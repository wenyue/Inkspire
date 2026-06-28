# 作品复杂度与制作参考尺寸设计

日期：2026-06-28

## 背景

Inkspire 当前已经支持用户上传环境图片、生成作品图、自动生成效果图，并在制作作品弹窗中使用 `record.recommended_artwork_size` 预填尺寸。现有尺寸主要来自上传环境图片时的图片比例推算，不能表达真实物理空间中的摆放大小，也不能覆盖用户跳过环境图片时的制作尺寸预填。

本设计引入两个独立概念：

- `generation_complexity`：作品生成复杂度，用于控制作品图的画面承载量、细节密度和构图复杂度。
- `recommended_artwork_size`：制作参考尺寸，用于制作作品页的尺寸预填和估价。用户仍可在制作页调整。

## 目标

1. 生成效果图前，基于最新环境图片估算真实物理摆放建议，并写入制作参考尺寸。
2. 制作作品时始终优先使用 `record.recommended_artwork_size` 预填尺寸。
3. 用户没有提供环境图片时，必须选择作品复杂度；作品图生成后，根据复杂度和作品图实际宽高比计算制作参考尺寸。
4. 调整作品尺寸页面不再写死宽高，尺寸预设根据作品实际比例动态计算。
5. 用户最后补充说明中的方向意图优先于早期问题选择。

## 非目标

- 不做精确测距。环境图片估算是参考尺寸，不宣称为实际测量值。
- 不让制作页直接依赖“是否提供环境图片”的分支逻辑。制作页只消费 `recommended_artwork_size`。
- 不为 `generation_complexity` 单独保存解释原因。说明信息只保留在 `recommended_artwork_size.reason`。

## 数据模型

### `generation_complexity`

新增记录字段：

```ts
type GenerationComplexity = "small" | "medium" | "large";
```

含义：

- `small`：简洁。画面更克制、留白更明确、细节密度较低。
- `medium`：均衡。细节和留白平衡，适合常规作品生成。
- `large`：丰富。层次更充分、细节承载更多，适合主视觉作品生成。

该字段影响作品图生成提示词，不直接代表制作尺寸。
前端可以在副文案中说明“小空间点缀 / 书房礼赠 / 大空间主视觉”等使用场景，但主标签必须使用画面承载语义，避免用户误认为自己正在选择最终制作尺寸。

### `recommended_artwork_size`

继续使用现有结构：

```ts
interface ArtworkSize {
  preset_id: string;
  label: string;
  width_cm: number;
  height_cm: number;
  reason?: string;
}
```

该字段是制作参考尺寸，制作页用它预填并估价。用户可以继续手动调整或选择自定义尺寸。

`recommended_artwork_size.reason` 保留，用于解释参考尺寸来源。制作页展示尺寸说明时应优先显示该字段；只有缺失时才使用 preset 的固定说明。

### `resolved_orientation`

后端在生成和估算前解析一个单一方向意图：

```ts
type ResolvedOrientation = "portrait" | "landscape" | "square" | "unknown";
type OrientationSource = "notes" | "question" | "artwork_aspect" | "default" | "none";
```

`resolved_orientation` 不要求前端直接传入。后端从 `answers`、`conversationNotes` 和必要时的作品图比例解析，并在 prompt、环境估算和尺寸校验中作为硬约束使用。

## 方向意图优先级

尺寸估算和作品生成都应解析最终方向意图，优先级如下：

1. 最后补充说明中的明确方向，例如“竖幅”“横向”“方形”“portrait orientation”“landscape orientation”“square format”。
2. 用户问题流中的方向或构图选择。
3. 作品图实际宽高比。
4. 默认中幅竖向。

环境图片估算不能擅自改变用户最终方向意图。只有用户没有表达方向时，估算流程才可以根据环境图片提出更合适的方向。

问题流映射必须使用稳定问题 id，不做全局文本扫描：

- `painting_composition`：
  - `横幅` / `橫幅` / `Horizontal` -> `landscape`
  - `竖幅` / `豎幅` / `Vertical` -> `portrait`
  - `斗方` / `Square` -> `square`
  - `由墨起决定` / `由墨起決定` / `Let Inkspire decide` -> `unknown`
- `calligraphy_layout`：
  - `竖排` / `豎排` / `Vertical` -> `portrait`
  - `横排` / `橫排` / `Horizontal` -> `landscape`
  - `匾额` / `匾額` / `Plaque` -> `landscape`
  - 默认项 -> `unknown`

补充说明解析必须保守，不能把英文题材 `Landscape` 当作方向。只接受强方向短语，例如 `竖幅`、`竖向`、`portrait orientation`、`vertical format`、`横幅`、`横向`、`landscape orientation`、`horizontal format`、`斗方`、`方形`、`square format`。如果短语附近出现 `不要`、`别`、`不要做成`、`no`、`not` 等否定语，应避免把它识别为正向意图。

## 生成流程

### 有环境图片

1. 用户上传环境图片。
2. 用户点击生成。
3. 后端解析 `resolved_orientation`。
4. 后端在创建作品任务前先基于环境图片估算：
   - `generation_complexity`
   - `recommended_artwork_size`
5. 估算输入包括：
   - 环境图片
   - 作品类型
   - 问题流答案
   - 最后补充说明
   - `resolved_orientation` 和 `orientation_source`
6. 用估算出的 `generation_complexity` 生成作品图。
7. 作品图成功后自动生成 AI 效果图。
8. AI 效果图提示词使用同一个 `recommended_artwork_size`，让作品在环境中的视觉比例与制作页预填尺寸一致。
9. 如果用户在结果页重新上传环境图片，开始新 AI 效果图任务前重新估算并覆盖 `recommended_artwork_size`。

上传环境图片接口可以继续返回旧的比例推算尺寸，用于上传后的即时提示或估算失败 fallback；但生成时必须以后端基于环境图片、用户答案和最终方向意图的估算结果为准。

估算失败时：

- `generation_complexity` 回退为 `medium`。
- `recommended_artwork_size` 优先保留记录已有值；没有旧值时回退为默认中幅。
- 作品图和效果图生成继续进行。

### 无环境图片

1. 用户点击“不需要效果图，直接生成”。
2. Studio 进入复杂度选择页。
3. 用户选择 `small`、`medium` 或 `large`。
4. 进入补充要求页。
5. 点击生成时，前端提交 `generation_complexity`。
6. 后端用 `generation_complexity` 生成作品图，并写入 record。
7. 作品图成功后，后端读取作品图实际宽高比。
8. 使用 `generation_complexity + 作品图宽高比` 计算 `recommended_artwork_size` 并写回 record。

此后制作页不需要特殊处理，仍只读取 `record.recommended_artwork_size`。

## 制作参考尺寸计算

无环境图片时，使用目标面积计算，而不是固定长边。

目标面积：

| 复杂度 | 目标面积参考 | 典型竖幅 |
| --- | ---: | --- |
| `small` | 约 `30 × 45 = 1350 cm²` | `30 × 45 cm` |
| `medium` | 约 `45 × 68 = 3060 cm²` | `45 × 68 cm` |
| `large` | 约 `60 × 90 = 5400 cm²` | `60 × 90 cm` |

计算规则：

1. 读取作品图宽高比 `r = width / height`。
2. 根据解析后的 `resolved_orientation` 校正比例：
   - `portrait`：如果作品图是横向，则使用倒数比例；最终必须 `height_cm > width_cm`。
   - `landscape`：如果作品图是竖向，则使用倒数比例；最终必须 `width_cm > height_cm`。
   - `square`：使用 `1:1`。
   - `unknown`：使用作品图实际比例。
3. 将有效比例限制在实用区间，避免极端画幅失真：
   - 竖向：`0.45 <= r <= 0.90`
   - 横向：`1.10 <= r <= 2.20`
   - 方形：`0.90 <= r <= 1.10`
   - 未知：`0.45 <= r <= 2.20`
4. 根据复杂度选择目标面积 `A`。
5. 计算 `height = sqrt(A / r)`，`width = height * r`。
6. 做物理限幅：短边不小于 `25cm`，长边不超过 `120cm`。若超过限幅，等比缩放回边界内。
7. 将宽高取整到接近真实制作规格的 `5cm` 档。
8. 取整后再次校验方向。如果方向被取整破坏，则最小幅度调整 `5cm`，直到满足 `resolved_orientation`。

如果极端比例导致最终面积偏离目标面积，允许偏离；方向意图和实用制作边界优先于严格面积。

制作页“调整作品尺寸”中的小、中、大预设也使用同一套动态计算，不再写死固定宽高。

## UI 变化

### Studio

有环境图片：

- 不显示复杂度选择页。
- 点击生成后由服务器自动估算复杂度和制作参考尺寸。

无环境图片：

- 点击“不需要效果图，直接生成”后进入复杂度选择页。
- 三档复杂度展示用途参考：
  - 简洁：画面更克制，适合玄关、书桌旁、小空间点缀。
  - 均衡：细节和留白平衡，适合书房、客厅边柜、礼赠。
  - 丰富：层次更充分，适合沙发墙、厅堂主位、大空间主视觉。
- 文案明确说明这是作品复杂度或画面承载量，不是最终制作尺寸。
- `generation_complexity` 是独立步骤状态，不属于问题流 `answers`。它必须进入 Studio draft、URL/back 流、generation session 和 retry payload，避免刷新、排队、重试时丢失。

### 制作作品弹窗

- 只使用 `record.recommended_artwork_size` 预填尺寸。
- 如果缺失，回退默认中幅。
- 用户可以继续调整尺寸或输入自定义尺寸。
- 尺寸说明使用 `recommended_artwork_size.reason`，用于解释参考尺寸来源。
- 调整尺寸页的小、中、大预设由当前作品比例动态计算，不再直接使用固定 `SIZE_OPTIONS` 宽高。
- 估价仍可沿用 `small`、`medium`、`large` 的倍率映射；按实际厘米面积精算价格不在本设计范围内。

## 后端 API 和模块

### API

`POST /api/generations` 新增可选字段：

```json
{
  "generation_complexity": "small | medium | large"
}
```

规则：

- 有环境图片时可省略，由后端估算。
- 无环境图片时前端必须传；如果缺失，后端回退 `medium`，但前端 UI 应避免这种情况。
- 字段必须作为独立 payload 字段处理，不得塞入 `answers`。

`POST /api/records/:id/fusion`：

- 如果传入新的环境图片，先重新估算 `recommended_artwork_size`。
- 估算成功后再启动 AI 效果图任务。
- 估算失败不阻止效果图任务。

### 后端 helper

建议新增 `server/src/sizeEstimation.js`：

- `estimateFromEnvironment(...)`：调用 AI，基于环境图片和最终方向意图估算复杂度与参考尺寸。
- `sizeFromComplexityAndAspectRatio(...)`：无环境图片时的本地尺寸计算。
- `resolveOrientationIntent(...)`：解析最终方向意图。
- `normalizeGenerationComplexity(...)`：校验复杂度。
- `normalizeArtworkSize(...)`：校验 AI 返回的尺寸，避免坏 JSON 或离谱尺寸进入 record。
- `enforceArtworkSizeOrientation(...)`：按 `resolved_orientation` 校验 AI 返回的宽高；必要时 swap、微调或回退。

## Prompt 变化

作品图 prompt 增加独立复杂度段落，不把复杂度塞入 `answers`。该段落应放在“用户选择”之后、“用户补充”之前，让用户补充说明保持最高优先级。

- `small`：画面简洁、留白明确、细节密度较低。
- `medium`：细节与留白平衡，适合常规制作。
- `large`：层次更丰富、细节承载更多，适合主视觉作品。

作品图 prompt 同时写入解析后的方向硬约束，例如：

```text
最终方向：portrait，来源：用户补充说明。该方向必须优先于早期构图选择和环境图片判断。
```

AI 效果图 prompt 增加制作参考尺寸说明：

```text
作品建议制作尺寸约 45 × 68 cm，请按这个真实尺寸感摆放到环境图片中。
```

环境估算 prompt 要求模型返回结构化 JSON，并明确：

- 尺寸是参考估算，不是精确测量。
- 不得违背用户最终方向意图。
- 输出必须包含 `generation_complexity` 和 `recommended_artwork_size`。

当 `orientation_source` 是 `notes` 或 `question` 时，环境图片只能用于估算复杂度和物理尺寸，不能改变方向。只有 `resolved_orientation` 是 `unknown` 或 `orientation_source` 是 `none` 时，才允许环境图片影响方向建议。AI 返回 JSON 后，服务端仍必须做方向和尺寸范围校验。

## 兼容和迁移

- 历史 record 没有 `generation_complexity` 时按 `medium` 处理。
- 历史 record 没有 `recommended_artwork_size` 时制作页回退默认中幅。
- 已有 `recommended_artwork_size.reason` 继续可选，不强制历史数据补齐。
- 上传接口旧的比例推算结果继续作为 fallback，不作为生成时的权威尺寸。

## 测试策略

### 后端

- `generation_complexity` 规范化和默认回退。
- 环境估算 JSON 成功解析并写入 record。
- 环境估算失败时不中断作品图或效果图生成。
- 结果页重新上传环境图片后，效果图任务前覆盖更新制作参考尺寸。
- 无环境图片时，作品图成功后按复杂度和作品图比例计算 `recommended_artwork_size`。
- `resolveOrientationIntent` 验证补充说明优先于问题选择。
- `resolveOrientationIntent` 验证 `painting_composition`、`calligraphy_layout` 的本地化映射。
- 补充说明方向词解析验证否定词和英文题材 `Landscape` 不误判。
- AI 返回尺寸与方向冲突时验证服务端会修正或回退。
- 作品 prompt 包含复杂度语义。
- AI 效果图 prompt 包含制作参考尺寸。

### 前端

- 提供环境图片时不显示复杂度选择。
- 跳过环境图片时显示复杂度选择页。
- 生成 payload 带 `generation_complexity`。
- 刷新、返回、排队、重试时不丢失 `generation_complexity`。
- 制作页使用 `record.recommended_artwork_size` 预填。
- 制作页优先显示 `recommended_artwork_size.reason`。
- 调整作品尺寸页按作品比例动态生成小、中、大预设。
- 最后补充说明中的方向词覆盖早期构图选择。

### E2E

- 无环境图片：选择复杂度，生成作品图，制作页预填尺寸。
- 有环境图片：自动估算复杂度和制作参考尺寸，生成作品图和效果图。
- 重新上传环境图片：重新估算制作参考尺寸并生成新效果图。
