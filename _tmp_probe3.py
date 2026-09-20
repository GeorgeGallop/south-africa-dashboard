"""Throwaway probe 3: pull the inline Highcharts data out of the WGB page."""
import re
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

URL = "https://www.worldgovernmentbonds.com/country/south-africa/"

req = urllib.request.Request(URL, headers={
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "en-US,en;q=0.9",
})
with urllib.request.urlopen(req, timeout=25) as resp:
    html = resp.read().decode("utf-8", "replace")

print("page bytes:", len(html))

# 1. All inline script bodies
scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S | re.I)
print("inline script blocks:", len(scripts))

KEYWORDS = ("series", "jsGlobal", "bond10y", "Highcharts.chart", "categories", "data:")
for i, body in enumerate(scripts):
    if any(k in body for k in KEYWORDS):
        print(f"\n--------- inline script #{i} ({len(body)} chars) ---------")
        print(body[:4000])

# 2. Any occurrence of jsGlobalResult assignment
for match in re.findall(r"jsGlobalResult\s*=\s*[^;]{0,600}", html):
    print("\n>>> jsGlobalResult assignment:", match[:600])

# 3. Hunt for the async endpoint that fills the placeholders
for match in sorted(set(re.findall(r"[\"']([^\"'\s]*(?:async|ajax|getData|global-result)[^\"'\s]*)[\"']", html, re.I))):
    print(">>> endpoint:", match)

print("\n=== jsGlobalResult|bond variable names present ===")
print(sorted(set(re.findall(r"jsGlobalResult\|([A-Za-z0-9_]+)", html))))
