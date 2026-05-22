# Grid Dots — Figma Plugin

Generate scattered dot grids inside closed shapes. Dot diameters vary with the gradient lightness of the boundary shape.

## Features

- **Boundary shapes** — Use any closed shape (Rectangle, Ellipse, Polygon, Star, Vector, Frame, Component) as the boundary for dot placement
- **Solid fill** — All dots share a uniform diameter you specify
- **Gradient fill** — Dot diameters interpolate between a max and min value based on the gradient's lightness at each point (lighter areas get larger dots)
- **Two tiling modes** — Quad grid (square) or Hex grid (staggered honeycomb)
- **Custom dot shape** — Select a second closed shape to use as the dot body instead of default circles
- **All Figma gradient types supported** — Linear, Radial, Angular, Diamond

## Installation

1. In Figma desktop, go to **Plugins → Development → Import plugin from manifest...**
2. Select `manifest.json` from this project
3. The plugin appears under **Plugins → Development → Grid Dots**

## Usage

1. **Select a boundary shape** — Click any closed shape in your Figma document. This defines the area where dots will be placed.

2. **Pick a fill mode:**
   - **Solid fill shapes**: Enter a single *Diameter* value. All dots are the same size.
   - **Gradient fill shapes**: Enter *Max* and *Min* diameters. Dots will smoothly vary in size according to the gradient's brightness at each location.

3. **Configure the grid:**
   - *Pattern*: **Quad Grid** for a square lattice, **Hex Grid** for a staggered honeycomb arrangement
   - *Spacing*: Distance between adjacent dot centers (px)

4. **(Optional) Select a dot source shape** — Select a second shape in Figma (CTRL+Click). This shape is cloned and scaled at each grid point instead of using default circles.

5. **Click Generate**

All generated dots are grouped under a "Grid Dots" layer.

## Parameters

| Parameter | Description |
|-----------|-------------|
| Diameter | Dot diameter for solid-fill shapes (px) |
| Max Diameter | Largest dot diameter for gradient fills (px) |
| Min Diameter | Smallest dot diameter for gradient fills (px) |
| Pattern | Quad Grid (square) or Hex Grid (honeycomb) |
| Spacing | Center-to-center distance between dots (px) |

## Development

```bash
npm install
npm run build      # Compile TypeScript → code.js
npm run watch      # Auto-rebuild on changes
```

## License

MIT
