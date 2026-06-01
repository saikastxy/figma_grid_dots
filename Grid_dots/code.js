"use strict";
// ============================================================
// Grid Dots — Figma Plugin
// ============================================================
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// ---- Plugin Init ----
figma.showUI(__html__, { width: 320, height: 560 });
let bitmapResolve = null;
function sendSelectionState() {
    var _a;
    const selection = figma.currentPage.selection;
    const boundaryNode = selection.length > 0 ? selection[0] : null;
    const dotSourceNode = selection.length > 1 ? selection[1] : null;
    let fillType = 'none';
    let fillInfo = null;
    if (boundaryNode && 'fills' in boundaryNode) {
        const fills = boundaryNode.fills;
        if (Array.isArray(fills) && fills.length > 0 && fills[0].visible !== false) {
            const fill = fills[0];
            fillType = fill.type;
            if (fill.type === 'SOLID') {
                fillInfo = { color: fill.color };
            }
            else if (fill.type === 'GRADIENT_LINEAR' ||
                fill.type === 'GRADIENT_RADIAL' ||
                fill.type === 'GRADIENT_ANGULAR' ||
                fill.type === 'GRADIENT_DIAMOND') {
                fillInfo = {
                    gradientType: fill.type,
                    stops: fill.gradientStops,
                };
            }
        }
    }
    const bounds = (_a = boundaryNode === null || boundaryNode === void 0 ? void 0 : boundaryNode.absoluteBoundingBox) !== null && _a !== void 0 ? _a : null;
    figma.ui.postMessage({
        type: 'selection-change',
        boundaryNode: boundaryNode
            ? {
                id: boundaryNode.id,
                name: boundaryNode.name,
                nodeType: boundaryNode.type,
                fillType,
                fillInfo,
                bounds: bounds
                    ? {
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                    }
                    : null,
            }
            : null,
        dotSourceNode: dotSourceNode
            ? {
                id: dotSourceNode.id,
                name: dotSourceNode.name,
                nodeType: dotSourceNode.type,
            }
            : null,
    });
}
sendSelectionState();
figma.on('selectionchange', sendSelectionState);
// ---- Message Handling ----
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    if (msg.type === 'generate-dots') {
        yield handleGenerate(msg);
    }
    else if (msg.type === 'cancel') {
        figma.closePlugin();
    }
    else if (msg.type === 'request-selection') {
        sendSelectionState();
    }
    else if (msg.type === 'bitmap-result') {
        if (bitmapResolve) {
            bitmapResolve({
                lightness: msg.lightness,
                colors: msg.colors,
            });
            bitmapResolve = null;
        }
    }
});
// ---- Geometry Extraction ----
function extractGeometry(node) {
    const nodeType = node.type;
    if (nodeType === 'RECTANGLE' ||
        nodeType === 'ELLIPSE' ||
        nodeType === 'POLYGON' ||
        nodeType === 'STAR') {
        const shape = node;
        const w = shape.width;
        const h = shape.height;
        if (nodeType === 'RECTANGLE') {
            return {
                type: 'rect',
                width: w,
                height: h,
                vertices: [
                    { x: 0, y: 0 },
                    { x: w, y: 0 },
                    { x: w, y: h },
                    { x: 0, y: h },
                ],
            };
        }
        if (nodeType === 'ELLIPSE') {
            return { type: 'ellipse', width: w, height: h };
        }
        if (nodeType === 'POLYGON') {
            const polygon = node;
            const vertices = computePolygonVertices(w, h, polygon.pointCount, 0, 0);
            return { type: 'polygon', width: w, height: h, vertices };
        }
        if (nodeType === 'STAR') {
            const star = node;
            const vertices = computeStarVertices(w, h, star.pointCount, star.innerRadius, 0);
            return { type: 'star', width: w, height: h, vertices };
        }
    }
    if (nodeType === 'VECTOR') {
        const vector = node;
        const network = vector.vectorNetwork;
        if (network && network.vertices && network.segments) {
            const vertices = network.vertices.map((v) => ({ x: v.x, y: v.y }));
            const loops = extractVectorLoops(network.vertices, network.segments, network.regions);
            return {
                type: 'vector',
                width: vector.width,
                height: vector.height,
                vertices,
                loops: loops.length > 0 ? loops : [vertices],
            };
        }
        return {
            type: 'frame',
            width: vector.width,
            height: vector.height,
        };
    }
    if (nodeType === 'FRAME' ||
        nodeType === 'COMPONENT' ||
        nodeType === 'INSTANCE' ||
        nodeType === 'SECTION') {
        const frame = node;
        const w = frame.width;
        const h = frame.height;
        return {
            type: 'frame',
            width: w,
            height: h,
            vertices: [
                { x: 0, y: 0 },
                { x: w, y: 0 },
                { x: w, y: h },
                { x: 0, y: h },
            ],
        };
    }
    return null;
}
function computePolygonVertices(w, h, pointCount, rotation, cornerRadius) {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const verts = [];
    for (let i = 0; i < pointCount; i++) {
        const angle = -Math.PI / 2 + rotation + (i * 2 * Math.PI) / pointCount;
        verts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
    }
    return verts;
}
function computeStarVertices(w, h, pointCount, innerRadiusRatio, rotation) {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const verts = [];
    for (let i = 0; i < pointCount; i++) {
        const outerAngle = -Math.PI / 2 + rotation + (i * 2 * Math.PI) / pointCount;
        verts.push({ x: cx + rx * Math.cos(outerAngle), y: cy + ry * Math.sin(outerAngle) });
        const innerAngle = outerAngle + Math.PI / pointCount;
        const ir = innerRadiusRatio;
        verts.push({ x: cx + rx * ir * Math.cos(innerAngle), y: cy + ry * ir * Math.sin(innerAngle) });
    }
    return verts;
}
function extractVectorLoops(vertices, segments, regions) {
    const loops = [];
    if (regions && regions.length > 0) {
        for (const region of regions) {
            for (const loop of region.loops) {
                const pts = [];
                for (const segIdx of loop) {
                    const seg = segments[segIdx];
                    if (seg && pts.length === 0) {
                        pts.push({ x: vertices[seg.start].x, y: vertices[seg.start].y });
                    }
                    if (seg) {
                        pts.push({ x: vertices[seg.end].x, y: vertices[seg.end].y });
                    }
                }
                if (pts.length >= 3)
                    loops.push(pts);
            }
        }
    }
    if (loops.length === 0) {
        const visited = new Set();
        const adj = new Map();
        for (const seg of segments) {
            if (!adj.has(seg.start))
                adj.set(seg.start, []);
            adj.get(seg.start).push(seg.end);
            if (!adj.has(seg.end))
                adj.set(seg.end, []);
            adj.get(seg.end).push(seg.start);
        }
        for (const [start] of adj) {
            if (visited.has(start))
                continue;
            const loop = [];
            const stack = [start];
            while (stack.length > 0) {
                const v = stack.pop();
                if (visited.has(v))
                    continue;
                visited.add(v);
                loop.push(v);
                const neighbors = adj.get(v) || [];
                for (const n of neighbors) {
                    if (!visited.has(n))
                        stack.push(n);
                }
            }
            if (loop.length >= 3) {
                loops.push(loop.map((v) => ({ x: vertices[v].x, y: vertices[v].y })));
            }
        }
    }
    return loops;
}
// ---- Fill Analysis ----
function analyzeFill(node) {
    if (!('fills' in node))
        return { type: 'none' };
    const fills = node.fills;
    if (!Array.isArray(fills) || fills.length === 0)
        return { type: 'none' };
    const fill = fills[0];
    if (fill.visible === false)
        return { type: 'none' };
    if (fill.type === 'SOLID') {
        return { type: 'solid', color: fill.color };
    }
    if (fill.type === 'GRADIENT_LINEAR' ||
        fill.type === 'GRADIENT_RADIAL' ||
        fill.type === 'GRADIENT_ANGULAR' ||
        fill.type === 'GRADIENT_DIAMOND') {
        const gf = fill;
        return {
            type: 'gradient',
            gradient: {
                gradientType: fill.type,
                stops: gf.gradientStops,
                transform: gf.gradientTransform,
            },
        };
    }
    return { type: 'none' };
}
// ---- Point-in-Shape Testing ----
// All coordinates in node-local space
function isPointInsideShape(localPt, geom) {
    switch (geom.type) {
        case 'rect':
        case 'frame':
            return localPt.x >= 0 && localPt.x <= geom.width && localPt.y >= 0 && localPt.y <= geom.height;
        case 'ellipse': {
            const cx = geom.width / 2;
            const cy = geom.height / 2;
            const rx = geom.width / 2;
            const ry = geom.height / 2;
            if (rx <= 0 || ry <= 0)
                return false;
            const dx = (localPt.x - cx) / rx;
            const dy = (localPt.y - cy) / ry;
            return dx * dx + dy * dy <= 1;
        }
        case 'polygon':
        case 'star':
            if (geom.vertices && geom.vertices.length >= 3) {
                return pointInPolygon(localPt, geom.vertices);
            }
            return localPt.x >= 0 && localPt.x <= geom.width && localPt.y >= 0 && localPt.y <= geom.height;
        case 'vector':
            if (geom.loops && geom.loops.length > 0) {
                let inside = false;
                for (const loop of geom.loops) {
                    if (pointInPolygon(localPt, loop)) {
                        inside = !inside;
                    }
                }
                return inside;
            }
            return localPt.x >= 0 && localPt.x <= geom.width && localPt.y >= 0 && localPt.y <= geom.height;
        default:
            return localPt.x >= 0 && localPt.x <= geom.width && localPt.y >= 0 && localPt.y <= geom.height;
    }
}
function pointInPolygon(pt, vertices) {
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;
        if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}
// ---- Grid Generation ----
function generateGridPoints(bounds, spacing, mode) {
    const points = [];
    if (spacing <= 0)
        return points;
    const cols = Math.ceil(bounds.width / spacing) + 1;
    const rows = Math.ceil(bounds.height / spacing) + 1;
    switch (mode) {
        case 'quad': {
            for (let row = 0; row <= rows; row++) {
                for (let col = 0; col <= cols; col++) {
                    points.push({
                        x: bounds.x + col * spacing,
                        y: bounds.y + row * spacing,
                    });
                }
            }
            break;
        }
        case 'hex': {
            const vSpacing = spacing * (Math.sqrt(3) / 2);
            const hRows = Math.ceil(bounds.height / vSpacing) + 1;
            for (let row = 0; row <= hRows; row++) {
                const offsetX = row % 2 === 0 ? 0 : spacing / 2;
                for (let col = 0; col <= cols; col++) {
                    points.push({
                        x: bounds.x + col * spacing + offsetX,
                        y: bounds.y + row * vSpacing,
                    });
                }
            }
            break;
        }
        case 'brick': {
            for (let row = 0; row <= rows; row++) {
                const offsetX = row % 2 === 0 ? 0 : spacing / 2;
                for (let col = 0; col <= cols; col++) {
                    points.push({
                        x: bounds.x + col * spacing + offsetX,
                        y: bounds.y + row * spacing,
                    });
                }
            }
            break;
        }
        case 'diamond': {
            for (let row = 0; row <= rows; row++) {
                for (let col = 0; col <= cols; col++) {
                    const cx = bounds.x + col * spacing;
                    const cy = bounds.y + row * spacing;
                    points.push({ x: cx, y: cy });
                    points.push({ x: cx + spacing / 2, y: cy + spacing / 2 });
                }
            }
            break;
        }
        case 'random': {
            const targetCount = cols * rows;
            for (let i = 0; i < targetCount; i++) {
                points.push({
                    x: bounds.x + Math.random() * bounds.width,
                    y: bounds.y + Math.random() * bounds.height,
                });
            }
            break;
        }
    }
    return points;
}
function estimatePointCount(bounds, spacing, mode) {
    if (spacing <= 0)
        return 0;
    const baseCols = Math.ceil(bounds.width / spacing) + 1;
    const baseRows = Math.ceil(bounds.height / spacing) + 1;
    const base = baseCols * baseRows;
    switch (mode) {
        case 'quad':
        case 'brick':
        case 'random':
            return base;
        case 'hex': {
            const vSpacing = spacing * (Math.sqrt(3) / 2);
            const hRows = Math.ceil(bounds.height / vSpacing) + 1;
            return baseCols * hRows;
        }
        case 'diamond':
            return base * 2;
    }
}
// ---- Concentric Circle Point Generation ----
function generateConcentricPoints(center, maxRadius, spacingType, spacing, delta, ratio, phaseOffsetDeg) {
    const points = [];
    if (spacing <= 0)
        return points;
    const phaseOffsetRad = (phaseOffsetDeg * Math.PI) / 180;
    // Center point
    points.push({ x: center.x, y: center.y });
    let ringIndex = 1;
    const maxRings = 10000; // safety cap
    while (ringIndex <= maxRings) {
        // Compute ring radius based on spacing type
        let ringRadius;
        if (spacingType === 'equal') {
            ringRadius = ringIndex * spacing;
        }
        else if (spacingType === 'arithmetic') {
            // r_i = i*spacing + i*(i-1)/2 * delta
            ringRadius = ringIndex * spacing + (ringIndex * (ringIndex - 1) / 2) * delta;
        }
        else {
            // geometric: r_i = spacing * (1 - ratio^i) / (1 - ratio)
            if (Math.abs(ratio - 1) < 1e-9) {
                ringRadius = ringIndex * spacing;
            }
            else {
                ringRadius = spacing * (1 - Math.pow(ratio, ringIndex)) / (1 - ratio);
            }
        }
        if (ringRadius > maxRadius || ringRadius < 0)
            break;
        // Number of points: maintain consistent arc density ~= spacing
        const circumference = 2 * Math.PI * ringRadius;
        const n = Math.max(1, Math.round(circumference / spacing));
        // Phase offset accumulates per ring
        const ringPhase = ringIndex * phaseOffsetRad;
        for (let j = 0; j < n; j++) {
            const angle = j * (2 * Math.PI / n) + ringPhase;
            points.push({
                x: center.x + ringRadius * Math.cos(angle),
                y: center.y + ringRadius * Math.sin(angle),
            });
        }
        ringIndex++;
    }
    return points;
}
// ---- Polar Curve Grid Point Generation ----
// R = maxRadius (auto-computed from shape geometry).
// curvature controls total bend at r=R (in units of 2π).
// skip controls arm density: fewer arms at higher skip values.
// spiralType selects the radial twist profile.
//
// Points are sampled at uniform ARC-LENGTH intervals along each spiral arm
// (not uniform radial intervals). This prevents visual gaps near the boundary
// where the spiral's angular component stretches the radial step into a much
// longer arc-length step.
function computeSpiralTwist(r, R, curvature, type) {
    const u = r / R; // normalized radius [0, 1]
    let f;
    switch (type) {
        case 'archimedean':
            f = u;
            break;
        case 'fermat':
            f = Math.sqrt(u);
            break;
        case 'logarithmic':
            // log(1 + u) / log(2) — at u=1: f=1
            f = u < 1e-9 ? 0 : Math.log(1 + u) / Math.log(2);
            break;
        case 'euler':
            f = u * u;
            break;
        default:
            f = u;
    }
    return curvature * 2 * Math.PI * f;
}
function generatePolarPoints(center, maxRadius, curvature, skip, spiralType, densitySpacing) {
    const points = [];
    if (maxRadius <= 0 || densitySpacing <= 0)
        return points;
    // Center point
    points.push({ x: center.x, y: center.y });
    const numArms = Math.max(1, Math.floor((2 * Math.PI * maxRadius) / densitySpacing));
    const step = Math.max(1, Math.floor(skip) + 1);
    const generatedArms = Math.max(1, Math.ceil(numArms / step));
    // Oversample radially to integrate arc length accurately.
    // More oversampling when curvature is high (more arc-length stretch).
    const maxStretch = Math.max(1, Math.abs(curvature) * 2 * Math.PI);
    const oversample = Math.max(4, Math.ceil(maxStretch / 2));
    const fineSteps = Math.max(Math.floor(maxRadius / densitySpacing) * oversample, oversample * 4);
    for (let a = 0; a < generatedArms; a++) {
        const baseAngle = (a * 2 * Math.PI) / generatedArms;
        let accumulatedArc = 0;
        let prevR = 0;
        let prevTwist = 0;
        for (let i = 1; i <= fineSteps; i++) {
            const ri = (i / fineSteps) * maxRadius;
            const twist = computeSpiralTwist(ri, maxRadius, curvature, spiralType);
            const dr = ri - prevR;
            const dTheta = twist - prevTwist;
            const rMid = (ri + prevR) / 2;
            const segmentArc = Math.sqrt(dr * dr + rMid * rMid * dTheta * dTheta);
            accumulatedArc += segmentArc;
            if (accumulatedArc >= densitySpacing || i === fineSteps) {
                const curvedAngle = baseAngle + twist;
                points.push({
                    x: center.x + ri * Math.cos(curvedAngle),
                    y: center.y + ri * Math.sin(curvedAngle),
                });
                accumulatedArc = 0;
            }
            prevR = ri;
            prevTwist = twist;
        }
    }
    return points;
}
// ---- Phyllotaxis (Sunflower) Point Generation ----
// Based on the golden angle φ = π·(3 − √5) ≈ 137.508°.
// Seeds are placed at r(n)=k·√n, θ(n)=n·φ for n=0,1,2,...
// This produces the same spiral packing seen in sunflower heads.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
function generatePhyllotaxisPoints(center, maxRadius, scale) {
    const points = [];
    if (maxRadius <= 0 || scale <= 0)
        return points;
    // scale controls average distance between adjacent seeds.
    // Seeds within radius R: n_max = floor((R / scale)^2)
    const maxN = Math.floor(Math.pow((maxRadius / scale), 2));
    for (let n = 0; n <= maxN; n++) {
        const r = scale * Math.sqrt(n);
        const theta = n * GOLDEN_ANGLE;
        points.push({
            x: center.x + r * Math.cos(theta),
            y: center.y + r * Math.sin(theta),
        });
    }
    return points;
}
// ---- Gradient Sampling ----
function getLightness(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}
function sampleGradient(normalizedPt, gradient) {
    const gradPt = transformPoint(gradient.transform, normalizedPt);
    const gx = Math.max(0, Math.min(1, gradPt.x));
    const gy = Math.max(0, Math.min(1, gradPt.y));
    let t;
    switch (gradient.gradientType) {
        case 'GRADIENT_LINEAR':
            t = gx;
            break;
        case 'GRADIENT_RADIAL': {
            const dx = gx - 0.5;
            const dy = gy - 0.5;
            t = Math.sqrt(dx * dx + dy * dy) * 2;
            break;
        }
        case 'GRADIENT_ANGULAR': {
            const dx = gx - 0.5;
            const dy = gy - 0.5;
            let angle = Math.atan2(dy, dx);
            if (angle < 0)
                angle += 2 * Math.PI;
            t = angle / (2 * Math.PI);
            break;
        }
        case 'GRADIENT_DIAMOND':
            t = Math.abs(gx - 0.5) + Math.abs(gy - 0.5);
            break;
        default:
            t = gx;
    }
    t = Math.max(0, Math.min(1, t));
    return sampleStops(gradient.stops, t);
}
function sampleStops(stops, t) {
    if (stops.length === 0)
        return { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    if (stops.length === 1)
        return stops[0].color;
    let lo = 0;
    for (let i = stops.length - 1; i >= 0; i--) {
        if (stops[i].position <= t) {
            lo = i;
            break;
        }
    }
    let hi = lo + 1;
    if (hi >= stops.length) {
        return stops[lo].color;
    }
    const s0 = stops[lo];
    const s1 = stops[hi];
    const range = s1.position - s0.position;
    if (range <= 0)
        return s0.color;
    const frac = (t - s0.position) / range;
    return {
        r: s0.color.r + (s1.color.r - s0.color.r) * frac,
        g: s0.color.g + (s1.color.g - s0.color.g) * frac,
        b: s0.color.b + (s1.color.b - s0.color.b) * frac,
        a: s0.color.a + (s1.color.a - s0.color.a) * frac,
    };
}
// ---- Matrix Math ----
function invertMatrix(m) {
    const [[a, b, tx], [c, d, ty]] = m;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12)
        return m;
    return [
        [d / det, -b / det, (b * ty - d * tx) / det],
        [-c / det, a / det, (c * tx - a * ty) / det],
    ];
}
function transformPoint(m, pt) {
    const [[a, b, tx], [c, d, ty]] = m;
    return {
        x: a * pt.x + b * pt.y + tx,
        y: c * pt.x + d * pt.y + ty,
    };
}
// ---- Base64 Encoding ----
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function uint8ArrayToBase64(bytes) {
    let result = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < len ? bytes[i + 1] : 0;
        const b2 = i + 2 < len ? bytes[i + 2] : 0;
        result += BASE64_CHARS[b0 >> 2];
        result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
        result += i + 1 < len ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
        result += i + 2 < len ? BASE64_CHARS[b2 & 63] : '=';
    }
    return result;
}
// ---- Rotation Computation ----
function pseudoNoise(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}
function smoothNoise(x, y) {
    return (pseudoNoise(x, y) * 0.5 +
        pseudoNoise(x * 2.1, y * 2.1) * 0.3 +
        pseudoNoise(x * 4.3, y * 4.3) * 0.2);
}
function computeRotation(pt, center, mode, gridSpacing, curlEnabled, curlIntensity) {
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    const deg = 180 / Math.PI;
    const theta = Math.atan2(dy, dx);
    const r = Math.sqrt(dx * dx + dy * dy);
    const s = Math.max(1, gridSpacing);
    const u = r / s; // normalized radius
    let rotation;
    switch (mode) {
        case 'none':
            rotation = 0;
            break;
        case 'random':
            rotation = Math.random() * 360;
            break;
        case 'radial':
            rotation = theta * deg;
            break;
        case 'vortex':
            rotation = theta * deg + 90;
            break;
        case 'wave-h':
            rotation = Math.sin(pt.x * 0.03) * 180;
            break;
        case 'wave-v':
            rotation = Math.sin(pt.y * 0.03) * 180;
            break;
        case 'noise':
            rotation = smoothNoise(pt.x * 0.008, pt.y * 0.008) * 360;
            break;
        // ---- Spiral curl fields ----
        // Dots stay on the grid; their rotation follows a spiral vector field.
        // rotation = (polar angle θ + distance-dependent twist f(r)) in degrees.
        // f(r) determines the number of visible spiral arms: ~f(r_max)/(2π) arms.
        case 'archimedean':
            // Constant radial arm spacing: f(r) ∝ r
            // ~0.5 turns at r=s, ~4.8 turns at r=10s
            rotation = (theta + u * 3.0) * deg;
            break;
        case 'logarithmic':
            // Arms spread outward (equiangular): f(r) ∝ log(r)
            // ~1 turn at r=s, ~3.4 turns at r=10s
            rotation = (theta + Math.log(u + 1) * 9.0) * deg;
            break;
        case 'fermat':
            // Arms tighter near center (sunflower phyllotaxis): f(r) ∝ √r
            // ~1 turn at r=s, ~3 turns at r=10s
            rotation = (theta + Math.sqrt(u) * 6.0) * deg;
            break;
        case 'euler':
            // Clothoid: curvature κ ∝ r, so f(r) ∝ r²
            // ~0 turns at center → ~4 turns at r=10s (smooth transition)
            rotation = (theta + u * u * 0.25) * deg;
            break;
        default:
            rotation = 0;
    }
    // ---- Curl modifier ----
    // Constant curl = solid-body rotation: adds uniform angular velocity
    // curl=0: irrotational; curl>0: counterclockwise circulation
    // φ_curl = k·r where k = curlIntensity/1000 rad/px
    if (curlEnabled && curlIntensity > 0) {
        rotation += (curlIntensity / 1000) * r * deg;
    }
    return rotation;
}
// ---- Main Generation ----
function handleGenerate(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const boundaryNode = (yield figma.getNodeByIdAsync(params.boundaryNodeId));
        if (!boundaryNode || !('absoluteTransform' in boundaryNode)) {
            figma.notify('Please select a valid boundary shape', { error: true });
            return;
        }
        const geometry = extractGeometry(boundaryNode);
        if (!geometry) {
            figma.notify('Cannot read geometry from selected node', { error: true });
            return;
        }
        const fillResult = analyzeFill(boundaryNode);
        let dotSource = null;
        if (params.dotSourceNodeId) {
            dotSource = (yield figma.getNodeByIdAsync(params.dotSourceNodeId));
            if (!dotSource || !('clone' in dotSource)) {
                figma.notify('Invalid dot source shape', { error: true });
                return;
            }
        }
        const bounds = boundaryNode.absoluteBoundingBox;
        if (!bounds) {
            figma.notify('Cannot determine boundary size', { error: true });
            return;
        }
        const shapeCenter = {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
        };
        const invAbsTransform = invertMatrix(boundaryNode.absoluteTransform);
        const MAX_DOTS = 10000;
        // Generate candidate points from bounding box
        let allPoints;
        if (params.polarEnabled) {
            const cx = bounds.width / 2;
            const cy = bounds.height / 2;
            const maxRadius = Math.sqrt(cx * cx + cy * cy);
            const center = { x: bounds.x + cx, y: bounds.y + cy };
            allPoints = generatePolarPoints(center, maxRadius, params.polarN, params.polarSkip, params.polarSpiralType, params.gridSpacing);
        }
        else if (params.concentricEnabled) {
            const cx = bounds.width / 2;
            const cy = bounds.height / 2;
            const maxRadius = Math.sqrt(cx * cx + cy * cy);
            const center = { x: bounds.x + cx, y: bounds.y + cy };
            allPoints = generateConcentricPoints(center, maxRadius, params.concentricSpacingType, params.concentricSpacing, params.concentricDelta, params.concentricRatio, params.concentricPhaseOffset);
        }
        else if (params.phyllotaxisEnabled) {
            const cx = bounds.width / 2;
            const cy = bounds.height / 2;
            const maxRadius = Math.sqrt(cx * cx + cy * cy);
            const center = { x: bounds.x + cx, y: bounds.y + cy };
            allPoints = generatePhyllotaxisPoints(center, maxRadius, params.gridSpacing);
        }
        else {
            allPoints = generateGridPoints(bounds, params.gridSpacing, params.tileMode);
        }
        const rawPoints = [];
        for (const pt of allPoints) {
            const localPt = transformPoint(invAbsTransform, pt);
            if (!isPointInsideShape(localPt, geometry))
                continue;
            rawPoints.push({ ax: pt.x, ay: pt.y, lx: localPt.x, ly: localPt.y });
        }
        const gridPoints = [];
        if (params.sampleBitmap) {
            // Export boundary node as PNG and sample pixel lightness via UI
            const exportScale = Math.min(4, Math.max(0.5, 2 / params.gridSpacing));
            const nodeMaxDim = Math.max(boundaryNode.width, boundaryNode.height);
            const scale = Math.min(exportScale, 4096 / nodeMaxDim);
            const imageBytes = yield boundaryNode.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: scale },
            });
            figma.ui.postMessage({
                type: 'sample-bitmap',
                imageBase64: uint8ArrayToBase64(imageBytes),
                scale,
                localPoints: rawPoints.map((p) => ({ x: p.lx, y: p.ly })),
                nodeWidth: boundaryNode.width,
                nodeHeight: boundaryNode.height,
                sampleColor: params.sampleColor,
            });
            const result = yield new Promise((resolve) => {
                bitmapResolve = resolve;
            });
            for (let i = 0; i < rawPoints.length; i++) {
                const l = result.lightness[i];
                const diameter = Math.max(0.5, params.maxDiameter - l * (params.maxDiameter - params.minDiameter));
                const color = result.colors ? result.colors[i] : undefined;
                const rotation = computeRotation({ x: rawPoints[i].ax, y: rawPoints[i].ay }, shapeCenter, params.rotationMode, params.gridSpacing, params.curlEnabled, params.curlIntensity);
                gridPoints.push({ x: rawPoints[i].ax, y: rawPoints[i].ay, diameter, color, rotation });
            }
        }
        else {
            for (const rp of rawPoints) {
                let diameter;
                let color;
                if (fillResult.type === 'gradient' && fillResult.gradient) {
                    const normX = rp.lx / geometry.width;
                    const normY = rp.ly / geometry.height;
                    const sampled = sampleGradient({ x: normX, y: normY }, fillResult.gradient);
                    const lightness = getLightness(sampled);
                    diameter = params.maxDiameter - lightness * (params.maxDiameter - params.minDiameter);
                    if (params.sampleColor) {
                        color = sampled;
                    }
                }
                else {
                    diameter = params.dotDiameter;
                    if (params.sampleColor && fillResult.type === 'solid' && fillResult.color) {
                        color = fillResult.color;
                    }
                }
                if (diameter < 0.5)
                    diameter = 0.5;
                const rotation = computeRotation({ x: rp.ax, y: rp.ay }, shapeCenter, params.rotationMode, params.gridSpacing, params.curlEnabled, params.curlIntensity);
                gridPoints.push({ x: rp.ax, y: rp.ay, diameter, color, rotation });
            }
        }
        if (gridPoints.length === 0) {
            figma.notify('No grid points inside the boundary shape', { error: true });
            return;
        }
        if (gridPoints.length > MAX_DOTS) {
            figma.notify(`Too many dots (${gridPoints.length}). Increase grid spacing or reduce boundary size.`, { error: true });
            return;
        }
        const nodes = [];
        for (const gp of gridPoints) {
            let dot;
            if (dotSource) {
                dot = dotSource.clone();
                const sourceBounds = dotSource.absoluteBoundingBox;
                const sourceW = sourceBounds ? sourceBounds.width : dotSource.width;
                if (sourceW > 0) {
                    const scale = gp.diameter / sourceW;
                    dot.rescale(scale);
                }
            }
            else {
                const ellipse = figma.createEllipse();
                ellipse.resize(gp.diameter, gp.diameter);
                ellipse.strokeWeight = 0;
                dot = ellipse;
            }
            dot.x = gp.x - dot.width / 2;
            dot.y = gp.y - dot.height / 2;
            if ('fills' in dot && !dotSource) {
                if (gp.color) {
                    dot.fills = [{ type: 'SOLID', color: gp.color }];
                }
                else {
                    dot.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
                }
            }
            if ('rotation' in dot && gp.rotation !== 0) {
                dot.rotation = gp.rotation;
            }
            figma.currentPage.appendChild(dot);
            nodes.push(dot);
        }
        let group;
        if (nodes.length > 1) {
            group = figma.group(nodes, figma.currentPage);
        }
        else {
            group = figma.group([nodes[0]], figma.currentPage);
        }
        group.name = 'Grid Dots';
        group.expanded = false;
        figma.currentPage.selection = [group];
        figma.viewport.scrollAndZoomIntoView([group]);
        figma.notify(`Created ${gridPoints.length} dots`);
        figma.closePlugin();
    });
}
