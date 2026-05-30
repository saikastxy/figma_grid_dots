# Grid Dots — Figma Plugin

Generate scattered dot grids inside closed shapes. Dot diameters vary with the
gradient lightness of the boundary shape, and dot rotations follow configurable
vector / spiral-curl fields.

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
| `code.ts` | Geometry extraction, fill analysis, grid generation, point-in-shape testing, gradient sampling, bitmap export, rotation field computation, dot creation & grouping |
| `ui.html` | Boundary shape info display, diameter controls, grid/rotation/curl settings, bitmap sampling toggle, dot source shape status, point-count estimation |
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
| **Solid fill** | All dots use a single fixed diameter |
| **Gradient fill** | Dot diameters interpolate between *Max* and *Min* based on gradient lightness at each point. Supports Linear, Radial, Angular, and Diamond gradients via inverse-transform sampling |
| **Bitmap sampling** (toggle) | Export the boundary node as PNG, decode it in a hidden `<canvas>`, and sample per-pixel lightness. Works with image fills, complex multi-fill nodes, frames with children, etc. Optionally samples per-dot colour from the bitmap |

Lightness formula (ITU-R BT.709): `L = 0.2126·R + 0.7152·G + 0.0722·B`

Diameter mapping: `diameter = maxDiam − L × (maxDiam − minDiam)` — darker areas
get larger dots.

### Grid Tiling Modes

| Mode | Layout |
|------|--------|
| **Quad** | Square lattice, uniform row & column spacing |
| **Hex** | Staggered honeycomb; vertical spacing = `spacing × √3/2`, odd rows offset by `spacing/2` |
| **Brick** | Like hex but with equal vertical spacing; odd rows offset by `spacing/2` |
| **Diamond** | Two interleaved square grids offset by `spacing/2` diagonally |
| **Random** | Uniformly random positions within the bounding box (same point count as quad) |

All modes generate candidate points from the bounding box, then filter by the
actual shape geometry via point-in-shape tests.

### Dot Source Shape

Select a second closed shape in Figma (CTRL+Click). Each grid point clones and
scales this shape instead of creating a default circle. The scale factor is
`diameter / sourceWidth`. The source shape itself is never modified.

### Rotation Modes

Each dot's `node.rotation` is set according to the selected mode. Rotation has
no visible effect on default circles; use a **directional dot source shape**
(e.g. arrow, triangle, chevron, leaf) to see the rotation field.

All rotation formulas use the dot's position relative to the **shape centre**:
`θ = atan2(dy, dx)`, `r = √(dx²+dy²)`, `u = r/spacing` (normalised radius).

#### Basic modes

| Mode | Formula | Description |
|------|---------|-------------|
| **None** | `0°` | No rotation (default) |
| **Random** | `random(0, 360)°` | Independently random per dot |
| **Radial** | `θ` (deg) | All dots point toward centre |
| **Vortex** | `θ + 90°` | Tangent to radial — circular flow |
| **Wave H** | `sin(x·0.03) × 180°` | Horizontal sine wave |
| **Wave V** | `sin(y·0.03) × 180°` | Vertical sine wave |
| **Noise Field** | `noise(x, y) × 360°` | 3-octave pseudo-Perlin noise field |

#### Spiral curl fields

All four spiral modes use the same architecture: dots stay on the **rectangular
grid**; only their rotation follows the spiral vector field.

Rotation formula: `φ = (θ + f(u)) × 180/π`

| Spiral | f(u) | Turns at u=1 | Turns at u=10 | Character |
|--------|------|-------------|---------------|-----------|
| **Archimedean** | `u × 3.0` | ~0.5 | ~4.8 | Uniform arm spacing (`r = aθ`). Constant radial pitch |
| **Logarithmic** | `log(u+1) × 9.0` | ~1.0 | ~3.4 | Equiangular — arms spread outward like galaxies, nautilus shells |
| **Fermat** | `√u × 6.0` | ~1.0 | ~3.0 | Arms tighter near centre — sunflower phyllotaxis (`r² ∝ θ`) |
| **Euler** | `u² × 0.25` | ~0.04 | ~4.0 | Clothoid: curvature `κ ∝ r`, straight at centre, tight far out. Highway transition-curve mathematics |

The number of visible spiral arms ≈ `f(r_max) / (2π)`.

### Curl Modifier

Based on the mathematical definition of [curl in 2D vector fields](
https://en.wikipedia.org/wiki/Curl_(mathematics)). Constant curl = **solid-body
rotation**: every point rotates at the same angular rate, like a rigid disk.

When the **Apply Curl** checkbox is enabled, an extra rotation term is added to
whatever mode is selected:

```
φ_curl = (curlIntensity / 1000) × r   [radians]
```

The **Curl Intensity** slider (0–100) controls the constant `k`:

| Slider | k (rad/px) | Extra rotation at r=200px |
|--------|-----------|--------------------------|
| 25 | 0.025 | +287° (~0.8 turns) |
| 50 | 0.050 | +573° (~1.6 turns) |
| 100 | 0.100 | +1146° (~3.2 turns) |

Curl can be applied to **any** base mode. For example:
- **None + Curl** → pure solid-body rotation field
- **Radial + Curl** → inward-pointing with rotational twist
- **Euler + Curl** → clothoid spiral with additional uniform swirl

### Limits & Safety

- **Max 10 000 dots** per generation (hard cap)
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
| `tileMode` | enum | `quad` | Grid layout: `quad`, `hex`, `brick`, `diamond`, `random` |
| `dotSourceNodeId` | string\|null | null | Figma node ID of optional custom dot shape |
| `boundaryNodeId` | string | — | Figma node ID of the boundary shape |
| `sampleColor` | boolean | false | Sample dot colours from gradient or bitmap |
| `sampleBitmap` | boolean | false | Export boundary as PNG and sample pixel lightness |
| `rotationMode` | enum | `none` | Rotation field: see table above |
| `curlEnabled` | boolean | false | Enable curl (solid-body rotation) modifier |
| `curlIntensity` | number | 0 | Curl strength slider 0–100 |

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
│  - diameter calc │                       │  - curl toggle    │
│  - rotation calc │                       │  - generate btn   │
│  - dot creation  │                       │  - estimate       │
└─────────────────┘                       └──────────────────┘
        │                                        │
        │  generate-dots (all params)              │
        │◄───────────────────────────────────────│
        │                                        │
        │  sample-bitmap (PNG + grid points)       │  [bitmap mode only]
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
- **Rotation fields**: Polar decomposition `(r, θ)` relative to shape centre,
  mode-specific `f(r)` twist function, optional curl solid-body-rotation term
- **Pseudo-noise**: GLSL-style `fract(sin(x·12.9898 + y·78.233) · 43758.5453)`
  with 3-octave summation for smooth noise-field rotation

## Development

```bash
npm install          # Install TypeScript, ESLint, Figma typings
npm run build        # Compile TypeScript → code.js
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
| v0.6 | `20260531` | Rotation modes (7 basic + 4 spiral curl fields), curl modifier with intensity slider |
| v0.5 | `20260530` | Bitmap lightness sampling mode (PNG export + Canvas pixel read) |
| v0.4 | — | Random, diamond, and brick grid tiling modes |
| v0.3 | — | Gradient colour sampling toggle |
| v0.2 | — | Fix gradient sampling, default black dots |
| v0.1 | — | Initial implementation: grid dots inside closed shapes |

## License

MIT
