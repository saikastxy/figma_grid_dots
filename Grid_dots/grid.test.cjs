const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(require.resolve('./code.js'), 'utf8')
const makeGeometryNode = (kind) => ({
  kind,
  width: 100,
  height: 100,
  fills: [],
  strokes: [],
  rotation: 0,
  resize(width, height) {
    this.width = width
    this.height = height
  },
})
const context = vm.createContext({
  console,
  Math,
  Number,
  Uint8Array,
  Int32Array,
  Set,
  Map,
  Promise,
  __html__: '',
  figma: {
    showUI() {},
    on() {},
    currentPage: { selection: [] },
    ui: { postMessage() {}, onmessage: null },
    createEllipse: () => makeGeometryNode('ellipse'),
    createPolygon: () => makeGeometryNode('polygon'),
    createRectangle: () => makeGeometryNode('rectangle'),
    createVector: () => makeGeometryNode('vector'),
  },
})

vm.runInContext(source, context)

const generate = context.generateGridPoints
assert.equal(typeof generate, 'function')
const flowRotation = context.computeFlowRotation
assert.equal(typeof flowRotation, 'function')
const rhythmRotation = context.computeRhythmRotation
assert.equal(typeof rhythmRotation, 'function')
const densityProbability = context.computeDensityProbability
assert.equal(typeof densityProbability, 'function')
const densityRandom = context.densityRandomValue
assert.equal(typeof densityRandom, 'function')
const densitySpacingMultiplier = context.computeDensitySpacingMultiplier
assert.equal(typeof densitySpacingMultiplier, 'function')
const keepDensitySublattice = context.keepPointOnDensitySublattice
assert.equal(typeof keepDensitySublattice, 'function')
const createPreset = context.createPresetDot
assert.equal(typeof createPreset, 'function')
const placeNode = context.placeNodeAtVisualAngle
assert.equal(typeof placeNode, 'function')
const triangleTessellation = context.generateTriangleTessellationPoints
assert.equal(typeof triangleTessellation, 'function')

const bounds = { x: 0, y: 0, width: 240, height: 180 }
const regularArgs = [bounds, 20, 'quad', 0, 0, 1, 0, 7, 50000]

const square = generate(...regularArgs)
const squareAgain = generate(...regularArgs)
assert.deepEqual(squareAgain, square, 'regular lattices should be deterministic')

const diagonal = generate(bounds, 20, 'brick', 35, 25, 0.85, 0, 7, 50000)
assert.notDeepEqual(diagonal, square, 'angle and row drift should change the lattice')

const hex = generate(bounds, 20, 'hex', 0, 0, 1, 0, 7, 50000)
const diamond = generate(bounds, 20, 'diamond', 0, 0, 1, 0, 7, 50000)
assert.ok(hex.length > square.length, 'hex close-pack should be denser than square')
assert.ok(diamond.length > hex.length, 'dense diamond should be denser than hex')

const poisson = generate(bounds, 20, 'poisson', 0, 0, 1, 0, 19, 50000)
const poissonAgain = generate(bounds, 20, 'poisson', 0, 0, 1, 0, 19, 50000)
assert.deepEqual(poissonAgain, poisson, 'Poisson layout should be repeatable for a seed')

for (let i = 0; i < poisson.length; i++) {
  for (let j = i + 1; j < poisson.length; j++) {
    const dx = poisson[i].x - poisson[j].x
    const dy = poisson[i].y - poisson[j].y
    assert.ok(dx * dx + dy * dy >= 20 * 20 - 1e-7, 'Poisson points must keep minimum spacing')
  }
}

const cappedGrid = generate({ x: 0, y: 0, width: 1000, height: 1000 }, 1, 'quad', 0, 0, 1, 0, 1, 100)
const cappedPoisson = generate({ x: 0, y: 0, width: 1000, height: 1000 }, 1, 'poisson', 0, 0, 1, 0, 1, 100)
assert.equal(cappedGrid.length, 101, 'regular lattice should signal candidate overflow')
assert.equal(cappedPoisson.length, 101, 'Poisson lattice should signal candidate overflow before large allocation')

const flowCenter = { x: 0, y: 0 }
const flowPoint = { x: 10, y: 0 }
const flowArgs = [flowPoint, flowCenter]
assert.ok(Math.abs(flowRotation(...flowArgs, 'uniform', 20, 30, 50, 6, 15, 7) - 45) < 1e-9)
assert.equal(flowRotation(...flowArgs, 'radial-out', 20, 0, 50, 6, 0, 7), 0)
assert.equal(Math.abs(flowRotation(...flowArgs, 'radial-in', 20, 0, 50, 6, 0, 7)), 180)
assert.equal(flowRotation(...flowArgs, 'orbit-cw', 20, 0, 50, 6, 0, 7), 90)
assert.equal(flowRotation(...flowArgs, 'orbit-ccw', 20, 0, 50, 6, 0, 7), -90)
assert.ok(Math.abs(flowRotation(...flowArgs, 'spiral-out', 20, 0, 50, 6, 0, 7) - 45) < 1e-9)
assert.ok(Math.abs(flowRotation(...flowArgs, 'spiral-out', 20, 0, -50, 6, 0, 7) + 45) < 1e-9)

assert.equal(rhythmRotation({ x: 0, y: 0 }, flowCenter, 20, 'alternate', 180, 0, 0, 0), 0)
assert.equal(rhythmRotation({ x: 20, y: 0 }, flowCenter, 20, 'alternate', 180, 0, 1, 0), 180)
assert.equal(rhythmRotation({ x: 0, y: 20 }, flowCenter, 20, 'alternate', 180, 0, 0, 1), 180)
assert.equal(rhythmRotation({ x: 0, y: 0 }, flowCenter, 20, 'alternate', 180, 1, 0, 0), 180, 'phase should invert the alternating rhythm')
assert.equal(rhythmRotation({ x: 0, y: 0 }, flowCenter, 20, 'row-alternate', 90, 0, 4, 0), 0)
assert.equal(rhythmRotation({ x: 0, y: 20 }, flowCenter, 20, 'row-alternate', 90, 0, 4, 1), 90)
assert.equal(rhythmRotation({ x: 20, y: 0 }, flowCenter, 20, 'syncopated', 180, 0, 1, 0), 180)
assert.equal(rhythmRotation({ x: 40, y: 0 }, flowCenter, 20, 'syncopated', 180, 0, 2, 0), 180)
assert.equal(rhythmRotation({ x: 60, y: 0 }, flowCenter, 20, 'syncopated', 180, 0, 3, 0), 0)

assert.equal(densityProbability(0, 5, 1), 1, 'black should keep the maximum candidate density')
assert.equal(densityProbability(1, 5, 1), 0.05, 'white should keep the configured density floor')
assert.ok(densityProbability(0.25, 5, 1) > densityProbability(0.75, 5, 1), 'darker pixels should keep more points')
assert.ok(densityProbability(0.5, 5, 2) < densityProbability(0.5, 5, 1), 'a steeper curve should thin midtones more strongly')
const densityStableA = densityRandom({ x: 80, y: 55 }, flowCenter, 20, 33)
const densityStableB = densityRandom({ x: 80, y: 55 }, flowCenter, 20, 33)
assert.equal(densityStableA, densityStableB, 'density thinning should be deterministic')
const densityTranslated = densityRandom({ x: 1450, y: -585 }, { x: 1370, y: -640 }, 20, 33)
assert.equal(densityStableA, densityTranslated, 'density thinning should be invariant to canvas translation')
assert.equal(densitySpacingMultiplier(0, 8, 1), 1, 'black should use the base lattice spacing')
assert.equal(densitySpacingMultiplier(1, 8, 1), 8, 'white should use the configured maximum spacing')
assert.ok(densitySpacingMultiplier(0.3, 8, 3) > densitySpacingMultiplier(0.3, 8, 1), 'a steeper curve should move midtones to coarser regular spacing')
const regularWhitePoints = []
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    if (keepDensitySublattice({ x: col * 20, y: row * 20 }, flowCenter, 20, 1, 4, 1, 7, col, row)) {
      regularWhitePoints.push({ col, row })
    }
  }
}
assert.equal(regularWhitePoints.length, 4, '4x light-area spacing should retain one point per 4x4 lattice block')
for (const a of regularWhitePoints) {
  for (const b of regularWhitePoints) {
    if (a === b) continue
    assert.ok(a.col === b.col || Math.abs(a.col - b.col) >= 4, 'regular density columns should follow the selected stride')
    assert.ok(a.row === b.row || Math.abs(a.row - b.row) >= 4, 'regular density rows should follow the selected stride')
  }
}
const regularLocal = keepDensitySublattice({ x: 80, y: 60 }, flowCenter, 20, 0.7, 8, 1.3, 7)
const regularMoved = keepDensitySublattice({ x: 1450, y: -580 }, { x: 1370, y: -640 }, 20, 0.7, 8, 1.3, 7)
assert.equal(regularLocal, regularMoved, 'regular density spacing should be invariant to canvas translation')

const curlA = flowRotation({ x: 80, y: 55 }, flowCenter, 'curl-noise', 20, 12, 80, 7, 0, 33)
const curlB = flowRotation({ x: 80, y: 55 }, flowCenter, 'curl-noise', 20, 12, 80, 7, 0, 33)
assert.equal(curlA, curlB, 'curl-noise orientation should be deterministic for a seed')

const translation = { x: 1370, y: -640 }
const invariantModes = [
  'uniform',
  'radial-out',
  'radial-in',
  'orbit-ccw',
  'orbit-cw',
  'spiral-out',
  'spiral-in',
  'wave',
  'cross-wave',
  'curl-noise',
  'saddle',
]
for (const mode of invariantModes) {
  const localRotation = flowRotation({ x: 86, y: -53 }, flowCenter, mode, 20, 17, -63, 8, 11, 29)
  const translatedRotation = flowRotation(
    { x: 86 + translation.x, y: -53 + translation.y },
    translation,
    mode,
    20,
    17,
    -63,
    8,
    11,
    29,
  )
  assert.ok(Math.abs(localRotation - translatedRotation) < 1e-9, `${mode} should be invariant to canvas translation`)
}

const unitKinds = {
  circle: 'ellipse',
  ellipse: 'ellipse',
  diamond: 'polygon',
  triangle: 'polygon',
  arrow: 'vector',
  capsule: 'rectangle',
  leaf: 'vector',
  chevron: 'vector',
}
for (const [preset, expectedKind] of Object.entries(unitKinds)) {
  const result = createPreset(preset, 20)
  assert.equal(result.node.kind, expectedKind, `${preset} should use the expected Figma node type`)
  assert.ok(result.node.width > 0 && result.node.height > 0, `${preset} should have positive dimensions`)
}
assert.equal(createPreset('triangle', 20).baseRotation, 90, 'triangle preset should point along +X')

const triangleFaces = triangleTessellation({ x: 0, y: 0, width: 240, height: 180 }, 20, 0, 1, 0, 7, 50000)
assert.ok(triangleFaces.length > 0 && triangleFaces.length % 2 === 0, 'triangle tessellation should emit face pairs')
const facePairIndex = triangleFaces.findIndex((face, index) => {
  const other = triangleFaces[index + 1]
  return other && face.latticeI === other.latticeI && face.latticeJ === other.latticeJ
})
assert.ok(facePairIndex >= 0, 'triangle tessellation should expose two faces from the same cell')
const faceA = triangleFaces[facePairIndex]
const faceB = triangleFaces[facePairIndex + 1]
assert.equal(faceA.rhythmOffset, 1, 'one triangular face should be the flipped orientation')
assert.equal(faceB.rhythmOffset, 0, 'each cell should include the opposite orientation')
const faceDx = faceB.x - faceA.x
const faceDy = faceB.y - faceA.y
assert.ok(Math.abs(Math.sqrt(faceDx * faceDx + faceDy * faceDy) - 20 / Math.sqrt(3)) < 1e-9, 'face centers should be spaced by the shared-edge centroid distance')

for (const visualAngle of [-135, -45, 0, 45, 90, 170]) {
  const node = makeGeometryNode('directional-unit')
  node.resize(20, 10)
  const center = { x: 123, y: -47 }
  placeNode(node, center, visualAngle)

  const [[m00, m01, tx], [m10, m11, ty]] = node.relativeTransform
  const mappedCenter = {
    x: m00 * (node.width / 2) + m01 * (node.height / 2) + tx,
    y: m10 * (node.width / 2) + m11 * (node.height / 2) + ty,
  }
  assert.ok(Math.abs(mappedCenter.x - center.x) < 1e-9, `center X should stay fixed at ${visualAngle}deg`)
  assert.ok(Math.abs(mappedCenter.y - center.y) < 1e-9, `center Y should stay fixed at ${visualAngle}deg`)

  const actualVisualAngle = (Math.atan2(m10, m00) * 180) / Math.PI
  assert.ok(
    Math.abs(actualVisualAngle - visualAngle) < 1e-9,
    `local +X should follow the ${visualAngle}deg canvas direction`,
  )
}

console.log(`grid/flow tests passed: ${square.length} square, ${hex.length} hex, ${diamond.length} diamond, ${poisson.length} Poisson`)
