/*
 * CSV export — the exact rows currently plotted.
 */
(function () {
  'use strict';

  var COLUMNS = [
    'technology_id',
    'technology',
    'year',
    'lcoe_low_zar_per_mwh',
    'lcoe_high_zar_per_mwh',
    'lcoe_mid_zar_per_mwh',
    'currency',
    'unit',
    'price_basis',
    'source'
  ];

  function field(value) {
    var text = String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function build(options) {
    var lines = [COLUMNS.join(',')];

    options.technologies.forEach(function (tech) {
      var rows = (options.series[tech.id] || []).slice().sort(function (a, b) {
        return a[0] - b[0];
      });
      rows.forEach(function (entry) {
        lines.push([
          field(tech.id),
          field(tech.name),
          field(entry[0]),
          field(entry[1]),
          field(entry[2]),
          field(Math.round((entry[1] + entry[2]) / 2)),
          field(options.currency),
          field(options.unit),
          field(options.priceBasis),
          field(options.source)
        ].join(','));
      });
    });

    return lines.join('\r\n') + '\r\n';
  }

  function download(text, filename) {
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  window.SALcoeCsv = {
    build: build,
    download: download,
    rowCount: function (options) {
      return options.technologies.reduce(function (total, tech) {
        return total + (options.series[tech.id] || []).length;
      }, 0);
    }
  };
})();
