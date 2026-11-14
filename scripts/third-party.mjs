// Writes THIRD_PARTY.md at the repository root from the one list of everything Zixtaro did not make
// (src/lib/attribution.ts - the list the site's own Sources and Licence pages show) and from package-lock.json
// (every package in the built site, with the licence its own package.json declares).
//
//   node scripts/third-party.mjs          (Node 23.6+: it imports the TypeScript list directly)
//
// Run it after changing a dependency or a line of attribution.ts; src/lib/attribution.test.ts fails while the file
// is out of step.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const A = await import(pathToFileURL(join(root, 'src/lib/attribution.ts')).href)
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))

/** every installed package: name, version, licence (the lock's, else the package's own), and whether it is dev-only */
function packages() {
  const out = []
  for (const [path, v] of Object.entries(lock.packages)) {
    if (!path) continue
    let licence = v.license
    const pj = join(root, path, 'package.json')
    if (!licence && existsSync(pj)) {
      const j = JSON.parse(readFileSync(pj, 'utf8'))
      licence = typeof j.license === 'string' ? j.license : (j.license?.type ?? j.licenses?.map((x) => x.type).join(' OR '))
    }
    out.push({ name: path.replace(/^.*node_modules\//, ''), version: v.version, licence: Array.isArray(licence) ? licence.join(' OR ') : (licence ?? 'UNKNOWN'), dev: !!v.dev })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const cell = (s) => String(s).replace(/\|/g, '\\|')
const table = (items) =>
  ['| Material | By | Used for | Use | Terms | Licence |', '| --- | --- | --- | --- | --- | --- |', ...items.map((c) => `| [${cell(c.name)}](${c.url}) | ${cell(c.by)} | ${cell(c.what)}${c.note ? ` *${cell(c.note)}*` : ''} | ${c.use} | ${A.TERMS_LABEL[c.terms]} | ${cell(c.licence)} |`)].join('\n')

const all = packages()
const prod = all.filter((p) => !p.dev)
const dev = all.filter((p) => p.dev)
const byLicence = (list) => {
  const m = new Map()
  for (const p of list) m.set(p.licence, (m.get(p.licence) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

const md = `# Third-party materials

Everything in Zixtaro that its authors did not make - data, imagery, software, typefaces, scanned objects, voices -
with who made it, how it is used here and the terms it comes under. Zixtaro's own code and text are under the
Apache License 2.0 (see [LICENSE](LICENSE)); nothing below is covered by that licence.

This file is generated: \`node scripts/third-party.mjs\` writes it from \`src/lib/attribution.ts\` (the list the
site's own Sources and Licence pages show) and \`package-lock.json\`. Do not edit it by hand.

Last checked: **${A.CHECKED}**.

**Use**: *live* - asked by the visitor's browser; *bundled* - a file in this repository; *check* - validation only,
not in the page; *optional* - off unless configured; *build* - used to make the site, not shipped.

**Terms**: *open* - public domain, CC0, or a licence approved by the Open Source Initiative; *credit required* - free
to use and pass on with attribution; *terms apply* - conditions beyond credit (non-commercial, no redistribution, or
a provider's own terms of use); *not confirmed* - the licence was not confirmed when this list was last checked.

## Not plainly open

The NASA Space Apps Challenge asks that non-NASA materials be "freely and publicly available without restriction
or, at a minimum, ... licensed as open source". These ${A.OPEN_QUESTIONS.length} are not, or were not confirmed. Each
needs a decision before the project is published; [docs/SPACE-APPS-COMPLIANCE.md](docs/SPACE-APPS-COMPLIANCE.md)
says what the choices are.

${A.OPEN_QUESTIONS.map((c) => `- **${c.name}** (${A.TERMS_LABEL[c.terms]}, ${c.use}): ${c.licence}.${c.note ? ` ${c.note}` : ''}`).join('\n')}

## NASA and its missions

${table(A.NASA_DATA)}

## Open data

${table(A.OPEN_DATA)}

## Maps and imagery

${table(A.MAPS)}

## Typefaces, objects, voices

${table([...A.FONTS, ...A.ASSETS])}

The scanned objects and skies are listed file by file in [src/assets/cc0/README.md](src/assets/cc0/README.md).

## Software

${table(A.SOFTWARE)}

### Every package in the built site

${prod.length} packages are installed for the site itself (\`dependencies\` of package.json and what they bring).
By licence: ${byLicence(prod).map(([l, n]) => `${l} × ${n}`).join(', ')}.

| Package | Version | Licence |
| --- | --- | --- |
${prod.map((p) => `| ${p.name} | ${p.version} | ${cell(p.licence)} |`).join('\n')}

### Development tools

${dev.length} more packages are installed only to build and test the site and are not shipped.
By licence: ${byLicence(dev).map(([l, n]) => `${l} × ${n}`).join(', ')}.

## Scientific literature

The papers and handbooks behind each parameter of the model are cited one by one in the parameter registry
(\`src/lib/evidence.ts\`; on the site: Method, Every number), with a DOI or a link for each.

## Tools used to make the site

- **Claude** (Anthropic), an AI coding assistant: the site's code and interface text were written with it, directed
  and reviewed by the authors. The commits it took part in are marked \`Co-Authored-By\` in the history.
- The tour is read aloud by the visitor's browser (the Web Speech API): no recorded or generated voice is shipped.
- The crop pictures and the 3D scenes are drawn by the site's own code (three.js), not by an image generator.

No machine-learned or generative model produces a score, a plan or a sentence of advice in the running site.
`

writeFileSync(join(root, 'THIRD_PARTY.md'), md)
console.log(`THIRD_PARTY.md: ${A.ALL_CREDITS.length} materials, ${prod.length} shipped packages, ${dev.length} development packages, ${A.OPEN_QUESTIONS.length} not plainly open`)
