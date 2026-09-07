# 点阵生成与动态 Shader 数学规格

本文档只总结插件中的纯数学与逻辑部分，不包含 Figma 节点、UI、manifest、消息通信或导出流程。目标是把同一套点阵算法移植到 GLSL、WGSL、Metal、HLSL 或 compute shader。

## 1. 统一数据流

```text
分布函数 → 候选点位置 → 边界裁切 → 尺寸/颜色采样 → 向量场方向 → 节奏翻转 → 点形状 SDF
```

对每个候选点 `p`：

```text
inside = boundaryTest(p)
size   = sizeFromField(p)
angle  = flowAngle(p) + rhythmAngle(p) + unitAxisOffset
color  = colorFromField(p)
```

只有 `inside` 为真时才绘制点。

## 2. 坐标与角度

建议统一使用一个局部像素空间：边界尺寸为 `W,H`，中心为：

```text
C = (W/2, H/2)
```

所有场函数都使用以 `C` 为原点、以基础间距 `s` 归一化的坐标：

```text
d = p - C
g = d / max(s, 1)
gridX = g.x
gridY = g.y
```

插件原逻辑使用屏幕式 `Y-down` 坐标，因此视觉角度为：

```text
angle = atan2(vector.y, vector.x)
```

如果 shader 使用传统 `Y-up`，应在入口处做一次 `y = -y`，不要在每个场函数里重复修正。

## 3. 稳定随机数

规则 Jitter、Random、Poisson 和 Curl Noise 都依赖稳定 seed。插件使用 uint32 风格的顺序 PRNG：

```text
state = uint32(floor(seed))
if state == 0: state = 0x6d2b79f5

next():
    state += 0x6d2b79f5
    v = state
    v = imul(v xor (v >> 15), v or 1)
    v = v xor (v + imul(v xor (v >> 7), v or 61))
    return uint32(v xor (v >> 14)) / 4294967296.0
```

GPU 端必须使用 wrapping `u32` 运算。如果只需要按 cell 取随机值，可使用 hash：

```glsl
float hash21(uvec2 p, uint seed) {
    uint v = p.x * 374761393u + p.y * 668265263u + seed * 1442695041u;
    v = (v ^ (v >> 13u)) * 1274126177u;
    v ^= v >> 16u;
    return float(v) / 4294967295.0;
}
```

## 4. 仿射规则晶格

所有规则点阵都可以写成：

```text
p(i,j) = C + i*A + j*B
```

令 `theta = radians(direction)`，`c=cos(theta)`，`t=sin(theta)`：

```text
A = s * (c, t)

rowShift = presetShift + clamp(rowDriftPercent, -200, 200) / 100
rowHeight = presetHeight * clamp(rowSpacingRatio, 0.25, 4)

B = s * (
    c * rowShift - t * rowHeight,
    t * rowShift + c * rowHeight
)
```

预设常量：

| 模式 | `presetShift` | `presetHeight` | 几何含义 |
|---|---:|---:|---|
| Square / Quad | `0` | `1` | 正交方格 |
| Hex Close-pack | `0.5` | `sqrt(3)/2` | 三角晶格、圆点高密度排列 |
| Brick / Half-drop | `0.5` | `1` | 半行错位 |
| Dense Diamond | `0.5` | `0.5` | 交错密集菱形 |

基向量退化时：

```text
det = A.x*B.y - A.y*B.x
if abs(det) < epsilon: 终止
```

### 4.1 晶格索引范围

如果需要在有限矩形内枚举点，使用晶格基向量的逆解。对角点 `q`，令 `d=q-C`：

```text
i = (d.x*B.y - d.y*B.x) / det
j = (A.x*d.y - A.y*d.x) / det
```

取四个角点的 `minI,maxI,minJ,maxJ`，向外扩展 1～2 格，再逐点做边界测试。

fragment shader 通常可以直接求最近 cell：

```glsl
vec2 ij = inverse(mat2(A, B)) * (p - C);
vec2 base = floor(ij + 0.5);
```

由于旋转/错切后最近点可能跨 cell，实际绘制建议检查 `base` 周围的 3×3 邻居。

### 4.2 Jitter

```text
j = clamp(jitterPercent, 0, 100) / 100
radius = min(s, rowHeight*s) * 0.45 * j

p(i,j) += radius * (2*random2(i,j,seed) - 1)
```

规则 Jitter 不保证点间最小距离。

## 5. 正反三角面密铺

该模式直接生成三角密铺中两个相邻三角面的中心，而不是先生成方格再翻转。

设等边三角形边长为 `s`，行高比例为 `r`：

```text
h = (sqrt(3)/2) * r
A = s * (cos(theta), sin(theta))
B = s * (0.5*cos(theta) - h*sin(theta),
         0.5*sin(theta) + h*cos(theta))
```

每个晶格单元 `(i,j)` 产生两点：

```text
faceA = C + i*A + j*B + (A+B)/3
faceB = C + i*A + j*B + 2*(A+B)/3
```

当 `r=1` 时：

```text
length(faceB-faceA) = s / sqrt(3)
```

两点对应相反朝向。用 bit 表示方向：

```text
faceBit(A) = 1
faceBit(B) = 0
```

实际角度由 `faceBit * flipAngle` 产生。若使用等边三角形 SDF，`s` 同时是三角形边长和密铺基本尺度。

候选密度近似：

```text
2 * area / (s² * (sqrt(3)/2) * rowSpacingRatio)
```

三角模式的 Jitter 半径为：

```text
min(s, h*s) * 0.22 * jitter
```

## 6. Uniform Random

目标点数：

```text
count = ceil(W*H / (s² * rowSpacingRatio))
```

每个点独立均匀采样：

```text
x = random(bounds.x, bounds.x + W)
y = random(bounds.y, bounds.y + H)
```

它只保证 seed 可复现，不保证最小距离。大数量时应预生成点 buffer，而不是让每个 fragment 重复扫描所有点。

## 7. Poisson Blue Noise

采用 Bridson 风格活动列表算法：

```text
cellSize = minDistance / sqrt(2)
backgroundGrid = -1
active = []

随机生成第一个点，加入 points 和 active

while active 非空且 points.length <= maxPoints:
    origin = 随机选择 active 点
    accepted = false

    重复 30 次：
        angle = random() * 2*pi
        radius = minDistance * sqrt(1 + 3*random())
        candidate = origin + radius*(cos(angle), sin(angle))
        越界则跳过
        检查背景网格周围 ±2 格
        所有邻居距离 >= minDistance 则接受

    若未接受，从 active 移除 origin
```

候选网格索引：

```text
gx = floor((x - bounds.x) / cellSize)
gy = floor((y - bounds.y) / cellSize)
```

Poisson 活动列表包含动态数组、随机选择和写入，通常不适合普通 fragment shader。推荐在 CPU/compute shader 生成后写入 SSBO、storage buffer 或 RG32F 点纹理。

## 8. 同心环 Concentric

首先生成中心点 `C`。第 `k` 圈半径：

```text
Equal:       r_k = k * spacing
Arithmetic:  r_k = k*spacing + k(k-1)/2 * delta
Geometric:   r_k = spacing*(1-ratio^k)/(1-ratio)
```

当 `ratio≈1` 时，Geometric 退化为 `k*spacing`。超过 `maxRadius` 后停止。

每圈点数：

```text
n_k = max(1, round(2*pi*r_k / spacing))
phase_k = k * phaseOffset

p(k,j) = C + r_k * (
    cos(j*2*pi/n_k + phase_k),
    sin(j*2*pi/n_k + phase_k)
)
```

这会保持近似恒定弧长间距。shader 可按有限圈数循环，或使用环带索引近似。

## 9. Polar Curve / Spiral Grid

Polar 模式用多条从中心出发的曲线生成点。设最大半径为 `R`，密度间距为 `s`：

```text
numArms = max(1, floor(2*pi*R / s))
step = max(1, floor(skip) + 1)
generatedArms = ceil(numArms / step)
baseAngle(a) = a * 2*pi / generatedArms
```

归一化半径 `u=r/R` 对应四种扭转 profile：

```text
Archimedean: f(u) = u
Fermat:      f(u) = sqrt(u)
Logarithmic: f(u) = log(1+u) / log(2)
Euler:       f(u) = u²
```

曲线角度：

```text
twist(r) = curvature * 2*pi * f(r/R)
theta(r,a) = baseAngle(a) + twist(r)
point = C + r * (cos(theta), sin(theta))
```

插件按弧长采样，避免高曲率外圈稀疏：

```text
dr = r_i - r_prev
dTheta = twist_i - twist_prev
rMid = (r_i + r_prev) / 2
segmentArc = sqrt(dr² + rMid²*dTheta²)
accumulatedArc += segmentArc
```

当 `accumulatedArc >= s` 或到达末端时输出一个点，然后清零累计弧长。高曲率时使用更多径向细分：

```text
maxStretch = max(1, abs(curvature) * 2*pi)
oversample = max(4, ceil(maxStretch / 2))
fineSteps = max(floor(R/s)*oversample, oversample*4)
```

## 10. Phyllotaxis / Sunflower

使用黄金角：

```text
goldenAngle = pi * (3 - sqrt(5))
```

第 `n` 个点：

```text
r_n = s * sqrt(n)
theta_n = n * goldenAngle
p_n = C + r_n * (cos(theta_n), sin(theta_n))
```

最大索引：

```text
maxN = floor((R/s)²)
```

该分布的面积密度均匀，但不是严格恒定最近邻距离，适合花盘、圆形声场和自然生长效果。

## 11. 边界裁切

候选点生成后执行 `inside = boundaryTest(p)`。如果边界有模型变换，先把点变换到边界局部空间：

```text
local = inverse(model) * p
```

### 11.1 矩形

```text
inside = 0 <= x <= W && 0 <= y <= H
```

### 11.2 椭圆

```text
dx = (x - W/2) / (W/2)
dy = (y - H/2) / (H/2)
inside = dx² + dy² <= 1
```

### 11.3 多边形 / 星形

使用 ray casting 或 winding test。正多边形顶点为：

```text
angle_i = -pi/2 + i * 2*pi / pointCount
vertex_i = (W/2 + W/2*cos(angle_i),
            H/2 + H/2*sin(angle_i))
```

星形在相邻外顶点之间插入内顶点，内半径比例为 `innerRadiusRatio`，内顶点角度比外顶点多 `pi/pointCount`。

### 11.4 圆角矩形

先做矩形范围测试，四个角改用圆测试：

```text
(p - cornerCenter)² <= radius²
```

radius 限制为 `min(W,H)/2`。shader 中可使用标准 rounded-box SDF。

### 11.5 多环 Vector

对每个闭合 loop 做 point-in-polygon，偶数/奇数规则为：

```text
inside = false
for loop in loops:
    if pointInPolygon(p, loop): inside = !inside
```

复杂多边形建议预烘焙 SDF 或 mask texture，避免 fragment 内遍历大量边。

## 12. 尺寸与颜色场

### 12.1 固定尺寸

```text
diameter = dotDiameter
```

### 12.2 Gradient

先把点转换到边界归一化坐标：

```text
uv = (localX / W, localY / H)
g = clamp(gradientTransform * vec3(uv, 1), 0, 1)
```

四类渐变的参数 `t`：

```text
Linear:   t = g.x
Radial:   t = 2 * length(g - 0.5)
Angular:  t = fract(atan2(g.y - 0.5, g.x - 0.5) / (2*pi))
Diamond:  t = abs(g.x - 0.5) + abs(g.y - 0.5)
```

在颜色 stops 中按 `t` 线性插值，得到 `color`。亮度和直径映射见下一节。

```text
L = 0.2126*R + 0.7152*G + 0.0722*B
diameter = maxDiameter - L*(maxDiameter - minDiameter)
diameter = max(diameter, 0.5)
```

### 12.3 Bitmap / Texture

shader 版本直接采样边界纹理：

```glsl
vec4 sample = texture(boundaryTexture, uv);
float L = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)) * sample.a;
float diameter = mix(maxDiameter, minDiameter, L);
```

### 12.4 灰度密度与规则间距

默认方式不是随机删除，而是把基础晶格切换到嵌套的二次幂子晶格。令最亮区域最大间距倍率为 `M∈{2,4,8,16}`：

```text
maxLevel = round(log2(M))
spacingResponse = 1 - (1-clamp(L,0,1))^curve
level = round(spacingResponse * maxLevel)
stride = 2^level

keep = mod(i-phaseI, stride) == 0
    && mod(j-phaseJ, stride) == 0
```

黑色 `L=0` 时 `stride=1`，保留基础晶格；白色 `L=1` 时 `stride=M`。二次幂子晶格相互嵌套，所以跨明度等级仍保持同一晶格相位。`phaseI/phaseJ` 可以由 Seed 决定，但它只平移整齐子晶格，不产生随机缺口。

可选的 `Random Thinning` 使用原概率映射：

```text
darkness = 1 - clamp(L, 0, 1)
minimum = clamp(lightAreaDensityPercent, 0, 100) / 100
curve = clamp(densityCurve, 0.25, 4)

Pkeep = minimum + (1-minimum) * darkness^curve
keep = stableHash(pointIndexOrLocalPosition, seed) < Pkeep
```

其中黑色区域 `Pkeep=1`，白色区域 `Pkeep=minimum`。规则晶格使用 `(i,j)` 作为 hash 输入；无索引分布可使用相对中心、按 spacing 归一化并量化后的坐标。

在 fragment shader 中，这种按 candidate 的筛选可以直接放在邻域循环里；点 buffer 管线则应在 compute/CPU 生成阶段筛选。若尺寸也由灰度控制，复用同一个 `L`：

```text
diameter = mix(maxDiameter, minDiameter, L)
```

## 13. Vector Flow 方向场

公共参数：

```text
fieldAngle = radians(fieldAngleDeg)
strength = clamp(fieldStrength, -100, 100) / 100
scale = clamp(fieldScale, 1, 24)
fallback = (cos(fieldAngle), sin(fieldAngle))
```

所有向量在取角度前 normalize；长度过小时使用 `fallback`。

### 13.1 None / Uniform

```text
None:    finalAngle = orientationOffset
Uniform: vector = fallback
```

### 13.2 Radial

```text
Radial Out: vector = normalize(( dx,  dy), fallback)
Radial In:  vector = normalize((-dx, -dy), fallback)
```

中心奇点使用 fallback。

### 13.3 Orbit

插件的精确向量公式：

```text
Orbit CCW: vector = normalize(( dy, -dx), fallback)
Orbit CW:  vector = normalize((-dy,  dx), fallback)
```

名称沿用 UI；实际旋向以公式为准。

### 13.4 Spiral

```text
radial = normalize((dx, dy), fallback)
Spiral Out = rotate(radial, strength*pi/2)

inward = normalize((-dx, -dy), fallback)
Spiral In = rotate(inward, strength*pi/2)
```

```text
rotate(v,a) = (
    v.x*cos(a) - v.y*sin(a),
    v.x*sin(a) + v.y*cos(a)
)
```

Legacy `archimedean`、`logarithmic`、`fermat`、`euler` 也使用 Spiral Out 的这套方向公式。

### 13.5 Sine / Wave

```text
axis = (cos(fieldAngle), sin(fieldAngle))
normal = (-axis.y, axis.x)
projected = gridX*axis.x + gridY*axis.y
wave = sin((projected/scale) * 2*pi)
vector = normalize(axis + normal*wave*strength*2, axis)
```

`wave-v` 是 legacy alias，把主轴增加 `pi/2`。

### 13.6 Cross Wave

```text
inverse = rotate((gridX, gridY), -fieldAngle)
frequency = 2*pi / scale
cross = normalize((
    cos(inverse.y*frequency),
    sin(inverse.x*frequency)
), (1,0))

mixed = normalize((
    1 - abs(strength) + cross.x*abs(strength),
    cross.y*strength
), (1,0))

vector = rotate(mixed, fieldAngle)
```

### 13.7 Curl Noise

先实现三层 value noise：

```text
valueNoise(x,y) = 对四个整数格点 hash 做双线性插值，每轴使用 quintic fade
fractalNoise = Σ octaveNoise * amplitude / Σ amplitude
```

插件参数为 3 个 octave：初始 amplitude `0.58`，每层乘 `0.5`；frequency 从 `1` 开始，每层乘 `2`；每层 seed 增加 `1013`。插值曲线：

```text
fade(t) = t³ * (t*(t*6 - 15) + 10)
```

用有限差分构造二维 curl：

```text
nx = gridX / scale
ny = gridY / scale
epsilon = 0.04

dNoiseDx = fractalNoise(nx+epsilon, ny) - fractalNoise(nx-epsilon, ny)
dNoiseDy = fractalNoise(nx, ny+epsilon) - fractalNoise(nx, ny-epsilon)
curl = normalize((dNoiseDy, -dNoiseDx), fallback)

mixAmount = abs(strength)
direction = strength < 0 ? -1 : 1
vector = normalize(
    fallback*(1-mixAmount) + curl*mixAmount*direction,
    fallback
)
```

### 13.8 Saddle

```text
local = rotate((gridX, gridY), -fieldAngle)
squeeze = 0.35 + abs(strength)*1.65
sign = strength < 0 ? -1 : 1
saddle = normalize((local.x, -local.y*squeeze*sign), (1,0))
vector = rotate(saddle, fieldAngle)
```

### 13.9 转成角度

```text
flowAngle = atan2(vector.y, vector.x)
finalFlowAngle = flowAngle + radians(orientationOffsetDeg)
```

建议 shader 内始终使用 radians，只有调试面板转换成 degrees。

## 14. Rhythm Tiling 方向节奏

节奏层只改变方向，不改变普通点阵的位置：

```text
finalAngle = flowAngle + rhythmAngle + unitAxisOffset
```

有规则晶格索引时使用真实 `(i,j)`。Random、Polar、Concentric 没有索引时回退到：

```text
cellI = round((p.x - C.x) / s)
cellJ = round((p.y - C.y) / s)
```

`phase` 取 0 或 1，`flipAngle` 默认 `pi`。

### Alternate / Checker

```text
flipped = mod(i + j + phase, 2) == 1
```

### Row Alternating

```text
flipped = mod(j + phase, 2) == 1
```

### Column Alternating

```text
flipped = mod(i + phase, 2) == 1
```

### Syncopated 2 + 1

```text
flipped = mod(i + j + phase, 3) != 0
```

最终：

```text
rhythmAngle = flipped ? flipAngle : 0
```

Triangle Faces 模式额外使用第 5 节的两类面中心，并把两个 face bit 交替映射到 `flipAngle`。

## 15. 基本单元与 SDF

点中心确定后，把像素旋回 unit space：

```glsl
vec2 q = rotate(pixel - pointCenter, -finalAngle);
float d = unitSdf(q, size);
float alpha = 1.0 - smoothstep(0.0, aaWidth, d);
```

当前预设尺寸比例：

| Unit | 宽度 | 高度 |
|---|---:|---:|
| Circle | `d` | `d` |
| Ellipse | `d` | `0.42d` |
| Diamond | `d` | `0.62d` |
| Triangle | `d` | `sqrt(3)/2*d` |
| Capsule | `d` | `0.28d` |

推荐实现：

- Circle：`length(q) - radius`。
- Ellipse：将 `q` 除以半轴后使用归一化距离。
- Capsule：点到线段距离减半高。
- Diamond / Triangle：三条或四条边的 half-plane 最大值。
- Arrow / Leaf / Chevron：预烘焙 SDF texture，或使用线段、圆弧和 Bézier 的距离组合。

## 16. Fragment Shader 结构

规则晶格适合在 fragment shader 中即时求最近点：

```glsl
vec2 p = pixelPosition;
vec2 cell = inverseBasis * (p - C);
vec2 base = floor(cell + 0.5);
float alpha = 0.0;

for (int dj = -1; dj <= 1; ++dj) {
    for (int di = -1; di <= 1; ++di) {
        vec2 ij = base + vec2(di, dj);
        vec2 center = C + A*ij.x + B*ij.y;
        if (!insideBoundary(center)) continue;
        float diameter = sizeFromField(center);
        float angle = flowAngle(center) + rhythmAngle(ij);
        vec2 q = rotate(p - center, -angle);
        alpha = max(alpha, drawUnit(q, diameter));
    }
}
```

Concentric、Polar、Phyllotaxis 可在有限半径/臂数内循环；大点数时改用 compute shader 生成点 buffer。

Poisson 和 Random 不建议在普通 fragment shader 中动态生成，应该使用 SSBO、storage buffer、point texture 或预烘焙蓝噪声纹理。

## 17. 抗锯齿与性能

SDF 抗锯齿：

```glsl
float aa = max(fwidth(distance), 1e-4);
float alpha = 1.0 - smoothstep(-aa, aa, distance);
```

推荐的性能策略：

1. Square / Hex / Brick / Diamond：fragment shader 最近 cell + 3×3 邻域。
2. Triangle Faces：每个基本单元两个 face center，检查两个相位。
3. Concentric / Polar：有限循环或预生成 buffer。
4. Phyllotaxis：固定最大 `n` 循环或点 buffer。
5. Poisson / Random：compute/CPU 预生成，再实例化绘制。
6. 复杂多边形：预烘焙 mask/SDF，避免每像素遍历所有边。

## 18. 参数与动画建议

适合连续动画的参数：

- `direction`、`rowDrift`、`rowSpacingRatio`：连续改变晶格基向量。
- `fieldAngle`、`strength`、`fieldScale`：连续改变向量场。
- `phase`：整齐交换正反节奏，不改变点数。
- `concentricPhase`：沿环旋转。
- `curvature`：连续改变 Polar 螺旋。

改变 `seed` 会导致 Jitter、Poisson 或 noise 跳变；若需要无跳变动画，保持 seed 不变，改用 phase、offset 或 flow 参数。

## 19. 移植检查清单

1. 统一 `Y-down` / `Y-up`，只在入口处转换一次。
2. 所有场坐标先减中心，再除以 `Spacing`。
3. 旋转晶格始终共用同一组 `A/B` 基向量。
4. Triangle Faces 使用 `(A+B)/3` 和 `2(A+B)/3`，不要用普通方格点再翻转。
5. 向量场先 normalize，再 `atan2`；中心奇点使用 fallback。
6. Rhythm 在 flow 后叠加，`phase` 只改变相位。
7. Gradient/texture 采样使用同一套局部归一化坐标。
8. 用固定 seed、边界、spacing 对 CPU/GPU 结果做快照对比。

## 20. 推荐移植顺序

```text
Phase 1: Square / Hex + Circle SDF + 椭圆边界
Phase 2: Direction / Row Drift / Jitter + Uniform / Radial / Spiral
Phase 3: Triangle Faces + Rhythm + Triangle SDF
Phase 4: Gradient / Texture 尺寸采样 + 多边形 mask
Phase 5: Concentric / Phyllotaxis / Polar
Phase 6: Poisson buffer + Curl Noise + 自定义 SDF texture
```
