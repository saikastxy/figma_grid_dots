# Grid Dots — Figma Plugin

Generate scattered dot grids inside closed shapes. Dot diameters vary with the
gradient lightness of the boundary shape, and directional units follow
configurable 2D vector flow fields.

For practical recipes, see the [Chinese dense-pattern guide](DENSE_PATTERN_GUIDE.zh-CN.md).
For a pure-math port to GLSL/WGSL or compute shaders, see the [shader point-field specification](SHADER_POINT_FIELD_SPEC.zh-CN.md).

## Project Structure

```
Grid_dots/
├── code.ts              # Plugin main logic (TypeScript source)
├── code.js              # Compiled plugin code (auto-generated)
├── ui.html              # Plugin UI panel (HTML + inline CSS/JS)
├── manifest.json        # Figma plugin manifest
├── package.json         # npm dependencies & scripts
├── tsconfig.json        # TypeScript compiler config
├── eslint.config.js     # Linter config
└── README.md
```

### File roles

| File | Role |
|------|------|
| `code.ts` | Geometry extraction, fill analysis, grid generation, point-in-shape testing, gradient sampling, bitmap export, vector-field computation, unit presets, dot creation & grouping |
| `ui.html` | Boundary and unit status, diameter/grid controls, live lattice and flow previews, bitmap sampling, point-count estimation |
| `manifest.json` | Plugin identity (`id`, `main`, `ui`, `documentAccess: "dynamic-page"`) |

## Features

### Boundary Shapes

Any closed Figma shape can serve as the dot-placement boundary:

Rectangle, Ellipse, Polygon, Star, Vector (closed paths), Frame, Component,
Instance, Section.

The plugin extracts each shape's geometry (vertices, loops, ellipse axes) and
uses ray-casting or analytic tests to determine whether a grid point lies inside.

### Fill Modes

| Mode | Behaviour |
|------|-----------|
| **Disabled** | Grayscale changes neither radius nor density |
| **Radius only** | Lightness interpolates dot radius between *Max* and *Min* |
| **Density only** | Lightness changes regular lattice spacing while radius stays fixed |
| **Radius + Density** | The same lightness sample controls both effects |

Lightness formula (ITU-R BT.709): `L = 0.2126·R + 0.7152·G + 0.0722·B`

Diameter mapping: `diameter = maxDiam − L × (maxDiam − minDiam)` — darker areas
get larger dots.

### Density by Grayscale

The default `Regular Spacing` method maps lightness to nested sublattices:
black uses the base `Grid Spacing`, while lighter regions use 2×, 4×, 8×, or
16× spacing. Because every coarser lattice is a subset of the base lattice, the
result remains ordered instead of developing random holes. `Density Curve`
controls how quickly the spacing level changes through the midtones.

The earlier seeded probability method remains available as `Random Thinning`.
Radius and density modes share one rendered grayscale sample when combined.

### Grid Tiling Modes

| Mode | Layout |
|------|--------|
| **Square** | Balanced square lattice with equal default row and column spacing |
| **Hex close-pack** | Triangular lattice; row height = `spacing × √3/2`, row drift = `spacing/2` |
| **Brick / half-drop** | `spacing/2` row drift with full row height for a directional rhythm |
| **Dense diamond** | Two interleaved square rows; 2× square candidate density, nearest distance ≈ `0.707 × spacing` |
| **Poisson blue noise** | Seeded Bridson sampling with a guaranteed minimum centre distance |
| **Random** | Seeded uniform positions; fast but allows clumps and near-overlaps |

All modes generate candidate points from the bounding box, then filter by the
actual shape geometry via point-in-shape tests.

### Rhythm Tiling

The separate **Rhythm Tiling** panel adds a discrete orientation layer that can
be composed with the grid, fill sampling, custom units, and vector fields.
`Triangle Faces · Up / Down` is a true triangular-face-center generator: each
triangular-lattice parallelogram contributes one face of each orientation. The
other modes alternate orientations on an existing lattice (rows, columns,
checker phase, or a repeating 2+1 syncopation). `Flip Angle` and `Phase` control
the visual cadence without changing the source unit or the flow field.

### Directional Lattice Controls

Regular grids share one affine lattice model. Two basis vectors generate each
point: `p(i,j) = centre + iA + jB`.

- **Direction** rotates both basis vectors around the boundary centre.
- **Row drift** shears `B` along `A`, so every following row advances in a
  consistent direction. Positive and negative values reverse the flow.
- **Row spacing** compresses or expands the perpendicular component of `B`.
- **Jitter** adds seeded variation up to 45% of the smaller lattice interval.
- **Seed** makes jitter, uniform random, and Poisson layouts repeatable.

The live Canvas preview and four presets make these relationships visible
before node generation.

### Which Dense Pattern to Use

| Goal | Recommended pattern | Why |
|------|---------------------|-----|
| Maximum density for equal circular dots without overlap | **Hex close-pack** | The triangular/hexagonal arrangement is the densest congruent-circle packing in the plane, with density `π/√12 ≈ 0.9069` |
| Very dense halftone or moiré construction | **Dense diamond** | Twice the square candidate density; reduce dot diameter below `0.707 × spacing` to avoid overlap |
| Organic density without visible rows | **Poisson blue noise** | Maintains a minimum distance while suppressing obvious clusters and axes |
| Directional fabric, scales, or flow | **Brick + direction + row drift** | Strong controllable rhythm while retaining independent angle and row compression |
| Radial organic fill | **Phyllotaxis** | Golden-angle placement spreads samples around the centre without straight grid axes |

References: [an elementary proof of Thue's circle-packing theorem](https://epub.uni-bayreuth.de/4374/),
[Bridson's fast Poisson-disk sampling paper](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf),
and [Vogel's sunflower construction record](https://agris.fao.org/search/en/providers/123819/records/64735f4553aa8c89630a23c5).

### Basic Unit Presets and Custom Source

The Basic Unit panel provides nine choices. `Selected` preserves the original
workflow: select the boundary first and a second Figma shape as the unit. The
source is cloned and scaled without modifying the original.

| Unit | Orientation character |
|------|-----------------------|
| **Circle** | Neutral; field rotation is intentionally invisible |
| **Ellipse** | Smooth bidirectional axis |
| **Diamond** | Angular bidirectional axis |
| **Triangle** | Clear forward direction |
| **Arrow** | Strongest vector-direction indicator |
| **Capsule** | Compact dash / streamline |
| **Leaf** | Organic bidirectional streamline |
| **Chevron** | Strong forward direction with an open-tail silhouette |
| **Selected** | Any custom Figma shape chosen as the second selected node |

Preset width follows the computed dot diameter. Each preset has a tuned height
ratio. For custom units, the scale remains `diameter / sourceWidth`.

### Vector Flow Fields

Rotation is now derived from a local 2D vector rather than independent angle
effects. For each point `p`, the selected field returns `v(p) = (vx, vy)` and
the unit orientation is `atan2(vy, vx) + UnitAxisOffset`.

Field coordinates are `(p − boundaryCentre) / gridSpacing`. This makes Wave,
Cross Wave, Curl Noise, and Saddle independent of the boundary's absolute
Figma-canvas position. The UI preview evaluates the same grid-cell formulas,
including the same seeded value-noise hash and finite-difference curl.

| Field | Behaviour |
|-------|-----------|
| **Uniform** | Constant direction controlled by Base Angle |
| **Radial Out / In** | Source and sink fields around the boundary centre |
| **Orbit CCW / CW** | Tangent vectors producing pure circulation |
| **Spiral Out / In** | Radial flow rotated by signed Bend / Spin |
| **Sine Flow** | Directional wave with adjustable amplitude and wavelength |
| **Cross Wave** | Two coupled waves producing braided/cellular flow |
| **Curl Noise** | Seeded, smooth curl-of-noise field blended with a base direction |
| **Saddle** | Hyperbolic attraction/repulsion axes |

Controls are mode-aware:

- **Base Angle** defines the uniform or principal field axis.
- **Bend / Spin** is signed (`-100` to `100`); its sign reverses spiral,
  wave, noise, or saddle handedness.
- **Field Scale** controls wavelength or noise feature size in grid-spacing units.
- **Unit Axis Offset** corrects a custom unit whose natural forward direction
  is not the plugin's expected `+X` direction.
- **Seed** is shared with grid jitter/Poisson and makes Curl Noise repeatable.

The live arrow preview shows the final orientation field, including Unit Axis
Offset, before any Figma nodes are created.

### Limits & Safety

- **Max 10 000 dots** per generation (hard cap)
- **Max 50 000 candidates** before boundary clipping; denser inputs fail early
  instead of allocating or iterating an unbounded grid
- Grid spacing minimum: **2 px** (UI), **1 px** (code floor)
- Diameter floor: **0.5 px**
- Bitmap export capped at **4096 px** max dimension
- All dots created in one Figma transaction → single **Undo**

## All Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dotDiameter` | number | 10 | Fixed diameter for solid-fill shapes (px) |
| `maxDiameter` | number | 20 | Largest dot diameter for gradient/bitmap fills (px) |
| `minDiameter` | number | 2 | Smallest dot diameter for gradient/bitmap fills (px) |
| `gridSpacing` | number | 20 | Centre-to-centre distance between dots (px) |
| `tileMode` | enum | `quad` | Grid layout: `quad`, `hex`, `brick`, `diamond`, `poisson`, `random` |
| `gridAngle` | number | 0 | Lattice direction in degrees |
| `rowOffset` | number | 0 | Progressive row drift as a percentage of spacing (`-100` to `100`) |
| `rowSpacingRatio` | number | 1 | Perpendicular row spacing multiplier (`0.4` to `2`) |
| `jitterAmount` | number | 0 | Seeded lattice variation (`0` to `100`) |
| `randomSeed` | number | 7 | Repeatable seed for jitter, random, and Poisson layouts |
| `unitPreset` | enum | `circle` | `selected`, `circle`, `ellipse`, `diamond`, `triangle`, `arrow`, `capsule`, `leaf`, `chevron` |
| `dotSourceNodeId` | string\|null | null | Figma node ID of optional custom dot shape |
| `boundaryNodeId` | string | — | Figma node ID of the boundary shape |
| `sampleColor` | boolean | false | Sample dot colours from gradient or bitmap |
| `grayscaleMode` | enum | `off` | `off`, `radius`, `density`, or `both`; the latter three are the active grayscale states |
| `densityMethod` | enum | `spacing` | `spacing` for regular nested sublattices, or optional `random` thinning |
| `densityMaxSpacing` | number | 4 | Light-area spacing multiplier: `2`, `4`, `8`, or `16` |
| `densityMinPercent` | number | 5 | Random Thinning only: percentage retained in fully white areas |
| `densityCurve` | number | 1 | Exponent controlling how strongly midtones are thinned (`0.25`–`4`) |
| `rotationMode` | enum | `spiral-out` | Vector field: see table above |
| `flowAngle` | number | 0 | Base/principal field angle in degrees |
| `flowStrength` | number | 45 | Signed bend, spin, or field blend (`-100` to `100`) |
| `flowScale` | number | 6 | Wave/noise scale in grid-spacing units |
| `orientationOffset` | number | 0 | Custom unit axis correction in degrees |
| `rhythmEnabled` | boolean | false | Enable the discrete orientation rhythm layer |
| `rhythmMode` | enum | `triangle-tessellation` | Triangle face centers, checker, row/column alternation, or syncopated 2+1 |
| `rhythmFlipAngle` | number | 180 | Signed orientation change applied on a rhythm hit |
| `rhythmPhase` | number | 0 | A/B phase swap for the rhythm sequence |

## Data Flow

```
User selects shape(s) in Figma
        │
        ▼
┌─────────────────┐    selectionchange     ┌──────────────────┐
│   code.ts        │◄──────────────────────│   ui.html         │
│                  │──────────────────────►│                  │
│  - geometry      │   postMessage         │  - boundary info  │
│  - fill analysis │   (selection state)   │  - diameter ctrls │
│  - grid points   │                       │  - grid settings  │
│  - shape filter  │                       │  - rotation mode  │
│  - diameter calc │                       │  - flow preview   │
│  - rotation calc │                       │  - generate btn   │
│  - dot creation  │                       │  - estimate       │
└─────────────────┘                       └──────────────────┘
        │                                        │
        │  generate-dots (all params)              │
        │◄───────────────────────────────────────│
        │                                        │
        │  sample-bitmap (PNG + grid points)       │  [bitmap radius or density mode]
        │───────────────────────────────────────►│
        │                                        │
        │  bitmap-result (lightness array)        │
        │◄───────────────────────────────────────│
        │                                        │
        ▼                                        │
  Create dots, group as "Grid Dots",              │
  select group, close plugin                      │
```

## Architecture

The plugin operates in two JavaScript contexts connected by `postMessage`:

1. **Main thread** (`code.ts` → `code.js`) — Figma Plugin API access
   (`figma.currentPage`, `figma.createEllipse`, node manipulation, export).
2. **UI iframe** (`ui.html`) — Browser DOM APIs (`<canvas>`, image decoding,
   base64 handling) for bitmap sampling.

All coordinates are computed in **absolute canvas space**, converted to
**node-local space** via `absoluteTransform` inverse for geometry tests, and
mapped back to absolute space for dot placement.

### Key algorithms

- **Point-in-shape**: Rect bounds check, ellipse analytic test, ray-casting for
  polygons/stars/vectors, vector-network loop extraction with region support
- **Gradient sampling**: Inverse gradient-transform matrix maps world → gradient
  space (0–1), then type-specific t-parameter (linear = x, radial = distance,
  angular = angle, diamond = Manhattan distance), then colour-stop interpolation
- **Bitmap sampling**: `node.exportAsync({ format: 'PNG' })` → base64 →
  UI Canvas `getImageData()` → per-pixel lightness array → postMessage back
- **Flow-field rotation**: every point evaluates a local 2D vector; `atan2`
  converts that vector into unit orientation, with signed spin and axis correction
- **Affine lattices**: two rotated basis vectors support direction, progressive
  row drift, row compression, and deterministic jitter without pattern-specific loops
- **Poisson blue noise**: Bridson active-list sampler with a `spacing` minimum
  distance, seeded PRNG, and bounded background-grid allocation
- **Curl noise**: seeded three-octave interpolated value noise is differentiated
  into a smooth curl vector and blended with the base field

## Development

```bash
npm install          # Install TypeScript, ESLint, Figma typings
npm run build        # Compile TypeScript → code.js
npm test             # Build and verify lattice density, seed, distance, and caps
npm run watch        # Auto-rebuild on changes
npm run lint         # Run ESLint
```

### Requirements

- Node.js ≥ 18
- Figma desktop app (for plugin testing)
- Import the plugin via **Plugins → Development → Import plugin from manifest...**
  and select `manifest.json`

## Version History

| Version | Tag | Changes |
|---------|-----|---------|
| v1.0 | `20260808` | Unified 2D vector flow fields, live orientation preview, signed spin/scale/axis controls, and nine basic-unit choices including custom selection |
| v0.9 | `20260808` | Directional affine lattices, live preview, four dense presets, seeded jitter/random, Poisson blue noise, candidate safety cap, grid tests |
| v0.8 | — | Rounded rectangle, frame, polygon, and star boundary support |
| v0.7 | — | Concentric, polar-curve, and phyllotaxis distributions |
| v0.6 | `20260531` | Rotation modes (7 basic + 4 spiral curl fields), curl modifier with intensity slider |
| v0.5 | `20260530` | Bitmap lightness sampling mode (PNG export + Canvas pixel read) |
| v0.4 | — | Random, diamond, and brick grid tiling modes |
| v0.3 | — | Gradient colour sampling toggle |
| v0.2 | — | Fix gradient sampling, default black dots |
| v0.1 | — | Initial implementation: grid dots inside closed shapes |

## License

MIT
