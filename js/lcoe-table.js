/*
 * LCOE data table — builds rows from the same filtered series the chart uses.
 */
(function () {
  'use strict';

  function cell(text, className) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function swatchCell(tech) {
    var td = document.createElement('td');
    var dot = document.createElement('span');
    dot.className = 'lcoe-swatch';
    dot.style.background = tech.color;
    td.appendChild(dot);
    td.appendChild(document.createTextNode(tech.short));
    return td;
  }

  function format(value) {
    return value.toLocaleString('en-ZA');
  }

  function render(tbody, options) {
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    options.technologies.forEach(function (tech) {
      var rows = (options.series[tech.id] || []).slice().sort(function (a, b) {
        return a[0] - b[0];
      });
      rows.forEach(function (entry, index) {
        var tr = document.createElement('tr');
        var mid = Math.round((entry[1] + entry[2]) / 2);

        if (index === 0) {
          var nameCell = swatchCell(tech);
          nameCell.rowSpan = rows.length;
          tr.appendChild(nameCell);
        }

        tr.appendChild(cell(String(entry[0])));
        tr.appendChild(cell(format(entry[1]), 'text-end'));
        tr.appendChild(cell(format(entry[2]), 'text-end'));
        tr.appendChild(cell(format(mid), 'text-end'));
        tbody.appendChild(tr);
      });
    });

    if (!tbody.firstChild) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'text-muted text-center py-4';
      td.textContent = 'No technologies selected.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  window.SALcoeTable = { render: render };
})();
