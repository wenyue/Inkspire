# 蓝区 AI 参考选项图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将蓝区选项图从“直接裁切历史作品”改为“每个选项选择相关历史名作作为参考，再由 AI 绘制统一缩略图”，并清除书法/绘画参考混用。

**Architecture:** 保持 `config/questions.json` 的 `option_preview_images` 路径不变，只替换 `client/public/previews/options/*.webp` 资产。每个问题生成一张 AI 联系图，按选项顺序切分成 `320x240` WebP；同时更新 `.tmp-codex/selector-assets/sources.json`，把蓝区记录为 AI 生成资产和参考名作，而不是直接源图裁切。

**Tech Stack:** 内置 `image_gen` 生成位图；Node.js + Sharp 切分、压缩、资产审计；Vitest、Node test、Playwright e2e 验证。

---

### Task 1: 明确参考边界

**Files:**
- Modify: `.tmp-codex/selector-assets/sources.json`
- Modify: `.tmp-codex/selector-assets/build-selector-assets.cjs`

- [x] **Step 1: 绘画选项只参考绘画或对应雅物**

国画题材、笔墨、设色、气质、形制选项只使用中国画、花鸟、人物、走兽游鱼、文房雅物、山水形制相关参考。不得使用法书/碑帖作为绘画选项参考。

- [x] **Step 2: 书法选项只参考法书、碑帖和纸墨**

书体、气息、章法、纸墨选项只使用书法碑帖、法书手卷、书法册页、纸墨材质参考。不得使用山水、花鸟、人物画作为书法选项参考。

### Task 2: 生成蓝区 AI 联系图并切分

**Files:**
- Create: `.tmp-codex/selector-assets/ai-sheets/*.png`
- Modify: `client/public/previews/options/*.webp`

- [x] **Step 1: 每题生成一张 AI 联系图**

生成 10 张联系图：

```text
work-type: 国画 / 书法
painting_subject: 山水 / 花鸟 / 人物 / 走兽游鱼 / 文房雅物
painting_brushwork: 工笔 / 写意 / 白描 / 没骨
painting_palette: 水墨 / 青绿 / 浅绛 / 重彩
painting_mood: 清雅 / 空灵 / 雄浑 / 古拙 / 明丽
painting_format: 横幅 / 立轴 / 斗方 / 手卷 / 扇面
calligraphy_script: 楷书 / 行书 / 草书 / 隶书 / 篆书
calligraphy_spirit: 端庄 / 俊逸 / 雄强 / 古拙 / 温润
calligraphy_layout: 立轴 / 横幅 / 斗方 / 手卷 / 册页
calligraphy_material: 素宣 / 仿古 / 洒金 / 碑拓
```

每张联系图要求分格清楚、无文字标签、无水印、无现代 UI。生成后按格子切成选项图。

- [x] **Step 2: 切分为统一 WebP**

使用 Sharp 将每格输出为 `320x240` WebP，并覆盖现有 `client/public/previews/options/*.webp`。

### Task 3: 资产审计

**Files:**
- Modify: `.tmp-codex/selector-assets/sources.json`
- Create/Modify: `.tmp-codex/selector-assets/option-contact.png`

- [x] **Step 1: 写入 AI 参考清单**

`sources.json` 中每个 `optionSources` 项记录：

```json
{
  "output": "previews/options/painting-subject-0-landscape.webp",
  "assetMode": "ai_generated_from_historical_reference",
  "referenceType": "painting",
  "title": "参考作品名",
  "artist": "作者",
  "page": "来源链接",
  "promptRole": "用于参考题材、构图或笔墨，不直接裁切"
}
```

- [x] **Step 2: 尺寸和引用审计**

检查所有 `option_preview_images` 文件存在且尺寸为 `320x240`，并生成联系表人工查看。

### Task 4: 验证

**Files:**
- Modify only if tests expose real breakage.

- [x] **Step 1: 运行客户端测试**

Run:

```powershell
npm test --workspace client
```

- [x] **Step 2: 运行服务端测试**

Run:

```powershell
npm test --workspace server
```

- [x] **Step 3: 运行端到端测试**

Run:

```powershell
npm run e2e
```

### Self-Review

- 覆盖了用户要求：蓝区 AI 绘制，每个选项有历史名作参考，且绘画/书法严格分开。
- 不改问题流程和图片路径，避免扩大前端逻辑改动。
- 不做 git commit，遵守项目规则。
