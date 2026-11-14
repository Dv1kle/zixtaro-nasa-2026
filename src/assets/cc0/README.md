# Found, not built: CC0 scans and skies

Everything in this folder comes from [Poly Haven](https://polyhaven.com) and is **CC0** (public domain): no
attribution is required. It is given anyway, because someone went out and scanned these.

| File(s) | Poly Haven asset | Used in |
|---|---|---|
| `industrial_sunset_puresky_1k.hdr` | [industrial_sunset_puresky](https://polyhaven.com/a/industrial_sunset_puresky) | the market yard: what its steel and wet concrete reflect |
| `evening_field_1k.hdr` | [evening_field](https://polyhaven.com/a/evening_field) | the soil scene; the glass of the greenhouse cutaway |
| `cement_bag.*` | [cement_bag](https://polyhaven.com/a/cement_bag) | sacks on pallets: market yard, nursery yard |
| `Barrel_01.*` | [Barrel_01](https://polyhaven.com/a/Barrel_01) | drums: market yard, nursery yard |
| `old_tyre.*` | [old_tyre](https://polyhaven.com/a/old_tyre) | tyres: market yard, nursery yard |
| `wooden_crate_02.*` | [wooden_crate_02](https://polyhaven.com/a/wooden_crate_02) | crates: market yard, nursery yard |
| `metal_jerrycan.*` | [metal_jerrycan](https://polyhaven.com/a/metal_jerrycan) | fuel cans: market yard, nursery yard |
| `concrete_road_barrier.*` | [concrete_road_barrier](https://polyhaven.com/a/concrete_road_barrier) | barriers: market yard, nursery yard |
| `rusted_spade_01.*` | [rusted_spade_01](https://polyhaven.com/a/rusted_spade_01) | the spade of the Method page's "Farmers" chapter |

## How they got here

`scripts/cc0/cc0get.py <dir>` downloads the 1k glTF of each prop and the 1k `.hdr` of each sky (17.7 MB).

`scripts/cc0/cc0pack.mjs <raw dir> <out dir>` packs each prop for the site (1.6 MB for the seven):

- **mesh** → `<id>.zxm`: every primitive merged with its node's transform applied, simplified to a triangle budget
  with the project's own `meshoptimizer`, then quantized - positions as u16 inside the bounding box, normals as i8,
  uvs as u16, indices as u16. Read by `src/lib/objects/cc0.ts`.
- **maps** → `<id>_diff.webp`, `<id>_nor.webp`, `<id>_arm.webp` at 512 px (the spade, seen close: 1024 px).
  ARM is ambient occlusion / roughness / metalness in red / green / blue.

Three diffuse maps are **repainted** in that step, because the scans come as they were found and this world has its
own rules (red is kept for risk; the yard is a grain yard):

- `cement_bag`: its print softened to smudges and everything taken to the tone of brown paper - it said CEMENT in red;
- `Barrel_01`: its red turned to steel blue;
- `metal_jerrycan`: its red turned to olive.

The skies are used as they came, except that the sun's disc is brought down to the glow about it before filtering
(`SUN_CAP` in `cc0.ts`): spread over a rough surface, that one spot is a glare on everything.
