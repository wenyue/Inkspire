# 作品环境图片与效果图设计

## 背景

当前作品记录已有三类图片字段：

- `artwork_path`：作品图。
- `fusion_path`：基于环境图片生成的效果图。
- `source_photo_path`：用户上传的环境图片。

现有实现中，环境图片通常先保存到 `records/upload-.../source-photo.webp`，新作品记录只是引用这个路径。这样可以支持初次生成效果图，但每张作品并没有自己的环境图片资产。后续调整作品时虽然可以携带 `source_photo_path`，但它仍依赖旧上传目录，记录迁移、清理和重试都不够稳。

结果页当前也把作品图放进固定比例容器并使用裁切式显示，竖幅或横幅作品会看不到完整画面。

## 目标

1. 作品页显示完整作品图，不裁剪作品图主体。
2. 如果用户提供了环境图片，作品图生成成功后立即自动生成效果图。
3. 每张作品都保存自己的环境图片，调整作品时能继承环境图片并自动生成新的效果图。
4. 效果图生成失败时不影响作品图，结果页提供手动重试入口。
5. 用户可见文案统一使用“环境图片/环境照片”，不再使用“场景图”。

## 非目标

- 不新增新的图片生成算法。
- 不改变作品图、效果图的文件格式，继续使用 WebP。
- 不重做藏卷列表布局；藏卷缩略图仍可保持裁切式缩略展示。
- 不引入后台常驻任务系统。自动效果图生成先复用现有前端轮询触发链路。

## 数据模型

沿用现有字段，不新增 record 顶层字段：

- `artwork_path` 指向 `records/<record-id>/artwork.webp`。
- `fusion_path` 指向 `records/<record-id>/fusion.webp`。
- `source_photo_path` 指向 `records/<record-id>/source-photo.webp`。
- `fusion_status` 记录效果图状态；失败时为 `failed`。

生成新作品时，如果请求带入环境图片路径，服务器创建 record 后把源环境图片复制到新作品目录：

```text
records/<record-id>/source-photo.webp
```

随后 record 的 `source_photo_path` 指向新作品目录下的文件。这样每张作品记录都拥有自己的环境图片资产。

## 后端流程

### 环境图片上传

`POST /api/uploads/photo` 保持现有行为：接收图片、转为 WebP、返回临时上传记录路径和推荐作品尺寸。用户可见文案称为“环境照片/环境图片”，但 API 字段名保持 `source_photo_path`，避免破坏现有客户端和测试。

### 作品生成

`POST /api/generations` 接收 `source_photo_path` 时：

1. 先按现有规则验证路径归属当前用户。
2. 创建新 record id。
3. 将环境图片复制到 `records/<record-id>/source-photo.webp`。
4. 保存 record，`source_photo_path` 写入新作品自己的路径。
5. 正常排队或立即运行作品图生成 job。

如果没有环境图片，作品生成流程不变。

### 效果图生成

`POST /api/records/:id/fusion` 支持两种方式：

- 请求带 `source_photo_path`：验证后复制或更新为当前作品自己的 `source-photo.webp`，再生成效果图。
- 请求不带 `source_photo_path`：如果 record 已有 `source_photo_path`，直接用现有环境图片生成效果图。

如果 record 没有环境图片且请求也没有提供新图片，接口返回明确的 400 错误，不启动 job。

效果图成功后：

- 写入 `fusion_path`。
- `has_fusion` 为 `true`。
- `fusion_status` 为 `succeeded`。
- `status` 保持或恢复为 `succeeded`。

效果图失败后：

- 不删除或覆盖 `artwork_path`。
- 保留 `source_photo_path`。
- `status` 恢复为 `succeeded`。
- `fusion_status` 为 `failed`。
- 记录诊断信息，结果页可显示手动重试入口。

### 调整作品

调整作品仍通过创建新 artwork job 完成。提交调整时，客户端把当前作品的 `source_photo_path` 和 `recommended_artwork_size` 带入新作品请求。

服务器为调整后的新作品复制环境图片到新 record 目录。新作品图生成成功后，如果新 record 有 `source_photo_path` 且没有 `fusion_path`，客户端轮询完成逻辑立即触发效果图生成。

## 前端展示

### 作品图完整显示

结果页中的作品图使用完整显示样式：

- `object-fit: contain`。
- 容器保持稳定尺寸和背景。
- 竖幅、横幅、方形作品都完整显示。

该调整只针对结果页作品图。效果图和藏卷缩略图可以继续使用适合缩略展示的裁切样式。

### 结果页状态

结果页按记录状态展示：

| 记录状态 | 展示 | 按钮 |
| --- | --- | --- |
| 有 `fusion_path` | 完整作品图 + 效果图 | `制作作品`、`调整作品` |
| 有 `source_photo_path`，但无 `fusion_path`，或 `fusion_status=failed` | 完整作品图 + 效果图不可用提示 | `生成效果图`、`制作作品`、`调整作品` |
| 没有 `source_photo_path` | 完整作品图 | `添加环境照片生成效果图`、`制作作品`、`调整作品` |

### 按钮行为

- `添加环境照片生成效果图`：打开文件选择器，上传新的环境照片，随后调用 `/api/records/:id/fusion`。
- `生成效果图`：不打开文件选择器，直接调用 `/api/records/:id/fusion`，复用当前作品保存的环境图片。

自动效果图生成是主路径。`生成效果图` 只作为效果图失败或未生成时的回退入口。

### 文案

用户可见文案统一：

- “场景图”改为“环境图片”。
- “添加照片生成效果图”改为“添加环境照片生成效果图”。
- 已有环境图片的重试按钮为“生成效果图”。

## 错误处理

- 环境照片上传过大：沿用现有上传大小错误提示。
- 环境照片路径非法或不属于当前用户：后端返回 400，前端显示通用错误。
- 效果图生成失败：作品图仍可用，结果页显示效果图不可用提示和 `生成效果图`。
- 自动效果图生成被并发限制拦截：沿用现有生成限制提示或保留待重试状态，不破坏作品图。

## 测试计划

### 服务端

运行 `npm test --workspace server`。重点覆盖：

- `POST /api/generations` 带环境图片时，新 record 的 `source_photo_path` 指向 `records/<record-id>/source-photo.webp`。
- 新 record 目录中实际存在复制后的 `source-photo.webp`。
- `POST /api/records/:id/fusion` 不传路径时可复用 record 已保存的环境图片。
- record 没有环境图片且 fusion 请求不传路径时返回 400。
- 效果图失败后保留 `artwork_path` 和 `source_photo_path`，`fusion_status` 为 `failed`。
- 调整作品生成的新 record 继承并复制旧作品环境图片。

### 客户端

运行 `npm test --workspace client`。重点覆盖：

- 作品图结果页使用完整显示样式。
- 记录已有环境图片但无效果图时显示 `生成效果图`。
- 记录无环境图片时显示 `添加环境照片生成效果图`。
- 效果图已生成后显示作品图和效果图，不显示回退生成按钮。
- 调整作品提交时带上当前作品的环境图片路径。
- 作品图完成后有环境图片时自动触发效果图生成。

### 端到端

如果本轮改动触及结果页响应式布局、上传路径或生成轮询链路，优先在单元测试通过后运行 `npm run e2e`。如果因环境端口或耗时无法运行，需要在完成报告中说明。

## 实施边界

实现时优先保持改动局部：

- 后端集中修改 `server/src/jobs.js`、`server/src/app.js`、必要时补充 `server/src/storage.js` 的安全路径支持。
- 前端集中修改 `client/src/App.tsx`、`client/src/components/ResultView.tsx`、`client/src/styles.css` 和相关测试。
- 类型只扩展现有 `GenerationRecord` / `LibraryRecord` 中已存在字段，不引入新的 API 命名。

不修改无关页面、不重排藏卷列表、不改变 production order 的已有快照字段。

## 自审记录

- 没有 `TBD` 或未决占位。
- “环境图片/环境照片”术语已统一；仅在背景中说明旧称“场景图”。
- 自动效果图生成是主路径，`生成效果图` 明确为失败或未生成后的回退入口。
- 数据模型保持现有 API 字段名，避免前后端契约大改。
- 范围聚焦作品页、生成链路、环境图片保存和相关测试，没有引入无关重构。
