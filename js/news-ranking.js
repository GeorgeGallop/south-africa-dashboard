/**
 * news-ranking.js
 * ---------------------------------------------------------------------------
 * Keyword-relevance ranking for the South Africa Dashboard news brief.
 *
 * The news page used to "rank" stories with a fixed importance score that
 * ignored the keywords the user typed entirely — the keywords only decided
 * whether a story was *included*, never how highly it was *placed*. The result
 * was exactly what the user reported: lots of loosely-related stories, ordered
 * by recency and source credibility rather than by how well they matched.
 *
 * This module replaces that with a real information-retrieval score:
 *
 *   1. BM25 over the story text, with field boosting so a keyword in the
 *      headline counts far more than one buried in the body.
 *   2. IDF taken from the actual fetched corpus, so rare, specific terms
 *      ("brulpadda") outweigh common ones ("power", "South Africa").
 *   3. A keyword-coverage multiplier (saturating after 8 group hits) so a
 *      long default list does not treat 5 real matches as ~1% coverage.
 *   4. Phrase bonuses: "load shedding" as an exact phrase outranks the two
 *      words appearing far apart.
 *   5. Glued-form matching so "loadshedding" and "load shedding" find each
 *      other, and prefix matching so "Africa"/"African" relate.
 *
 * Recency and source credibility survive only as small tie-breakers, so
 * relevance genuinely drives the order.
 *
 * Exposed as window.NewsRanking. Pure functions, no DOM, so it is unit-testable.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var CONFIG = {
    // Field weights feed the BM25 term frequency (how much a hit in each field
    // is worth relative to a hit in another field).
    FIELD_WEIGHTS: { title: 3, subtags: 2, source: 1.5, description: 1, content: 1 },
    // Glued n-gram tokens (2..NGRAM_MAX consecutive words joined) let phrase
    // concepts match whether or not the source spaced them apart.
    NGRAM_MAX: 3,
    NGRAM_WEIGHT: 0.6,
    // Standard BM25 saturation / length-normalisation constants.
    BM25_K1: 1.5,
    BM25_B: 0.75,
    // How strongly raw relevance outranks the recency/credibility tie-breakers.
    RELEVANCE_SCALE: 20,
    // Reward for covering more of the typed keywords (0..1 coverage).
    // Coverage saturates after this many distinct group hits so a long default
    // list (300+ groups) does not shrink 5 real matches to ~0.01.
    COVERAGE_SATURATE: 8,
    COVERAGE_BOOST: 1.2,
    // Additive lift per matched group so two-hit stories beat one-hit stories
    // even when BM25 of a common word is similar.
    HIT_COUNT_WEIGHT: 0.45,
    // Phrase-hit bonus as a multiple of the summed IDF of the phrase's words.
    PHRASE_TERM_MULT: 0.8,
    PHRASE_TITLE_MULT: 1.6,
    // Small tie-breakers layered under relevance.
    FRESHNESS_MAX: 10,
    CREDIBILITY_WEIGHT: 1,
    IMPORTANCE_WEIGHT: 0.05,
    // Prefix matching ("africa" ~ "african"): only for longer tokens, only
    // when the lengths are close, and discounted.
    PREFIX_MIN_LEN: 5,
    PREFIX_MAX_LEN_DIFF: 4,
    PREFIX_DISCOUNT: 0.7
  };

  var TOKEN_RE = /[a-z0-9]+/g;

  // ---- TOKENISATION & NORMALISATION ----------------------------------------

  function tokenize(text) {
    if (!text) return [];
    var matches = String(text).toLowerCase().match(TOKEN_RE);
    return matches || [];
  }

  // Conservative suffix normaliser: strips plurals / gerunds / past tense so
  // that "renewables" matches "renewable" and "funding" matches "funded".
  // Deliberately narrow — it must never turn two unrelated words into one.
  function normalizeToken(token) {
    var t = token;
    if (t.length > 4 && endsWith(t, 'ies')) {
      t = t.slice(0, -3) + 'y';                       // policies -> policy
    } else if (t.length > 4 && endsWith(t, 's') &&
               !endsWith(t, 'ss') && !endsWith(t, 'us') && !endsWith(t, 'is')) {
      t = t.slice(0, -1);                             // renewables -> renewable
    }
    if (t.length > 5 && endsWith(t, 'ing')) {
      t = t.slice(0, -3);                             // funding -> fund
    } else if (t.length > 5 && endsWith(t, 'ed')) {
      t = t.slice(0, -2);                             // funded -> fund
    }
    return t;
  }

  function endsWith(str, suffix) {
    return str.slice(-suffix.length) === suffix;
  }

  // Lowercased, punctuation-stripped, space-padded form used for exact phrase
  // matching (so " eskom " only matches the standalone word).
  function normalizePhraseText(text) {
    return ' ' + tokenize(text).join(' ') + ' ';
  }

  // ---- DOCUMENT / QUERY BUILDING -------------------------------------------

  function buildDoc(item) {
    var tf = Object.create(null);
    var state = { length: 0 };

    addField(tf, state, tokenize(item.title), CONFIG.FIELD_WEIGHTS.title, true);
    addField(tf, state, tokenize((item.sourceTags || []).join(' ')), CONFIG.FIELD_WEIGHTS.subtags, false);
    addField(tf, state, tokenize(item.source), CONFIG.FIELD_WEIGHTS.source, false);
    addField(tf, state, tokenize(item.description), CONFIG.FIELD_WEIGHTS.description, true);
    addField(tf, state, tokenize(item.content), CONFIG.FIELD_WEIGHTS.content, false);

    return { tf: tf, length: state.length, tokens: Object.keys(tf) };
  }

  function addField(tf, state, rawTokens, weight, withNgrams) {
    var norms = [];
    var i;
    for (i = 0; i < rawTokens.length; i++) {
      var n = normalizeToken(rawTokens[i]);
      if (!n) continue;
      norms.push(n);
      tf[n] = (tf[n] || 0) + weight;
      state.length += weight;
    }
    if (!withNgrams) return;

    for (var size = 2; size <= CONFIG.NGRAM_MAX; size++) {
      for (i = 0; i + size <= norms.length; i++) {
        var glued = norms.slice(i, i + size).join('');
        if (glued.length < CONFIG.PREFIX_MIN_LEN) continue;
        tf[glued] = (tf[glued] || 0) + CONFIG.NGRAM_WEIGHT;
        state.length += CONFIG.NGRAM_WEIGHT;
      }
    }
  }

  // Parses the keyword box into "groups". A group is one comma/semicolon
  // separated concept; multi-word groups (e.g. "load shedding") keep their
  // words together as both individual terms and a glued phrase term.
  function parseKeywords(keywordText) {
    var groups = [];
    var allTerms = [];
    var termSeen = Object.create(null);
    var groupSeen = Object.create(null);

    var chunks = String(keywordText || '')
      .split(/[;,]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    for (var c = 0; c < chunks.length; c++) {
      var words = tokenize(chunks[c]);
      if (!words.length) continue;

      var terms = [];
      for (var w = 0; w < words.length; w++) {
        var n = normalizeToken(words[w]);
        if (n && terms.indexOf(n) === -1) terms.push(n);
      }
      if (!terms.length) continue;

      var phrase = words.join(' ');
      if (groupSeen[phrase]) continue;
      groupSeen[phrase] = true;

      var glued = terms.length > 1 ? terms.join('') : '';
      groups.push({ phrase: phrase, terms: terms, glued: glued });

      for (var t = 0; t < terms.length; t++) {
        if (!termSeen[terms[t]]) { termSeen[terms[t]] = true; allTerms.push(terms[t]); }
      }
      if (glued && !termSeen[glued]) { termSeen[glued] = true; allTerms.push(glued); }
    }

    return { groups: groups, allTerms: allTerms };
  }

  // ---- TERM MATCHING -------------------------------------------------------

  // Returns the (possibly discounted) weighted frequency of a term in a doc,
  // or 0 if absent. Falls back to a guarded prefix match so that closely
  // related forms still count.
  function matchTerm(term, doc) {
    var direct = doc.tf[term];
    if (direct) return direct;
    if (term.length < CONFIG.PREFIX_MIN_LEN) return 0;

    var best = 0;
    for (var i = 0; i < doc.tokens.length; i++) {
      var key = doc.tokens[i];
      if (key.length < CONFIG.PREFIX_MIN_LEN) continue;
      if (Math.abs(key.length - term.length) > CONFIG.PREFIX_MAX_LEN_DIFF) continue;
      // Digits mean a distinct ticker/id (south ≠ south32).
      if (/\d/.test(term) || /\d/.test(key)) continue;
      if (key.indexOf(term) === 0 || term.indexOf(key) === 0) {
        var value = doc.tf[key] * CONFIG.PREFIX_DISCOUNT;
        if (value > best) best = value;
      }
    }
    return best;
  }

  function phraseHit(group, phraseFields) {
    if (group.terms.length <= 1) return { phrase: false, title: false };
    var needle = ' ' + group.phrase + ' ';
    var inTitle = phraseFields.title.indexOf(needle) !== -1;
    var inOther = inTitle || phraseFields.other.indexOf(needle) !== -1;
    return { phrase: inTitle || inOther, title: inTitle };
  }

  function buildPhraseFields(item) {
    return {
      title: normalizePhraseText(item.title),
      other: normalizePhraseText([
        (item.sourceTags || []).join(' '),
        item.source,
        item.description,
        item.content
      ].join(' '))
    };
  }

  // ---- BM25 SCORER ---------------------------------------------------------

  function createScorer(pool, parsed) {
    var docs = pool.map(buildDoc);
    var total = docs.length;
    var N = total || 1;
    var lengthSum = 0;
    var i;
    for (i = 0; i < docs.length; i++) lengthSum += docs[i].length;
    var avgLength = total ? (lengthSum / total) : 1;

    var phraseFields = pool.map(buildPhraseFields);

    // Document frequency is measured over the actual candidate corpus so the
    // IDF reflects how rare each keyword is in *this* batch of stories.
    var idf = Object.create(null);
    for (i = 0; i < parsed.allTerms.length; i++) {
      var term = parsed.allTerms[i];
      var df = 0;
      for (var d = 0; d < docs.length; d++) {
        if (matchTerm(term, docs[d]) > 0) df++;
      }
      idf[term] = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    }

    function bm25(doc) {
      var norm = CONFIG.BM25_K1 * (1 - CONFIG.BM25_B + CONFIG.BM25_B * (doc.length / (avgLength || 1)));
      var score = 0;
      for (var t = 0; t < parsed.allTerms.length; t++) {
        var term = parsed.allTerms[t];
        var wtf = matchTerm(term, doc);
        if (wtf <= 0) continue;
        score += (idf[term] * (wtf * (CONFIG.BM25_K1 + 1))) / (wtf + norm);
      }
      return score;
    }

    function scoreOne(index) {
      var doc = docs[index];
      var pf = phraseFields[index];
      var matchedGroups = 0;
      var phraseBonus = 0;
      var matchedTerms = [];
      var matchedPhrases = [];

      for (var g = 0; g < parsed.groups.length; g++) {
        var group = parsed.groups[g];
        var groupMatched = false;

        if (group.terms.length === 1) {
          groupMatched = matchTerm(group.terms[0], doc) > 0;
        } else {
          var hit = phraseHit(group, pf);
          // Glued forms are exact n-grams only. Prefix matching would let
          // "eskomdebt" hit any story that merely contains "eskom".
          var gluedHit = group.glued ? !!doc.tf[group.glued] : false;
          var allTerms = true;
          for (var t = 0; t < group.terms.length; t++) {
            if (matchTerm(group.terms[t], doc) <= 0) { allTerms = false; break; }
          }
          groupMatched = hit.phrase || gluedHit || allTerms;

          if (hit.phrase || gluedHit) {
            var groupIdf = 0;
            for (var k = 0; k < group.terms.length; k++) groupIdf += (idf[group.terms[k]] || 0);
            phraseBonus += groupIdf * (hit.title ? CONFIG.PHRASE_TITLE_MULT : CONFIG.PHRASE_TERM_MULT);
          }
        }

        if (groupMatched) {
          matchedGroups++;
          matchedPhrases.push(group.phrase);
        }
      }

      matchedPhrases.sort(function (a, b) {
        var aw = a.indexOf(' ') >= 0 ? 1 : 0;
        var bw = b.indexOf(' ') >= 0 ? 1 : 0;
        if (bw !== aw) return bw - aw;
        return b.length - a.length;
      });

      for (var m = 0; m < parsed.allTerms.length; m++) {
        if (matchTerm(parsed.allTerms[m], doc) > 0 && matchedTerms.indexOf(parsed.allTerms[m]) === -1) {
          matchedTerms.push(parsed.allTerms[m]);
        }
      }

      var saturate = CONFIG.COVERAGE_SATURATE || 8;
      var coverage = parsed.groups.length ? Math.min(1, matchedGroups / Math.min(parsed.groups.length, saturate)) : 0;
      var relevance = bm25(doc) * (1 + CONFIG.COVERAGE_BOOST * coverage) +
                      phraseBonus +
                      (CONFIG.HIT_COUNT_WEIGHT * matchedGroups);

      return {
        item: pool[index],
        relevance: relevance,
        coverage: coverage,
        matchedGroups: matchedGroups,
        matchedTerms: matchedTerms,
        matchedPhrases: matchedPhrases
      };
    }

    function scoreAll() {
      var out = [];
      for (var idx = 0; idx < pool.length; idx++) out.push(scoreOne(idx));
      return out;
    }

    return { scoreAll: scoreAll, scoreOne: scoreOne, idf: idf, avgLength: avgLength };
  }

  // ---- FILTERING & RANKING -------------------------------------------------

  // Keeps a story only if it satisfies at least one keyword group.
  function matchesFilter(item, parsed) {
    if (!parsed.groups.length) return true;
    var doc = buildDoc(item);
    var pf = buildPhraseFields(item);

    for (var g = 0; g < parsed.groups.length; g++) {
      var group = parsed.groups[g];
      if (group.terms.length === 1) {
        if (matchTerm(group.terms[0], doc) > 0) return true;
        continue;
      }
      if (phraseHit(group, pf).phrase) return true;
      if (group.glued && doc.tf[group.glued]) return true;

      var allTerms = true;
      for (var t = 0; t < group.terms.length; t++) {
        if (matchTerm(group.terms[t], doc) <= 0) { allTerms = false; break; }
      }
      if (allTerms) return true;
    }
    return false;
  }

  /**
   * Ranks a candidate pool against the parsed keywords.
   *
   * opts.credibilityOf(sourceName) -> number   small tie-breaker
   * opts.importanceOf(item)        -> number   fallback score when no keywords
   * opts.maxStoryAgeMs             -> number   recency window
   *
   * Returns an array of { item, rankScore, relevance, coverage, matchedTerms,
   * matchedPhrases, matchedGroups } sorted best-first.
   */
  function rankItems(items, parsed, opts) {
    opts = opts || {};
    var hasKeywords = parsed.groups.length > 0;
    var now = Date.now();
    var maxAge = opts.maxStoryAgeMs || (7 * 24 * 60 * 60 * 1000);
    var maxAgeHours = maxAge / (60 * 60 * 1000);

    var scored = hasKeywords
      ? createScorer(items, parsed).scoreAll()
      : items.map(function (item) {
          return { item: item, relevance: 0, coverage: 0, matchedGroups: 0, matchedTerms: [], matchedPhrases: [] };
        });

    var ranked = scored.map(function (s) {
      var item = s.item;
      var ts = (typeof item.pubTime === 'number') ? item.pubTime : null;
      var ageHours = ts === null ? maxAgeHours : Math.max(0, (now - ts) / (60 * 60 * 1000));
      var freshness = Math.max(0, CONFIG.FRESHNESS_MAX * (1 - ageHours / (maxAgeHours || 1)));
      var credibility = opts.credibilityOf ? (opts.credibilityOf(item.source) || 0) : 0;
      var importance = opts.importanceOf ? (opts.importanceOf(item) || 0) : 0;

      var rankScore;
      if (hasKeywords) {
        rankScore = (s.relevance * CONFIG.RELEVANCE_SCALE) +
                    freshness +
                    (credibility * CONFIG.CREDIBILITY_WEIGHT) +
                    (importance * CONFIG.IMPORTANCE_WEIGHT);
      } else {
        rankScore = importance;
      }

      return {
        item: item,
        rankScore: rankScore,
        relevance: s.relevance,
        coverage: s.coverage,
        matchedGroups: s.matchedGroups,
        matchedTerms: s.matchedTerms,
        matchedPhrases: s.matchedPhrases || [],
        freshness: freshness,
        credibility: credibility
      };
    });

    ranked.sort(function (a, b) { return b.rankScore - a.rankScore; });
    return ranked;
  }

  window.NewsRanking = {
    CONFIG: CONFIG,
    tokenize: tokenize,
    normalizeToken: normalizeToken,
    normalizePhraseText: normalizePhraseText,
    buildDoc: buildDoc,
    parseKeywords: parseKeywords,
    matchTerm: matchTerm,
    matchesFilter: matchesFilter,
    createScorer: createScorer,
    rankItems: rankItems
  };
})();
