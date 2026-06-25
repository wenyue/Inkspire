import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { getProgressLabel } from "../src/components/Studio";

function generationRequestBodies(): Array<Record<string, unknown>> {
  return vi.mocked(fetch).mock.calls
    .filter(([input]) => String(input).endsWith("/api/generations"))
    .map(([, init]) => init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
}

const publicConfig = {
  questions: {
    painting: [
      {
        id: "painting_subject",
        applies_to: ["painting", "fusion"],
        preview_image: "/previews/questions/painting-subject.webp",
        option_preview_images: [
          "/previews/options/painting-subject-0-landscape.webp",
          "/previews/options/painting-subject-1-birds-flowers.webp",
          "/previews/options/painting-subject-2-figures.webp",
          "/previews/options/painting-subject-3-inkspire-decide.webp"
        ],
        preview_prompt: {
          "zh-Hans": "中国画主题选择，留白构图",
          "zh-Hant": "中國畫主題選擇，留白構圖",
          en: "Painting subject preview"
        },
        title: {
          "zh-Hans": "想画什么主题？",
          "zh-Hant": "想畫什麼主題？",
          en: "What subject should the painting show?"
        },
        options: {
          "zh-Hans": ["山水", "花鸟", "人物", "由墨起决定"],
          "zh-Hant": ["山水", "花鳥", "人物", "由墨起決定"],
          en: ["Landscape", "Birds and Flowers", "Figures", "Let Inkspire decide"]
        },
        default_option: "由墨起决定"
      }
    ],
    calligraphy: [
      {
        id: "calligraphy_script",
        applies_to: ["calligraphy", "fusion"],
        preview_image: "/previews/questions/calligraphy-script.webp",
        option_preview_images: [
          "/previews/options/calligraphy-script-0-regular.webp",
          "/previews/options/calligraphy-script-1-running.webp",
          "/previews/options/calligraphy-script-2-cursive.webp",
          "/previews/options/calligraphy-script-3-inkspire-decide.webp"
        ],
        preview_prompt: {
          "zh-Hans": "书法字体选择，行草楷隶",
          "zh-Hant": "書法字體選擇，行草楷隸",
          en: "Calligraphy script preview"
        },
        title: {
          "zh-Hans": "偏好哪种书体？",
          "zh-Hant": "偏好哪種書體？",
          en: "Which script do you prefer?"
        },
        options: {
          "zh-Hans": ["楷书", "行书", "草书", "由墨起决定"],
          "zh-Hant": ["楷書", "行書", "草書", "由墨起決定"],
          en: ["Regular", "Running", "Cursive", "Let Inkspire decide"]
        },
        default_option: "由墨起决定"
      }
    ]
  },
  experts: [
    {
      id: "wu_jiayin",
      name: "吴嘉茵",
      region: "广东省",
      bio: "中国书法家协会会员，中山大学中国美学博士，岭南书画领域青年艺术家。",
      phone: "",
      wechat: "",
      credentials: ["中国书法家协会会员", "中山大学中国美学博士"],
      sampleImages: [
        "/previews/options/calligraphy-script-1-running.webp",
        "/previews/options/painting-subject-0-landscape.webp"
      ],
      services: [
        {
          id: "expert_custom",
          name: {
            "zh-Hans": "专家定制",
            "zh-Hant": "專家定製",
            en: "Expert Custom"
          },
          description: {
            "zh-Hans": "专家直接创作或深度主导，价格更高。",
            "zh-Hant": "專家直接創作或深度主導，價格更高。",
            en: "The artisan creates directly or leads the work closely, with higher pricing."
          },
          priceEstimate: {
            base: 1800,
            currency: "CNY",
            rule: "按尺寸、复杂度和交付周期估算"
          }
        },
        {
          id: "expert_guided",
          name: {
            "zh-Hans": "专家指导",
            "zh-Hant": "專家指導",
            en: "Expert Guided"
          },
          description: {
            "zh-Hans": "专家给方向、修改意见或把关，价格更低。",
            "zh-Hant": "專家給方向、修改意見或把關，價格更低。",
            en: "The artisan gives direction, revision notes, or review at a lower price."
          },
          priceEstimate: {
            base: 600,
            currency: "CNY",
            rule: "按咨询次数、修改轮次和复杂度估算"
          }
        }
      ]
    }
  ],
  productionContact: {
    phone: "020-12345678",
    wechat: "InkspireArt"
  },
  productionAvailable: true,
  image: {
    maxInputSizeMb: 10
  },
  i18n: {
    "zh-Hans": {
      tabs: { studio: "画案", library: "藏卷", experts: "雅匠" },
      buttons: { generate: "生成", make: "制作作品" }
    },
    "zh-Hant": {
      tabs: { studio: "畫案", library: "藏卷", experts: "雅匠" },
      buttons: { generate: "生成", make: "製作作品" }
    },
    en: {
      tabs: { studio: "Studio", library: "Library", experts: "Artisans" },
      buttons: { generate: "Generate", make: "Make Artwork" }
    }
  }
};

const calligraphyTextQuestion = {
  id: "text",
  applies_to: ["calligraphy", "fusion"],
  input_type: "textarea",
  preview_image: "/previews/questions/calligraphy-script.webp",
  preview_prompt: {
    "zh-Hans": "书法正文，祝福语或诗句",
    "zh-Hant": "書法正文，祝福語或詩句",
    en: "Calligraphy wording preview"
  },
  title: {
    "zh-Hans": "想写什么正文？",
    "zh-Hant": "想寫什麼正文？",
    en: "What text should the calligraphy write?"
  },
  placeholder: {
    "zh-Hans": "例如：年年有余、平安喜乐，或一两句祝福语",
    "zh-Hant": "例如：年年有餘、平安喜樂，或一兩句祝福語",
    en: "For example: Peace and joy, or a short blessing"
  },
  submit_label: {
    "zh-Hans": "继续定书体",
    "zh-Hant": "繼續定書體",
    en: "Continue to script"
  }
};

type TestUser = ReturnType<typeof userEvent.setup>;

async function completePaintingQuestions(user: TestUser): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "国画" }));
  await user.click(screen.getByRole("button", { name: "山水" }));
}

async function completePaintingWithoutPhoto(user: TestUser): Promise<void> {
  await completePaintingQuestions(user);
  await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));
}

async function completePaintingWithPhoto(user: TestUser, file = new File(["sample"], "sample.png", { type: "image/png" })): Promise<void> {
  await completePaintingQuestions(user);
  await user.upload(screen.getByLabelText("相册"), file);
  await screen.findByText("已提供环境图，将用于生成效果图。");
  await user.click(screen.getByRole("button", { name: "继续" }));
}

describe("App", () => {
  let failLateFusion = false;
  let failLateFusionJob = false;
  let configResponse = publicConfig;
  let libraryRecords: unknown[] = [];
  let activeJobsResponse: unknown[] = [];

  beforeEach(() => {
    failLateFusion = false;
    failLateFusionJob = false;
    configResponse = publicConfig;
    libraryRecords = [];
    activeJobsResponse = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/config/public")) {
        return Response.json(configResponse);
      }
      if (url.endsWith("/api/library")) {
        return Response.json({ records: libraryRecords });
      }
      if (url.endsWith("/api/jobs/active")) {
        return Response.json({ jobs: activeJobsResponse });
      }
      if (url.endsWith("/api/uploads/photo")) {
        return Response.json({
          record_id: "upload-1",
          source_photo_path: "records/upload-1/source-photo.webp"
        }, { status: 201 });
      }
      if (url.endsWith("/api/generations")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.conversationNotes === "fail") {
          return Response.json({
            record: {
              id: "record-failed",
              type: "painting",
              artwork_path: "records/record-failed/artwork.webp",
              fusion_path: "",
              status: "failed"
            }
          }, { status: 201 });
        }
        return Response.json({
          record: {
            id: "record-1",
            type: "painting",
            artwork_path: "records/record-1/artwork.webp",
            fusion_path: "",
            source_photo_path: "records/upload-1/source-photo.webp",
            recommended_artwork_size: {
              preset_id: "square_scene",
              label: "方形点景",
              width_cm: 50,
              height_cm: 50,
              reason: "根据场景图比例推算，适合作为方形点景作品。"
            },
            status: "succeeded"
          }
        }, { status: 201 });
      }
      if (url.endsWith("/api/records/record-1/fusion")) {
        if (failLateFusion) {
          return Response.json({ error: "fusion failed" }, { status: 500 });
        }
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (failLateFusionJob) {
          return Response.json({
            job: {
              id: "job-fusion-failed",
              recordId: "record-1",
              stage: "fusion_render",
              status: "failed",
              error: "fusion failed"
            },
            record: {
              id: "record-1",
              type: "painting",
              artwork_path: "records/record-1/artwork.webp",
              source_photo_path: body.source_photo_path || "records/upload-1/source-photo.webp",
              status: "succeeded",
              fusion_status: "failed"
            }
          }, { status: 201 });
        }
        return Response.json({
          record: {
            id: "record-1",
            type: "painting",
            artwork_path: "records/record-1/artwork.webp",
            fusion_path: "records/record-1/fusion.webp",
            source_photo_path: body.source_photo_path || "records/upload-1/source-photo.webp",
            status: "succeeded",
            has_fusion: true
          }
        }, { status: 201 });
      }
      if (url.endsWith("/api/records/record-1/production-estimate")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const multiplier = body.size === "large" ? 1.5 : body.size === "small" ? 0.75 : 1;
        return Response.json({
          expert_id: "wu_jiayin",
          size: body.size || "medium",
          estimates: {
            expert_custom: { amount: Math.round(1800 * multiplier), currency: "CNY", rule: "按尺寸、复杂度和交付周期估算" },
            expert_guided: { amount: Math.round(600 * multiplier), currency: "CNY", rule: "按咨询次数、修改轮次和复杂度估算" }
          }
        });
      }
      if (url.endsWith("/api/records/record-1/production-orders")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return Response.json({
          order: {
            id: "order-20260624-0001",
            record_id: "record-1",
            expert_id: body.expertId,
            service_id: body.serviceId,
            size: body.size,
            reference_level: body.referenceLevel,
            created_at: "2026-06-24T12:00:00.000Z"
          }
        }, { status: 201 });
      }
      if (url.endsWith("/api/records/missing-record") && (!init || !init.method || init.method === "GET")) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      if (url.endsWith("/api/records/record-1") && (!init || !init.method || init.method === "GET")) {
        return Response.json({
          id: "record-1",
          type: "painting",
          title: "藏卷山水",
          answers: { painting_subject: "山水" },
          artwork_path: "records/record-1/artwork.webp",
          fusion_path: "",
          source_photo_path: "",
          status: "succeeded",
          favorite: true
        });
      }
      if (url.endsWith("/api/records/record-1/favorite")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return Response.json({
          id: "record-1",
          type: "painting",
          artwork_path: "records/record-1/artwork.webp",
          status: "succeeded",
          favorite: Boolean(body.favorite)
        });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:photo-preview")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders 墨起 and the three mobile nav buttons", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
    expect(screen.getAllByText("园林卷轴里的书画生成")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "画案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "雅匠" })).toBeInTheDocument();
  });

  it("aligns the 墨起 title left and the language selector right", async () => {
    const styles = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toMatch(/\.topbar\s*{[^}]*width:\s*100%/s);
    expect(styles).toMatch(/\.topbar-title\s*{[^}]*text-align:\s*left/s);
    expect(styles).toMatch(/\.language-select\s*{[^}]*margin-left:\s*auto/s);
  });

  it("restores active generation status from the server", async () => {
    activeJobsResponse = [
      {
        id: "job-active",
        recordId: "record-1",
        stage: "artwork",
        title: "山水",
        status: "running"
      }
    ];

    render(<App />);

    expect(await screen.findByText("墨色正在铺开，可能需要 2-3 分钟，请耐心等待。")).toBeInTheDocument();
    expect(screen.getByText("山水 作品图")).toBeInTheDocument();
  });

  it("disables generation when the restored active job list already has two tasks", async () => {
    const user = userEvent.setup();
    activeJobsResponse = [
      { id: "job-a", recordId: "record-a", stage: "artwork", title: "山水", status: "running" },
      { id: "job-b", recordId: "record-b", stage: "fusion_render", title: "花鸟", status: "queued" }
    ];

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));

    expect(await screen.findByText("当前已有 2 个生成任务，请等其中一个完成后再开始。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不需要效果图，直接生成" })).toBeDisabled();
    expect(screen.getByText("山水 作品图 · 花鸟 效果图")).toBeInTheDocument();
  });

  it("does not show photo controls before the final photo step", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "国画" });

    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("拍照")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "不需要效果图，直接生成" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "国画" }));

    expect(screen.getByText("想画什么主题？")).toBeInTheDocument();
    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("拍照")).not.toBeInTheDocument();
  });

  it("keeps scrollable content clear of the mobile navigation without wasting a full nav height", async () => {
    const styles = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toMatch(/--bottom-nav-clearance:\s*calc\(env\(safe-area-inset-bottom\) \+ 16px\)/);
    expect(styles).toMatch(/padding-bottom:\s*var\(--bottom-nav-clearance\)/);
    expect(styles).toMatch(/padding:\s*8px 8px calc\(8px \+ env\(safe-area-inset-bottom\)\)/);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)[\s\S]*\.language-select-label[\s\S]*clip:\s*rect\(0 0 0 0\)/);
  });

  it("shows photo selection as the final explicit step", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingQuestions(user);

    expect(screen.getByRole("heading", { name: "可选：添加摆放环境照片" })).toBeInTheDocument();
    expect(screen.getByText("用于生成摆放效果图；不添加也能直接生成作品图。")).toBeInTheDocument();
    expect(screen.getByText("第 3 / 3 步")).toBeInTheDocument();
    expect(screen.getByLabelText("相册")).toBeInTheDocument();
    expect(screen.getByLabelText("拍照")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不需要效果图，直接生成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  });

  it("warns before uploading an oversized setup photo", async () => {
    configResponse = {
      ...publicConfig,
      image: { maxInputSizeMb: 1 }
    };
    const user = userEvent.setup();
    render(<App />);

    await completePaintingQuestions(user);
    await user.upload(
      screen.getByLabelText("相册"),
      new File([new Uint8Array(1024 * 1024 + 1)], "too-large.png", { type: "image/png" })
    );

    expect(await screen.findByText("图片太大了，请换一张 10MB 以内的照片。")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/uploads/photo"))).toBe(false);
  });

  it("uses decorative option fallbacks without repeating visible labels", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByRole("button", { name: "国画" });

    expect(screen.getByRole("button", { name: "国画" }).textContent).not.toBe("国国画");
    expect([...container.querySelectorAll(".option-preview-fallback")].map((item) => item.textContent?.trim())).toEqual([
      "◆",
      "●"
    ]);

    await user.click(screen.getByRole("button", { name: "国画" }));

    expect(screen.getByRole("button", { name: "山水" }).textContent).not.toBe("山山水");
    expect([...container.querySelectorAll(".option-preview-fallback")].map((item) => item.textContent?.trim())).toEqual([
      "◆",
      "●",
      "◇",
      "◎"
    ]);
  });

  it("requires the photo step after branch questions before showing generation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));

    expect(screen.getByText("想画什么主题？")).toBeInTheDocument();
    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("拍照")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "山水" }));

    expect(screen.getByLabelText("相册")).toBeInTheDocument();
    expect(screen.getByLabelText("拍照")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  });

  it("uses a low-emphasis back action during branch questions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));

    expect(screen.getByRole("button", { name: "上一步" })).toHaveClass("back-action");
  });

  it("shows the full expected progress on the first step", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "墨起" });

    expect(screen.getByText("第 1 / 3 步")).toBeInTheDocument();
    expect(screen.queryByText("第 1 / 1 步")).not.toBeInTheDocument();
  });

  it("does not promise a fake total before choosing a type when branch lengths differ", () => {
    const unevenConfig = {
      ...publicConfig,
      questions: {
        painting: [
          ...publicConfig.questions.painting,
          { ...publicConfig.questions.painting[0], id: "painting_extra" }
        ],
        calligraphy: publicConfig.questions.calligraphy
      }
    };

    expect(getProgressLabel(unevenConfig, {}, "zh-Hans")).toBe("第 1 步");
    expect(getProgressLabel(unevenConfig, {}, "en")).toBe("Step 1");
  });

  it("updates visible tab text when language changes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "墨起" });
    await user.selectOptions(screen.getByLabelText("语言"), "en");

    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Artisans" })).toBeInTheDocument();
  });

  it("localizes the language selector label itself", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");

    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Language"), "zh-Hant");

    expect(screen.getByLabelText("語言")).toBeInTheDocument();
    expect(screen.getByText("語言")).toBeInTheDocument();
  });

  it("persists the selected language across remounts", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();

    view.unmount();
    render(<App />);

    expect(await screen.findByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
  });

  it("renders visual previews for options without leaking Chinese preview text in English", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");

    expect(screen.getByText("Choose the work type")).toBeInTheDocument();
    expect(screen.queryByText("选择国画或书法创作方向")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preview the artwork direction" })).toHaveAttribute("src", expect.stringContaining("/previews/questions/"));
    const workTypePreviews = [...container.querySelectorAll(".option-preview-image")].map((image) => image.getAttribute("src"));
    expect(workTypePreviews).toHaveLength(2);
    expect(new Set(workTypePreviews).size).toBe(2);

    await user.click(screen.getByRole("button", { name: "Painting" }));

    expect(screen.getByRole("heading", { name: "What subject should the painting show?" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "What subject should the painting show?" })).toHaveAttribute("src", expect.stringContaining("/previews/questions/"));
    const subjectPreviews = [...container.querySelectorAll(".option-preview-image")].map((image) => image.getAttribute("src"));
    expect(subjectPreviews).toHaveLength(4);
    expect(new Set(subjectPreviews).size).toBe(4);
  });

  it("shows decorative fallback marks for calligraphy option previews before images decode", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(await screen.findByRole("button", { name: "书法" }));

    expect(screen.getByRole("heading", { name: "偏好哪种书体？" })).toBeInTheDocument();
    const fallbackGlyphs = [...container.querySelectorAll(".option-preview-fallback")].map((item) => item.textContent?.trim());
    expect(fallbackGlyphs).toEqual(["◆", "●", "◇", "◎"]);
    expect(container.querySelectorAll(".option-preview-image")).toHaveLength(4);
  });

  it("advances the question flow after clicking 国画", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));

    expect(screen.getByText("想画什么主题？")).toBeInTheDocument();
  });

  it("collects calligraphy text before generating", async () => {
    configResponse = {
      ...publicConfig,
      questions: {
        ...publicConfig.questions,
        calligraphy: [calligraphyTextQuestion, ...publicConfig.questions.calligraphy]
      }
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "书法" }));

    expect(screen.getByRole("heading", { name: "想写什么正文？" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("例如：年年有余、平安喜乐，或一两句祝福语"), "年年有余");
    await user.click(screen.getByRole("button", { name: "继续定书体" }));
    await user.click(screen.getByRole("button", { name: "行书" }));
    await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/generations", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"text\":\"年年有余\"")
      }));
    });
  });

  it("persists answered questions across remounts", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    expect(screen.getByText("想画什么主题？")).toBeInTheDocument();

    view.unmount();
    render(<App />);

    expect(await screen.findByText("想画什么主题？")).toBeInTheDocument();
    expect(screen.queryByText("先定作品类型")).not.toBeInTheDocument();
  });

  it("keeps the restored library tab when a current record is restored", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    window.localStorage.setItem("inkspire.activeTab", "library");
    window.localStorage.setItem("inkspire.currentRecordId", "record-1");

    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1", undefined);
    });

    expect(await screen.findByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "藏卷山水" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
  });

  it("shows question progress and can go back without losing the uploaded photo", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));
    expect(await screen.findByText("已提供环境图，将用于生成效果图。")).toBeInTheDocument();

    expect(screen.getByText("第 3 / 3 步")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "上一步" }));

    expect(screen.getByRole("heading", { name: "可选：添加摆放环境照片" })).toBeInTheDocument();
    expect(screen.getByText("已提供环境图，将用于生成效果图。")).toBeInTheDocument();
  });

  it("keeps generation as the only submit action after questions complete", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);

    expect(screen.queryByRole("button", { name: "可以开始生成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更清雅一点" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();
  });

  it("restores active generation status from the server", async () => {
    activeJobsResponse = [{
      id: "job-active-1",
      recordId: "record-1",
      stage: "artwork",
      type: "painting",
      title: "藏卷山水",
      status: "running"
    }];

    render(<App />);

    expect(await screen.findByText("墨色正在铺开，可能需要 2-3 分钟，请耐心等待。")).toBeInTheDocument();
    expect(screen.getByText("藏卷山水 作品图")).toBeInTheDocument();
  });

  it("keeps active generation status when switching tabs", async () => {
    activeJobsResponse = [{
      id: "job-active-1",
      recordId: "record-1",
      stage: "artwork",
      type: "painting",
      title: "藏卷山水",
      status: "queued"
    }];
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("墨色正在铺开，可能需要 2-3 分钟，请耐心等待。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(screen.getByText("藏卷山水 作品图")).toBeInTheDocument();
  });

  it("shows the generation limit when two active jobs are already running", async () => {
    activeJobsResponse = [{
      id: "job-active-1",
      recordId: "record-1",
      stage: "artwork",
      type: "painting",
      title: "山水",
      status: "running"
    }, {
      id: "job-active-2",
      recordId: "record-2",
      stage: "fusion_render",
      type: "painting",
      title: "花鸟",
      status: "queued"
    }];
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));

    expect(screen.getByText("当前已有 2 个生成任务，请等其中一个完成后再开始。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不需要效果图，直接生成" })).toBeDisabled();
  });

  it("generates from empty notes with the primary generate button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(generationRequestBodies()).toHaveLength(1);
    });
    expect(generationRequestBodies()[0].conversationNotes).toBe("");
    expect(generationRequestBodies()[0].source_photo_path).toBe("");
  });

  it("puts refinement suggestions into notes before generating", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "更清雅一点" }));

    expect(screen.getByLabelText("也可以补一句想法")).toHaveValue("更清雅一点");
    expect(generationRequestBodies()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(generationRequestBodies()).toHaveLength(1);
    });
    expect(generationRequestBodies()[0].conversationNotes).toBe("更清雅一点");
  });

  it("persists notes and uploaded photo path across remounts", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await completePaintingWithPhoto(user);
    await user.type(screen.getByPlaceholderText("也可以补一句想法"), "更像家里玄关");

    view.unmount();
    render(<App />);

    expect(await screen.findByDisplayValue("更像家里玄关")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "上一步" }));

    expect(screen.getByRole("heading", { name: "可选：添加摆放环境照片" })).toBeInTheDocument();
    expect(screen.getByText("已提供环境图，将用于生成效果图。")).toBeInTheDocument();
  });

  it("shows when an optional photo is ready for fusion", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));

    expect(await screen.findByText("已提供环境图，将用于生成效果图。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "已选照片预览" })).toHaveAttribute("src", "blob:photo-preview");
    expect(screen.getByText("sample.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除照片" })).toBeInTheDocument();
    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "先不放照片" })).not.toBeInTheDocument();
  });

  it("uses a clean placeholder when the selected photo preview cannot load", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));
    const preview = await screen.findByRole("img", { name: "已选照片预览" });
    preview.dispatchEvent(new Event("error"));

    await waitFor(() => {
      expect(screen.queryByRole("img", { name: "已选照片预览" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("sample.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除照片" })).toBeInTheDocument();
  });

  it("clears the optional photo ready state when removing the photo", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));
    expect(await screen.findByText("已提供环境图，将用于生成效果图。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除照片" }));

    expect(screen.queryByText("已提供环境图，将用于生成效果图。")).not.toBeInTheDocument();
    expect(screen.getByLabelText("相册")).toBeInTheDocument();
  });

  it("creates a fusion render after generating from an uploaded photo", async () => {
    const user = userEvent.setup();
    render(<App />);

    const photo = new File(["sample"], "sample.png", { type: "image/png" });
    await completePaintingWithPhoto(user, photo);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1/fusion", expect.objectContaining({ method: "POST" }));
    });
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按这张图继续调整" })).toBeInTheDocument();
  });

  it("puts result actions before the fusion image on narrow screens", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const user = userEvent.setup();
    const { container } = render(<App />);

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    const actions = container.querySelector(".result-actions");
    const fusionFigure = screen.getByRole("img", { name: "效果图" }).closest("figure");

    expect(actions).toBeTruthy();
    expect(fusionFigure).toBeTruthy();
    expect(actions!.compareDocumentPosition(fusionFigure!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses compact square result media on narrow screens only", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toHaveClass("compact-result-media");
  });

  it("keeps the taller result media treatment on wide screens", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).not.toHaveClass("compact-result-media");
  });

  it("restores the current record after remounting", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    view.unmount();
    render(<App />);

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
  });

  it("focuses the generated result by hiding pre-generation controls until notes are requested", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("也可以补一句想法")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByText("可先看尺寸和估价，确认意向后再联系制作。")).toBeInTheDocument();
    expect(container.querySelector(".result-actions")?.firstElementChild).toHaveTextContent("制作作品");

    await user.click(screen.getByRole("button", { name: "补充要求" }));

    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("也可以补一句想法")).toHaveFocus();
  });

  it("uses a polished failure state when the artwork image cannot load", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    const image = await screen.findByRole("img", { name: "作品图" });
    image.dispatchEvent(new Event("error"));

    expect(await screen.findByText("作品图暂时无法显示")).toBeInTheDocument();
    expect(screen.getByText("可以补充要求后再生成，或稍后从藏卷重新打开。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按这张图继续调整" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "补充要求" })).toBeInTheDocument();
  });

  it("scrolls the generated result into view", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it("can attach a photo after artwork generation and then create a fusion render", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "效果图" })).not.toBeInTheDocument();

    const photo = new File(["late sample"], "late.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("添加摆放照片生成效果图"), photo);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/fusion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ source_photo_path: "records/upload-1/source-photo.webp" })
        })
      );
    });
    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
  });

  it("warns before attaching an oversized result photo", async () => {
    configResponse = {
      ...publicConfig,
      image: { maxInputSizeMb: 1 }
    };
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    vi.mocked(fetch).mockClear();

    await user.upload(
      screen.getByLabelText("添加摆放照片生成效果图"),
      new File([new Uint8Array(1024 * 1024 + 1)], "late-large.png", { type: "image/png" })
    );

    expect(await screen.findByText("图片太大了，请换一张 10MB 以内的照片。")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/uploads/photo"))).toBe(false);
  });

  it("shows an error if attaching a photo for fusion fails", async () => {
    failLateFusion = true;
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(screen.getByLabelText("添加摆放照片生成效果图"), new File(["sample"], "late.png", { type: "image/png" }));

    expect(await screen.findByText("暂时无法完成，请稍后再试。")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "效果图" })).not.toBeInTheDocument();
  });

  it("keeps artwork visible when fusion returns a failed job", async () => {
    failLateFusionJob = true;
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(screen.getByLabelText("添加摆放照片生成效果图"), new File(["sample"], "late.png", { type: "image/png" }));

    expect(await screen.findByText("暂时无法完成，请稍后再试。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "效果图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByLabelText("添加摆放照片生成效果图")).toBeInTheDocument();
    expect(screen.queryByText("生成未完成")).not.toBeInTheDocument();
  });

  it("opens the production dialog with both service tiers after generation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "制作作品" })).toBeInTheDocument();
    });
    expect(screen.getByText("先调整规格、选择服务和参考程度；估价仅作参考，确认后生成单号和联系方式。")).toBeInTheDocument();
    expect(screen.getByText("专家定制")).toBeInTheDocument();
    expect(screen.getByText("专家指导")).toBeInTheDocument();
  });

  it("hides production entry points when production contact is unavailable", async () => {
    configResponse = {
      ...publicConfig,
      productionContact: { phone: "", wechat: "" },
      productionAvailable: false,
      experts: publicConfig.experts.map((expert) => ({ ...expert, phone: "", wechat: "" }))
    };
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "雅匠" }));

    const unavailableCta = await screen.findByRole("button", { name: "暂未开放制作咨询" });
    expect(unavailableCta).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps keyboard focus inside the production dialog and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    const makeButton = await screen.findByRole("button", { name: "制作作品" });
    await user.click(makeButton);

    expect(await screen.findByRole("dialog", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(makeButton).toHaveFocus();
  });

  it("shows only the selected artist reference hint in the production dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByRole("radio", { name: /第3级/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("参考总体布局，细节可自由发挥，提升艺术性。")).toBeInTheDocument();
    expect(screen.queryByText("尽量贴近 AI 图的构图、色调和细节。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /第5级/ }));

    expect(screen.getByText("AI 图只作灵感，主要交给艺术家判断。")).toBeInTheDocument();
    expect(screen.queryByText("参考总体布局，细节可自由发挥，提升艺术性。")).not.toBeInTheDocument();
  });

  it("uses short visible labels for artist reference choices on mobile", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByRole("radio", { name: /第1级 严格参考/ })).toBeInTheDocument();
    expect(screen.getByText("严格")).toBeInTheDocument();
    expect(screen.getByText("主要")).toBeInTheDocument();
    expect(screen.getByText("布局")).toBeInTheDocument();
    expect(screen.getByText("气质")).toBeInTheDocument();
    expect(screen.getByText("自由")).toBeInTheDocument();
    expect(screen.queryByText("第1级 严格参考")).not.toBeInTheDocument();
  });

  it("updates production estimates when selecting a larger size", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    await user.click(await screen.findByRole("button", { name: "调整尺寸" }));
    await user.click(screen.getByRole("radio", { name: /厅堂主景/ }));
    await user.click(screen.getByRole("button", { name: "用这个尺寸" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/production-estimate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ expertId: "wu_jiayin", size: "large" })
        })
      );
    });
    expect(await screen.findByText(/估算: 2700 CNY/)).toBeInTheDocument();
  });

  it("reveals contact details only after confirming production intent", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByText("专家定制")).toBeInTheDocument();
    expect(screen.queryByText(/020-12345678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/InkspireArt/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认制作意向" }));

    expect(screen.getByText("已记录制作意向")).toBeInTheDocument();
    expect(screen.getByText(/电话：020-12345678/)).toBeInTheDocument();
    expect(screen.getByText(/微信：InkspireArt/)).toBeInTheDocument();
    expect(screen.getByText(/单号：order-20260624-0001/)).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("prefills inferred artwork size, supports friendly size adjustment, and submits reference level", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByText("方形点景 · 约 50 × 50 cm")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /第3级/ })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "调整尺寸" }));
    expect(screen.getByRole("heading", { name: "调整作品尺寸" })).toBeInTheDocument();
    const customSize = screen.getByRole("radio", { name: /自定义尺寸/ });
    await user.click(customSize);
    expect(customSize).toContainElement(screen.getByLabelText("宽度 cm"));
    expect(customSize).toContainElement(screen.getByLabelText("高度 cm"));
    await user.clear(screen.getByLabelText("宽度 cm"));
    await user.click(screen.getByRole("button", { name: "用这个尺寸" }));
    expect(screen.getByText("请输入有效的宽高尺寸")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("宽度 cm"));
    await user.type(screen.getByLabelText("宽度 cm"), "42");
    await user.clear(screen.getByLabelText("高度 cm"));
    await user.type(screen.getByLabelText("高度 cm"), "66");
    await user.click(screen.getByRole("button", { name: "用这个尺寸" }));

    expect(screen.getByText(/自定义尺寸/)).toBeInTheDocument();
    expect(screen.getByText(/约 42 × 66 cm/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /第5级/ }));
    await user.click(screen.getByRole("button", { name: "确认制作意向" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/production-orders",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            expertId: "wu_jiayin",
            serviceId: "expert_custom",
            size: {
              preset_id: "custom",
              label: "自定义尺寸",
              width_cm: 42,
              height_cm: 66
            },
            referenceLevel: 5
          })
        })
      );
    });
  });

  it("localizes production contact labels in English", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(await screen.findByRole("button", { name: "Make Artwork" }));
    await user.click(await screen.findByRole("button", { name: "Confirm production" }));

    expect(screen.getByText(/Phone: 020-12345678/)).toBeInTheDocument();
    expect(screen.getByText(/WeChat: InkspireArt/)).toBeInTheDocument();
    expect(screen.queryByText(/电话：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/微信：/)).not.toBeInTheDocument();
  });

  it("localizes production size copy and custom size fields in English", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(await screen.findByRole("button", { name: "Make Artwork" }));

    expect(await screen.findByText("Square accent · approx. 50 × 50 cm")).toBeInTheDocument();
    expect(screen.getByText("Square accent size for balanced displays.")).toBeInTheDocument();
    expect(screen.queryByText(/方形点景/)).not.toBeInTheDocument();
    expect(screen.queryByText(/适合方形留白/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adjust" }));
    await user.click(screen.getByRole("radio", { name: /Custom size/ }));

    expect(screen.getByLabelText("Width cm")).toBeInTheDocument();
    expect(screen.getByLabelText("Height cm")).toBeInTheDocument();
    expect(screen.queryByLabelText("宽度 cm")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("高度 cm")).not.toBeInTheDocument();
  });

  it("returns to the conversation panel when continuing after a result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "按这张图继续调整" }));

    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "基于上次生成" })).toBeInTheDocument();
  });

  it("explains continued generation and lets users start a fresh studio flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "按这张图继续调整" }));

    expect(screen.getByText("将基于上次的主题、风格和选择继续生成，可补一句新想法。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重开画案" }));

    expect(screen.getByText("先定作品类型")).toBeInTheDocument();
    expect(screen.queryByText("将基于上次的主题、风格和选择继续生成，可补一句新想法。")).not.toBeInTheDocument();
  });

  it("focuses the notes box from the result add-notes action without hiding the result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "补充要求" }));

    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("也可以补一句想法")).toHaveFocus();
  });

  it("shows the generated artwork thumbnail in the library without reloading", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "藏卷" }));

    expect(screen.getByRole("img", { name: "record-1" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );
  });

  it("shows a guided empty library state for first-time users", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "藏卷" }));

    expect(screen.getByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();
    expect(screen.getByText("喜欢的画案或生成作品会收在这里。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移出藏卷" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "去画案看看" }));

    expect(screen.getByText("先定作品类型")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  });

  it("presents artisans as a service entry instead of a static contact card", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(await screen.findByRole("button", { name: "雅匠" }));

    expect(screen.getByText("可咨询方向")).toBeInTheDocument();
    expect(screen.getByText("专家定制")).toBeInTheDocument();
    expect(screen.getByText("专家指导")).toBeInTheDocument();
    expect(screen.getByText("装裱与落地咨询")).toBeInTheDocument();
    expect(screen.getByText("价格按需求评估")).toBeInTheDocument();
    expect(screen.getByText("中国书法家协会会员")).toBeInTheDocument();
    expect(screen.getByText("中山大学中国美学博士")).toBeInTheDocument();
    expect(screen.getByText("风格样张")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /风格样张/ })).toHaveLength(2);
    expect([...container.querySelectorAll(".expert-sample-fallback")].map((item) => item.textContent?.trim())).toEqual([
      "书",
      "画"
    ]);
    expect(screen.queryByText("联系方式待确认")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "先生成作品，再咨询雅匠" }));

    expect(screen.getByText("先定作品类型")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets users consult artisans with the current generated artwork", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "雅匠" }));
    const currentWork = screen.getByText("当前作品");
    expect(currentWork).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "当前作品预览" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );
    expect(
      currentWork.compareDocumentPosition(screen.getByText("可咨询方向")) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "用当前作品咨询雅匠" }));

    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens a saved library item as the current result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: /查看作品 record-1/ }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1", undefined);
    });
    expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByLabelText("添加摆放照片生成效果图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a visible library error when a saved item cannot be opened", async () => {
    libraryRecords = [{
      id: "missing-record",
      type: "painting",
      title: "旧作",
      thumbnail_path: "records/missing-record/artwork.webp",
      artwork_path: "records/missing-record/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: /查看作品 旧作/ }));

    expect(await screen.findByText("作品暂时无法打开，请稍后再试。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
  });

  it("formats library dates with the selected language", async () => {
    const createdAt = "2026-06-24T12:00:00.000Z";
    const expectedDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(createdAt));
    libraryRecords = [{
      id: "dated-record",
      type: "painting",
      title: "Dated work",
      thumbnail_path: "records/dated-record/artwork.webp",
      artwork_path: "records/dated-record/artwork.webp",
      created_at: createdAt,
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    render(<App />);

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(await screen.findByText(`Artwork · ${expectedDate}`)).toBeInTheDocument();
  });

  it("can remove a generated artwork from the library", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "藏卷" }));

    expect(screen.getByRole("img", { name: "record-1" })).toBeInTheDocument();
    expect(screen.getByText("查看作品")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "移出藏卷" }));
    expect(screen.getByText("作品记录不会删除。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "移出" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/favorite",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ favorite: false })
        })
      );
    });
    expect(screen.queryByRole("img", { name: "record-1" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();
  });

  it("shows a failed-result state without production actions when generation fails", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completePaintingWithoutPhoto(user);
    await user.type(screen.getByPlaceholderText("也可以补一句想法"), "fail");
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByText("生成未完成")).toBeInTheDocument();
    expect(screen.getByText("可以补充要求后再试一次，或稍后重新生成。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按这张图继续调整" })).toBeInTheDocument();
  });
});
