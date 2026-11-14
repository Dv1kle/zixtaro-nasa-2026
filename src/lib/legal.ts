// The legal pages' text: what the tool is and is not, what a visit leaves behind and where it goes, the terms of
// using it. Written from what the code does - the storage keys, the hosts a visit asks, the absence of cookies and
// analytics were read from a running page, not assumed - so a change to any of those is a change here.
// legal.test.ts holds the claims that can be held: no analytics or cookie code in the source, every host the app
// calls named below.
//
// It is a prototype's plain statement, not a lawyer's work: before the site takes money or accounts, have it read.

/** Who answers for the site. The owner fills these in before publishing; an empty value is said so on the page. */
export const OPERATOR: { name: string; contact: string; repository: string; host: string; updated: string } = {
  /** who "we" is on these pages */
  name: 'the Zixtaro team',
  /** an address for legal and privacy requests - not a personal one */
  contact: '',
  /** the public repository, once there is one */
  repository: '',
  /** the hosting provider of the published site, once it is deployed */
  host: '',
  updated: '2026-11-14',
}

export type Clause = { k: string; v: string }

// ---------- what Zixtaro is, and is not ----------

export const NOT_ADVICE: Clause[] = [
  { k: 'A tool to think with', v: 'Zixtaro compares crops and rotations for a field from open records of weather, soil and prices. It shows patterns and possibilities. It does not tell you what to sow, and it does not replace your judgement, your records or a local agronomist.' },
  { k: 'Regional data, not your field', v: 'The weather is one NASA POWER cell of about 50 km; the soil is a model at 250 m unless you enter a lab test; prices are national records. A frost hollow, a wet corner, last year’s herbicide or the buyer down the road are not in the model.' },
  { k: 'Estimates, with their limits', v: 'Yields, losses, margins, soil carbon and nitrate figures are estimates for comparing options. None is a forecast, a guarantee of a harvest or of income, or a valuation. The forecast is a model’s, not a promise. What the model cannot do is listed in Method, under Limits.' },
  { k: 'Check before you act', v: 'Before changing a rotation, buying seed or signing a contract, take the plan to a qualified agronomist or your extension service, and to your own field records. Rules on pesticides, nitrates, water rights and subsidies differ by place and are not checked here.' },
]

export const AI_NOTICE: Clause[] = [
  { k: 'No black box makes the recommendation', v: 'The ranking and the plans come from a written model - a water balance (FAO-56), crop requirements, rotation rules, prices - whose every parameter is listed with its source in Method, under Every number. No machine-learned or generative model produces a score, a plan or a sentence of advice.' },
  { k: 'Where AI was used', v: 'The site’s code and interface were written with an AI coding assistant (Claude, by Anthropic), directed and reviewed by the authors. The tour is read aloud by your browser’s own speech voice, which is synthetic. The pictures of crops and the 3D scenes are drawn by the site’s code, not by an image generator.' },
  { k: 'What that means for you', v: 'Software written with such help can be wrong in ways its authors missed. The numbers are held by tests and by a published validation, failures included (Method, Validation) - which lowers that risk and does not remove it.' },
]

export const NOT_NASA: Clause[] = [
  { k: 'An independent project', v: 'Zixtaro was made for the NASA Space Apps Challenge 2026 (“Field Shift: Adapting Farms with NASA Data”). It is not affiliated with, sponsored by or endorsed by NASA or any other agency or data provider named on this site.' },
  { k: 'NASA’s name and data', v: 'NASA data and imagery are used under NASA’s open data policy. NASA and mission names appear only to say where a number comes from. The site uses no NASA insignia or logo, and nothing here is an official NASA product or statement.' },
]

// ---------- privacy ----------

/** What a visit leaves in the visitor's own browser. The keys are the app's (lib/storage, lib/api, lib/farm). */
export const STORED: { what: string; where: string; why: string }[] = [
  { what: 'Your farm: the fields and greenhouses you save, their place and outline, crop history, priorities, soil test and prices', where: 'local storage', why: 'so they are there when you come back' },
  { what: 'Answers already fetched for a place (weather, soil, forecast)', where: 'local storage', why: 'so a field opens quickly and works offline' },
  { what: 'The tour’s sound switch', where: 'local storage', why: 'to keep your settings' },
  { what: 'That the opening film has played', where: 'session storage', why: 'so it plays once per visit' },
  { what: 'The site’s own files and the fields you opened', where: 'the browser’s offline cache (published site only)', why: 'so the site works without a connection' },
]

/** The services a visitor's browser asks directly. Each sees the visitor's IP address and what is asked. */
export const ASKED: { who: string; host: string; gets: string; when: string }[] = [
  { who: 'EOX (Sentinel-2 cloudless, place names)', host: 'tiles.maps.eox.at', gets: 'the map tiles around the field', when: 'always' },
  { who: 'Geoportal.lt (Lithuania’s orthophoto)', host: 'www.geoportal.lt', gets: 'the map tiles around the field', when: 'when the field is in Lithuania' },
  { who: 'Amazon Web Services (Terrain Tiles)', host: 's3.amazonaws.com', gets: 'the elevation tiles around the field', when: 'always' },
  { who: 'Open-Meteo', host: 'api.open-meteo.com', gets: 'the field’s coordinates', when: 'always' },
  { who: 'NASA (GIBS)', host: 'gibs.earthdata.nasa.gov', gets: 'the map tiles of a satellite layer around the field', when: 'when a layer is switched on, or past seasons are read from space' },
  { who: 'NASA (POWER)', host: 'power.larc.nasa.gov', gets: 'the field’s coordinates', when: 'for any place that is not a demo field; for the second rain record' },
  { who: 'ISRIC (SoilGrids)', host: 'rest.isric.org', gets: 'the field’s coordinates', when: 'for any place that is not a demo field' },
  { who: 'OpenStreetMap (Nominatim)', host: 'nominatim.openstreetmap.org', gets: 'what you type in the search, or the coordinates you pick', when: 'when you search or pick a place' },
  { who: 'USDA, Agriculture Canada, IGN, Landbrugsstyrelsen', host: 'pdi.scinet.usda.gov, agriculture.canada.ca, data.geopf.fr, geodata.fvm.dk', gets: 'a small window around the field', when: 'for fields in the USA, Canada, France or Denmark' },
  { who: 'Google', host: 'maps.googleapis.com', gets: 'the field’s coordinates', when: 'only if the site was built with a Street View key' },
  { who: 'Google Maps, by a link', host: 'www.google.com', gets: 'the field’s coordinates, in the link’s address', when: 'only when you follow the link to the roadside view or the map' },
]

export const PRIVACY: Clause[] = [
  { k: 'No account, no cookies, no analytics', v: 'Zixtaro has no sign-up and no login. It sets no cookies and loads no analytics, advertising or social-media scripts. Nobody is counted or followed.' },
  { k: 'Your farm stays in your browser', v: 'Fields, outlines, crop history, soil tests and prices you enter are kept in this browser’s own storage, on your device. They are not sent to us: there is no server of ours to send them to. Clearing the site’s data in the browser removes them.' },
  { k: 'A field’s place is sent to the data services', v: 'To fetch a field’s weather, soil and map, your browser asks the services listed below directly. Each of them receives your IP address and the coordinates or map tiles asked for, and handles them under its own privacy policy. A field’s place can say where a farm is: do not enter one you would not share with them.' },
  { k: 'A shared link carries the field', v: 'The Share link and its QR code hold the scenario - the place, crops and settings - in the address itself. Whoever has the link sees that field. Nothing is uploaded when you make one.' },
  { k: 'Server logs', v: 'The site is a set of static files. The provider that hosts them keeps the usual access log - IP address, time, the file asked for, browser type - for security and to keep the service running. We do not combine those logs with anything, and we do not receive what you enter.' },
  { k: 'Children', v: 'The site is not directed at children and asks nobody for personal details.' },
  { k: 'Your rights and requests', v: 'Because the site keeps nothing about you on a server of ours, there is usually nothing for us to hand over, correct or delete: what exists is in your browser, under your control. Questions and requests under data-protection law go to the contact below.' },
  { k: 'Changes', v: 'If the site ever starts to collect anything - an account, analytics, an error reporter - this page is changed first, with the date.' },
]

// ---------- terms of use ----------

export const TERMS: Clause[] = [
  { k: 'What this is', v: 'A prototype made for a hackathon and offered free of charge, as it is. By using it you accept these terms and the notice on what the tool is and is not.' },
  { k: 'No warranty', v: 'The site and everything it shows come without warranty of any kind: of accuracy, of fitness for a purpose, of being available tomorrow. Data services it depends on can change or stop without notice.' },
  { k: 'Your decisions are yours', v: 'What you grow, buy, sell or sign remains your decision and your responsibility. To the extent the law allows, the authors are not liable for a loss that follows from relying on the site.' },
  { k: 'Fair use of the data services', v: 'The open services behind the site are shared and rate-limited. Do not script the site to harvest them, and do not use it to geocode in bulk. Each service’s own terms apply to what your browser asks of it; the free weather service is for non-commercial use.' },
  { k: 'The code and the data', v: 'The site’s own code and text are open source under the Apache License 2.0. Data, imagery, typefaces and other third-party material keep their own licences - each is named under Sources. Reusing a number from the site means crediting its source as well.' },
  { k: 'Names', v: 'NASA, mission names and the names of data providers belong to their owners and are used here only to name sources. Zixtaro is not endorsed by any of them.' },
  { k: 'Changes', v: 'These terms may change as the prototype does; the date at the foot of the page says when they last did.' },
]
