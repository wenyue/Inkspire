# 古代名作参考创作设计

## 背景

现有 Studio 创作入口有两种方式：国画和书法。用户希望新增第三种方式：进入后浏览 100 张风格各异的古代名作，按类似小红书的双排瀑布流选择作品。用户点击作品后看到大图、选择按钮和作品介绍；选择后跳过国画/书法中的风格选择环节，直接进入上传效果图步骤，后续步骤与现有流程一致。

已确认的产品约束：

- 作品范围只包含古代绘画：以中国古代绘画为主，少量加入日本、朝鲜等东亚古画；不收录以书法为主体的作品。
- 这 100 张作品必须是真实古代名作，不是纯占位清单。
- 展示图只显示作品本身，不显示画框、展墙、相框或博物馆陈列背景。
- 可以用 AI 做轻度处理，但只限去边框、修复污损、统一白平衡、曝光、纸色和对比度；不改变原作构图、内容和笔墨。
- 用户选择名作后，生成的是参考该名作的新作品，不是直接复制或复刻原作。

## 推荐方案

采用独立第三入口方案：首屏把 `国画 / 书法 / 古代名作` 并列展示。用户点击 `古代名作` 后进入独立的名作选择器，而不是把 100 张名作塞进现有国画风格问题。

内部生成仍复用 `painting` 类型，不新增后端作品类型。选择名作后，前端把选择信息写入 `answers`，并设置：

```json
{
  "work_type": "painting",
  "creation_mode": "classic_reference",
  "classic_artwork_id": "fan-kuan-travelers",
  "classic_artwork_title": "溪山行旅图",
  "classic_artwork_artist": "范宽",
  "classic_artwork_period": "北宋",
  "classic_artwork_region": "中国",
  "classic_artwork_category": "山水",
  "classic_artwork_reference": "以山体结构、笔墨层次、空间经营和沉雄气象为参考，生成新的作品。"
}
```

这样可以让图库、制作订单、效果图生成和现有 painting prompt 流程继续工作，同时明确区分普通国画问答和古代名作参考创作。

## 前端流程

### 首屏入口

`WORK_TYPE_QUESTION` 从两项扩展为三项：

- 国画：进入现有 painting 问题流。
- 书法：进入现有 calligraphy 问题流。
- 古代名作：进入 `ClassicArtworkPicker`。

第三入口在选择作品前可以使用临时流程值 `work_type: "classic_reference"` 来驱动 Studio 显示名作选择器。用户点 `选择此作品` 后，前端把答案改写为最终生成态：`work_type: "painting"`、`creation_mode: "classic_reference"`，并写入所选作品元数据。也就是说，`classic_reference` 只存在于前端选择器阶段；提交生成、保存记录和后续制作流程仍使用 `painting`。

### 名作列表

`ClassicArtworkPicker` 使用独立视图：

- 移动端固定双列瀑布流。
- 桌面端可以维持双列，也可以在足够宽时扩展为三列，但默认视觉仍以双排浏览为主。
- 卡片展示处理后的作品图、标题、作者/年代短信息。
- 图片展示应避免裁掉主体。卡片可以用固定列宽和自然高度形成瀑布流，而不是强制统一比例裁切。
- 第一版提供分类筛选：山水、花鸟、人物、佛道、宫廷/风俗、日本绘画、朝鲜绘画。搜索不进入第一版范围。

如果图片加载失败，列表卡片显示标题和作者占位，不阻断用户打开详情。

### 作品详情

点击列表卡片后进入详情视图：

- 大图完整展示作品本体。
- 显示标题、作者、年代、地域、分类。
- 显示 80-120 字中文介绍。
- 显示主按钮 `选择此作品`。

选择后写入答案并直接跳到现有 `photo` 步骤。此时不会出现 `painting_subject`、`painting_brushwork`、`painting_palette`、`painting_mood`、`painting_format`，也不会进入书法问题。

### 返回与状态

返回规则接入现有 Studio URL step 和上一步逻辑：

- 从详情返回列表。
- 从列表返回首屏三选一。
- 选择作品后进入 photo 步骤；从 photo 上一步应回到名作详情或列表，并保留已选择作品上下文。
- 本地草稿需要保存名作选择状态，避免刷新后回到错误步骤。

## 数据与素材

新增配置文件：`config/classic-artworks.json`。

每条记录包含：

- `id`：稳定唯一 id。
- `title`：本地化标题，包含 `zh-Hans`、`zh-Hant`、`en`。
- `artist`：作者，可本地化；无名氏使用“佚名”。
- `period`：年代或朝代。
- `region`：地域，例如中国、日本、朝鲜。
- `category`：分类。
- `description`：本地化介绍，中文约 80-120 字。
- `image`：处理后的大图路径。
- `thumbnail`：缩略图路径；如果不生成独立缩略图，可先指向大图。
- `reference_focus`：给生成 prompt 使用的参考重点。
- `source_note`：来源或处理备注。

素材比例建议：

- 中国古代绘画约 80 张。
- 日本、朝鲜等东亚古画约 20 张。
- 覆盖山水、花鸟、人物、佛道题材、宫廷/风俗、手卷、册页、屏风等绘画形制与题材。题跋、印章可以作为绘画作品的一部分保留，但不选择以书法为主体的名作。

图片放在 `client/public/classic-artworks/`，建议输出 WebP。大图长边建议 1400-1800px，缩略图可按瀑布流需要另出较小版本。每张图都应只包含作品本体，不包含画框、展墙、相框或扫描黑边；修复和统一色调时保留完整构图，不为了统一比例裁掉主体。

如果某件作品无法获得足够清晰、可处理为作品本体的图，应替换作品，不用低质图硬凑。

## 后端与 Prompt

API 不新增必需字段，继续通过 `answers` 承载名作选择信息。`createGeneration()` 提交时：

- `type` 仍为 `painting`。
- `answers.work_type` 仍为 `painting`。
- `answers.creation_mode` 为 `classic_reference`。
- `answers` 中包含所选名作元数据。

`server/src/prompts.js` 中 `buildArtworkPrompt()` 需要识别 classic reference answers，并在现有用户选择信息之外加入“古代名作参考”段，内容包括：

- 参考作品：标题、作者、年代、地域、分类。
- 参考重点：构图、笔墨、设色、气韵、空间关系。
- 生成约束：生成一幅新的 Inkspire 中国画或东亚绘画作品，不直接复制原作。
- 展示约束：不要画框、展墙、相框、博物馆陈列背景。

后续 fusion 仍按现有逻辑工作。用户上传环境图后，真实摆放的是生成出来的新作品图，而不是直接把名作图片贴进环境。

标题生成第一版可以保持现有 painting title 逻辑；如果需要更强识别度，后续可以让标题池读取 `classic_artwork_title` 生成类似 `临古·溪山清韵` 的标题。

## 测试与验收

前端测试：

- 首屏出现 `国画 / 书法 / 古代名作` 三个入口。
- 点击 `古代名作` 后出现作品瀑布流，至少渲染配置里的 100 条作品。
- 点击作品进入详情，显示大图、标题、作者/年代、介绍和 `选择此作品`。
- 点击选择后直接进入上传效果图步骤，不出现国画或书法风格问题。
- 生成请求里 `type` 是 `painting`，`answers.creation_mode` 是 `classic_reference`，并包含所选作品元数据。
- 返回行为符合列表、详情、photo 步骤之间的状态预期。

后端测试：

- `buildArtworkPrompt()` 对 classic reference answers 输出名作参考段。
- Prompt 明确要求生成新作品，不直接复制原作。
- Prompt 明确排除画框、展墙、相框、博物馆陈列背景。
- 现有 painting 和 calligraphy prompt 测试不回归。

素材验收：

- `config/classic-artworks.json` 正好 100 条。
- id 唯一，必填字段完整。
- 每条图片路径存在于 `client/public/classic-artworks/`。
- 抽查图片只显示作品本体，无画框、展墙、相框或扫描黑边。
- 色调统一，不出现明显偏色、曝光极端或纸色突兀。

推荐验证命令：

```bash
npm test --workspace client
npm test --workspace server
npm run e2e
```

如果实现只改到前端流程和 prompt，至少运行 client 与 server 测试；如果调整响应式瀑布流、导航、上传或完整生成流程，应运行 e2e。

## 范围边界

第一版不做：

- 搜索。
- 用户收藏名作。
- 用户上传自定义参考名作。
- 外链图片运行时加载。
- 直接复刻名作作为最终作品。
- 把 classic reference 作为新的后端 `WorkType`。

这些功能可以在基础流程稳定后再单独设计。
