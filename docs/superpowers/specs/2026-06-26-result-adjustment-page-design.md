# 结果页调整流程与历史导航设计

## 目标

把结果页上两个语义重复的按钮（“按这张图继续调整”和“补充要求”）合并为单一的“调整”动作。点击后不再回落到画案问答流程，而是 **push 一个独立的调整页**，让用户只输入一段“调整方向”文字。提交后生成 **全新的作品记录**，并跳到这张新作品的结果页。此时按系统返回（手机返回键 / 侧滑 / 浏览器后退），应回到 **上一张作品**；在版本链最顶端再返回，则回到 **藏卷**。

## 背景与现状

结果页 `ResultView` 当前提供两个次要按钮，行为几乎一致：

- “按这张图继续调整” (`onContinue`)：把当前记录设为迭代源 → `clearCurrentRecord()` 清掉结果视图 → `notesFocusRequest + 1`。
- “补充要求” (`onAddNotes`)：把当前记录设为迭代源 → 切到 `studio` 页签 → `notesFocusRequest + 1`。

两者最终都回到 `Studio` 的补充要求步骤（预填上一轮答案、聚焦备注框），用户无法区分，且会重新暴露画案上下文，造成困惑。

生成接口 `createGeneration` 每次都会返回一条全新的 `record`，迭代时只是复用上一条记录的 `type`、`answers`、`source_photo_path`、`recommended_artwork_size`，并传入新的 `conversationNotes`。因此“生成全新作品”无需后端改动。

应用当前用 **页签状态 + localStorage**（`activeTab`、`currentRecord` 等）管理界面，没有接入浏览器 `history`。本设计需要新增一个轻量的历史导航模型。

## 范围

包含：

- 在 `ResultView` 中用单个“调整”按钮替换“继续调整 / 补充要求”两个按钮（失败态仍可调整/重试）。
- 新增独立的调整页组件，只包含：当前作品缩略图（上下文）、一段“调整方向”自由文字输入、提交与返回。
- 在 `App` 中引入基于浏览器 `history` 的统一导航层，**覆盖全部可导航视图**：底部页签（画案 / 藏卷 / 雅匠）、结果页、调整页、制作弹窗（含尺寸子页）、藏卷移出确认弹窗。所有“返回 / 关闭 / 取消”统一走 `history.back()`。
- 复用现有 `createGeneration` 流程，把上一条记录的参数 + 调整方向文字提交生成新记录。
- 更新受影响的前端测试与 e2e。

不包含：

- 修改后端生成 / 融合接口、提示词、存储结构。
- 让生成真正以“上一张图”为底图做图生图（当前是按答案 + 备注重生成，本次维持）。
- 在调整页修改原问答答案或重新选 / 改照片（仅自由文字方向）。
- 重设计藏卷或雅匠页。
- 新增正式订单、登录或云端功能。

## 用户流程

```text
藏卷/画案 -> 作品结果(A) -> 调整页 -> 作品结果(B) -> 调整页 -> 作品结果(C) ...
```

- 在作品结果页点击 **“调整”**：push 调整页。
- 调整页展示当前作品缩略图，一个多行输入框（占位示例如“更清雅一点、留白更多……”），一个“生成调整后的作品”主按钮，以及顶部返回。
- 提交后进入生成等待，成功后跳到新作品 B 的结果页。
- 在 B 结果页按系统返回 → 回到 A 结果页（而不是调整页）。
- 在 A 结果页（从藏卷打开的链顶）按系统返回 → 回到藏卷。
- 在调整页未提交直接返回 → 回到来源作品页。

失败态：从一条 `status === "failed"` 的记录进入调整页同样有效，提交即重试并生成新记录。失败结果页的按钮文案使用“重新调整”。

## 历史导航模型

历史导航不只服务“结果 → 调整 → 结果”这条链，而是 **覆盖应用的全部可导航视图**，让手机系统返回键 / 侧滑 / 浏览器后退在任何页面都有一致、可预期的行为。当前应用的视图清单：

- 底部页签：`studio`（画案）、`library`（藏卷）、`experts`（雅匠）。
- 画案内部子视图：多步问答流程（自带“上一步”）、结果页、调整页（新增）。
- 覆盖层：制作弹窗 `ProductionDialog`（内含 `main` / `size` 子页与下单确认）、藏卷“移出藏卷”确认弹窗。

### 统一的视图状态

引入一个集中管理的“视图栈”，落到浏览器 `history.state` 上。`App` 维护一个 `pushView / replaceView / 监听 popstate` 的导航层，所有现有的 `setActiveTab`、打开记录、`setShowProduction` 等改为经过它。

```ts
type NavState =
  | { view: "tab"; tab: "studio" | "library" | "experts" }
  | { view: "result"; recordId: string }
  | { view: "adjust"; baseRecordId: string }
  | { view: "production"; recordId: string; page: "main" | "size" }
  | { view: "confirm"; kind: "removeFavorite"; recordId: string };
```

应用启动时 `replaceState` 写入一个基底条目（默认 `tab:studio`，或按持久化恢复的页签 / 记录）。之后所有导航都基于它增删。

### 各视图的入栈规则

- **页签切换（底部导航）**：点任一页签 `pushState({ view: "tab", tab })`。从 `library` / `experts` 返回 → 回到上一个页签（通常是 `studio`）。连续切换形成可后退的访问历史，符合移动端习惯。
- **从藏卷打开作品 A**：`pushState({ view: "result", recordId: A })`，其下层是 `tab:library`，因此返回回到藏卷。
- **画案内新生成得到作品**：生成成功时，把当前 `tab:studio` 顶上 `pushState({ view: "result", recordId })`；从这张结果返回 → 回到画案问答完成态（`tab:studio`）。
- **结果页点“调整”**：`pushState({ view: "adjust", baseRecordId: A })`，栈变为 `[…, result:A, adjust:A]`。
- **调整提交成功得到 B**：`replaceState({ view: "result", recordId: B })`，栈变为 `[…, result:A, result:B]`。从 B 返回直接到 A，跳过调整页；在版本链顶端再返回则按该链起点的下层（藏卷或画案）回退。
- **调整页未提交返回**：普通 `history.back()` 回到 result:A。
- **打开制作弹窗**：`pushState({ view: "production", recordId, page: "main" })`，返回即关闭弹窗回到来源页（结果页或雅匠页）。
- **制作弹窗内进入尺寸子页**：`pushState({ view: "production", recordId, page: "size" })`，返回回到 `main` 子页而不是直接关弹窗。
- **藏卷“移出藏卷”确认弹窗**：`pushState({ view: "confirm", kind: "removeFavorite", recordId })`，返回即取消该确认。

### popstate 同步

单一 `popstate` 监听根据弹出的 `NavState` 把 `App` 的实际界面状态对齐：

- `tab:*` → 设置 `activeTab`，并清理结果 / 弹窗等上层覆盖。
- `result` → 设置 `currentRecord`（按 `recordId` 复用已加载记录，缺失时回退 `getRecord` 重新拉取），关闭调整页与弹窗。
- `adjust` → 显示调整页，`baseRecordId` 指向来源记录。
- `production` → 打开制作弹窗并定位到对应 `page` 子页。
- `confirm` → 打开对应确认弹窗。

界面内所有“关闭 / 返回 / 取消”按钮（弹窗关闭、确认弹窗取消、调整页返回、制作尺寸子页返回）统一改为调用 `history.back()`，确保按钮返回与系统返回行为一致，不再各自直接 `setState`。

### 多步问答流程的返回

问答流程（作品类型 → 分支问题 → 照片步骤 → 补充要求）作为 `tab:studio` 内的单个历史条目处理，**不为每一步单独入栈**，以避免大规模重写并保持草稿逻辑稳定。规则：

- 当问答处于第 2 步及以后时，系统返回优先映射为画案现有的“上一步”（回退一题 / 退回上一子步骤），而不是离开画案。
- 当问答处于第 1 步时，系统返回按页签规则离开画案，回到上一个页签。

实现上可在 `popstate` 命中 `tab:studio` 且画案可回退时，拦截并触发画案内部返回，同时 `pushState` 重新占位，保证下一次系统返回仍可继续逐步回退。该拦截为可选增强项（见风险），若实现复杂可先退化为“第 1 步外的系统返回不离开画案”。

### 边界与约束

- 与现有 `activeTab`、`currentRecord` 的 localStorage 持久化保持兼容：启动 `replaceState` 用持久化值初始化基底条目，刷新后落到合理页面且不与历史栈冲突。
- `popstate` 恢复 `result` 时按 `recordId` 复用记录，必要时 `getRecord` 重新拉取；记录已被删除时回退到藏卷。
- 生成进行中（等待 job 完成）时返回：保持调整页可返回，生成失败不把错误态压入历史。
- 覆盖层（制作弹窗、确认弹窗）打开期间切换页签的边界：以“先关闭覆盖层再切页签”为准，避免历史条目与可见 UI 不一致。

## 状态与数据

调整页提交时构造的 `createGeneration` 载荷来源于来源记录：

- `type`：来源记录 `type`。
- `answers`：来源记录 `answers`。
- `source_photo_path`：来源记录 `source_photo_path`（保留以便仍可生成效果图）。
- `recommended_artwork_size`：来源记录 `recommended_artwork_size`。
- `conversationNotes`：调整页输入的“调整方向”文字（必填，去除首尾空白后非空才允许提交）。

`App` 不再需要 `iterationRecord` + `notesFocusRequest` 的“回灌画案”机制（结果页迭代部分）；该机制如仅服务于结果页迭代则移除，若画案内部仍依赖则保留但不再由结果页触发。

## 界面设计

调整页复用现有卷轴卡片容器风格，单列布局：

- 顶部：返回按钮 + 标题（如“调整这张作品”）。
- 当前作品缩略图（小尺寸，仅作上下文，不占满屏）。
- 多行输入框，带占位示例与若干可点选的方向建议（复用现有 `suggestions`，排除“可以开始生成”）。
- 主按钮“生成调整后的作品”，输入为空时禁用。
- 生成中显示等待态文案，并禁用重复提交。
- 错误复用现有通用错误样式。

结果页 `ResultView`：

- 移除“按这张图继续调整”和“补充要求”两个按钮，替换为单个“调整”次要按钮（失败态文案为“重新调整”）。
- 保留“制作作品”主按钮和“添加摆放照片生成效果图”能力不变。

## 文案

`i18n.ts` `result` 段：

- 移除/替换 `continue`、`retry`、`addNotes` 在结果页的双按钮用途，新增单一 `adjust`（如“调整这张图”）与失败态 `adjustRetry`（如“重新调整”）。
- 新增 `adjustPage` 段：标题、说明、输入占位、提交按钮、生成中文案。
- 保留 `suggestions` 复用为方向建议。

三种语言（zh-Hans / zh-Hant / en）同步更新。

## 测试

- `client/tests/app.test.tsx`：
  - 移除/改写依赖“按这张图继续调整 / 补充要求”双按钮的断言。
  - 新增：点击“调整”进入调整页，显示来源作品缩略图与输入框。
  - 新增：在调整页输入方向并提交，生成新记录后进入新结果页。
  - 新增：从新结果页返回回到上一张作品；从链顶结果页返回回到藏卷（通过 `popstate` 模拟）。
  - 失败记录进入调整页并重试。
  - 全覆盖导航：页签切换后系统返回回到上一页签；打开制作弹窗后返回关闭弹窗；制作尺寸子页返回回到 `main` 子页；藏卷移出确认弹窗返回即取消（均通过 `popstate` 模拟）。
- `e2e/inkspire.spec.ts`：更新结果页按钮断言为“调整”，覆盖一次调整生成新作品并用浏览器返回回到上一张；补充一条跳转制作弹窗后用浏览器返回关闭的用例。

## 验证命令

- `npm test --workspace client -- --run client/tests/app.test.tsx`
- `npm test --workspace client`
- `npm run e2e`

## 风险与取舍

- **历史导航是新增架构**：要把现有分散的 `setActiveTab` / `setShowProduction` / 打开记录等状态变更收拢到统一导航层，与 localStorage 持久化并存，需小心 `popstate` 与持久化的交互，避免“返回卡在空白”或“刷新后栈错乱”。这是本次最大风险点，建议先用单元测试覆盖各视图的 `popstate` 行为。
- **多步问答的系统返回拦截** 为可选增强项；若拦截与草稿 / 进度逻辑耦合过重，先退化为“第 1 步以外的系统返回不离开画案”，不阻塞主体交付。
- 调整生成仍是“按答案 + 方向重生成”，并非严格基于上一张图的图生图；按钮文案改为“调整”以避免误导。
- 移除结果页迭代回灌画案的逻辑后，需确认画案内部其它流程不受影响。
