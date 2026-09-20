"""Paths, source URLs and tunables for the policy tracker module.

The tracker is fed from a single upstream source of record -- the Energy
Council of South Africa's Policy and Regulations Review tracker -- plus a
hand-authored overlay that carries the annotations the source does not
publish (plain-English summaries, links to the dashboard's own briefing
pages, amendment lineage and watch-list items).
"""
from pathlib import Path

# Dashboard root = the directory that contains this package.
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
POLICY_DIR = DATA_DIR / "policy"

# Generated state: the "current reality" the page renders.
STATE_FILE = POLICY_DIR / "policy-tracker.json"
# Hand-authored annotations merged over the parsed source (never generated).
OVERLAY_FILE = POLICY_DIR / "curated-overlay.json"
# Raw upstream payloads kept for debugging a parse that goes wrong.
SNAPSHOT_DIR = POLICY_DIR / "_snapshots"

# --- Upstream source of record -----------------------------------------
# The tracker lists each instrument with its issuing authority, a status
# sentence, an issuance date and a comment due date.
TRACKER_URL = "https://energycouncil.org.za/policy-tracker/"
SOURCE_NAME = "Energy Council of South Africa — Policy and Regulations Review Tracker"

# --- HTTP ---------------------------------------------------------------
# A desktop browser user-agent is required: the site answers 403 to the
# default urllib agent.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 25  # seconds, per request

# --- Freshness ----------------------------------------------------------
# How long a generated state stays "fresh" before the page flags it stale.
# Policies move on a scale of weeks, so a week is a reasonable horizon.
STATE_TTL_SECONDS = 7 * 24 * 60 * 60

# Cap the changelog so the file does not grow without bound. Newest first.
MAX_CHANGES = 400

# The four upstream process stages, in order. ``tone`` selects the badge
# colour on the page; ``key`` is the CSS class the upstream site uses
# (pt-orange, pt-blue, pt-green, pt-red).
STAGES = (
    {
        "id": "open",
        "label": "Open",
        "short": "Open",
        "description": "Public comment period is active on this instrument.",
        "tone": "open",
        "order": 1,
    },
    {
        "id": "consolidation",
        "label": "Input Consolidation",
        "short": "Consolidating",
        "description": "Comments have closed; the authority is working through submissions.",
        "tone": "consolidation",
        "order": 2,
    },
    {
        "id": "approved",
        "label": "Approved",
        "short": "Approved",
        "description": "Finalised by the issuing authority and no longer open to comment.",
        "tone": "approved",
        "order": 3,
    },
    {
        "id": "closed",
        "label": "Closed",
        "short": "Closed",
        "description": "The process has concluded and the instrument is no longer under review.",
        "tone": "closed",
        "order": 4,
    },
    {
        "id": "in-force",
        "label": "In Force",
        "short": "In force",
        "description": "Signed, gazetted and operative. Amended only by a later instrument.",
        "tone": "in-force",
        "order": 5,
    },
    {
        "id": "amended",
        "label": "Amended",
        "short": "Amended",
        "description": "Superseded or amended by a later instrument. See its amendment lineage.",
        "tone": "amended",
        "order": 6,
    },
)

STAGE_BY_ID = {stage["id"]: stage for stage in STAGES}

# Upstream CSS colour class -> canonical stage id. The tracker marks the
# title and status cells of every row with one of these.
STAGE_BY_TONE_CLASS = {
    "pt-orange": "open",
    "pt-blue": "consolidation",
    "pt-green": "approved",
    "pt-red": "closed",
}

# Sector keys as they appear in the upstream post classes (sector-power).
SECTORS = (
    {"id": "power", "label": "Power", "icon": "bolt"},
    {"id": "gas", "label": "Gas", "icon": "flame"},
    {"id": "fuels", "label": "Fuels", "icon": "fuel"},
    {"id": "general", "label": "General", "icon": "clipboard"},
)

SECTOR_BY_ID = {sector["id"]: sector for sector in SECTORS}

# Instrument kinds, in the order the page groups them.
INSTRUMENTS = (
    {"id": "legislation", "label": "Legislation", "short": "Act"},
    {"id": "bill", "label": "Bills", "short": "Bill"},
    {"id": "regulation", "label": "Regulations", "short": "Reg."},
    {"id": "policy", "label": "Policy & Plans", "short": "Policy"},
    {"id": "framework", "label": "Frameworks", "short": "Framework"},
    {"id": "determination", "label": "Determinations", "short": "Determ."},
)
