# Figma Grid Dots Plugin — 开发工程计划

## 概述

将现有 Figma 插件模板改造为"散布网格点阵"插件。用户选择一个封闭图形作为边界，插件在其内部按指定密铺方式（四边形/六边形）散布点阵，点元素的直径根据边界图形的填充类型（纯色/渐变）决定，且支持指定另一个封闭图形作为点元素的本体形状。

---

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│  ui.html (插件 UI)                                    │
│  - 边界图形信息展示（选中状态、填充类型）               │
│  - 直径参数输入（纯色: 固定值 / 渐变: 最大值+最小值）    │
│  - 密铺形式选择（四边形 / 六边形）                      │
│  - 点元素本体图形选择（选中状态）                       │
│  - 网格间距参数                                       │
│  - 生成按钮                                           │
│  ─────────────────────────────────────────────────── │
│  postMessage ←→ onmessage                            │
└──────────────────────────────────────────────────────┘
                         ↕
┌──────────────────────────────────────────────────────┐
│  code.ts (插件主逻辑)                                  │
│  1. 边界识别模块                                       │
│  2. 填充分析模块                                       │
│  3. 网格生成模块（四边形 / 六边形）                     │
│  4. 点在形状内判定模块                                  │
│  5. 渐变颜色采样模块                                    │
│  6. 点阵放置与缩放模块                                  │
│  7. 自定义点元素本体模块                                │
└──────────────────────────────────────────────────────┘
```

---

## 阶段一：UI 重设计 (`ui.html`)

**目标**：将模板 UI 替换为功能完整的面板。

**具体工作**：
1. **边界图形信息区**
   - 显示当前选中图形名称、类型（矩形/椭圆/多边形/星形/矢量）
   - 显示填充类型：纯色(SOLID) / 渐变色(GRADIENT_LINEAR / GRADIENT_RADIAL / GRADIENT_ANGULAR / GRADIENT_DIAMOND) / 无填充
   - 未选中或选中多个时给出提示

2. **直径参数区**
   - 纯色模式：单个"点直径"输入框（px 值）
   - 渐变模式：
     - "最大直径"输入框（对应最亮处）
     - "最小直径"输入框（对应最暗处），默认值可为 1px

3. **密铺参数区**
   - 密铺形式下拉选择：`quad`（四边形网格）/ `hex`（六边形网格）
   - "网格间距"输入框（相邻点中心距，px）

4. **点元素本体图形区**
   - 显示"点源图形"选中状态（名称、类型）
   - 未选中时默认使用圆形

5. **生成 / 取消按钮**

6. **消息通信**
   - `generate-dots`：携带所有参数发送至 code.ts
   - `cancel`：关闭插件
   - 接收 code.ts 回传的选中状态信息，及时刷新 UI 显示

**涉及文件**：`ui.html`

---

## 阶段二：消息路由与参数接收 (`code.ts`)

**目标**：在 `code.ts` 中建立消息分发框架，解析 UI 发来的参数。

**具体工作**：
1. 定义 TypeScript 接口：
   ```ts
   interface GenerateParams {
     dotDiameter: number;        // 纯色模式下的固定直径
     maxDiameter: number;        // 渐变模式最大直径
     minDiameter: number;        // 渐变模式最小直径
     gridSpacing: number;        // 网格间距
     tileMode: 'quad' | 'hex';  // 密铺形式
     dotSourceNodeId?: string;   // 点源图形节点 ID（可选）
   }
   ```

2. `figma.ui.onmessage` 中增加 `generate-dots` 分支，解析参数后调用后续模块。

3. 启动时通过 `figma.currentPage.selection` 读取当前选中节点信息，回传给 UI 以预填充边界图形和点源图形状态。

4. 监听 `selectionchange` 事件，实时更新 UI 中的选中状态显示。

**涉及文件**：`code.ts`

---

## 阶段三：边界图形识别模块

**目标**：从当前选中节点中提取边界图形的几何信息，用于后续点在形状内判定。

**具体工作**：

1. **节点类型校验**
   - 支持类型：`RectangleNode`、`EllipseNode`、`PolygonNode`、`StarNode`、`VectorNode`（有封闭路径的）、`FrameNode`、`ComponentNode`、`InstanceNode`
   - 拒绝类型：`TextNode`、`LineNode`、`SliceNode`、`GroupNode`（可提示用户先解散群组）

2. **几何信息提取函数** `getShapeGeometry(node: SceneNode): ShapeGeometry`
   ```ts
   interface ShapeGeometry {
     type: 'rect' | 'ellipse' | 'polygon' | 'star' | 'vector';
     bounds: { x, y, width, height };     // 包围盒（绝对坐标）
     vertices?: { x, y }[];               // 多边形/星形顶点（绝对坐标）
     vectorPaths?: VectorPath[];           // 矢量路径数据
     transform: Transform;                 // 节点的绝对变换矩阵
   }
   ```

3. **各类型处理要点**：
   - **RectangleNode**：四角顶点 = `(x, y)`, `(x+w, y)`, `(x+w, y+h)`, `(x, y+h)`
   - **EllipseNode**：中心 `(cx, cy)` = `(x+w/2, y+h/2)`，半轴 `rx=w/2`, `ry=h/2`
   - **PolygonNode**：通过 `pointCount`、`cornerRadius` 和宽高计算顶点（正多边形内接于包围盒的椭圆）
   - **StarNode**：类似多边形，有内外两层顶点
   - **VectorNode**：通过 `vectorPaths` 属性获取路径数据
   - **FrameNode / ComponentNode / InstanceNode**：取其包围盒 `absoluteBoundingBox`

4. **绝对坐标转换**：所有顶点坐标需通过节点的 `absoluteTransform` 转换到画布坐标系。

**涉及文件**：新建 `src/geometry.ts` 或在 `code.ts` 中实现

---

## 阶段四：填充分析模块

**目标**：分析边界图形的 `fills` 属性，判断填充类型并提取颜色信息。

**具体工作**：

1. **填充类型检测**
   ```ts
   type FillAnalysis =
     | { type: 'none' }                           // 无填充
     | { type: 'solid'; color: RGBA; hex: string } // 纯色
     | { type: 'gradient'; stops: GradientStop[]; transform: Transform; gradientType: string }
   ```
   - 取 `node.fills[0]`（第一个可见填充）
   - 通过 `Paint.type` 区分 SOLID / GRADIENT_*

2. **渐变信息提取**
   - `gradientStops`：`{ position: number (0-1), color: RGBA }[]`
   - `gradientTransform`：2×3 变换矩阵 `[[a,b,x],[c,d,y]]`
   - `type`：`GRADIENT_LINEAR` / `GRADIENT_RADIAL` / `GRADIENT_ANGULAR` / `GRADIENT_DIAMOND`

3. **颜色转明度函数**
   ```ts
   function getLightness(color: RGBA): number {
     // 使用相对亮度公式 (ITU-R BT.709 / sRGB)
     return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
   }
   ```
   明度范围为 0（黑）~1（白）。

**涉及文件**：新建 `src/fill.ts` 或在 `code.ts` 中实现

---

## 阶段五：点在形状内判定模块

**目标**：判断一个坐标点是否位于边界图形内部，用于筛选网格点。

**具体工作**：

1. **矩形**：直接比较坐标与四边界限：
   ```
   x_min <= px <= x_max && y_min <= py <= y_max
   ```

2. **椭圆**：判断点到椭圆中心的归一化距离：
   ```
   ((px - cx)² / rx²) + ((py - cy)² / ry²) <= 1
   ```

3. **正多边形 / 星形**：射线法（Ray Casting）判断点是否在多边形内部。
   - 从点向右发射水平射线，统计与多边形边的交点数量
   - 奇数 → 内部，偶数 → 外部

4. **矢量图形**：
   - 若 `vectorPaths` 可用：对每条封闭路径使用射线法
   - 若路径复杂无法解析：回退到包围盒判定（`absoluteBoundingBox`）

5. **通用函数** `isPointInsideShape(point: {x,y}, geometry: ShapeGeometry): boolean`

**涉及文件**：新建 `src/pointInShape.ts` 或在 `code.ts` 中实现

---

## 阶段六：网格生成模块

**目标**：在边界图形的包围盒内生成四边形或六边形网格点坐标。

**具体工作**：

1. **四边形网格 (`quad`)**
   ```
   行间距 = gridSpacing
   列间距 = gridSpacing
   ```
   - 从包围盒左上角开始，以 `gridSpacing` 为步长遍历所有行列
   - 点坐标：`(bounds.x + col * spacing, bounds.y + row * spacing)`

2. **六边形网格 (`hex`)**
   ```
   水平间距 = gridSpacing
   垂直间距 = gridSpacing * sqrt(3) / 2
   奇数行偏移 = gridSpacing / 2
   ```
   - 点坐标：`(bounds.x + col * spacing + (row % 2) * spacing/2, bounds.y + row * vSpacing)`
   - 这产生交错排列的点阵（蜂巢状）

3. **通用函数** `generateGridPoints(bounds: Rect, spacing: number, mode: 'quad' | 'hex'): {x, y}[]`

4. **边界剪裁**：对每个生成的点调用 `isPointInsideShape`，只保留在形状内部的点。

5. **坐标精确度**：保留浮点数精度，不取整。

**涉及文件**：新建 `src/grid.ts` 或在 `code.ts` 中实现

---

## 阶段七：渐变颜色采样模块

**目标**：对于渐变填充的图形，计算任意点在渐变中的颜色，进而得到该点处的明度。

**具体工作**：

1. **梯度空间坐标计算**
   - 使用 `gradientTransform` 的逆矩阵，将画布坐标点映射到渐变空间（0~1 范围）
   - 渐变空间的 Y 轴在 Figma 中方向为从上到下

2. **按渐变类型计算采样参数 `t`**（0~1，表示在渐变标尺上的位置）：

   | 类型 | 计算方式 |
   |------|---------|
   | `GRADIENT_LINEAR` | `t = gradientSpaceX`（沿 X 轴线性） |
   | `GRADIENT_RADIAL` | `t = sqrt(gx² + gy²)`（到中心的距离） |
   | `GRADIENT_ANGULAR` | `t = atan2(gy, gx) / (2*PI)`（角度映射） |
   | `GRADIENT_DIAMOND` | `t = abs(gx) + abs(gy)`（曼哈顿距离） |

3. **从 `gradientStops` 查色**
   - 根据 `t` 在 `gradientStops` 数组中的位置插值
   - 返回插值后的 `RGBA` 颜色

4. **明度计算**
   - 将插值颜色通过 `getLightness()` 转为明度值

5. **通用函数** `sampleGradientAtPoint(point: {x,y}, fill: GradientFill): number`（返回明度 0~1）

**涉及文件**：新建 `src/gradient.ts` 或在 `code.ts` 中实现

---

## 阶段八：点阵放置与缩放模块

**目标**：在每个筛选后的网格点上创建点元素，并根据直径参数缩放。

**具体工作**：

1. **直径计算**
   - **纯色模式**：所有点使用 `dotDiameter`
   - **渐变模式**：
     ```
     lightness = sampleGradientAtPoint(point, gradientFill)
     diameter = minDiameter + lightness * (maxDiameter - minDiameter)
     ```
     即明度越高直径越大（因为亮处更显眼）。

2. **点元素创建**
   - 若无自定义点源图形 → `figma.createEllipse()` 创建圆形
   - 若有点源图形 → `dotSourceNode.clone()` 克隆

3. **缩放与定位**
   - 默认圆形的直径映射：设置 `ellipse.width = diameter; ellipse.height = diameter`
   - 克隆图形的缩放：计算缩放因子 `scale = diameter / sourceNode.width`，通过 `node.rescale(scale, scale)` 缩放
   - 定位：将节点中心对齐网格点坐标 `node.x = point.x - node.width/2; node.y = point.y - node.height/2`

4. **批量操作优化**
   - 预估节点数量（数百到数千），所有创建操作置于同一事务中
   - 创建后统一选中所有新节点，便于用户观察和后续操作

5. **分组（可选）**
   - 将所有生成的点元素放入一个 `GroupNode`，命名为 `"Grid Dots"`，便于管理

**涉及文件**：`code.ts`

---

## 阶段九：自定义点元素本体模块

**目标**：允许用户选择一个封闭图形作为每个点的"本体形状"，替代默认的圆形。

**具体工作**：

1. **选择逻辑**
   - 用户在 Figma 中额外选中一个节点作为"点源"
   - 插件通过 UI 中的"点源图形"区域显示选中状态
   - 点源节点 ID 随 `generate-dots` 消息发送

2. **克隆与缩放**
   - 使用 `figma.getNodeById(dotSourceNodeId)` 获取源节点
   - 每创建一个点时 `sourceNode.clone()` 克隆一份
   - 根据计算出的 `diameter` 相对于源节点宽度计算缩放比：`scale = diameter / sourceBounds.width`
   - `clonedNode.rescale(scale, scale)` 等比缩放

3. **位置对齐**
   - 将克隆节点的中心对齐到网格点坐标

4. **源节点保留**
   - 源节点本身不被修改或删除，仅作为模板使用

**涉及文件**：`code.ts`

---

## 阶段十：边界情况与鲁棒性

1. **无选中图形** → UI 显示警告"请先选择一个边界图形"，禁用生成按钮
2. **多选图形** → 只取第一个作为边界；若同时选中两个以上，第二个可作为点源（UI 明确标识）
3. **选中非封闭图形**（如 Line、Text）→ UI 显示"所选图形类型不支持"，禁用生成按钮
4. **无填充图形** → 回退使用纯色模式 + 默认直径值
5. **渐变但 `gradientStops` 为空** → 回退纯色模式
6. **网格间距过小** → 设置下限（如 2px），防止生成过多节点导致性能问题；也可在 UI 给出预估点数
7. **点源图形与边界图形为同一节点** → 提示用户需要分别选择两个不同的图形
8. **`VectorNode` 路径解析失败** → 回退使用包围盒
9. **撤销支持** → 所有节点创建在一个操作中，用户可一键撤销

---

## 文件结构规划

```
Grid_dots/
├── code.ts              # 插件主入口，消息路由，主流程编排
├── ui.html              # 插件 UI 面板
├── src/
│   ├── geometry.ts      # 边界图形几何信息提取
│   ├── fill.ts          # 填充分析 & 明度计算
│   ├── pointInShape.ts  # 点在形状内判定
│   ├── grid.ts          # 网格点生成（四边形/六边形）
│   ├── gradient.ts      # 渐变颜色采样
│   └── types.ts         # 共享 TypeScript 类型定义
├── manifest.json        # Figma 插件清单
├── package.json
├── tsconfig.json
└── eslint.config.js
```

---

## 实施顺序建议

| 顺序 | 阶段 | 原因 |
|------|------|------|
| 1 | 阶段二 — 消息路由 | 搭好骨架，后续模块逐步接入 |
| 2 | 阶段一 — UI 重设计 | 与消息路由配套，形成完整通信链路 |
| 3 | 阶段三 — 边界识别 | 基础能力，后续阶段依赖 |
| 4 | 阶段四 — 填充分析 | 基础能力，与边界识别并行 |
| 5 | 阶段五 — 点在形状内判定 | 依赖阶段三的几何数据 |
| 6 | 阶段六 — 网格生成 | 依赖阶段五的判定结果 |
| 7 | 阶段七 — 渐变采样 | 依赖阶段四的渐变数据 |
| 8 | 阶段八 — 点阵放置 | 汇总前序所有模块 |
| 9 | 阶段九 — 自定义点源 | 在阶段八基础上增加功能 |
| 10 | 阶段十 — 边界情况 | 收尾打磨 |
