# 画案选择分类与经典图片资产实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重设画案选择问题体系，删除“由墨起决定”，让每题选项数量按内容合理分布，并用国画风格红区主图与经典作品/碑帖蓝区选项图提升审美。

**Architecture:** 问题流程继续由 `config/questions.json` 和 `client/src/domain.ts` 驱动，`Studio.tsx` 保持现有单张红区主图和蓝区选项图渲染。资产继续放在 `client/public/previews/questions/` 与 `client/public/previews/options/`，红区主图为生成的统一国画风概念图，蓝区选项图来自可核验的开放馆藏或公有领域经典作品局部。

**Tech Stack:** React 18 + TypeScript + Vitest/jsdom；Node.js + Sharp；静态 WebP 资产；开放馆藏图片下载与本地裁切压缩。

---

### Task 1: 重设问题配置和测试期望

**Files:**
- Modify: `config/questions.json`
- Modify: `client/tests/domain.test.ts`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 更新国画问题**

将国画分支改为五题：

```text
painting_subject: 山水、花鸟、人物、走兽游鱼、文房雅物
painting_brushwork: 工笔、写意、白描、没骨
painting_palette: 水墨、青绿、浅绛、重彩
painting_mood: 清雅、空灵、雄浑、古拙、明丽
painting_format: 横幅、立轴、斗方、手卷、扇面
```

所有语言保留 `zh-Hans`、`zh-Hant`、`en`，删除 `default_option` 和所有“由墨起决定”。

- [ ] **Step 2: 更新书法问题**

将书法分支保留正文输入，并改为四题：

```text
calligraphy_script: 楷书、行书、草书、隶书、篆书
calligraphy_spirit: 端庄、俊逸、雄强、古拙、温润
calligraphy_layout: 立轴、横幅、斗方、手卷、册页
calligraphy_material: 素宣、仿古、洒金、碑拓
```

所有语言保留 `zh-Hans`、`zh-Hant`、`en`，删除 `default_option` 和所有“由墨起决定”。

- [ ] **Step 3: 更新流程测试**

调整 `client/tests/domain.test.ts` 中完整答案字段，使用新的题目 id 与选项值：

```ts
const paintingAnswers = {
  work_type: "painting",
  painting_subject: "山水",
  painting_brushwork: "写意",
  painting_palette: "水墨",
  painting_mood: "清雅",
  painting_format: "立轴"
};
```

书法未完成测试使用：

```ts
const calligraphyAnswers = {
  work_type: "calligraphy",
  calligraphy_script: "行书",
  calligraphy_spirit: "俊逸",
  calligraphy_layout: "立轴",
  calligraphy_material: "素宣"
};
```

- [ ] **Step 4: 更新组件测试夹具**

在 `client/tests/app.test.tsx` 内把本地 mock config 中的旧选项、旧图片路径和 `default_option` 移除，覆盖可变选项数量与主图单图行为。

- [ ] **Step 5: 运行客户端测试确认配置行为**

Run:

```powershell
npm test --workspace client
```

Expected: 测试通过，若旧测试仍引用“由墨起决定”或旧问题 id，则继续修正测试与配置引用。

### Task 2: 准备经典作品蓝区选项图

**Files:**
- Modify/Create: `client/public/previews/options/*.webp`
- Create: `.tmp-codex/selector-assets/sources.json`

- [ ] **Step 1: 建立源图清单**

从开放馆藏或公有领域来源收集图片 URL、作品名、作者/年代、来源链接和目标选项。优先使用 Met Open Access、Cleveland Museum of Art Open Access、Smithsonian Open Access、Princeton University Art Museum public domain、Wikimedia Commons 公有领域页面。

- [ ] **Step 2: 下载源图到临时目录**

源图只存放在 `.tmp-codex/selector-assets/raw/`，不作为交付资产。

- [ ] **Step 3: 裁切并压缩选项图**

用 `sharp` 输出 `320x240` WebP，保留纸边与主体，避免过度裁切。文件名与 `config/questions.json` 中的 `option_preview_images` 一一对应。

- [ ] **Step 4: 校验选项图**

用脚本读取所有配置引用图片，确认文件存在、尺寸为 `320x240`，且没有旧的 `inkspire-decide` 文件仍被引用。

### Task 3: 生成国画风红区主图

**Files:**
- Modify/Create: `client/public/previews/questions/*.webp`

- [ ] **Step 1: 为每题生成红区主图**

每张红区主图是完整国画风概念图，不使用选项图拼接。可以做连续画卷式自然分区，但画面必须是一张连贯的作品。

- [ ] **Step 2: 压缩为移动端友好尺寸**

用 `sharp` 输出 `1024x576` WebP，核心信息放在中央安全区，避免手机短屏裁掉主体。

- [ ] **Step 3: 校验主图**

确认 `work-type`、国画五题、书法正文输入、书法四题的 `preview_image` 都存在且尺寸正确。

### Task 4: 验证和视觉核验

**Files:**
- No code files unless verification exposes defects.

- [ ] **Step 1: 运行客户端测试**

Run:

```powershell
npm test --workspace client
```

Expected: PASS.

- [ ] **Step 2: 运行端到端测试**

Run:

```powershell
npm run e2e
```

Expected: PASS.

- [ ] **Step 3: 启动本地页面并视觉检查**

启动开发服务，打开手机视口，检查：

```text
入口页红区不是左右拼图；
国画每题红区是国画风完整主图；
蓝区选项图来自经典画作或碑帖，不是生成图；
书法蓝区没有江湖风、招牌字、粗暴大字；
每题选项数量为 4 或 5，且无“由墨起决定”。
```

### Self-Review

- 已覆盖用户确认的分类重设、删除“由墨起决定”、选项数量不固定、红区国画风单图、蓝区经典作品图。
- 未引入运行时远程图片服务，资产仍为静态 WebP。
- 不包含 git commit 步骤，因为项目规则禁止未经用户明确要求自动执行 git 操作。
