# SQLite 存储替换设计

## 目标

将 Inkspire 后端的记录、作品库索引和生产订单从文件 JSON 索引迁移到 SQLite，满足当前上线目标：至少保存 10 万用户数据，并支持至少 100 个在线用户并发访问。

本次只替换持久化层，不改变 API 响应结构、前端字段名、生成任务流程、图片文件路径和生产订单接口。

## 非目标

- 不把图片二进制写入数据库。`artwork.webp`、`fusion.webp`、`source-photo.webp` 继续存放在 `data/records/<id>/`。
- 不引入 PostgreSQL 或多数据库抽象。
- 不做旧 JSON 文件删除或不可逆迁移。
- 不改变用户 cookie 身份模型。

## 当前问题

当前 `server/src/storage.js` 使用 `library.json`、`libraries/<userId>.json`、`active-records.json`、`records/<id>/record.json` 和 `orders/<id>.json` 组合保存数据。上一轮已降低了全局索引和启动扫描风险，但它仍然是文件索引模型：

- 单进程内可以串行化写入，但跨进程或未来多实例没有事务边界。
- 用户作品库、active cleanup 和订单查询依赖多个文件一致性。
- 10 万用户规模下，文件数量、目录遍历、备份和恢复成本会继续上升。

SQLite 能提供事务、索引和单文件备份，同时保持部署复杂度低。

## 依赖与配置

新增服务端依赖：

- `better-sqlite3`

数据库文件默认路径：

- `${INKSPIRE_DATA_DIR || data}/inkspire.db`

测试仍使用临时目录，不需要外部数据库服务。

## 模块边界

保留当前 storage 对外接口：

- `ensureStore()`
- `saveRecord(record, userId)`
- `getRecord(id)`
- `getRecordForUser(id, userId)`
- `listLibrary(userId)`
- `saveProductionOrder(order, userId)`
- `productionOrderExists(id)`
- `getProductionOrder(id)`

`server/src/app.js` 和 `server/src/jobs.js` 不直接感知 SQLite。图片路径校验函数继续留在 `storage.js` 或相邻模块中，保持 API 图片读取逻辑不变。

## 数据库 Schema

### `meta`

```sql
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

用于保存 `schema_version` 和 JSON 迁移标记。

### `records`

```sql
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  type TEXT,
  title TEXT NOT NULL DEFAULT '',
  thumbnail_path TEXT,
  has_fusion INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle',
  fusion_status TEXT,
  generation_complexity TEXT,
  record_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_user_created
  ON records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_records_status
  ON records(status);

CREATE INDEX IF NOT EXISTS idx_records_fusion_status
  ON records(fusion_status);
```

`record_json` 保存完整记录，列字段保存列表查询和 active cleanup 的热路径字段。

### `production_orders`

```sql
CREATE TABLE IF NOT EXISTS production_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  record_id TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  order_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON production_orders(user_id, created_at DESC);
```

订单详情仍从 `order_json` 返回，保持接口兼容。

## 行为设计

### 初始化

`ensureStore()` 执行：

1. 创建 `dataDir`、`records/`、`uploads/` 相关目录。
2. 打开或创建 `inkspire.db`。
3. 执行 schema migration。
4. 如果 `meta.json_imported` 不存在，执行一次旧 JSON 导入。
5. 执行 stale active cleanup。

初始化需要用单个 promise 防止并发请求重复执行。

### 保存记录

`saveRecord(record, userId)`：

1. 校验 record id。
2. 如传入 `userId` 且记录没有 `user_id`，写入 owner。
3. 生成 summary 字段。
4. 在 SQLite transaction 中 upsert `records`。

不再维护 `library.json`、`libraries/<userId>.json` 和 `active-records.json`。

### 读取作品库

`listLibrary(userId)`：

- 有 userId：查询 `user_id = ? OR user_id = ''`，按 `created_at DESC` 排序。
- 无 userId：只查询 legacy 记录 `user_id = ''`。

返回值仍是现有 summary 结构。

### 读取单条记录

`getRecord(id)`：

- 主键查 `records.record_json`。
- 缺失时抛出文件实现等价的 not found/ENOENT 语义，保持现有调用测试兼容。

`getRecordForUser(id, userId)`：

- 读取完整记录后沿用 `!record.user_id || record.user_id === userId` 访问规则。

### stale active cleanup

启动时只查询数据库：

```sql
SELECT record_json
FROM records
WHERE status IN ('queued', 'running')
   OR fusion_status IN ('queued', 'running');
```

对 active 记录按现有逻辑：

- 如果 `artwork_path` 对应文件存在，主状态可标记为 `succeeded`。
- 否则标记为 `failed`，写入 `generation_interrupted` 诊断。
- `fusion_status` 的 queued/running 一律标记为 `failed`。

cleanup 后通过 `saveRecord()` 回写数据库。

### 生产订单

`saveProductionOrder(order, userId)` 在 transaction 中 upsert `production_orders`。

`productionOrderExists(id)` 使用主键存在性查询。

`getProductionOrder(id)` 读取 `order_json`，并保持 `/api/production-orders/:id` 中的用户访问校验。

## 旧 JSON 导入

导入只在数据库为空且 `meta.json_imported` 不存在时运行：

1. 扫描 `records/*/record.json`。
2. 能解析且 id 合法的记录写入 `records`。
3. 扫描 `orders/*.json`。
4. 能解析且 id 合法的订单写入 `production_orders`。
5. 写入 `meta.json_imported = <ISO timestamp>`。

遇到单个损坏 JSON 文件：

- 跳过该文件。
- 不阻断服务启动。

旧 JSON 文件保留，避免不可逆迁移。后续如需要清理，应单独做人工确认的迁移脚本。

## 测试策略

服务端测试优先覆盖 storage 层：

- `ensureStore` 创建 SQLite 数据库和 schema。
- `saveRecord` 写入后 `getRecord`、`listLibrary` 行为不变。
- 并发 `saveRecord` 不丢记录。
- `listLibrary(userId)` 不依赖旧 JSON library 文件。
- stale cleanup 只查询 active 状态记录。
- 旧 JSON records/orders 可一次性导入。
- 损坏 JSON 迁移文件不会阻断启动。
- 生产订单 id 冲突检测继续可测。

API 层沿用现有 `app.test.js`，确保路由行为不变。

验证命令：

```powershell
npm test --workspace server
npm test
```

如只改后端 storage，不要求运行 `npm run e2e`。

## 上线与回滚

上线前：

1. 备份整个 `INKSPIRE_DATA_DIR`。
2. 首次启动自动导入旧 JSON。
3. 通过 `/api/health` 确认服务可用。
4. 抽查历史记录、作品库和生产订单。

回滚：

- 因旧 JSON 文件保留，短期内可切回旧代码读取旧 JSON。
- 回滚窗口内新写入 SQLite 的数据不会自动写回 JSON；如需要长期双向回滚，应另做导出脚本。本次不实现双写。

## 主要风险

- `better-sqlite3` 是原生模块，安装环境需要能安装对应预编译包或具备构建工具。
- SQLite 适合当前单机部署；多机器共享同一个 DB 文件不是目标。
- 单进程内 100 在线访问足够，但大量真实 Codex 图像生成仍受 job manager 的全局并发限制控制。
