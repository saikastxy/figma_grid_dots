# Grid Dots 密集平铺实战指南

这份指南把常见的点阵目标映射到插件中的模式和参数。`Spacing` 始终表示点中心的基础间距；如果使用默认圆点，是否重叠还取决于点直径。

## 一组可靠的起始方案

| 效果 | Pattern | Direction | Row drift | Row spacing | Jitter | 使用建议 |
|------|---------|-----------|-----------|-------------|--------|----------|
| 等圆最密无重叠 | Hex Close-pack | `0°` | `0%` | `100%` | `0%` | 令 `Spacing ≥ 最大点直径`；这是同半径圆的最密平面排列 |
| 高密菱形半调 | Dense Diamond | `45°` | `0%` | `100%` | `0%` | 最近点距约为 `0.707 × Spacing`，无重叠时点直径不要超过该值 |
| 斜向流动点阵 | Brick / Half-drop | `25°–45°` | `15%–35%` | `75%–95%` | `0%–10%` | 适合鳞片、织物、速度线和透视感背景 |
| 有机密铺 | Poisson Blue Noise | — | — | — | — | `Spacing` 是硬性最小点距；改变 Seed 可得到新的稳定方案 |
| 自然但仍有秩序 | Hex Close-pack | 任意 | `0%–15%` | `90%–110%` | `10%–25%` | 保留整体密度，同时打散过强的水平/垂直轴线 |
| 放射生长 | Phyllotaxis | — | — | — | — | 适合花盘、孔隙、声场和中心扩散效果 |

## 正反三角与节奏密铺

这类参考图不是普通方格中随机翻转三角形，而是**三角密铺的两类面中心**：每个由两条晶格基向量组成的基本平行四边形，包含一枚正向面和一枚反向面。等边三角形边长为 `s` 时，两类面中心之间的距离是 `s/√3`，因此可以共享边而不是只在顶点接触。

插件的 `Rhythm Tiling → Triangle Faces · Up / Down` 使用这套几何生成器。它会自动生成正反三角面中心，再继续经过边界裁切、渐变/位图采样和流场旋转，所以可以与 `Triangle / Arrow / Chevron / Selected` 等方向性单元耦合。

推荐起点：点击 `Triangle weave` 预设，使用 `Triangle` 单元、`Flip Angle = 180°`、`Phase = A`。需要整体换相时改为 `Phase = B`；要让图案随流场弯曲，保留 `Spiral`、`Sine` 或 `Curl Noise`，节奏翻转会叠加在流场方向上。

节奏变体：

- **Triangle Faces · Up / Down**：真正的正反三角面密铺，适合参考图中的连续边界。
- **Up / Down Alternating**：在现有点阵上做二维棋盘式换相，适合菱形、箭头和自定义单元。
- **Row / Column Alternating**：沿单一方向交替，适合条纹、织物和标题背景。
- **Syncopated 2 + 1**：按两拍翻转、一拍回到原向的重复节奏，适合更明显的视觉律动。

### 调研依据

正三角形平面密铺是三种规则欧氏平铺之一；六个 60° 角在每个顶点闭合，形成三角晶格。Truchet 的三角变体进一步展示了两种方向单元通过相位排列形成连续的节奏图案。相关资料：[Triangular tiling](https://en.wikipedia.org/wiki/Triangular_tiling)、[Truchet Tiling](https://mathworld.wolfram.com/TruchetTiling.html)、[Triangular Grid](https://mathworld.wolfram.com/TriangularGrid.html)。

## 为什么优先使用这些方案

### 1. Hex Close-pack：相同最小点距下的最高规则密度

六角密排的点心位于三角晶格上，行高为 `√3/2 × Spacing`，理论圆覆盖密度为 `π/√12 ≈ 90.69%`。在相同水平点距下，它比方格每单位面积大约多 `15.5%` 的点，同时仍可让等直径圆互不重叠。

适合：规则半调、等尺寸圆点、需要最大填充率的工程图案。

参考：[Thue 圆密排定理的 Voronoi 证明](https://epub.uni-bayreuth.de/4374/)。

### 2. Poisson Blue Noise：没有明显行列、又能控制最近距离

普通 Random 会出现团簇和大空洞；Poisson 模式使用 Bridson 的活动列表算法，候选点之间始终保持至少一个 `Spacing`。插件使用固定 Seed，因此同一参数可以重复生成完全一致的结果。

适合：颗粒、孔洞、星点、纹理底、需要避免近距离碰撞的随机形状。

参考：[Fast Poisson Disk Sampling in Arbitrary Dimensions](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf)。

### 3. Phyllotaxis：中心型边界中的自然均匀分布

向日葵模式采用黄金角 `π(3−√5) ≈ 137.508°` 和 `r(n) ∝ √n`。它不会生成笔直的网格轴线，尤其适合圆形、椭圆和近似圆形边界。

适合：花瓣、虹膜、扬声器孔、旋涡中心、自然生长结构。

参考：[Helmut Vogel, A Better Way to Construct the Sunflower Head](https://agris.fao.org/search/en/providers/123819/records/64735f4553aa8c89630a23c5)。

## 组合出更复杂的效果

### 灰度密度控制

`Grayscale Mapping` 有三个明确的有效状态：`Radius only`、`Density only`、`Radius + Density`。Density only 保持固定点直径，Radius only 不改变点距，两者共同作用时才同时产生“暗部点更大且更密”的效果。

密度默认使用 `Regular Spacing`：`Grid Spacing` 是暗部基础点距，亮度提高时依次切换到嵌套的 `2× / 4× / 8× / 16×` 子晶格，因此改变的是规律点距，不会随机打洞。`Light-area Spacing` 决定最亮区域的最大点距，`Density Curve` 决定中间调切换速度。

原来的概率抽稀保留为 `Random Thinning` 可选项；只有选择它时，`Light-area Density` 和 Seed 才控制白色区域保留率与随机相位。

### 双层莫尔纹

1. 用 Square 或 Dense Diamond 生成第一层，Direction 设为 `-3°`。
2. 重新选择边界，用相同间距生成第二层，Direction 设为 `+3°`。
3. 给两层不同颜色、透明度或略有差异的点直径。

角度差越小，干涉带越宽；Dense Diamond 会产生更强烈的细密纹理。

### 定向渐变半调

1. 使用带线性或径向渐变的边界。
2. 选择 Hex Close-pack 或 Diagonal flow 预设。
3. 设置 Max/Min Diameter，并按需启用 Sample Color。
4. 用 Direction 控制网格的视觉主轴，用 Row drift 把直线结构推成斜向流。

### 受控“手工感”

从 Hex Close-pack 开始，把 Jitter 设为 `12%–22%`，Seed 固定。这样既保留接近六角密排的均匀密度，又能避免机械感。若 Jitter 很高且点直径接近 Spacing，点仍可能相碰；需要严格防碰撞时改用 Poisson。

### 扁平透视/速度场

使用 Brick，将 Row spacing 压到 `60%–85%`，Row drift 调到 `25%–60%`，再把 Direction 设为运动方向。基本单元可选 Arrow、Leaf、Capsule 或 Selected 自定义形状，再叠加 Spiral、Sine Flow、Cross Wave 或 Curl Noise，形成位置和朝向的双重流动。

## 方向性基本单元与流动场

- **Arrow / Triangle / Chevron**：能明确区分前进和后退，最适合检查 Radial、Orbit 和 Spiral 的旋向。
- **Ellipse / Diamond / Capsule / Leaf**：显示流线轴向，但 `0°` 与 `180°` 的轮廓相同，适合柔和或连续纹理。
- **Selected**：继续使用“边界 + 第二选中形状”的原工作流；如果自定义图形天然朝上，可把 Unit Axis Offset 设为 `90°` 让它的前端与流场 `+X` 对齐。
- **Bend / Spin**：正负值反转旋向。Spiral 中 `0` 接近纯径向，绝对值越大越接近环绕。
- **Field Scale**：控制 Sine、Cross Wave 和 Curl Noise 的空间尺度；数值小产生细碎变化，数值大产生宽阔流线。
- 流场以边界中心为原点、以 `Spacing` 为坐标单位；移动整个边界不会改变内部流线。面板预览与生成器使用相同的 Wave、Cross Wave 和 Curl Noise 公式及 Seed。

## 密度和性能边界

- 最终生成上限为 `10,000` 个点。
- 边界裁切前的候选点上限为 `50,000`；超过时插件会要求增大间距或行距。
- Hex 无重叠圆：建议 `最大点直径 ≤ Spacing`。
- Dense Diamond 无重叠圆：建议 `最大点直径 ≤ 0.707 × Spacing`。
- 加入 Jitter 后，规则晶格不再保证最小点距；严格防碰撞请用 Poisson。
- 多层复杂效果最好分层生成，每层使用不同 Angle / Seed，并在 Figma 中单独控制透明度和混合模式。
