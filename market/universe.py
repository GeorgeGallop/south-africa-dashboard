"""Sector buckets and helpers for the SA-exposure equity universe.

Prices and market caps are deliberately absent from the universe definition.
This module only declares how listings are grouped, so that every number
rendered on the equities page comes from a live quote rather than a
hard-coded value. The listing table itself lives in ``market.listings``.
"""

# id, display name, icon, colour, blurb -- shared with the map and sector rail.
SECTORS = [
    ("tech", "Technology", "\U0001F4BB", "#1565c0",
     "Software, IT services, internet and consumer digital platforms."),
    ("telecom", "Telecommunications", "\U0001F4E1", "#00838f",
     "Mobile and fixed-line operators serving SA and the wider continent."),
    ("health", "Health Care", "\U0001F3E5", "#e91e63",
     "Pharmaceuticals, hospital groups and healthcare services."),
    ("financials", "Financials", "\U0001F3E6", "#f57c00",
     "Banks, insurers, investment holdings and diversified financial services."),
    ("realestate", "Real Estate", "\U0001F3E2", "#7b1fa2",
     "REITs and property funds across offices, retail, industrial and storage."),
    ("discre", "Consumer Discretionary", "\U0001F6CD", "#c62828",
     "Retail, luxury goods, media, hospitality, education and autos."),
    ("staples", "Consumer Staples", "\U0001F6D2", "#2e7d32",
     "Food and drug retail, food producers and distributors."),
    ("industrials", "Industrials", "\U0001F3ED", "#5d4037",
     "Diversified industrials, construction, logistics, packaging and services."),
    ("materials", "Basic Materials", "\u26CF", "#455a64",
     "Mining (PGMs, gold, coal, iron ore, manganese, chrome), chemicals, paper."),
    ("energy", "Energy", "\u26FD", "#e65100",
     "Integrated energy, oil and gas and fuel distribution."),
    ("utilities", "Utilities", "\U0001F4A1", "#0097a7",
     "Listed utilities are rare -- Eskom and Transnet are state-owned."),
]

SECTOR_BY_ID = {sector[0]: sector for sector in SECTORS}

# Yahoo Finance exchange suffix for Johannesburg-listed instruments.
JSE_SUFFIX = ".JO"


def yahoo_symbol(jse_code):
    """Return the Yahoo Finance symbol for a JSE share code."""
    return f"{jse_code}{JSE_SUFFIX}"


def sector_meta(sector_id):
    """Return a JSON-ready dict describing one sector bucket."""
    ident, name, icon, colour, blurb = SECTOR_BY_ID[sector_id]
    return {
        "id": ident,
        "name": name,
        "icon": icon,
        "color": colour,
        "blurb": blurb,
    }
