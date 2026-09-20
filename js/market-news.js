/* ============================================================
   SA economy headline strip.

   Feeds are fetched through the dashboard's own /api/rss proxy and parsed
   with DOMParser, so there is no third-party RSS-to-JSON service in the path
   and no cross-origin request from the browser. Headlines are built as DOM
   nodes with textContent, never assembled as an HTML string.
   ============================================================ */
(function () {
  'use strict';

  var FEEDS = [
    { name: 'Moneyweb', url: 'https://www.moneyweb.co.za/feed/' },
    { name: 'Daily Maverick', url: 'https://www.dailymaverick.co.za/feed/' },
    { name: 'Mail & Guardian', url: 'https://mg.co.za/feed/' },
    { name: 'ESI Africa', url: 'https://www.esi-africa.com/feed/' },
    { name: 'Mining Weekly', url: 'https://www.miningweekly.com/page/feed' },
    { name: 'TechCentral', url: 'https://techcentral.co.za/feed/' },
    { name: 'SABC News', url: 'https://www.sabcnews.com/sabcnews/feed/' },
    { name: 'Africanews', url: 'https://www.africanews.com/feed/rss' }
  ];

  var RSS_PATH = 'api/rss';
  var MAX_STORIES = 10;
  var FETCH_TIMEOUT_MS = 10000;

  //: Feeds fetched at once. Each can sit on an unreachable provider for the
  //: whole timeout, so firing all eight together competes with the market
  //: endpoints for no benefit -- the ranking needs them all only in the end.
  var FEED_CONCURRENCY = 3;

  var ECONOMY_KEYWORDS = new RegExp(
    'south africa|rand|jse|economy|gdp|inflation|interest rate|sarb|' +
    'reserve bank|budget|mining|platinum|gold|coal|eskom|load shedding|' +
    'transnet|export|import|trade|energy|banks|retail|investment|stocks|' +
    'shares|markets|treasury|sasol|anglo|bhp|richemont|firstrand|sanlam|' +
    'old mutual|shoprite|woolworths|naspers|telkom|vodacom|mtn|pick n pay',
    'i'
  );

  var FALLBACK_HEADLINES = [
    'JSE and rand data load from the dashboard API when the server is reachable.',
    'Start the dashboard with "py server.py" to enable live headlines.'
  ];

  function childText(node, tagName) {
    var child = node.getElementsByTagName(tagName)[0];
    return child ? child.textContent.trim() : '';
  }

  function entryLink(node) {
    var link = node.getElementsByTagName('link')[0];
    if (!link) return '';
    return (link.getAttribute('href') || link.textContent || '').trim();
  }

  /** Parse an RSS or Atom document into plain headline objects. */
  function parseFeed(xml, sourceName) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];

    var nodes = doc.querySelectorAll('item, entry');
    return Array.prototype.map.call(nodes, function (node) {
      return {
        title: childText(node, 'title'),
        link: entryLink(node),
        pubDate: childText(node, 'pubDate') || childText(node, 'updated') ||
          childText(node, 'published'),
        description: childText(node, 'description') || childText(node, 'summary'),
        source: sourceName
      };
    });
  }

  async function fetchFeed(feed) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    try {
      // Shared origin lookup: the proxy may be on the dashboard server's own
      // port rather than on this page's origin.
      var response = await window.DashboardApi.fetchPath(
        RSS_PATH + '?url=' + encodeURIComponent(feed.url) + '&_=' + Date.now(),
        { signal: controller.signal }
      );
      return parseFeed(await response.text(), feed.name);
    } catch (error) {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fetch every feed, at most FEED_CONCURRENCY at a time, preserving order. */
  async function fetchAll(feeds) {
    var batches = [];
    var next = 0;

    async function worker() {
      while (next < feeds.length) {
        var index = next;
        next += 1;
        batches[index] = await fetchFeed(feeds[index]);
      }
    }

    var pool = Math.min(FEED_CONCURRENCY, feeds.length);
    var workers = [];
    for (var slot = 0; slot < pool; slot += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return batches;
  }

  function scoreItem(item) {
    var text = (item.title + ' ' + item.description + ' ' + item.source).toLowerCase();
    var ageHours = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
    var score = isFinite(ageHours) ? Math.max(0, 100 - ageHours * 4) : 10;

    if (ECONOMY_KEYWORDS.test(text)) score += 60;
    if (/south africa|eskom|load shedding|rand\/|jse/.test(text)) score += 30;
    if (/\b(celebrity|sports|showbiz|festival|recipe)\b/.test(text)) score -= 50;
    return score;
  }

  function dedupe(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  /** Build one headline anchor entirely from DOM nodes. */
  function headlineNode(item) {
    var link = document.createElement('a');
    link.className = 'news-headline-link';
    link.href = item.link || '#';
    link.target = '_blank';
    link.rel = 'noopener';

    var title = document.createElement('span');
    title.className = 'news-headline-title';
    title.textContent = item.title;

    var meta = document.createElement('span');
    meta.className = 'news-headline-meta';
    meta.textContent = item.source + ' · ' + formatDate(item.pubDate);

    link.appendChild(title);
    link.appendChild(meta);
    return link;
  }

  function renderMessage(text) {
    var container = document.getElementById('equityNewsList');
    if (!container) return;
    container.textContent = '';
    var message = document.createElement('div');
    message.className = 'text-muted small text-center py-3';
    message.textContent = text;
    container.appendChild(message);
  }

  function renderItems(items) {
    var container = document.getElementById('equityNewsList');
    var count = document.getElementById('newsStripCount');
    if (!container) return;

    container.textContent = '';
    var wrapper = document.createElement('div');
    wrapper.className = 'news-headline-list';
    items.forEach(function (item) {
      wrapper.appendChild(headlineNode(item));
    });
    container.appendChild(wrapper);

    if (count) count.textContent = String(items.length);
  }

  async function load() {
    renderMessage('Loading SA economy headlines…');

    var batches = await fetchAll(FEEDS);
    var items = dedupe(batches.reduce(function (all, batch) {
      return all.concat(batch);
    }, []));

    var ranked = items
      .map(function (item) { return { item: item, score: scoreItem(item) }; })
      .filter(function (entry) { return entry.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, MAX_STORIES)
      .map(function (entry) { return entry.item; });

    if (!ranked.length) {
      renderMessage(FALLBACK_HEADLINES.join(' '));
      var count = document.getElementById('newsStripCount');
      if (count) count.textContent = '0';
      return;
    }

    renderItems(ranked);
  }

  window.MarketNews = { load: load };
})();
