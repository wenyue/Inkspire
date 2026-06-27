# 按 Tab 归属的生成中页面设计

## 背景

当前画案生成提交后，`Studio` 只在按钮和页面底部显示“墨色正在铺开”的 active job 状态。藏卷打开作品后的调整也会复用结果页和生成接口。`App` 只有在生成完成后打开结果页。这个体验有三个问题：

- 用户仍能看到提交前的生成或调整控件，容易误以为可以继续发起同 tab 任务。
- `Studio` 会在切换底部 tab 时卸载，生成中的体验状态不能只放在 `Studio` 本地。
- 现有服务端按同一用户统一限制 2 个 active jobs，不区分任务归属 tab，也没有把“首次生成”和“调整生成”的 loading 体验分开。

本设计目标是：在某个 tab 发起生成或调整后，该 tab 进入不可回退到提交前的生成中页面；底部 tab 仍可用；每个 tab 只受自己的 active job 限制；一个 tab 的生成中状态不阻塞其他 tab 的可用性。

## 用户体验

提交画案生成后，画案 tab 立即切换为专用生成中页面。画案结果页发起调整时，画案 tab 也进入同样结构的调整中页面。藏卷 tab 内发起调整后，藏卷 tab 也切换为同样结构的调整中页面。页面采用已确认的 B 方案：

- 保留现有 App 顶部 header 和底部 tab。
- 主体显示与当前阶段匹配的水墨、铺纸、绘画过程氛围图。
- 不显示进度条，避免让用户误解为真实进度。
- 显示当前 loading 文案和通用时间提示：“通常约 30 秒，请稍候。”

阶段文案和阶段图片按时间切换，只表达体验，不代表真实后端进度。文案和图片按 `operation` 区分，而不是按 `origin_tab` 区分：首次生成使用生成文案，调整作品使用调整文案。每个阶段准备 3-5 张候选图，进入该阶段时随机选择一张展示，阶段内不频繁切换图片，避免造成真实进度动画的误解。

首次生成 `operation: "create"`：

- 0-5 秒：艺术家正在构思
- 5-8 秒：艺术家正在张开纸张
- 8-20 秒：艺术家正在绘画
- 20 秒后：循环展示“艺术家正在完善细节”“艺术家正在整理墨色”“艺术家正在等待作品晾定”等低承诺文案

调整作品 `operation: "adjust"`：

- 0-5 秒：艺术家正在理解原作
- 5-8 秒：艺术家正在推敲调整方向
- 8-20 秒：艺术家正在重绘笔墨
- 20 秒后：循环展示“艺术家正在修整细节”“艺术家正在协调新稿”“艺术家正在收束画面”等低承诺文案

对应 tab 的生成成功时：

- 如果用户仍在发起任务的 tab，打开该 tab 下的结果页。
- 如果用户在其他 tab，不强制跳转；用户回到发起任务的 tab 时再看到结果。
- 画案 tab 的结果页使用 `from=studio`，例如 `/records/:id?from=studio`。画案首次生成和画案结果页调整都落到画案 tab 的结果页。
- 藏卷 tab 的结果页使用 `from=library`，例如 `/records/:id?from=library`。藏卷调整完成后，新结果要进入藏卷列表数据，并落到藏卷 tab 的结果页。

对应 tab 的生成失败时：

- 留在发起任务 tab 的生成中页面位置。
- 主文案改为“生成没有完成”。
- 显示简短失败说明和重试按钮。
- 重试仍受该 tab 独立 1 个槽位限制。

## 路由与返回

进入生成中页面时，替换当前 tab 状态，而不是把提交前页面压入浏览器返回栈。因此 loading 页不能通过 browser back 回到“补一句想法/生成按钮”或调整提交页面。

结果页允许 browser back，但必须二次确认：

- 用户从结果页触发 browser back 时，先弹出确认。
- 确认后回到发起 tab 的安全页面：画案结果回到新的画案流程，藏卷结果回到藏卷列表或该 tab 的根页面。
- 取消后留在当前结果页。

底部 tab 始终可用。切换到其他 tab 不会取消当前 tab 的任务，不会丢失当前 tab 的生成中状态，也不会在任务完成时被强制跳回发起任务的 tab。

## 前端状态

`App.tsx` 按 tab 持有生成 session，而不是让 `Studio.tsx`、结果页或藏卷页独自持有：

- 当前 tab 的 job id
- `sourceRecordId`：调整时被参考或被调整的原作品 id；首次生成时为空
- `resultRecordId`：当前 job 创建的新作品 id 或完成后的结果 id
- `startedAt`
- 当前状态：`running`、`succeeded`、`failed`
- 最近一次生成或调整 payload 摘要，用于失败重试
- 完成后的 result record 数据

`Studio.tsx` 继续负责收集答案、照片和补充想法，并发起画案生成，使用 `operation: "create"`。结果页调整入口使用 `operation: "adjust"`，并按当前所在 tab 归属发起任务：从画案结果页发起调整归属画案 tab，从藏卷结果页发起调整归属藏卷 tab。提交成功后，对应 tab 内容由 `App` 切换为 `GeneratingView`。对应 tab 不再在生成中场景显示原有提交入口，也不提供第二个同 tab 任务入口。

新增或等价实现的 `GeneratingView` 只负责展示：

- 当前阶段的随机氛围图
- 当前 `operation` 对应的阶段文案
- 约 30 秒提示
- 失败状态和重试入口

## 刷新恢复

刷新页面后，前端以服务端 active jobs 为准：

1. `App` 加载 `/api/jobs/active`。
2. 按 `origin_tab` 分组恢复 active job。
3. 如果某个 tab 存在 active job，该 tab 显示生成中页面。
4. 如果某个 tab 没有 active job，但本地保存了最近的该 tab `resultRecordId`，则尝试恢复对应结果记录。
5. 能恢复结果时，该 tab 显示结果页。
6. 不能恢复结果时，该 tab 显示失败/可重试状态。

`localStorage` 只保存按 tab 归属的轻量 generation session，包括 `originTab`、`operation`、`jobId`、`sourceRecordId`、`resultRecordId`、`startedAt` 和最近一次 payload 摘要，用于恢复文案时间轴、结果记录和重试信息，不作为并发判断来源。并发判断只相信服务端 active jobs 和服务端创建任务时的限制。

## 服务端并发规则

并发规则改为按 tab 独立限制：

- `origin_tab: "studio"`：最多 1 个 active job。
- `origin_tab: "library"`：最多 1 个 active job。
- 未来如果雅匠 tab 出现生成入口，可扩展为 `origin_tab: "experts"`，同样最多 1 个 active job；当前雅匠没有生成入口，不在本次实现范围内。

因此当前最多可能同时存在 2 个任务：1 个画案 tab job 加 1 个藏卷 tab job。这个规则保证藏卷调整不会导致画案不可用，画案生成或画案内调整也不会导致藏卷不可用，同时每个 tab 自身生成中不能再次发起该 tab 的生成或调整。

服务端需要能区分 job 归属 tab。建议为创建请求和 job 增加 tab 来源字段，并保留操作类型用于展示和诊断：

- `origin_tab: "studio"`：任务归属画案 tab。
- `origin_tab: "library"`：任务归属藏卷 tab。
- `operation: "create"`：首次生成作品。
- `operation: "adjust"`：基于结果调整生成。

`/api/generations` 接收 `origin_tab` 和 `operation`。画案主流程传 `origin_tab: "studio"`、`operation: "create"`。结果页调整按当前 URL 的 source tab 传 `origin_tab`，并传 `operation: "adjust"`。未传 `origin_tab` 的旧请求按 `studio` 处理，未传 `operation` 的旧请求按 `create` 处理，保持主生成入口的默认行为可理解。

`operation` 在 loading 体验里只分 `create` 和 `adjust` 两类。`/api/records/:id/fusion` 如果仍作为独立后端任务存在，也要携带发起 tab 的 `origin_tab`；它的 loading 体验沿用触发它的用户操作：首次生成链路中的自动融合仍按 `create` 展示，结果页追加效果图或调整链路中的融合按 `adjust` 展示。

超限响应需要区分原因：

- 当前 tab 池满：返回该 tab 正在生成中的错误码或现有 active job。
- 文案按 tab 展示，例如画案显示“画案正在生成中”，藏卷显示“藏卷正在生成中”。

## 图片资产

生成中页面使用由 agent 图片生成能力创建的阶段图片组。图片组也按 `operation` 区分，而不是按 tab 区分。每个 loading 阶段准备 3-5 张候选图。

首次生成 `operation: "create"`：

- 构思阶段：偏留白、案头、墨砚、构思氛围。
- 张开纸张阶段：宣纸、画案、铺纸动作或纸面展开氛围。
- 绘画阶段：笔触、墨色铺开、纸上成形的绘画过程。
- 完善细节阶段：局部笔墨、淡彩、收笔、整理细节氛围。

调整作品 `operation: "adjust"`：

- 理解原作阶段：对照原作、局部观察、案头审稿氛围。
- 推敲调整方向阶段：批注、局部草稿、构图比较氛围。
- 重绘笔墨阶段：局部重绘、笔触修正、墨色补写氛围。
- 修整新稿阶段：收笔、细节协调、新稿整理氛围。

图片应是低干扰的氛围图，支持中文水墨审美，不包含文字、水印、品牌、具体艺术家署名或仿作特征。每个阶段内部随机选择候选图，随机结果可在当前 job session 内保持稳定；刷新恢复时可以根据 `jobId` 或 session seed 稳定选择，避免刷新后图片频繁变化。

接入方式遵循项目现有前端资产方式。资产文件需要有稳定路径，并在测试和生产构建中可访问。

## 国际化

新增文案需要覆盖 `zh-Hans`、`zh-Hant` 和 `en`：

- `create` 和 `adjust` 两套阶段文案
- 约 30 秒提示
- 失败标题
- 失败说明
- 重试按钮
- 结果页 browser back 二次确认文案
- 当前 tab 池满提示

现有“当前已有 2 个生成任务”文案不再作为本次 tab 限制的主要提示，可在兼容旧错误或全局兜底错误时保留。

## 测试与验证

前端测试：

- 画案提交后画案 tab 显示生成中页面，并且生成按钮不再可见。
- 画案结果页调整后画案 tab 显示生成中页面。
- 藏卷结果页调整后藏卷 tab 显示生成中页面。
- `create` loading 显示首次生成文案和图片组，`adjust` loading 显示调整文案和图片组。
- 生成中切换到底部其他 tab，再回发起 tab，生成中页面仍存在。
- 页面刷新后，如果服务端返回对应 tab active job，继续显示该 tab 生成中页面。
- 生成失败后留在发起 tab 的生成中页面位置，并显示重试入口。
- 生成成功后，用户在其他 tab 时不被强制跳转；回发起 tab 后看到结果。
- 画案任务成功后结果路由使用 `from=studio`，藏卷任务成功后结果路由使用 `from=library`，藏卷列表包含新结果。
- 结果页 browser back 弹二次确认；确认返回发起 tab 的安全页面，取消留在结果页。

后端测试：

- 同一用户只能创建 1 个 `origin_tab: "studio"` active job。
- 同一用户只能创建 1 个 `origin_tab: "library"` active job。
- 同一用户可以同时拥有 1 个画案 active job 和 1 个藏卷 active job。
- 画案 tab 池满不阻塞藏卷 job，只要藏卷池为空。
- 藏卷 tab 池满不阻塞画案 job，只要画案 tab 池为空。
- 当前 tab 池满返回可区分的错误语义和现有 active job。

E2E 测试：

- 移动端完成画案流程后进入生成中页面。
- 从画案结果页发起调整后，画案 tab 进入调整 loading；切到藏卷不受影响，回画案仍显示 loading 或结果。
- 从藏卷打开作品并发起调整后，藏卷 tab 进入调整 loading；切到画案不受影响，回藏卷仍显示 loading 或结果。
- Loading 页 browser back 不回到提交前页面。
- 完成后结果页 browser back 需要二次确认。
- 底部 tab 在 loading 期间可切换。

验证命令：

- `npm test --workspace client`
- `npm test --workspace server`
- `npm run e2e`，如果本地端口或真实生成依赖阻塞，需要明确说明跳过原因

## 非目标

- 不改变真实图片生成耗时。
- 不显示真实进度百分比。
- 不让生成完成时强制打断用户当前所在 tab。
- 不把 localStorage 作为并发控制依据。
- 不在本次实现中为雅匠 tab 增加生成入口。
