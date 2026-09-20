// =====================================================================
// JSE / SOUTH AFRICA PUBLIC EQUITY MARKET — REFERENCE SNAPSHOT
// =====================================================================
// Covers the major + mid-cap listings related to South Africa across the
// 11 ICB industry sectors used by the Johannesburg Stock Exchange.
//
// Fields per company:
//   t : ticker (JSE code)
//   n : company name
//   p : indicative last price (ZAR)
//   c : indicative day change (%)
//   m : market capitalisation (R billion)
//
// Values are a curated REFERENCE snapshot (indicative levels for market
// structure analysis), NOT live quotes. The equities page attempts a live
// refresh from public data; if that succeeds it replaces these figures.
// =====================================================================

window.JSE_DATA = {
  asOf: "2026-08-11",
  label: "Reference snapshot (indicative) — refresh for live quotes",
  sectors: [
    {
      id: "tech",
      name: "Technology",
      icon: "💻",
      color: "#1565c0",
      blurb: "Software, IT services, internet & consumer digital platforms — anchored by Naspers/Prosus.",
      companies: [
        { t: "NPN", n: "Naspers", p: 3180, c: 1.2, m: 1500 },
        { t: "PRX", n: "Prosus", p: 1050, c: 1.5, m: 1700 },
        { t: "DTC", n: "Datatec", p: 108, c: -0.8, m: 8.5 },
        { t: "ALR", n: "Alaris Holdings", p: 85, c: 0.4, m: 7.5 },
        { t: "CTA", n: "Capital Appreciation", p: 15.4, c: 0.6, m: 4.2 },
        { t: "EOH", n: "EOH Holdings", p: 16.5, c: 2.1, m: 3.2 },
        { t: "ADI", n: "AdaptIT", p: 6.2, c: 1.0, m: 3.0 },
        { t: "PNC", n: "Pinnacle Holdings", p: 40, c: 0.8, m: 2.2 },
        { t: "MST", n: "Mustek", p: 24.0, c: -1.2, m: 1.5 },
        { t: "PBG", n: "PBT Group", p: 6.5, c: 3.0, m: 0.8 }
      ]
    },
    {
      id: "telecom",
      name: "Telecommunications",
      icon: "📡",
      color: "#00838f",
      blurb: "Mobile & fixed-line operators serving SA and the wider continent.",
      companies: [
        { t: "MTN", n: "MTN Group", p: 88, c: 0.9, m: 160 },
        { t: "VOD", n: "Vodacom Group", p: 122, c: -0.3, m: 130 },
        { t: "TKG", n: "Telkom SA", p: 49, c: 2.4, m: 25 },
        { t: "BLU", n: "Blue Label Telecoms", p: 10.2, c: 1.8, m: 8.5 },
        { t: "HUG", n: "Huge Group", p: 5.0, c: -0.5, m: 2.0 }
      ]
    },
    {
      id: "health",
      name: "Health Care",
      icon: "🏥",
      color: "#e91e63",
      blurb: "Pharmaceuticals, hospital groups and healthcare services.",
      companies: [
        { t: "APN", n: "Aspen Pharmacare", p: 165, c: 1.1, m: 70 },
        { t: "NTC", n: "Netcare", p: 25.5, c: 0.7, m: 35 },
        { t: "LHC", n: "Life Healthcare", p: 19.5, c: -0.9, m: 28 },
        { t: "AIP", n: "Adcock Ingram", p: 105, c: 0.5, m: 18 },
        { t: "ACT", n: "Afrocentric Investment", p: 5.0, c: -1.5, m: 2.5 }
      ]
    },
    {
      id: "financials",
      name: "Financials",
      icon: "🏦",
      color: "#f57c00",
      blurb: "Banks, insurers, investment holdings and diversified financial services.",
      companies: [
        { t: "FSR", n: "FirstRand", p: 75, c: 0.3, m: 420 },
        { t: "SBK", n: "Standard Bank Group", p: 240, c: 0.5, m: 400 },
        { t: "CPI", n: "Capitec Bank", p: 2400, c: 1.4, m: 280 },
        { t: "INL", n: "Investec Ltd", p: 130, c: 0.8, m: 180 },
        { t: "SLM", n: "Sanlam", p: 88, c: 0.6, m: 180 },
        { t: "ABG", n: "Absa Group", p: 175, c: -0.2, m: 150 },
        { t: "NED", n: "Nedbank Group", p: 270, c: 0.4, m: 130 },
        { t: "OMU", n: "Old Mutual", p: 12.5, c: 0.9, m: 80 },
        { t: "OUT", n: "OUTsurance", p: 52, c: 1.0, m: 70 },
        { t: "REM", n: "Remgro", p: 108, c: -0.7, m: 60 },
        { t: "SNT", n: "Santam", p: 470, c: 0.2, m: 55 },
        { t: "RNI", n: "Reinet Investments", p: 210, c: 0.4, m: 55 },
        { t: "MTM", n: "Momentum Metropolitan", p: 38, c: 1.1, m: 50 },
        { t: "DSY", n: "Discovery", p: 76, c: 0.3, m: 50 },
        { t: "JSE", n: "JSE Ltd", p: 165, c: 0.1, m: 35 },
        { t: "PGF", n: "PSG Financial Services", p: 9.4, c: 1.6, m: 16 },
        { t: "ARC", n: "African Rainbow Capital", p: 7.5, c: -1.1, m: 12 },
        { t: "TCP", n: "Transaction Capital", p: 12.5, c: 2.2, m: 8 },
        { t: "BAT", n: "Brait", p: 4.0, c: -0.8, m: 8 },
        { t: "PPE", n: "Purple Group", p: 3.6, c: 2.0, m: 7 },
        { t: "AFH", n: "Alexander Forbes", p: 8.0, c: 0.9, m: 6 },
        { t: "CLI", n: "Clientele", p: 11.5, c: 0.5, m: 6 },
        { t: "SFN", n: "Sasfin", p: 22, c: -1.0, m: 1.8 },
        { t: "SAB", n: "Sabvest", p: 24, c: 0.2, m: 0.9 }
      ]
    },
    {
      id: "realestate",
      name: "Real Estate",
      icon: "🏢",
      color: "#7b1fa2",
      blurb: "REITs and property funds spanning offices, retail, industrial and storage.",
      companies: [
        { t: "NRP", n: "NEPI Rockcastle", p: 182, c: 0.8, m: 130 },
        { t: "GRT", n: "Growthpoint Properties", p: 14.8, c: 0.5, m: 55 },
        { t: "RDF", n: "Redefine Properties", p: 4.7, c: -0.4, m: 35 },
        { t: "RES", n: "Resilient REIT", p: 69, c: 1.3, m: 25 },
        { t: "FFB", n: "Fortress REIT A", p: 22.5, c: 0.6, m: 22 },
        { t: "VKE", n: "Vukile Property Fund", p: 17.5, c: 0.4, m: 18 },
        { t: "MSS", n: "MAS Real Estate", p: 12.8, c: 0.3, m: 18 },
        { t: "SSS", n: "Stor-Age Property REIT", p: 190, c: 1.1, m: 16 },
        { t: "HYP", n: "Hyprop Investments", p: 71, c: 0.9, m: 14 },
        { t: "EQU", n: "Equites Property Fund", p: 16.5, c: -0.6, m: 14 },
        { t: "EMI", n: "Emira Property Fund", p: 8.5, c: 0.2, m: 12 },
        { t: "FTA", n: "Fairvest", p: 2.3, c: 1.5, m: 12 },
        { t: "ATT", n: "Attacq", p: 14.2, c: 0.7, m: 11 },
        { t: "SAC", n: "SA Corporate Real Estate", p: 1.8, c: 0.1, m: 11 },
        { t: "OCT", n: "Octodec Investments", p: 9.5, c: -0.5, m: 6 },
        { t: "DIB", n: "Dipula Income Fund", p: 3.4, c: 0.8, m: 6 },
        { t: "AWA", n: "Arrowhead Properties A", p: 2.9, c: 1.0, m: 5 },
        { t: "SEA", n: "Spear REIT", p: 8.0, c: 0.6, m: 4 },
        { t: "LTE", n: "Lighthouse Capital", p: 1.15, c: -0.9, m: 3 },
        { t: "TEX", n: "Texton Property Fund", p: 2.6, c: -1.2, m: 2 }
      ]
    },
    {
      id: "discre",
      name: "Consumer Discretionary",
      icon: "🛍️",
      color: "#c62828",
      blurb: "Retail, luxury goods, media, hospitality, education and autos.",
      companies: [
        { t: "CFR", n: "Compagnie Fin. Richemont", p: 3200, c: 0.4, m: 1900 },
        { t: "WHL", n: "Woolworths Holdings", p: 62, c: 0.8, m: 70 },
        { t: "MRP", n: "Mr Price Group", p: 180, c: 1.8, m: 48 },
        { t: "PPL", n: "PEPKOR Holdings", p: 14.5, c: 2.5, m: 35 },
        { t: "TFG", n: "The Foschini Group", p: 104, c: 1.2, m: 35 },
        { t: "MCG", n: "MultiChoice Group", p: 65, c: -1.8, m: 30 },
        { t: "ITE", n: "Italtile", p: 20.5, c: 0.5, m: 30 },
        { t: "MTH", n: "Motus Holdings", p: 125, c: 0.7, m: 30 },
        { t: "TRU", n: "Truworths", p: 68, c: 0.9, m: 25 },
        { t: "SUI", n: "Sun International", p: 34, c: 0.3, m: 14 },
        { t: "ADH", n: "Advtech", p: 13.5, c: 1.1, m: 12 },
        { t: "COH", n: "Curro Holdings", p: 13.9, c: -0.4, m: 10 },
        { t: "FBR", n: "Famous Brands", p: 78, c: 0.6, m: 8 },
        { t: "CMH", n: "Combined Motor Holdings", p: 63, c: 0.8, m: 8 },
        { t: "CAT", n: "Caxton & CTP Publishers", p: 13.5, c: 0.2, m: 6 },
        { t: "SUR", n: "Spur Corporation", p: 14.2, c: 1.3, m: 5 },
        { t: "SDO", n: "Stadio Holdings", p: 6.2, c: 2.0, m: 4 },
        { t: "MTA", n: "Metair Investments", p: 10.0, c: -1.4, m: 4 },
        { t: "CLH", n: "City Lodge Hotels", p: 6.1, c: -0.6, m: 2.5 },
        { t: "EMH", n: "eMedia Holdings", p: 7.5, c: 0.4, m: 1.8 }
      ]
    },
    {
      id: "staples",
      name: "Consumer Staples",
      icon: "🛒",
      color: "#2e7d32",
      blurb: "Food & drug retail, food producers and distributors.",
      companies: [
        { t: "SHP", n: "Shoprite Holdings", p: 310, c: 1.0, m: 180 },
        { t: "BID", n: "Bidcorp", p: 430, c: 0.5, m: 140 },
        { t: "CLS", n: "Clicks Group", p: 360, c: 0.9, m: 70 },
        { t: "DCP", n: "Dis-Chem Pharmacies", p: 34, c: 1.3, m: 45 },
        { t: "PIK", n: "Pick n Pay Stores", p: 18.5, c: 2.8, m: 35 },
        { t: "TBS", n: "Tiger Brands", p: 215, c: 0.4, m: 35 },
        { t: "AVI", n: "AVI Ltd", p: 89, c: 0.6, m: 30 },
        { t: "SPP", n: "The SPAR Group", p: 54, c: -0.7, m: 22 },
        { t: "OCE", n: "Oceana Group", p: 82, c: 1.4, m: 15 },
        { t: "RCL", n: "RCL Foods", p: 11.8, c: 0.8, m: 12 },
        { t: "PMR", n: "Premier Group", p: 92, c: 1.1, m: 12 },
        { t: "ARL", n: "Astral Foods", p: 195, c: -0.9, m: 10 },
        { t: "LBR", n: "Libstar Holdings", p: 11.5, c: 0.5, m: 7 },
        { t: "RFG", n: "RFG Holdings", p: 12.8, c: 0.7, m: 3.5 },
        { t: "SHG", n: "Sea Harvest Group", p: 6.8, c: -1.1, m: 2.5 }
      ]
    },
    {
      id: "industrials",
      name: "Industrials",
      icon: "🏭",
      color: "#5d4037",
      blurb: "Diversified industrials, construction, logistics, packaging and services.",
      companies: [
        { t: "BVT", n: "Bidvest Group", p: 270, c: 0.8, m: 90 },
        { t: "BAW", n: "Barloworld", p: 145, c: 1.2, m: 38 },
        { t: "RLO", n: "Reunert", p: 115, c: 0.5, m: 25 },
        { t: "SPG", n: "Super Group", p: 34, c: 1.5, m: 18 },
        { t: "GND", n: "Grindrod", p: 19.5, c: 1.8, m: 15 },
        { t: "RBX", n: "Raubex Group", p: 115, c: 0.9, m: 15 },
        { t: "KAP", n: "KAP Industrial Holdings", p: 11.0, c: 0.4, m: 14 },
        { t: "WBO", n: "Wilson Bayly Holmes-Ovcon", p: 33, c: 1.6, m: 12 },
        { t: "HDC", n: "Hudaco Industries", p: 160, c: 0.3, m: 6 },
        { t: "PPC", n: "PPC Ltd", p: 6.8, c: 2.2, m: 5 },
        { t: "NPK", n: "Nampak", p: 2.8, c: 3.5, m: 5 },
        { t: "TRE", n: "Trencor", p: 112, c: 0.1, m: 5 },
        { t: "WKF", n: "Workforce Holdings", p: 4.2, c: -0.5, m: 3 },
        { t: "SNV", n: "Santova", p: 7.5, c: 1.2, m: 2.5 },
        { t: "MUR", n: "Murray & Roberts", p: 6.2, c: 1.0, m: 2.5 },
        { t: "AEG", n: "Aveng", p: 9.0, c: 4.0, m: 2 },
        { t: "DAW", n: "DAWN (Distribution & Warehousing)", p: 15.0, c: 0.6, m: 2 },
        { t: "ADR", n: "Adcorp Holdings", p: 4.4, c: -0.8, m: 1.8 },
        { t: "SSK", n: "Stefanutti Stocks", p: 2.1, c: 2.5, m: 1.5 },
        { t: "VLE", n: "Value Group", p: 20.5, c: 0.3, m: 1.5 }
      ]
    },
    {
      id: "materials",
      name: "Basic Materials",
      icon: "⛏️",
      color: "#455a64",
      blurb: "Mining (PGMs, gold, coal, iron ore, manganese, chrome), chemicals and paper.",
      companies: [
        { t: "BHP", n: "BHP Group", p: 570, c: 0.6, m: 2900 },
        { t: "AGL", n: "Anglo American", p: 720, c: 1.1, m: 1100 },
        { t: "GLN", n: "Glencore", p: 93, c: 0.4, m: 950 },
        { t: "ANG", n: "AngloGold Ashanti", p: 480, c: 1.9, m: 260 },
        { t: "AMS", n: "Anglo American Platinum", p: 950, c: 2.3, m: 250 },
        { t: "KIO", n: "Kumba Iron Ore", p: 760, c: 0.7, m: 230 },
        { t: "GFI", n: "Gold Fields", p: 260, c: 1.5, m: 210 },
        { t: "IMP", n: "Impala Platinum", p: 126, c: 2.0, m: 180 },
        { t: "MNP", n: "Mondi", p: 330, c: 1.3, m: 150 },
        { t: "SSW", n: "Sibanye-Stillwater", p: 28, c: 3.4, m: 140 },
        { t: "HAR", n: "Harmony Gold", p: 175, c: 2.2, m: 135 },
        { t: "EXX", n: "Exxaro Resources", p: 157, c: -0.2, m: 75 },
        { t: "NHM", n: "Northam Platinum", p: 180, c: 1.7, m: 70 },
        { t: "TGA", n: "Thungela Resources", p: 120, c: -0.8, m: 55 },
        { t: "ARI", n: "African Rainbow Minerals", p: 250, c: 1.4, m: 45 },
        { t: "SAP", n: "Sappi", p: 56, c: 1.0, m: 35 },
        { t: "ASR", n: "Assore", p: 148, c: 0.9, m: 30 },
        { t: "DRD", n: "DRDGOLD", p: 33, c: 1.8, m: 20 },
        { t: "PAN", n: "Pan African Resources", p: 3.1, c: 2.5, m: 18 },
        { t: "AFE", n: "AECI", p: 165, c: -0.3, m: 18 },
        { t: "AFT", n: "Afrimat", p: 58, c: 0.8, m: 16 },
        { t: "OMN", n: "Omnia Holdings", p: 92, c: 0.4, m: 15 },
        { t: "MRF", n: "Merafe Resources", p: 2.9, c: 1.1, m: 8 },
        { t: "ACL", n: "ArcelorMittal South Africa", p: 3.4, c: -2.0, m: 8 },
        { t: "JBL", n: "Jubilee Metals Group", p: 1.05, c: 3.0, m: 3 },
        { t: "ORN", n: "Orion Minerals", p: 1.7, c: 2.8, m: 3 },
        { t: "WEZ", n: "Wesizwe Platinum", p: 0.42, c: -1.5, m: 2 },
        { t: "MCJ", n: "MC Mining", p: 2.6, c: 0.5, m: 0.8 }
      ]
    },
    {
      id: "energy",
      name: "Energy",
      icon: "⛽",
      color: "#e65100",
      blurb: "Integrated energy, oil & gas and fuel distribution. (Coal sits under Basic Materials on the JSE.)",
      companies: [
        { t: "SOL", n: "Sasol", p: 150, c: 0.9, m: 130 },
        { t: "TLM", n: "TotalEnergies Marketing SA", p: 235, c: 0.7, m: 18 },
        { t: "REN", n: "Renergen", p: 4.5, c: -2.2, m: 2 },
        { t: "SCL", n: "SacOil Holdings", p: 0.15, c: 1.5, m: 1 }
      ]
    },
    {
      id: "utilities",
      name: "Utilities",
      icon: "💡",
      color: "#0097a7",
      blurb: "Listed utilities are rare — Eskom & Transnet are state-owned. One listed energy investment vehicle.",
      companies: [
        { t: "HUL", n: "Hulisani", p: 0.55, c: -0.9, m: 1.2 }
      ]
    }
  ]
};
