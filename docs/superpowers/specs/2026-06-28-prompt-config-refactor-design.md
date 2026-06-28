# Prompt 配置化重构设计

## 背景

当前 `server/src/prompts.js` 同时承担三类职责：

- 保存大量 prompt 静态规则。
- 根据运行时记录、答案、尺寸估算结果拼接 prompt。
- 暴露 `buildArtworkPrompt`、`buildFusionPrompt`、`buildSizeEstimationPrompt` 给 `server/src/jobs.js` 使用。

这种结构让新规则容易以追加字符串的方式进入代码，后续修改会继续扩大 `prompts.js`，也不利于区分“产品规则”和“运行时数据注入”。

## 目标

- 保留现有三个导出函数，避免影响 `jobs.js` 的调用面。
- 把大部分静态 prompt 规则移动到 `config/prompts/*.json`。
- 新增 `config/prompts/sizeEstimationPrompt.json`，让尺寸和复杂度估算 prompt 也由配置驱动。
- 将 `server/src/prompts.js` 简化为配置渲染器和少量运行时字段注入逻辑。
- 保持现有生成行为合同：作品图只生成作品本身，融合图生成真实摆放效果，尺寸估算只返回 JSON。

## 不做事项

- 不拆分新的 `fusionPrompt.js`、`sizeEstimationPrompt.js` 或 `artworkPrompt.js`。
- 不改 `server/src/jobs.js` 的调用方式。
- 不改 API 字段、记录结构、生成队列、存储路径或 Codex runner。
- 不运行真实 Codex 生成作为本次重构的必要验证。

## 配置结构

`config/prompts/painting.json` 和 `config/prompts/calligraphy.json` 保留类型专属配置，新增结构化段落：

```json
{
  "system": "...",
  "brief": "创作一幅...",
  "sections": [
    {
      "title": "作品边界",
      "lines": [
        "只生成作品本身...",
        "作品内部的纸张、留白、笔墨、落款等按用户选择和作品类型生成。"
      ]
    }
  ]
}
```

`template` 可在实现中兼容为 `brief` 的旧名称，避免一次性破坏现有配置读取习惯。新规则优先写入 `brief` 和 `sections`。

`config/prompts/fusion.json` 保存融合图静态规则：

- `system`
- `brief`
- `sections`，例如“融合图要求”

融合图里的推荐尺寸、原始照片路径、艺术作品路径、参考图文件路径仍由代码在运行时注入，因为这些来自 record 和 job 上下文，不属于静态产品规则。

新增 `config/prompts/sizeEstimationPrompt.json` 保存估算 prompt 静态规则：

- `system`
- `responseRules`，例如只返回 JSON、不要 Markdown。
- `orientationRules`
- `schema`
- `sizeRules`
- `complexityRules`
- `recordSectionTitle`
- `answersSectionTitle`
- `rawAnswersSectionTitle`
- `notesSectionTitle`

schema 可以以 JSON 对象保存在配置里，由渲染器统一格式化为缩进 JSON。

## `prompts.js` 职责

`server/src/prompts.js` 保持唯一入口并导出：

- `buildArtworkPrompt`
- `buildFusionPrompt`
- `buildSizeEstimationPrompt`

文件内部只保留通用 helper 和最少业务装配：

- `fillTemplate(template, variables)`：替换 `{{key}}`，缺省值仍为 `由墨起决定`。
- `renderSections(sections, variables)`：渲染配置化段落，自动过滤空行。
- `answerLines(answers, labels)`：保留当前答案排序和中文 label 逻辑。
- `jsonBlock(value)`：把配置或运行时对象格式化为缩进 JSON。

`buildArtworkPrompt` 只负责：

1. 选择 `painting` 或 `calligraphy` 配置。
2. 渲染 `system`、`brief`、配置化 `sections`。
3. 注入用户选择、画面复杂度、推荐制作尺寸、最终方向、用户补充。

`buildFusionPrompt` 只负责：

1. 读取 `fusion` 配置。
2. 渲染静态系统提示和融合规则。
3. 注入推荐尺寸、record 路径和 reference image 路径。

`buildSizeEstimationPrompt` 只负责：

1. 读取 `sizeEstimationPrompt` 配置。
2. 注入最终方向、schema、record 摘要、用户答案、原始字段、用户补充。

## 数据流

`server/src/config.js` 继续加载 `config/prompts/*.json`，新增：

```js
sizeEstimationPrompt: readJson(path.join(configDir, "prompts", "sizeEstimationPrompt.json"))
```

调用路径保持：

```text
jobs.js
  -> prompts.js buildArtworkPrompt/buildFusionPrompt/buildSizeEstimationPrompt
    -> config.prompts.<type>
    -> rendered prompt string
      -> codexRunner.js
```

## 错误处理

- 未知作品类型仍抛出 `Unknown artwork prompt type: <type>`。
- `sizeEstimationPrompt` 缺失时抛出明确错误，避免静默回退到不完整 prompt。
- `fusion` 配置缺失时不再长期依赖代码内完整 fallback；实现可以保留短 fallback 只作为防御，但正式规则应来自配置。
- 空 section、空 line、空运行时路径会被过滤，不输出多余空段落。

## 测试策略

更新 `server/tests/prompts.test.js`：

- 断言 painting/calligraphy prompt 仍包含类型、用户答案、用户补充。
- 断言作品边界来自配置，并同时覆盖绘画和书法。
- 断言画面复杂度、推荐尺寸、最终方向仍输出。
- 断言 fusion prompt 仍包含真实摆放、非简单叠加、透视、阴影、路径和推荐尺寸。
- 断言 size estimation prompt 从 `sizeEstimationPrompt.json` 输出 JSON-only、schema、最终方向、答案和补充说明。

更新 `server/tests/config.test.js`：

- 断言 `config.prompts.sizeEstimationPrompt` 被加载。

验证命令：

```powershell
npm test --workspace server
```

`npm run verify:real` 不作为必跑项；本次重构不改变 Codex 调用方式或真实图片生成执行路径。

## 验收标准

- `prompts.js` 中不再保存大段静态 prompt 规则。
- 新增和现有静态规则主要位于 `config/prompts/*.json`。
- `config/prompts/sizeEstimationPrompt.json` 存在并被 `loadConfig()` 加载。
- `jobs.js` 不需要改调用接口。
- 服务端测试通过。
