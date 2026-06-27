# React Router 页面跳转与刷新恢复设计

## 目标

重新整理 Inkspire 页面之间的跳转关系，让页面位置由 URL 表达，并确保刷新页面不会重置到首页。只有当 URL 指向的页面资源已经不存在时，才回到对应 fallback 页。

本次重点解决已知问题：

```text
藏卷打开历史作品 -> 切到雅匠 -> 再切回藏卷
```

当前实现会回到藏卷首页；新设计要求回到刚才的历史作品页。

## 背景

当前 `App` 同时使用多份状态表达页面位置：

- `activeTab`
- `currentRecord`
- `recordViewOpen`
- `adjustOpen`
- `showProduction`
- `history.state`
- `localStorage`

这些状态会在不同入口被分别修改，导致页面位置、底部 tab 高亮、浏览器返回、刷新恢复和 tab 切换记忆之间容易不一致。

新设计不再继续补丁式维护这些组合状态，而是引入 React Router，让 URL 成为页面的唯一来源。

## 范围

包含：

- 引入 React Router 管理前端页面跳转。
- 用 URL 表达画案、藏卷、雅匠、作品结果、调整页、制作弹窗页。
- 每个底部 tab 记住自己的最后访问 URL。
- 刷新时根据 URL 恢复当前页面。
- 当 URL 指向的作品不存在时，按来源 tab fallback。
- 更新前端单元测试与 e2e 导航测试。

不包含：

- 修改后端 API。
- 修改作品存储格式。
- 修改生成、融合、下单业务逻辑。
- 重设计藏卷、画案、雅匠的视觉样式。

## 路由模型

基础路由：

```text
/studio
/library
/experts
/records/:recordId
/records/:recordId/adjust
/records/:recordId/production
```

作品相关路由使用 `from` query 参数记录来源 tab：

```text
/records/:recordId?from=studio
/records/:recordId?from=library
/records/:recordId?from=experts
/records/:recordId/adjust?from=library
/records/:recordId/production?from=experts
```

`from` 的合法值：

```ts
type SourceTab = "studio" | "library" | "experts";
```

当 `from` 缺失或非法时，默认按 `studio` 处理。

## Tab 高亮规则

底部 tab 不再由 `activeTab` 独立保存，而是从当前 URL 推导：

```text
/studio                              -> 画案
/library                             -> 藏卷
/experts                             -> 雅匠
/records/:id?from=studio             -> 画案
/records/:id?from=library            -> 藏卷
/records/:id?from=experts            -> 雅匠
/records/:id/adjust?from=library     -> 藏卷
/records/:id/production?from=experts -> 雅匠
```

这样从藏卷打开作品后，作品页仍属于藏卷上下文，底部高亮保持藏卷。

## 每个 Tab 的最后页面记忆

每个底部 tab 维护自己的最后 URL：

```ts
type TabRouteMemory = {
  studio: string;
  library: string;
  experts: string;
};
```

默认值：

```ts
const defaultTabRouteMemory = {
  studio: "/studio",
  library: "/library",
  experts: "/experts"
};
```

规则：

- 当前 URL 所属 tab 为 `library` 时，更新 `library` 的最后 URL。
- 当前 URL 所属 tab 为 `studio` 时，更新 `studio` 的最后 URL。
- 当前 URL 所属 tab 为 `experts` 时，更新 `experts` 的最后 URL。
- 点击底部 tab 时，跳转到该 tab 记住的最后 URL。
- 如果该 URL 无效或资源不存在，则跳到该 tab 的首页 fallback。

已知 bug 的新行为：

```text
/library
/records/record-1?from=library
/experts
点击“藏卷” -> /records/record-1?from=library
```

## 刷新恢复

刷新页面时，React Router 根据当前 URL 恢复页面。

当路由包含 `recordId` 时：

1. 调用 `getRecord(recordId)`。
2. 如果作品存在，渲染对应页面。
3. 如果作品不存在、接口 404 或读取失败，跳转到 fallback。

fallback 规则：

```text
from=studio  -> /studio
from=library -> /library
from=experts -> /experts
缺失或非法   -> /studio
```

确认规则：

- `/records/:id` 刷新后恢复作品结果页。
- `/records/:id/adjust` 刷新后恢复调整页。
- `/records/:id/production` 刷新后恢复作品页并打开制作弹窗。
- 只有作品不存在时才 fallback。

## 页面跳转关系

### 画案

```text
/studio
  -> 生成成功
  -> /records/:newRecordId?from=studio
```

在画案结果页点击底部画案 tab，保留现有“重开画案”语义，跳回 `/studio` 并重置画案流程。

### 藏卷

```text
/library
  -> 点击作品
  -> /records/:recordId?from=library
```

切到其它 tab 后再切回藏卷，应恢复藏卷最后 URL。如果最后 URL 是作品页，则回到该作品页。

### 雅匠

```text
/experts
  -> 用当前作品咨询
  -> /records/:recordId/production?from=experts
```

如果没有当前作品，则“去生成作品”跳到 `/studio`。

### 作品结果页

```text
/records/:recordId?from=...
  -> 调整作品
  -> /records/:recordId/adjust?from=...

/records/:recordId?from=...
  -> 制作作品
  -> /records/:recordId/production?from=...
```

### 调整页

```text
/records/:recordId/adjust?from=...
  -> 返回
  -> browser back

/records/:recordId/adjust?from=...
  -> 提交成功生成新作品
  -> replace /records/:newRecordId?from=...
```

提交成功使用 `replace`，避免浏览器返回回到已经提交过的调整表单。返回时应回到上一张作品。

### 制作弹窗页

```text
/records/:recordId/production?from=...
  -> 关闭
  -> browser back
```

制作弹窗是 URL 可恢复页面。刷新后继续显示制作弹窗。

## 数据加载与错误处理

作品页面统一使用一个记录加载边界：

```ts
type RecordRouteState =
  | { status: "loading" }
  | { status: "ready"; record: GenerationRecord }
  | { status: "missing" };
```

行为：

- `loading`：显示轻量加载态。
- `ready`：渲染 result / adjust / production。
- `missing`：按 `from` fallback。

客户端缓存可以保留 `recordCacheRef` 或改为普通 state map，但缓存不是页面来源。URL 才是页面来源。

## 组件拆分

建议把当前 `App` 的页面控制逻辑拆成几个边界：

```text
App
  RouterProvider / BrowserRouter
  AppShell
    Topbar
    RoutedMain
    BottomTabs

RoutedMain
  StudioRoute
  LibraryRoute
  ExpertsRoute
  RecordResultRoute
  AdjustRoute
  ProductionRoute
```

`AppShell` 负责公共顶部、底部导航和 tab 记忆。

`RecordResultRoute`、`AdjustRoute`、`ProductionRoute` 复用同一个 record loader。

## 持久化

保留：

- `inkspire.locale`
- `inkspire.studioDraft.v1`
- 当前用户相关的后端 job / library 数据

新增：

```text
inkspire.tabRouteMemory.v1
```

移除或停止依赖：

- `inkspire.activeTab`
- `inkspire.currentRecordId`

如果为了兼容旧数据需要迁移：

- 首次启动时可以读取旧 `activeTab/currentRecordId` 生成初始 URL。
- 迁移完成后以后不再写旧 key。

## 浏览器历史规则

- 普通点击跳转使用 `navigate(path)`，形成历史。
- 调整提交成功使用 `navigate(path, { replace: true })`。
- 弹窗关闭、调整返回使用 `navigate(-1)`。
- 页面刷新不改变历史，只按 URL 重建页面。

## 测试计划

前端单元测试：

- `/records/record-1?from=library` 高亮藏卷。
- 藏卷打开作品后，切雅匠再切回藏卷，仍显示作品页。
- 刷新 `/records/record-1?from=library` 后恢复作品页。
- 刷新 `/records/missing?from=library` 后 fallback 到藏卷首页。
- 刷新 `/records/record-1/production?from=library` 后恢复制作弹窗。
- 调整提交成功 replace 到新作品页，返回回到上一张作品。
- 旧 `activeTab/currentRecordId` 只做一次兼容迁移，不再作为页面来源。

E2E：

- 完整生成流程仍可进入作品页。
- 从藏卷打开作品后 tab 高亮藏卷。
- 藏卷作品页 -> 雅匠 -> 藏卷，仍回到作品页。
- production URL 刷新后仍显示制作弹窗。

验证命令：

```text
npm test --workspace client
npm run e2e
```

## 风险

- `App.tsx` 当前集中承载大量状态，路由化会触及较多调用点。需要先用测试锁住行为，再逐步拆分。
- React Router 引入后，测试需要使用 router-aware render helper。
- 旧 localStorage 数据需要兼容一次，避免用户升级后直接丢失当前页面。
- production 弹窗内部如果还有子页面状态，第一阶段只恢复主弹窗；若后续要恢复尺寸子页，需要把子页也编码进 URL。

## 实施建议

分阶段做：

1. 引入 React Router 和基础路由，但不改业务 UI。
2. 把底部 tab 切换改为 URL 导航。
3. 把作品页、调整页、制作弹窗页改为 URL 页面。
4. 加入 tabRouteMemory。
5. 加入刷新恢复和 missing fallback。
6. 删除旧的页面来源状态。
7. 跑完整前端测试和 e2e。

