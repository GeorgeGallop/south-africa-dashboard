"""The covered JSE listings, as a compact ``code|name|sector`` table."""

_TABLE = """
NPN|Naspers|tech
PRX|Prosus|tech
DTC|Datatec|tech
CTA|Capital Appreciation|tech
EOH|EOH Holdings|tech
MST|Mustek|tech
PBG|PBT Group|tech
ISA|ISA Holdings|tech
MTN|MTN Group|telecom
VOD|Vodacom Group|telecom
TKG|Telkom SA|telecom
BLU|Blue Label Telecoms|telecom
HUG|Huge Group|telecom
APN|Aspen Pharmacare|health
NTC|Netcare|health
LHC|Life Healthcare|health
AIP|Adcock Ingram|health
ACT|Afrocentric Investment|health
FSR|FirstRand|financials
SBK|Standard Bank Group|financials
CPI|Capitec Bank|financials
INL|Investec Ltd|financials
INP|Investec plc|financials
SLM|Sanlam|financials
ABG|Absa Group|financials
NED|Nedbank Group|financials
OMU|Old Mutual|financials
OUT|OUTsurance|financials
REM|Remgro|financials
SNT|Santam|financials
RNI|Reinet Investments|financials
MTM|Momentum Metropolitan|financials
DSY|Discovery|financials
JSE|JSE Ltd|financials
KST|PSG Financial Services|financials
ARC|African Rainbow Capital|financials
TCP|Transaction Capital|financials
BAT|Brait|financials
PPE|Purple Group|financials
AFH|Alexander Forbes|financials
CLI|Clientele|financials
SFN|Sasfin|financials
SAB|Sabvest Capital|financials
QLT|Quilter|financials
ZED|Zeder Investments|financials
NRP|NEPI Rockcastle|realestate
GRT|Growthpoint Properties|realestate
RDF|Redefine Properties|realestate
RES|Resilient REIT|realestate
FFB|Fortress REIT A|realestate
VKE|Vukile Property Fund|realestate
MSS|MAS Real Estate|realestate
SSS|Stor-Age Property REIT|realestate
HYP|Hyprop Investments|realestate
EQU|Equites Property Fund|realestate
EMI|Emira Property Fund|realestate
FTA|Fairvest|realestate
ATT|Attacq|realestate
SAC|SA Corporate Real Estate|realestate
OCT|Octodec Investments|realestate
DIB|Dipula Income Fund|realestate
AWA|Arrowhead Properties A|realestate
SEA|Spear REIT|realestate
LTE|Lighthouse Capital|realestate
TEX|Texton Property Fund|realestate
SRE|Sirius Real Estate|realestate
CFR|Compagnie Financiere Richemont|discre
WHL|Woolworths Holdings|discre
MRP|Mr Price Group|discre
PPH|Pepkor Holdings|discre
TFG|The Foschini Group|discre
MCG|MultiChoice Group|discre
ITE|Italtile|discre
MTH|Motus Holdings|discre
TRU|Truworths|discre
SUI|Sun International|discre
ADH|Advtech|discre
COH|Curro Holdings|discre
FBR|Famous Brands|discre
CMH|Combined Motor Holdings|discre
CAT|Caxton and CTP Publishers|discre
SUR|Spur Corporation|discre
SDO|Stadio Holdings|discre
MTA|Metair Investments|discre
CLH|City Lodge Hotels|discre
EMH|eMedia Holdings|discre
TSG|Tsogo Sun|discre
HDC|Hudaco Industries|discre
SHP|Shoprite Holdings|staples
BID|Bidcorp|staples
CLS|Clicks Group|staples
DCP|Dis-Chem Pharmacies|staples
PIK|Pick n Pay Stores|staples
TBS|Tiger Brands|staples
AVI|AVI Ltd|staples
SPP|The SPAR Group|staples
OCE|Oceana Group|staples
RCL|RCL Foods|staples
PMR|Premier Group|staples
ARL|Astral Foods|staples
LBR|Libstar Holdings|staples
RFG|RFG Holdings|staples
SHG|Sea Harvest Group|staples
KAL|Kaap Agri|staples
BVT|Bidvest Group|industrials
BAW|Barloworld|industrials
RLO|Reunert|industrials
SPG|Super Group|industrials
GND|Grindrod|industrials
RBX|Raubex Group|industrials
KAP|KAP Industrial Holdings|industrials
WBO|Wilson Bayly Holmes-Ovcon|industrials
PPC|PPC Ltd|industrials
NPK|Nampak|industrials
TRE|Trencor|industrials
WKF|Workforce Holdings|industrials
SNV|Santova|industrials
MUR|Murray and Roberts|industrials
AEG|Aveng|industrials
ADR|Adcorp Holdings|industrials
SSK|Stefanutti Stocks|industrials
VLE|Value Group|industrials
MMP|Marshall Monteagle|industrials
BHG|BHP Group|materials
AGL|Anglo American|materials
GLN|Glencore|materials
ANG|AngloGold Ashanti|materials
VAL|Valterra Platinum (ex-Amplats)|materials
KIO|Kumba Iron Ore|materials
GFI|Gold Fields|materials
IMP|Impala Platinum|materials
MNP|Mondi|materials
SSW|Sibanye-Stillwater|materials
HAR|Harmony Gold|materials
EXX|Exxaro Resources|materials
NPH|Northam Platinum|materials
TGA|Thungela Resources|materials
ARI|African Rainbow Minerals|materials
SAP|Sappi|materials
DRD|DRDGOLD|materials
PAN|Pan African Resources|materials
AFE|AECI|materials
AFT|Afrimat|materials
OMN|Omnia Holdings|materials
MRF|Merafe Resources|materials
ACL|ArcelorMittal South Africa|materials
JBL|Jubilee Metals Group|materials
ORN|Orion Minerals|materials
WEZ|Wesizwe Platinum|materials
MCZ|MC Mining|materials
S32|South32|materials
SOL|Sasol|energy
TLM|TotalEnergies Marketing SA|energy
REN|Renergen|energy
MTT|Montauk Renewables|energy
HUL|Hulisani|utilities
"""

# JSE codes that the upstream provider carries no live listing for. They stay
# in the table above for completeness but are excluded from the fetched
# universe, so the page reports coverage honestly instead of showing a gap.
UNAVAILABLE = {
    "AIP", "ARC", "AWA", "BAW", "CLI", "COH", "CTA", "EOH", "HUL", "MCG",
    "MSS", "MTT", "MUR", "PBG", "REN", "RFG", "SAB", "SFN", "TCP", "TRE",
    "VLE", "WKF",
}


def _parse(table):
    """Turn the pipe-delimited table into ``(code, name, sector)`` triples."""
    listings = []
    for line in table.strip().splitlines():
        parts = line.split("|")
        if len(parts) != 3:
            continue
        code, name, sector = (part.strip() for part in parts)
        if not (code and name and sector):
            continue
        if code in UNAVAILABLE:
            continue
        listings.append((code, name, sector))
    return listings


#: ``(jse_code, company_name, sector_id)`` for every covered listing.
UNIVERSE = _parse(_TABLE)
