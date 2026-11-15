# Zixtaro against the NASA Space Apps rules

Checked on **2026-11-14** against the *2026 NASA Space Apps Participant Terms and Conditions*
(<https://www.spaceappschallenge.org/legal/>), the *Project Submission Guide* and the *Judging & Awards Guide*
(<https://www.spaceappschallenge.org/resources/>). An engineer's check of the repository against the published text,
not legal advice.

## What the rules ask, and where the project stands

| Requirement | Where Zixtaro stands | Evidence |
| --- | --- | --- |
| Responds to an official challenge | "Field Shift: Adapting Farms with NASA Data". | README, the site's first screen |
| Uses NASA data (required for a Global Award) | NASA POWER, GPM IMERG, SMAP, MODIS/VIIRS, GRACE/GRACE-FO, SRTM, NEX-GDDP-CMIP6, through NASA's own services. | README "Data sources", the site's Sources page |
| English on the submission page and in everything it links to | The site, the repository's documents and the code comments are in English. The language menu, the shipped translations and the recorded narration were removed on 2026-11-14. | `src/lib/i18n.ts` |
| Original content is open source | Apache License 2.0, the licence the terms themselves fall back on. | `LICENSE`, `NOTICE`, `package.json` |
| Third-party materials are open, their licences identified | Every material is listed with its maker and licence. Three are not plainly open: see below. All 54 shipped software packages are under OSI-approved or public-domain terms, and a test fails on any other. | `THIRD_PARTY.md`, `src/lib/attribution.test.ts` |
| Every source cited | Data, maps, typefaces, objects and software are named; every parameter of the model cites its paper; the acknowledgements NASA and the other providers ask for are in the README. | `THIRD_PARTY.md`, README, Method -> Every number |
| AI ("SI") use declared, in text and metadata | README "Use of AI", the site's Legal page, `package.json` (`aiAssistance`), `Co-Authored-By` trailers on the commits. No AI-generated image, video or audio is in the project. | README |
| No personal data; nobody under 18 pictured or heard | No personal data in any tracked file; the site has no account, cookies or analytics. | `src/lib/legal.test.ts` |
| No commercial promotion, nothing offensive | None. | - |

## The three materials that are not plainly open

Checked at the providers' own pages on 2026-11-14.

1. **GAEZ v4** (FAO and IIASA; `src/lib/gaez-tables.ts`, `src/data/perennials.json`). CC BY-NC-SA: non-commercial
   and share-alike. It is in the score and cannot be dropped. NASA names GAEZ among this challenge's own resources
   and asks participants to follow each site's terms: the project is non-commercial, credits FAO/IIASA, and keeps the
   transcribed tables under GAEZ's licence rather than Apache 2.0 (`NOTICE`).
2. **Open-Meteo** (weather now and the 16-day outlook). The data is CC BY 4.0; the free API is for non-commercial use
   and rate-limited. Fine for the hackathon, credited with a link.
3. **Google Street View**. Off: it needs a key the public build does not have. The page links out to Google Maps.

The map's imagery is open: Sentinel-2 cloudless 2016 (EOX, from Copernicus Sentinel-2 of ESA) is CC BY 4.0, and
Lithuania's orthophoto ORT10LT is published by the National Land Service as a high-value dataset under CC BY 4.0
(<https://data.gov.lt/datasets/2564/>, read 2026-11-14). It is read through geoportal.lt's map service, which asks
to be told when it is used in another system (pagalba@geoportal.lt): a courtesy still owed, not a licence term.

Removed because they could not be made open: the WorldClim 2.1 rain table (no redistribution), the recorded
English tour voice (trained on a non-commercial corpus) and Esri World Imagery (Esri's terms; replaced by
Sentinel-2 cloudless 2016, CC BY 4.0, ESA Copernicus data). The tour is now read by the browser's own voice.

## Still the owner's

- **Contact address and host** on the Legal page: `OPERATOR.contact` and `OPERATOR.host` in `src/lib/legal.ts`.
- **The e-mail address in the git history.** Commits before 2026-11-14 carry the author's personal address; the
  repository is private until that is decided.
- **The demo** (a video of at most 30 seconds or at most seven slides, in English) and the submission form's fields
  are not in the repository.
