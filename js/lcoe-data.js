/*
 * South African LCOE dataset — indicative, editable.
 *
 * All figures are ZAR/MWh in the nominal money of the stated year.
 * Method: Lazard-style unsubsidised technology LCOE ranges, re-based to
 * South African conditions (resource, dry cooling, local costs, WACC).
 *
 * Anchors for the low ends of solar PV and onshore wind:
 *   REIPPPP bid-window outcomes, BW1 (2011) through BW7 (2023/24).
 * Anchors for thermal, nuclear and storage:
 *   EPRI, Supply-Side Cost and Performance Data for Eskom IRP (2023-24 update),
 *   earlier IRP assumptions, and IRENA/CSIR published ranges.
 *
 * These are indicative compiled values for comparison, not official EPRI,
 * IRP or Lazard output. Edit the numbers here and every chart, table and CSV
 * on lcoe.html updates — this file is the single source of truth.
 */
(function () {
  'use strict';

  var TECHNOLOGIES = [
    {
      id: 'solar-pv',
      name: 'Solar PV — utility, single-axis',
      short: 'Solar PV',
      color: '#E3A008',
      components: { capital: 78, fuel: 0, om: 18, other: 4 },
      note: 'Lowest-cost new build in South Africa on a technology basis. Bid-window outcomes fell from about R2.76/kWh in BW1 (2011) to R0.42-0.49/kWh in BW7.'
    },
    {
      id: 'wind-onshore',
      name: 'Wind — onshore',
      short: 'Onshore wind',
      color: '#007A4D',
      components: { capital: 72, fuel: 0, om: 24, other: 4 },
      note: 'Eastern Cape and Western Cape resource. BW1 bids around R1.14/kWh; best recent wind bids near R0.34-0.49/kWh.'
    },
    {
      id: 'solar-bess',
      name: 'Solar PV + 4-hour battery',
      short: 'Solar + 4h BESS',
      color: '#E65100',
      components: { capital: 74, fuel: 4, om: 16, other: 6 },
      note: 'The cheapest route to dispatchable daytime and evening energy. Fuel here is charging energy and round-trip losses.'
    },
    {
      id: 'csp',
      name: 'CSP — tower, 8-12 h storage',
      short: 'CSP + storage',
      color: '#C62828',
      components: { capital: 76, fuel: 0, om: 20, other: 4 },
      note: 'Upington-class direct normal irradiation. Firm and dispatchable, but at roughly three times the capital cost of PV.'
    },
    {
      id: 'coal',
      name: 'Coal — new supercritical PF, dry-cooled',
      short: 'New coal',
      color: '#37474F',
      components: { capital: 42, fuel: 38, om: 16, other: 4 },
      note: 'Excludes carbon. Fuel is the dominant exposure: domestic coal price plus transport, escalated.'
    },
    {
      id: 'coal-ccs',
      name: 'Coal with carbon capture (CCS)',
      short: 'Coal + CCS',
      color: '#6D4C41',
      components: { capital: 48, fuel: 26, om: 18, other: 8 },
      note: 'No operating reference plant in South Africa. High uncertainty on capture energy penalty and transport/storage cost.'
    },
    {
      id: 'ccgt',
      name: 'Gas — combined cycle (CCGT)',
      short: 'CCGT gas',
      color: '#00838F',
      components: { capital: 22, fuel: 62, om: 12, other: 4 },
      note: 'Highly sensitive to gas price and to whether LNG is imported at Richards Bay or Saldanha versus domestic supply.'
    },
    {
      id: 'ocgt',
      name: 'Gas — open cycle / peaking (OCGT)',
      short: 'OCGT peaking',
      color: '#AD1457',
      components: { capital: 16, fuel: 70, om: 10, other: 4 },
      note: 'Low capacity factor, high fuel burn per unit. Used for peak and emergency reserve, not bulk energy.'
    },
    {
      id: 'nuclear',
      name: 'Nuclear — large PWR (AP1000 / EPR class)',
      short: 'Nuclear',
      color: '#1565C0',
      components: { capital: 76, fuel: 12, om: 10, other: 2 },
      note: 'Overnight cost and cost of capital dominate. Long build time means financing structure matters more than fuel price.'
    },
    {
      id: 'wind-offshore',
      name: 'Wind — offshore, fixed-bottom',
      short: 'Offshore wind',
      color: '#558B2F',
      components: { capital: 70, fuel: 0, om: 26, other: 4 },
      note: 'No installed capacity in South Africa. European benchmarks adjusted for a first-of-a-kind local programme and port constraints.'
    },
    {
      id: 'diesel',
      name: 'Diesel / HFO reciprocating engines',
      short: 'Diesel peaking',
      color: '#455A64',
      components: { capital: 12, fuel: 76, om: 8, other: 4 },
      note: 'Emergency and islanded supply. The dearest energy on the system by a wide margin.'
    }
  ];

  // [year, low ZAR/MWh, high ZAR/MWh]
  var SERIES = {
    'solar-pv': [
      [2010, 2800, 4200], [2012, 1400, 2760], [2014, 850, 1500], [2016, 620, 1100],
      [2018, 550, 900], [2020, 480, 800], [2022, 420, 700], [2024, 420, 750]
    ],
    'wind-onshore': [
      [2010, 1300, 2100], [2012, 800, 1200], [2014, 620, 950], [2016, 560, 850],
      [2018, 500, 780], [2020, 450, 700], [2022, 400, 620], [2024, 430, 700]
    ],
    'solar-bess': [
      [2016, 2400, 3600], [2018, 1950, 2900], [2020, 1500, 2300],
      [2022, 1250, 1900], [2024, 1150, 1750]
    ],
    'csp': [
      [2010, 3400, 5200], [2012, 2900, 4400], [2014, 2600, 3900], [2016, 2400, 3500],
      [2018, 2200, 3200], [2020, 2000, 3000], [2022, 1900, 2800], [2024, 1850, 2750]
    ],
    'coal': [
      [2010, 620, 900], [2012, 700, 1000], [2014, 780, 1100], [2016, 850, 1200],
      [2018, 930, 1300], [2020, 990, 1400], [2022, 1040, 1500], [2024, 1100, 1600]
    ],
    'coal-ccs': [
      [2014, 1400, 2100], [2016, 1550, 2300], [2018, 1700, 2450],
      [2020, 1800, 2600], [2022, 1950, 2800], [2024, 2050, 2950]
    ],
    'ccgt': [
      [2010, 800, 1200], [2012, 850, 1300], [2014, 900, 1400], [2016, 1000, 1500],
      [2018, 1100, 1650], [2020, 1200, 1750], [2022, 1300, 1850], [2024, 1350, 1950]
    ],
    'ocgt': [
      [2010, 1900, 2800], [2012, 2000, 3000], [2014, 2100, 3200], [2016, 2250, 3400],
      [2018, 2400, 3600], [2020, 2550, 3800], [2022, 2700, 4000], [2024, 2850, 4200]
    ],
    'nuclear': [
      [2010, 650, 950], [2012, 700, 1000], [2014, 780, 1100], [2016, 850, 1200],
      [2018, 900, 1300], [2020, 950, 1400], [2022, 1000, 1450], [2024, 1050, 1550]
    ],
    'wind-offshore': [
      [2015, 2400, 3400], [2018, 2000, 2900], [2020, 1800, 2600],
      [2022, 1650, 2400], [2024, 1550, 2250]
    ],
    'diesel': [
      [2010, 2800, 4200], [2014, 3200, 4800], [2018, 3600, 5400],
      [2022, 4100, 6000], [2024, 4400, 6500]
    ]
  };

  var COMPONENT_LABELS = {
    capital: 'Capital (incl. financing)',
    fuel: 'Fuel or charging energy',
    om: 'Fixed and variable O&M',
    other: 'Grid, decommissioning, other'
  };

  window.SA_LCOE = {
    currency: 'ZAR',
    unit: 'R/MWh',
    priceBasis: 'nominal, year of publication',
    technologies: TECHNOLOGIES,
    series: SERIES,
    componentLabels: COMPONENT_LABELS,
    years: [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024],
    csvFilename: 'south-africa-lcoe-data.csv',
    source: 'EPRI IRP 2023-24; REIPPPP BW1-BW7; IRENA; CSIR'
  };
})();
