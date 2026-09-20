# England & Wales Electricity Pool — Data Folder

The Electricity Pool of England & Wales operated from **1 April 1990 to 26 March 2001** (last trading day 26 March 2001), replacing the state-owned CEGB monopoly. It was the world's first privatised competitive wholesale electricity market, and it is the historical ancestor of today's SAWEM System Marginal Price (SMP) design in South Africa.

## Files in this folder

| File | Description |
|---|---|
| `england-wales-pool-annual-summary.csv` | Compiled annual summary (1990–2001) of SMP, capacity charge, PPP, PSP and uplift. **Indicative only** — compiled from published literature (OFFER/Ofgem, DUKES, NBER w8248, academic papers). |
| `Electricity_since_1920.xlsx` | Official UK government (DESNZ / BEIS) historical electricity dataset, 1920–2025, downloaded from GOV.UK (30 Jul 2026 edition). Source: https://www.gov.uk/government/statistical-data-sets/historical-electricity-data |
| `w8248_england_wales_pool_wolak_patrick.pdf` | NBER Working Paper 8248 — Wolak & Patrick (2001), *The Impact of Market Rules and Market Structure on the Price Determination Process in the England and Wales Electricity Market*. The definitive academic study of Pool price formation and market power (4 fiscal years of half-hourly bids/prices). |

## The authoritative half-hourly Pool dataset (external)

The complete half-hourly dataset — **~200,000 records** of gross demand, SMP, LOLP, PPP, PSP, transmission losses — covering 1 Apr 1990 – 26 Mar 2001 is held by the **UKERC Energy Data Centre (EDC)** (dataset "UK Electricity Pool Demand and Price (1990-2001)", owner **Poolit Ltd**):

- Dataset page: https://ukerc.rl.ac.uk/cgi-bin/dataDiscover.pl?Action=detail&dataid=30415dec-7f35-4f71-9544-a2a9025a9a34
- Archive path: https://data.ceda.ac.uk/edc/d1/30415dec-7f35-4f71-9544-a2a9025a9a34
- **Registration required** (free, academic/research use): https://services.ceda.ac.uk/services/archive/edc_electricity_pool/
- Format: text/csv. Mandatory acknowledgement of UKERC EDC and Poolit Ltd in any publication.

### Parameters in the UKERC dataset
- `Year, Month, Day, Week, Day number, Day name, Day type, Period, Time`
- `SMP` — System Marginal Price (£/MWh): highest offer price of any generating set scheduled by the Pool before constraints.
- `LOLP` — Loss Of Load Probability per half-hour (decreasing function of spare capacity).
- `PPP` — Pool Purchase Price = SMP + CC (paid to generators).
- `PSP` — Pool Selling Price = PPP + UPLIFT (paid by suppliers/RECs).
- `Table` — pricing-rule regime (Table A: capacity charge + uplift applies; Table B: no capacity charge), plus transmission losses (MWh) and gross system demand (MWh).

## Other useful external sources

1. **GOV.UK / DUKES** — Historical electricity data series (1920–2025) incl. UK generation, capacity, fuel mix and average prices: https://www.gov.uk/government/statistical-data-sets/historical-electricity-data
2. **NBER w8248** — Wolak & Patrick (2001), DOI 10.3386/w8248: https://www.nber.org/papers/w8248 (PDF already included in this folder)
3. **Computational modelling of price formation** — Journal of Economic Dynamics & Control (2009), Bunn & Martoccia: https://www.sciencedirect.com/science/article/pii/S0165188908001176
4. **JSTOR — The Electricity Contract Market in England and Wales** (1997, Powell): https://www.jstor.org/stable/117509

## Key facts for the record (from the literature)

- **Structure at launch (1990):** National Power (~46% capacity) and PowerGen (~28%) — private duopoly; Nuclear Electric (incl. Scottish Power interconnector + imports) remainder; National Grid Company (NGC) as independent system operator owning the transmission network.
- **SMP rule:** SMP was set by the highest accepted *unconstrained* offer; the capacity charge CC = LOLP × (VOLL − SMP); PPP = SMP + CC; PSP = PPP + UPLIFT.
- **T&D transfer:** CEGB's grid + pumped storage → **NGC** (1990), privatised by flotation in Dec 1995. Distribution → 12 Regional Electricity Companies (RECs), floated Dec 1990.
- **Market power:** Wolak & Patrick (2001) quantify that National Power + PowerGen used *capacity-withholding* plus high bids to push SMP substantially above marginal cost, especially in peak periods (spikes > £500/MWh during 1991–94 winters).
- **Divestitures:** MMC (1996) → National Power divested 4,000 MW (selling Drax etc. eventually to AES) and PowerGen 2,000 MW (later to TXU), halving their market share by ~2000.
- **Outcomes:** CCGT "dash for gas" added ~20 GW by 2000 (~40% of generation); coal fell from ~67% to ~30%; real wholesale prices fell ~25% by late 1990s; entry, full retail competition (1998/99); the Pool was replaced by NETA (BETTA) on 27 Mar 2001.

*Compiled 2026 for the South Africa Dashboard - Thesis section. Figures marked "indicative" should be verified against the UKERC dataset or primary sources before academic citation.*
