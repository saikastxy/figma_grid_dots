"use strict";
// ============================================================
// Grid Dots — Figma Plugin
// ============================================================
// ---- Plugin Init ----
figma.showUI(__html__, { width: 320, height: 520 });
function sendSelectionState() {
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
    const bounds = boundaryNode?.absoluteBoundingBox ?? null;
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
figma.ui.onmessage = (msg) => {
    if (msg.type === 'generate-dots') {
        handleGenerate(msg);
    }
    else if (msg.type === 'cancel') {
        figma.closePlugin();
    }
    else if (msg.type === 'request-selection') {
        sendSelectionState();
    }
};
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
    if (mode === 'quad') {
        const startX = bounds.x;
        const startY = bounds.y;
        const cols = Math.ceil(bounds.width / spacing) + 1;
        const rows = Math.ceil(bounds.height / spacing) + 1;
        for (let row = 0; row <= rows; row++) {
            for (let col = 0; col <= cols; col++) {
                points.push({
                    x: startX + col * spacing,
                    y: startY + row * spacing,
                });
            }
        }
    }
    else {
        const hSpacing = spacing;
        const vSpacing = spacing * (Math.sqrt(3) / 2);
        const cols = Math.ceil(bounds.width / hSpacing) + 1;
        const rows = Math.ceil(bounds.height / vSpacing) + 1;
        for (let row = 0; row <= rows; row++) {
            const offsetX = row % 2 === 0 ? 0 : hSpacing / 2;
            for (let col = 0; col <= cols; col++) {
                points.push({
                    x: bounds.x + col * hSpacing + offsetX,
                    y: bounds.y + row * vSpacing,
                });
            }
        }
    }
    return points;
}
function estimatePointCount(bounds, spacing, mode) {
    if (spacing <= 0)
        return 0;
    if (mode === 'quad') {
        const cols = Math.ceil(bounds.width / spacing) + 1;
        const rows = Math.ceil(bounds.height / spacing) + 1;
        return cols * rows;
    }
    const hSpacing = spacing;
    const vSpacing = spacing * (Math.sqrt(3) / 2);
    const cols = Math.ceil(bounds.width / hSpacing) + 1;
    const rows = Math.ceil(bounds.height / vSpacing) + 1;
    return cols * rows;
}
// ---- Gradient Sampling ----
function getLightness(color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}
function sampleGradient(localPt, gradient, node) {
    const invGradTransform = invertMatrix(gradient.transform);
    const gradPt = transformPoint(invGradTransform, localPt);
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
// ---- Main Generation ----
function handleGenerate(params) {
    const boundaryNode = figma.getNodeById(params.boundaryNodeId);
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
        dotSource = figma.getNodeById(params.dotSourceNodeId);
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
    const allPoints = generateGridPoints(bounds, params.gridSpacing, params.tileMode);
    const invAbsTransform = invertMatrix(boundaryNode.absoluteTransform);
    const gridPoints = [];
    for (const pt of allPoints) {
        const localPt = transformPoint(invAbsTransform, pt);
        if (!isPointInsideShape(localPt, geometry))
            continue;
        let diameter;
        let color;
        if (fillResult.type === 'gradient' && fillResult.gradient) {
            const sampled = sampleGradient(localPt, fillResult.gradient, boundaryNode);
            const lightness = getLightness(sampled);
            diameter = params.minDiameter + lightness * (params.maxDiameter - params.minDiameter);
            color = sampled;
        }
        else {
            diameter = params.dotDiameter;
            if (fillResult.type === 'solid' && fillResult.color) {
                color = fillResult.color;
            }
        }
        if (diameter < 0.5)
            diameter = 0.5;
        gridPoints.push({ x: pt.x, y: pt.y, diameter, color });
    }
    if (gridPoints.length === 0) {
        figma.notify('No grid points inside the boundary shape', { error: true });
        return;
    }
    const MAX_DOTS = 10000;
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
        if (gp.color && 'fills' in dot && !dotSource) {
            dot.fills = [{ type: 'SOLID', color: gp.color }];
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
}
