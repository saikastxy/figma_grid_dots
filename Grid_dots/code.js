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
figma.showUI(__html__, { width: 340, height: 640 });
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
            const rect = node;
            const rTL = rect.topLeftRadius;
            const rTR = rect.topRightRadius;
            const rBR = rect.bottomRightRadius;
            const rBL = rect.bottomLeftRadius;
            const geometry = {
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
            if (rTL > 0 || rTR > 0 || rBR > 0 || rBL > 0) {
                geometry.cornerRadii = [rTL, rTR, rBR, rBL];
            }
            return geometry;
        }
        if (nodeType === 'ELLIPSE') {
            return { type: 'ellipse', width: w, height: h };
        }
        if (nodeType === 'POLYGON') {
            const polygon = node;
            const vertices = computePolygonVertices(w, h, polygon.pointCount, 0, 0);
            const geometry = { type: 'polygon', width: w, height: h, vertices };
            const cr = polygon.cornerRadius;
            if (typeof cr === 'number' && cr > 0) {
                geometry.cornerRadius = cr;
            }
            return geometry;
        }
        if (nodeType === 'STAR') {
            const star = node;
            const vertices = computeStarVertices(w, h, star.pointCount, star.innerRadius, 0);
            const geometry = { type: 'star', width: w, height: h, vertices };
            const cr = star.cornerRadius;
            if (typeof cr === 'number' && cr > 0) {
                geometry.cornerRadius = cr;
            }
            return geometry;
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
        const rTL = frame.topLeftRadius;
        const rTR = frame.topRightRadius;
        const rBR = frame.bottomRightRadius;
        const rBL = frame.bottomLeftRadius;
        const geometry = {
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
        if (rTL > 0 || rTR > 0 || rBR > 0 || rBL > 0) {
            geometry.cornerRadii = [rTL, rTR, rBR, rBL];
        }
        return geometry;
    }
    return null;
}
function computePolygonVertices(w, h, pointCount, rotation, _cornerRadius) {
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
            if (geom.cornerRadii) {
                return isInsideRoundedRect(localPt, geom.width, geom.height, geom.cornerRadii);
            }
            return localPt.x >= 0 && localPt.x <= geom.width && localPt.y >= 0 && localPt.y <= geom.height;
        case 'frame':
            if (geom.cornerRadii) {
                return isInsideRoundedRect(localPt, geom.width, geom.height, geom.cornerRadii);
            }
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
                if (geom.cornerRadius && geom.cornerRadius > 0) {
                    return isInsideRoundedPolygon(localPt, geom.vertices, geom.cornerRadius);
                }
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
function isInsideRoundedRect(pt, w, h, radii) {
    const { x, y } = pt;
    if (x < 0 || x > w || y < 0 || y > h)
        return false;
    const maxR = Math.min(w, h) / 2;
    const rTL = Math.min(radii[0], maxR);
    const rTR = Math.min(radii[1], maxR);
    const rBR = Math.min(radii[2], maxR);
    const rBL = Math.min(radii[3], maxR);
    if (x < rTL && y < rTL) {
        const dx = x - rTL, dy = y - rTL;
        return dx * dx + dy * dy <= rTL * rTL;
    }
    if (x > w - rTR && y < rTR) {
        const dx = x - (w - rTR), dy = y - rTR;
        return dx * dx + dy * dy <= rTR * rTR;
    }
    if (x > w - rBR && y > h - rBR) {
        const dx = x - (w - rBR), dy = y - (h - rBR);
        return dx * dx + dy * dy <= rBR * rBR;
    }
    if (x < rBL && y > h - rBL) {
        const dx = x - rBL, dy = y - (h - rBL);
        return dx * dx + dy * dy <= rBL * rBL;
    }
    return true;
}
// Rounded polygon point test. For each convex vertex, computes the
// rounding-circle center C (inset from both edges by cornerRadius) and
// excludes points that lie on the vertex side of the chord Q1-Q2 yet
// fall outside the circle — those are in the corner-cut region.
function isInsideRoundedPolygon(pt, vertices, cornerRadius) {
    if (!pointInPolygon(pt, vertices))
        return false;
    if (cornerRadius <= 0)
        return true;
    const n = vertices.length;
    const r = cornerRadius;
    const r2 = r * r;
    for (let i = 0; i < n; i++) {
        const V = vertices[i];
        const dx = pt.x - V.x;
        const dy = pt.y - V.y;
        if (dx * dx + dy * dy < 1e-9)
            continue; // exactly on vertex — keep
        const Vp = vertices[(i - 1 + n) % n];
        const Vn = vertices[(i + 1) % n];
        // Edge direction vectors (node-local, y-down)
        const e1x = V.x - Vp.x;
        const e1y = V.y - Vp.y;
        const e2x = Vn.x - V.x;
        const e2y = Vn.y - V.y;
        // Cross product: positive = convex for CW polygon in y-down
        if (e1x * e2y - e1y * e2x <= 0)
            continue;
        const len1 = Math.sqrt(e1x * e1x + e1y * e1y);
        const len2 = Math.sqrt(e2x * e2x + e2y * e2y);
        if (len1 < 1e-9 || len2 < 1e-9)
            continue;
        const d1x = e1x / len1;
        const d1y = e1y / len1;
        const d2x = e2x / len2;
        const d2y = e2y / len2;
        // Offset points on each edge, r back/ahead from V
        const Q1x = V.x - d1x * r;
        const Q1y = V.y - d1y * r;
        const Q2x = V.x + d2x * r;
        const Q2y = V.y + d2y * r;
        // Interior normals (right of edge direction in y-down)
        const n1x = -d1y;
        const n1y = d1x;
        const n2x = -d2y;
        const n2y = d2x;
        // Arc center C = intersection of lines through Q1,Q2 along normals
        const denom = n1x * n2y - n1y * n2x;
        if (Math.abs(denom) < 1e-12)
            continue;
        const qdx = Q2x - Q1x;
        const qdy = Q2y - Q1y;
        const t = (qdx * n2y - qdy * n2x) / denom;
        const Cx = Q1x + t * n1x;
        const Cy = Q1y + t * n1y;
        // Is pt on the V side of chord Q1-Q2?
        const sideV = (V.x - Q1x) * (Q2y - Q1y) - (V.y - Q1y) * (Q2x - Q1x);
        const sideP = (pt.x - Q1x) * (Q2y - Q1y) - (pt.y - Q1y) * (Q2x - Q1x);
        if (sideV * sideP <= 0)
            continue; // pt is on body side of chord
        // Pt on V side: if outside the rounding circle → corner cut
        const cdx = pt.x - Cx;
        const cdy = pt.y - Cy;
        if (cdx * cdx + cdy * cdy > r2) {
            return false;
        }
    }
    return true;
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
function createSeededRandom(seed) {
    let state = Math.floor(seed) >>> 0;
    if (state === 0)
        state = 0x6d2b79f5;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}
function generatePoissonDiskPoints(bounds, minDistance, seed, maxPoints) {
    const points = [];
    if (minDistance <= 0 || bounds.width <= 0 || bounds.height <= 0)
        return points;
    const random = createSeededRandom(seed);
    const cellSize = minDistance / Math.sqrt(2);
    const gridWidth = Math.max(1, Math.ceil(bounds.width / cellSize));
    const gridHeight = Math.max(1, Math.ceil(bounds.height / cellSize));
    const cellCount = gridWidth * gridHeight;
    if (!Number.isSafeInteger(cellCount) || cellCount > maxPoints * 6) {
        points.length = maxPoints + 1;
        return points;
    }
    const backgroundGrid = new Int32Array(gridWidth * gridHeight);
    backgroundGrid.fill(-1);
    const active = [];
    const minDistanceSq = minDistance * minDistance;
    const attempts = 30;
    const addPoint = (point) => {
        const index = points.length;
        points.push(point);
        active.push(index);
        const gx = Math.min(gridWidth - 1, Math.floor((point.x - bounds.x) / cellSize));
        const gy = Math.min(gridHeight - 1, Math.floor((point.y - bounds.y) / cellSize));
        backgroundGrid[gy * gridWidth + gx] = index;
    };
    addPoint({
        x: bounds.x + random() * bounds.width,
        y: bounds.y + random() * bounds.height,
    });
    while (active.length > 0 && points.length <= maxPoints) {
        const activeSlot = Math.floor(random() * active.length);
        const origin = points[active[activeSlot]];
        let accepted = false;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const angle = random() * Math.PI * 2;
            const radius = minDistance * Math.sqrt(1 + 3 * random());
            const candidate = {
                x: origin.x + Math.cos(angle) * radius,
                y: origin.y + Math.sin(angle) * radius,
            };
            if (candidate.x < bounds.x ||
                candidate.x > bounds.x + bounds.width ||
                candidate.y < bounds.y ||
                candidate.y > bounds.y + bounds.height) {
                continue;
            }
            const gx = Math.floor((candidate.x - bounds.x) / cellSize);
            const gy = Math.floor((candidate.y - bounds.y) / cellSize);
            let clear = true;
            for (let ny = Math.max(0, gy - 2); ny <= Math.min(gridHeight - 1, gy + 2) && clear; ny++) {
                for (let nx = Math.max(0, gx - 2); nx <= Math.min(gridWidth - 1, gx + 2); nx++) {
                    const neighborIndex = backgroundGrid[ny * gridWidth + nx];
                    if (neighborIndex < 0)
                        continue;
                    const neighbor = points[neighborIndex];
                    const dx = candidate.x - neighbor.x;
                    const dy = candidate.y - neighbor.y;
                    if (dx * dx + dy * dy < minDistanceSq) {
                        clear = false;
                        break;
                    }
                }
            }
            if (clear) {
                addPoint(candidate);
                accepted = true;
                break;
            }
        }
        if (!accepted) {
            active[activeSlot] = active[active.length - 1];
            active.pop();
        }
    }
    return points;
}
function generateGridPoints(bounds, spacing, mode, angleDeg, rowOffsetPercent, rowSpacingRatio, jitterAmount, seed, maxPoints) {
    const points = [];
    if (spacing <= 0 || bounds.width <= 0 || bounds.height <= 0)
        return points;
    if (mode === 'poisson') {
        return generatePoissonDiskPoints(bounds, spacing, seed, maxPoints);
    }
    const rowRatio = clamp(finiteOr(rowSpacingRatio, 1), 0.25, 4);
    const random = createSeededRandom(seed);
    if (mode === 'random') {
        const targetCount = Math.ceil((bounds.width * bounds.height) / (spacing * spacing * rowRatio));
        for (let i = 0; i < Math.min(targetCount, maxPoints + 1); i++) {
            points.push({
                x: bounds.x + random() * bounds.width,
                y: bounds.y + random() * bounds.height,
            });
        }
        return points;
    }
    let presetRowShift = 0;
    let presetRowHeight = 1;
    if (mode === 'hex') {
        presetRowShift = 0.5;
        presetRowHeight = Math.sqrt(3) / 2;
    }
    else if (mode === 'brick') {
        presetRowShift = 0.5;
    }
    else if (mode === 'diamond') {
        presetRowShift = 0.5;
        presetRowHeight = 0.5;
    }
    const angle = (finiteOr(angleDeg, 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rowShift = presetRowShift + clamp(finiteOr(rowOffsetPercent, 0), -200, 200) / 100;
    const rowHeight = presetRowHeight * rowRatio;
    // A and B are the two basis vectors of the lattice. Row offset shears B
    // along A; rotating both vectors changes the overall flow direction.
    const ax = cos * spacing;
    const ay = sin * spacing;
    const bx = (cos * rowShift - sin * rowHeight) * spacing;
    const by = (sin * rowShift + cos * rowHeight) * spacing;
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-9)
        return points;
    const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
    };
    const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
    ];
    let minI = Infinity;
    let maxI = -Infinity;
    let minJ = Infinity;
    let maxJ = -Infinity;
    for (const corner of corners) {
        const dx = corner.x - center.x;
        const dy = corner.y - center.y;
        const i = (dx * by - dy * bx) / det;
        const j = (ax * dy - ay * dx) / det;
        minI = Math.min(minI, i);
        maxI = Math.max(maxI, i);
        minJ = Math.min(minJ, j);
        maxJ = Math.max(maxJ, j);
    }
    const jitter = clamp(finiteOr(jitterAmount, 0), 0, 100) / 100;
    const jitterRadius = Math.min(spacing, rowHeight * spacing) * 0.45 * jitter;
    const padding = jitter > 0 ? 2 : 1;
    const startI = Math.floor(minI) - padding;
    const endI = Math.ceil(maxI) + padding;
    const startJ = Math.floor(minJ) - padding;
    const endJ = Math.ceil(maxJ) + padding;
    for (let row = startJ; row <= endJ; row++) {
        for (let col = startI; col <= endI; col++) {
            let x = center.x + col * ax + row * bx;
            let y = center.y + col * ay + row * by;
            if (jitterRadius > 0) {
                x += (random() * 2 - 1) * jitterRadius;
                y += (random() * 2 - 1) * jitterRadius;
            }
            if (x >= bounds.x - jitterRadius &&
                x <= bounds.x + bounds.width + jitterRadius &&
                y >= bounds.y - jitterRadius &&
                y <= bounds.y + bounds.height + jitterRadius) {
                points.push({ x, y, latticeI: col, latticeJ: row });
                if (points.length > maxPoints)
                    return points;
            }
        }
    }
    return points;
}
/**
 * Centers of the two congruent triangular faces in each triangular-lattice
 * parallelogram. Their local offsets are (A+B)/3 and 2(A+B)/3, so the
 * resulting units share edges instead of merely alternating orientations on a
 * square point grid.
 */
function generateTriangleTessellationPoints(bounds, side, angleDeg, rowSpacingRatio, jitterAmount, seed, maxPoints) {
    const points = [];
    if (side <= 0 || bounds.width <= 0 || bounds.height <= 0)
        return points;
    const random = createSeededRandom(seed);
    const ratio = clamp(finiteOr(rowSpacingRatio, 1), 0.25, 4);
    const height = (Math.sqrt(3) / 2) * ratio;
    const angle = (finiteOr(angleDeg, 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ax = cos * side;
    const ay = sin * side;
    const bx = (cos * 0.5 - sin * height) * side;
    const by = (sin * 0.5 + cos * height) * side;
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-9)
        return points;
    const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
    };
    const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
    ];
    let minI = Infinity;
    let maxI = -Infinity;
    let minJ = Infinity;
    let maxJ = -Infinity;
    for (const corner of corners) {
        const dx = corner.x - center.x;
        const dy = corner.y - center.y;
        const i = (dx * by - dy * bx) / det;
        const j = (ax * dy - ay * dx) / det;
        minI = Math.min(minI, i);
        maxI = Math.max(maxI, i);
        minJ = Math.min(minJ, j);
        maxJ = Math.max(maxJ, j);
    }
    const jitter = clamp(finiteOr(jitterAmount, 0), 0, 100) / 100;
    const jitterRadius = Math.min(side, height * side) * 0.22 * jitter;
    const startI = Math.floor(minI) - 2;
    const endI = Math.ceil(maxI) + 2;
    const startJ = Math.floor(minJ) - 2;
    const endJ = Math.ceil(maxJ) + 2;
    const addFace = (i, j, faceOffset, rhythmOffset) => {
        let x = center.x + i * ax + j * bx + faceOffset.x * ax + faceOffset.y * bx;
        let y = center.y + i * ay + j * by + faceOffset.x * ay + faceOffset.y * by;
        if (jitterRadius > 0) {
            x += (random() * 2 - 1) * jitterRadius;
            y += (random() * 2 - 1) * jitterRadius;
        }
        if (x < bounds.x - jitterRadius ||
            x > bounds.x + bounds.width + jitterRadius ||
            y < bounds.y - jitterRadius ||
            y > bounds.y + bounds.height + jitterRadius) {
            return true;
        }
        points.push({ x, y, latticeI: i, latticeJ: j, rhythmOffset });
        return points.length <= maxPoints;
    };
    for (let row = startJ; row <= endJ; row++) {
        for (let col = startI; col <= endI; col++) {
            // Face centroids in local lattice coordinates:
            // A = (A + B) / 3, B = 2(A + B) / 3.
            if (!addFace(col, row, { x: 1 / 3, y: 1 / 3 }, 1))
                return points;
            if (!addFace(col, row, { x: 2 / 3, y: 2 / 3 }, 0))
                return points;
        }
    }
    return points;
}
// ---- Concentric Circle Point Generation ----
function generateConcentricPoints(center, maxRadius, spacingType, spacing, delta, ratio, phaseOffsetDeg, maxPoints) {
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
            if (points.length > maxPoints)
                return points;
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
function generatePolarPoints(center, maxRadius, curvature, skip, spiralType, densitySpacing, maxPoints) {
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
                if (points.length > maxPoints)
                    return points;
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
function generatePhyllotaxisPoints(center, maxRadius, scale, maxPoints) {
    const points = [];
    if (maxRadius <= 0 || scale <= 0)
        return points;
    // scale controls average distance between adjacent seeds.
    // Seeds within radius R: n_max = floor((R / scale)^2)
    const maxN = Math.floor(Math.pow((maxRadius / scale), 2));
    for (let n = 0; n <= Math.min(maxN, maxPoints); n++) {
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
    const hi = lo + 1;
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
function noiseHash(x, y, seed) {
    let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
function noiseFade(value) {
    return value * value * value * (value * (value * 6 - 15) + 10);
}
function valueNoise(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = noiseFade(x - x0);
    const ty = noiseFade(y - y0);
    const n00 = noiseHash(x0, y0, seed);
    const n10 = noiseHash(x0 + 1, y0, seed);
    const n01 = noiseHash(x0, y0 + 1, seed);
    const n11 = noiseHash(x0 + 1, y0 + 1, seed);
    const top = n00 + (n10 - n00) * tx;
    const bottom = n01 + (n11 - n01) * tx;
    return top + (bottom - top) * ty;
}
function fractalNoise(x, y, seed) {
    let total = 0;
    let amplitude = 0.58;
    let frequency = 1;
    let normalization = 0;
    for (let octave = 0; octave < 3; octave++) {
        total += valueNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
        normalization += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return total / normalization;
}
function rotateVector(vector, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: vector.x * cos - vector.y * sin,
        y: vector.x * sin + vector.y * cos,
    };
}
function normalizeVector(vector, fallback) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length < 1e-9)
        return fallback;
    return { x: vector.x / length, y: vector.y / length };
}
function computeFlowRotation(pt, center, mode, gridSpacing, fieldAngleDeg, fieldStrength, fieldScale, orientationOffsetDeg, seed) {
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    const spacing = Math.max(1, gridSpacing);
    // Work in grid-cell coordinates so a field depends on its position inside
    // the boundary, not on the boundary's absolute canvas location.
    const gridX = dx / spacing;
    const gridY = dy / spacing;
    const fieldAngle = (finiteOr(fieldAngleDeg, 0) * Math.PI) / 180;
    const strength = clamp(finiteOr(fieldStrength, 50), -100, 100) / 100;
    const scale = clamp(finiteOr(fieldScale, 6), 1, 24);
    const fallback = { x: Math.cos(fieldAngle), y: Math.sin(fieldAngle) };
    let vector;
    switch (mode) {
        case 'none':
            return finiteOr(orientationOffsetDeg, 0);
        case 'uniform':
            vector = fallback;
            break;
        case 'radial': // legacy alias
        case 'radial-out':
            vector = normalizeVector({ x: dx, y: dy }, fallback);
            break;
        case 'radial-in':
            vector = normalizeVector({ x: -dx, y: -dy }, fallback);
            break;
        case 'orbit-ccw':
            vector = normalizeVector({ x: dy, y: -dx }, fallback);
            break;
        case 'vortex': // legacy alias
        case 'orbit-cw':
            vector = normalizeVector({ x: -dy, y: dx }, fallback);
            break;
        case 'spiral-out':
        case 'archimedean':
        case 'logarithmic':
        case 'fermat':
        case 'euler': {
            const radial = normalizeVector({ x: dx, y: dy }, fallback);
            vector = rotateVector(radial, strength * Math.PI * 0.5);
            break;
        }
        case 'spiral-in': {
            const inward = normalizeVector({ x: -dx, y: -dy }, fallback);
            vector = rotateVector(inward, strength * Math.PI * 0.5);
            break;
        }
        case 'wave-h':
        case 'wave-v':
        case 'wave': {
            const legacyAngle = mode === 'wave-v' ? fieldAngle + Math.PI / 2 : fieldAngle;
            const axis = { x: Math.cos(legacyAngle), y: Math.sin(legacyAngle) };
            const normal = { x: -axis.y, y: axis.x };
            const projected = gridX * axis.x + gridY * axis.y;
            const wave = Math.sin((projected / scale) * Math.PI * 2);
            vector = normalizeVector({ x: axis.x + normal.x * wave * strength * 2, y: axis.y + normal.y * wave * strength * 2 }, axis);
            break;
        }
        case 'cross-wave': {
            const inverse = rotateVector({ x: gridX, y: gridY }, -fieldAngle);
            const frequency = (Math.PI * 2) / scale;
            const cross = normalizeVector({ x: Math.cos(inverse.y * frequency), y: Math.sin(inverse.x * frequency) }, { x: 1, y: 0 });
            const mixed = normalizeVector({ x: 1 - Math.abs(strength) + cross.x * Math.abs(strength), y: cross.y * strength }, { x: 1, y: 0 });
            vector = rotateVector(mixed, fieldAngle);
            break;
        }
        case 'noise': // legacy alias
        case 'curl-noise': {
            const nx = gridX / scale;
            const ny = gridY / scale;
            const epsilon = 0.04;
            const dNoiseDx = fractalNoise(nx + epsilon, ny, seed) - fractalNoise(nx - epsilon, ny, seed);
            const dNoiseDy = fractalNoise(nx, ny + epsilon, seed) - fractalNoise(nx, ny - epsilon, seed);
            const curl = normalizeVector({ x: dNoiseDy, y: -dNoiseDx }, fallback);
            const mix = Math.abs(strength);
            const direction = strength < 0 ? -1 : 1;
            vector = normalizeVector({
                x: fallback.x * (1 - mix) + curl.x * mix * direction,
                y: fallback.y * (1 - mix) + curl.y * mix * direction,
            }, fallback);
            break;
        }
        case 'saddle': {
            const local = rotateVector({ x: gridX, y: gridY }, -fieldAngle);
            const squeeze = 0.35 + Math.abs(strength) * 1.65;
            const saddle = normalizeVector({ x: local.x, y: -local.y * squeeze * (strength < 0 ? -1 : 1) }, { x: 1, y: 0 });
            vector = rotateVector(saddle, fieldAngle);
            break;
        }
        default:
            vector = fallback;
    }
    const angleDeg = (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
    return angleDeg + finiteOr(orientationOffsetDeg, 0);
}
function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
}
/**
 * Converts sampled lightness to the probability that a candidate point is
 * kept. Black always keeps every candidate; white keeps the configured floor.
 */
function computeDensityProbability(lightness, minDensityPercent, curve) {
    const darkness = 1 - clamp(finiteOr(lightness, 1), 0, 1);
    const minimum = clamp(finiteOr(minDensityPercent, 5), 0, 100) / 100;
    const response = clamp(finiteOr(curve, 1), 0.25, 4);
    return minimum + (1 - minimum) * Math.pow(darkness, response);
}
/**
 * Maps lightness onto nested regular sublattices. Powers of two ensure every
 * lighter/coarser lattice remains a subset of the darker/denser lattice.
 */
function computeDensitySpacingMultiplier(lightness, maxSpacingMultiplier, curve) {
    const value = clamp(finiteOr(lightness, 1), 0, 1);
    const maximum = clamp(finiteOr(maxSpacingMultiplier, 4), 1, 16);
    const maxLevel = Math.max(0, Math.round(Math.log(maximum) / Math.log(2)));
    const response = clamp(finiteOr(curve, 1), 0.25, 4);
    const spacingResponse = 1 - Math.pow(1 - value, response);
    const level = Math.round(spacingResponse * maxLevel);
    return Math.pow(2, level);
}
function keepPointOnDensitySublattice(pt, center, gridSpacing, lightness, maxSpacingMultiplier, curve, seed, latticeI, latticeJ) {
    const stride = computeDensitySpacingMultiplier(lightness, maxSpacingMultiplier, curve);
    if (stride <= 1)
        return true;
    const spacing = Math.max(1, finiteOr(gridSpacing, 20));
    const cellI = Number.isFinite(latticeI)
        ? Math.round(latticeI)
        : Math.round((pt.x - center.x) / spacing);
    const cellJ = Number.isFinite(latticeJ)
        ? Math.round(latticeJ)
        : Math.round((pt.y - center.y) / spacing);
    const seedValue = Math.floor(finiteOr(seed, 1));
    const phaseI = positiveModulo(seedValue, stride);
    const phaseJ = positiveModulo(seedValue * 3 + 1, stride);
    return (positiveModulo(cellI - phaseI, stride) === 0 &&
        positiveModulo(cellJ - phaseJ, stride) === 0);
}
function densityRandomValue(pt, center, gridSpacing, seed, latticeI, latticeJ, rhythmOffset) {
    const spacing = Math.max(1, finiteOr(gridSpacing, 20));
    const face = Number.isFinite(rhythmOffset) ? Math.round(rhythmOffset) : 0;
    const hashX = Number.isFinite(latticeI)
        ? Math.round(latticeI * 4) + face
        : Math.round(((pt.x - center.x) / spacing) * 4096);
    const hashY = Number.isFinite(latticeJ)
        ? Math.round(latticeJ * 4) + face * 2
        : Math.round(((pt.y - center.y) / spacing) * 4096);
    return noiseHash(hashX, hashY, Math.floor(finiteOr(seed, 1)) + 7919);
}
/**
 * Adds a deterministic orientation rhythm on top of the vector field. The
 * optional lattice indices keep the phase locked to angled/offset lattices;
 * polar, concentric and random layouts fall back to quantized canvas cells.
 */
function computeRhythmRotation(pt, center, gridSpacing, mode, flipAngleDeg, phase, latticeI, latticeJ) {
    if (!mode || mode === 'none')
        return 0;
    const spacing = Math.max(1, finiteOr(gridSpacing, 20));
    const cellI = Number.isFinite(latticeI)
        ? Math.round(latticeI)
        : Math.round((pt.x - center.x) / spacing);
    const cellJ = Number.isFinite(latticeJ)
        ? Math.round(latticeJ)
        : Math.round((pt.y - center.y) / spacing);
    const phaseBit = Math.round(clamp(finiteOr(phase, 0), 0, 1));
    let flipped = false;
    switch (mode) {
        case 'triangle-tessellation':
        case 'alternate':
            flipped = positiveModulo(cellI + cellJ + phaseBit, 2) === 1;
            break;
        case 'row-alternate':
            flipped = positiveModulo(cellJ + phaseBit, 2) === 1;
            break;
        case 'column-alternate':
            flipped = positiveModulo(cellI + phaseBit, 2) === 1;
            break;
        case 'syncopated':
            // Two hits followed by a rest: A B B, repeated along the lattice.
            flipped = positiveModulo(cellI + cellJ + phaseBit, 3) !== 0;
            break;
        default:
            return 0;
    }
    return flipped ? finiteOr(flipAngleDeg, 180) : 0;
}
/**
 * Places a node so its local center stays on the requested grid point while
 * its local +X axis follows a visual, canvas-space angle. Canvas angles grow
 * clockwise because Y grows downward; Figma's `rotation` property uses the
 * opposite sign and pivots around the top-left, so setting `rotation` alone
 * cannot keep directional units centered on their grid points.
 */
function placeNodeAtVisualAngle(node, center, visualAngleDeg) {
    const angle = (finiteOr(visualAngleDeg, 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfWidth = node.width / 2;
    const halfHeight = node.height / 2;
    node.relativeTransform = [
        [cos, -sin, center.x - cos * halfWidth + sin * halfHeight],
        [sin, cos, center.y - sin * halfWidth - cos * halfHeight],
    ];
}
function createVectorUnit(path) {
    const vector = figma.createVector();
    vector.vectorPaths = [{ windingRule: 'NONZERO', data: path }];
    vector.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    vector.strokes = [];
    return vector;
}
function createPresetDot(preset, diameter) {
    const width = Math.max(0.5, diameter);
    if (preset === 'ellipse') {
        const ellipse = figma.createEllipse();
        ellipse.resize(width, Math.max(0.5, width * 0.42));
        ellipse.strokeWeight = 0;
        return { node: ellipse, baseRotation: 0 };
    }
    if (preset === 'diamond') {
        const diamond = figma.createPolygon();
        diamond.pointCount = 4;
        diamond.resize(width, Math.max(0.5, width * 0.62));
        diamond.strokeWeight = 0;
        return { node: diamond, baseRotation: 0 };
    }
    if (preset === 'triangle') {
        const triangle = figma.createPolygon();
        triangle.pointCount = 3;
        triangle.resize(width, Math.max(0.5, width * (Math.sqrt(3) / 2)));
        triangle.strokeWeight = 0;
        // Figma polygons point upward by default; visually +90° points the tip right.
        return { node: triangle, baseRotation: 90 };
    }
    if (preset === 'capsule') {
        const height = Math.max(0.5, width * 0.28);
        const capsule = figma.createRectangle();
        capsule.resize(width, height);
        capsule.cornerRadius = height / 2;
        capsule.strokeWeight = 0;
        return { node: capsule, baseRotation: 0 };
    }
    if (preset === 'arrow') {
        const height = Math.max(0.5, width * 0.62);
        const y1 = height * 0.31;
        const y2 = height * 0.69;
        const neck = width * 0.58;
        const arrow = createVectorUnit(`M 0 ${y1} L ${neck} ${y1} L ${neck} 0 L ${width} ${height / 2} L ${neck} ${height} L ${neck} ${y2} L 0 ${y2} Z`);
        return { node: arrow, baseRotation: 0 };
    }
    if (preset === 'leaf') {
        const height = Math.max(0.5, width * 0.56);
        const leaf = createVectorUnit(`M 0 ${height / 2} C ${width * 0.24} 0 ${width * 0.72} 0 ${width} ${height / 2} C ${width * 0.72} ${height} ${width * 0.24} ${height} 0 ${height / 2} Z`);
        return { node: leaf, baseRotation: 0 };
    }
    if (preset === 'chevron') {
        const height = Math.max(0.5, width * 0.68);
        const chevron = createVectorUnit(`M 0 0 L ${width * 0.46} ${height / 2} L 0 ${height} L ${width * 0.34} ${height} L ${width} ${height / 2} L ${width * 0.34} 0 Z`);
        return { node: chevron, baseRotation: 0 };
    }
    const circle = figma.createEllipse();
    circle.resize(width, width);
    circle.strokeWeight = 0;
    return { node: circle, baseRotation: 0 };
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
        const requestedUnit = params.unitPreset || (params.dotSourceNodeId ? 'selected' : 'circle');
        let dotSource = null;
        if (requestedUnit === 'selected' && params.dotSourceNodeId) {
            dotSource = (yield figma.getNodeByIdAsync(params.dotSourceNodeId));
            if (!dotSource || !('clone' in dotSource)) {
                figma.notify('Invalid dot source shape', { error: true });
                return;
            }
        }
        const effectiveUnit = requestedUnit === 'selected' && !dotSource ? 'circle' : requestedUnit;
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
        const MAX_CANDIDATES = 50000;
        const gridSpacing = clamp(finiteOr(params.gridSpacing, 20), 1, 10000);
        const triangleTessellationLayout = params.rhythmEnabled &&
            params.rhythmMode === 'triangle-tessellation' &&
            !params.polarEnabled &&
            !params.concentricEnabled &&
            !params.phyllotaxisEnabled;
        // Generate candidate points from bounding box
        let allPoints;
        if (triangleTessellationLayout) {
            allPoints = generateTriangleTessellationPoints(bounds, gridSpacing, finiteOr(params.gridAngle, 0), finiteOr(params.rowSpacingRatio, 1), finiteOr(params.jitterAmount, 0), finiteOr(params.randomSeed, 1), MAX_CANDIDATES);
        }
        else if (params.polarEnabled) {
            const cx = bounds.width / 2;
            const cy = bounds.height / 2;
            const maxRadius = Math.sqrt(cx * cx + cy * cy);
            const center = { x: bounds.x + cx, y: bounds.y + cy };
            allPoints = generatePolarPoints(center, maxRadius, params.polarN, params.polarSkip, params.polarSpiralType, gridSpacing, MAX_CANDIDATES);
        }
        else if (params.concentricEnabled) {
            const cx = bounds.width / 2;
            const cy = bounds.height / 2;
            const maxRadius = Math.sqrt(cx * cx + cy * cy);
            const center = { x: bounds.x + cx, y: bounds.y + cy };
            allPoints = generateConcentricPoints(center, maxRadius, params.concentricSpacingType, params.concentricSpacing, params.concentricDelta, params.concentricRatio, params.concentricPhaseOffset, MAX_CANDIDATES);
        }
        else if (params.phyllotaxisEnabled) {
            const cx = bounds.width / 2;
            const cy = bounds.height / 2;
            const maxRadius = Math.sqrt(cx * cx + cy * cy);
            const center = { x: bounds.x + cx, y: bounds.y + cy };
            allPoints = generatePhyllotaxisPoints(center, maxRadius, gridSpacing, MAX_CANDIDATES);
        }
        else {
            allPoints = generateGridPoints(bounds, gridSpacing, params.tileMode, finiteOr(params.gridAngle, 0), finiteOr(params.rowOffset, 0), finiteOr(params.rowSpacingRatio, 1), finiteOr(params.jitterAmount, 0), finiteOr(params.randomSeed, 1), MAX_CANDIDATES);
        }
        if (allPoints.length > MAX_CANDIDATES) {
            figma.notify('Point field is too dense. Increase spacing or row spacing.', { error: true });
            return;
        }
        const rawPoints = [];
        for (const pt of allPoints) {
            const localPt = transformPoint(invAbsTransform, pt);
            if (!isPointInsideShape(localPt, geometry))
                continue;
            rawPoints.push({
                ax: pt.x,
                ay: pt.y,
                lx: localPt.x,
                ly: localPt.y,
                latticeI: pt.latticeI,
                latticeJ: pt.latticeJ,
                rhythmOffset: pt.rhythmOffset,
            });
        }
        const gridPoints = [];
        const grayscaleMode = params.grayscaleMode ||
            (params.sampleBitmap && params.densityEnabled
                ? 'both'
                : params.sampleBitmap
                    ? 'radius'
                    : params.densityEnabled
                        ? 'density'
                        : 'off');
        const radiusByGrayscale = grayscaleMode === 'radius' || grayscaleMode === 'both';
        const densityByGrayscale = grayscaleMode === 'density' || grayscaleMode === 'both';
        const needsBitmapSampling = radiusByGrayscale || densityByGrayscale;
        let bitmapResult = null;
        if (needsBitmapSampling) {
            // Radius sampling and density control share this single image export.
            const exportScale = Math.min(4, Math.max(0.5, 2 / gridSpacing));
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
            bitmapResult = yield new Promise((resolve) => {
                bitmapResolve = resolve;
            });
        }
        for (let i = 0; i < rawPoints.length; i++) {
            const rp = rawPoints[i];
            const bitmapLightness = bitmapResult
                ? clamp(finiteOr(bitmapResult.lightness[i], 1), 0, 1)
                : null;
            if (densityByGrayscale && bitmapLightness !== null) {
                if ((params.densityMethod || 'spacing') === 'random') {
                    const keepProbability = computeDensityProbability(bitmapLightness, finiteOr(params.densityMinPercent, 5), finiteOr(params.densityCurve, 1));
                    const randomValue = densityRandomValue({ x: rp.ax, y: rp.ay }, shapeCenter, gridSpacing, finiteOr(params.randomSeed, 1), rp.latticeI, rp.latticeJ, rp.rhythmOffset);
                    if (randomValue >= keepProbability)
                        continue;
                }
                else if (!keepPointOnDensitySublattice({ x: rp.ax, y: rp.ay }, shapeCenter, gridSpacing, bitmapLightness, finiteOr(params.densityMaxSpacing, 4), finiteOr(params.densityCurve, 1), finiteOr(params.randomSeed, 1), rp.latticeI, rp.latticeJ)) {
                    continue;
                }
            }
            let diameter;
            let color;
            if (radiusByGrayscale && bitmapLightness !== null) {
                diameter = params.maxDiameter - bitmapLightness * (params.maxDiameter - params.minDiameter);
                if (params.sampleColor && (bitmapResult === null || bitmapResult === void 0 ? void 0 : bitmapResult.colors)) {
                    color = bitmapResult.colors[i];
                }
            }
            else {
                diameter = params.dotDiameter;
                if (params.sampleColor && fillResult.type === 'gradient' && fillResult.gradient) {
                    const normX = rp.lx / geometry.width;
                    const normY = rp.ly / geometry.height;
                    const sampled = sampleGradient({ x: normX, y: normY }, fillResult.gradient);
                    color = sampled;
                }
                else if (params.sampleColor && fillResult.type === 'solid' && fillResult.color) {
                    color = fillResult.color;
                }
            }
            if (params.sampleColor && (bitmapResult === null || bitmapResult === void 0 ? void 0 : bitmapResult.colors)) {
                color = bitmapResult.colors[i];
            }
            if (diameter < 0.5)
                diameter = 0.5;
            const rotation = computeFlowRotation({ x: rp.ax, y: rp.ay }, shapeCenter, params.rotationMode, gridSpacing, finiteOr(params.flowAngle, 0), finiteOr(params.flowStrength, 50), finiteOr(params.flowScale, 6), finiteOr(params.orientationOffset, 0), finiteOr(params.randomSeed, 1));
            gridPoints.push({
                x: rp.ax,
                y: rp.ay,
                diameter,
                color,
                rotation,
                latticeI: rp.latticeI,
                latticeJ: rp.latticeJ,
                rhythmOffset: rp.rhythmOffset,
            });
        }
        if (params.rhythmEnabled) {
            for (const gp of gridPoints) {
                if (Number.isFinite(gp.rhythmOffset)) {
                    const facePhase = positiveModulo(gp.rhythmOffset + Math.round(clamp(finiteOr(params.rhythmPhase, 0), 0, 1)), 2);
                    gp.rotation += facePhase * finiteOr(params.rhythmFlipAngle, 180);
                }
                else {
                    gp.rotation += computeRhythmRotation({ x: gp.x, y: gp.y }, shapeCenter, gridSpacing, params.rhythmMode, finiteOr(params.rhythmFlipAngle, 180), finiteOr(params.rhythmPhase, 0), gp.latticeI, gp.latticeJ);
                }
            }
        }
        if (gridPoints.length === 0) {
            figma.notify(densityByGrayscale
                ? 'No points remained after grayscale density filtering. Reduce Light-area Spacing, increase Light-area Density, or reduce Grid Spacing.'
                : 'No grid points inside the boundary shape', { error: true });
            return;
        }
        if (gridPoints.length > MAX_DOTS) {
            figma.notify(`Too many dots (${gridPoints.length}). Increase grid spacing or reduce boundary size.`, { error: true });
            return;
        }
        const nodes = [];
        for (const gp of gridPoints) {
            let dot;
            let baseRotation = 0;
            let isCustomDot = false;
            if (dotSource) {
                dot = dotSource.clone();
                // Preserve the selected unit's visible axis, including rotation inherited
                // from a parent frame/group. Figma's absolute transform maps local +X to
                // (m00, m10) in canvas coordinates.
                baseRotation =
                    (Math.atan2(dotSource.absoluteTransform[1][0], dotSource.absoluteTransform[0][0]) * 180) /
                        Math.PI;
                isCustomDot = true;
                const sourceBounds = dotSource.absoluteBoundingBox;
                const sourceW = sourceBounds ? sourceBounds.width : dotSource.width;
                if (sourceW > 0) {
                    const scale = gp.diameter / sourceW;
                    dot.rescale(scale);
                }
            }
            else {
                const preset = createPresetDot(effectiveUnit, gp.diameter);
                dot = preset.node;
                baseRotation = preset.baseRotation;
                if (triangleTessellationLayout && effectiveUnit === 'triangle') {
                    // The tessellation faces are vertical up/down triangles. The regular
                    // directional triangle preset uses +X as its flow axis elsewhere.
                    baseRotation = 0;
                }
            }
            if ('fills' in dot && !isCustomDot) {
                if (gp.color) {
                    dot.fills = [{ type: 'SOLID', color: gp.color }];
                }
                else {
                    dot.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
                }
            }
            // A clone may initially belong to the selected unit's parent. Reparent it
            // before applying page-space coordinates, then rotate around its center.
            figma.currentPage.appendChild(dot);
            placeNodeAtVisualAngle(dot, { x: gp.x, y: gp.y }, gp.rotation + baseRotation);
            nodes.push(dot);
        }
        let group;
        if (nodes.length > 1) {
            group = figma.group(nodes, figma.currentPage);
        }
        else {
            group = figma.group([nodes[0]], figma.currentPage);
        }
        const unitName = dotSource ? `Selected · ${dotSource.name}` : effectiveUnit;
        group.name = `Grid Dots · ${unitName} · ${params.rotationMode}`;
        group.expanded = false;
        figma.currentPage.selection = [group];
        figma.viewport.scrollAndZoomIntoView([group]);
        figma.notify(`Created ${gridPoints.length} dots`);
        figma.closePlugin();
    });
}
