import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicConfig } from "../src/api";
import { getProgressLabel } from "../src/components/Studio";
import type { Question } from "../src/domain";
import { renderApp } from "./renderApp";

function generationRequestBodies(): Array<Record<string, unknown>> {
  return vi.mocked(fetch).mock.calls
    .filter(([input]) => String(input).endsWith("/api/generations"))
    .map(([, init]) => init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
}

const publicConfig: PublicConfig = {
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

const calligraphyTextQuestion: Question = {
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
  await user.click(screen.getByRole("button", { name: /均衡/ }));
}

async function completePaintingWithPhoto(user: TestUser, file = new File(["sample"], "sample.png", { type: "image/png" })): Promise<void> {
  await completePaintingQuestions(user);
  await user.upload(screen.getByLabelText("相册"), file);
  await screen.findByText("已提供环境图片，将用于生成效果图。");
  await user.click(screen.getByRole("button", { name: "继续" }));
}

describe("App", () => {
  let failLateFusion = false;
  let failLateFusionJob = false;
  let failUploadTooLarge = false;
  let configResponse = publicConfig;
  let libraryRecords: unknown[] = [];
  let activeJobsResponse: unknown[] = [];
  let queuedGenerationJob: unknown | null = null;
  let jobResponses: Record<string, unknown> = {};
  let holdGenerationResponse = false;
  let releaseGenerationResponse: (() => void) | null = null;
  let holdFusionResponse = false;
  let releaseFusionResponse: (() => void) | null = null;
  let recordOneSourcePhotoPath = "";
  let recordOneGenerationComplexity: unknown;

  beforeEach(() => {
    failLateFusion = false;
    failLateFusionJob = false;
    failUploadTooLarge = false;
    configResponse = publicConfig;
    libraryRecords = [];
    activeJobsResponse = [];
    queuedGenerationJob = null;
    jobResponses = {};
    holdGenerationResponse = false;
    releaseGenerationResponse = null;
    holdFusionResponse = false;
    releaseFusionResponse = null;
    recordOneSourcePhotoPath = "";
    recordOneGenerationComplexity = undefined;
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
      const jobMatch = url.match(/\/api\/jobs\/([^/?]+)$/);
      if (jobMatch) {
        return Response.json(jobResponses[decodeURIComponent(jobMatch[1])] ?? {});
      }
      if (url.endsWith("/api/uploads/photo")) {
        if (failUploadTooLarge) {
          return Response.json({ error: "Photo is too large.", code: "photo_too_large" }, { status: 413 });
        }
        return Response.json({
          record_id: "upload-1",
          source_photo_path: "records/upload-1/source-photo.webp"
        }, { status: 201 });
      }
      if (url.endsWith("/api/generations")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        recordOneGenerationComplexity = body.generation_complexity;
        if (holdGenerationResponse) {
          return new Promise<Response>((resolve) => {
            releaseGenerationResponse = () => resolve(Response.json({
              job: queuedGenerationJob ?? {
                id: "job-held-generation",
                recordId: "record-1",
                stage: "artwork",
                origin_tab: body.origin_tab ?? "studio",
                operation: body.operation ?? "create",
                status: "queued"
              }
            }, { status: 201 }));
          });
        }
        if (queuedGenerationJob) {
          return Response.json({ job: queuedGenerationJob }, { status: 201 });
        }
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
        if (body.conversationNotes && !body.source_photo_path) {
          return Response.json({
            record: {
              id: "record-2",
              type: "painting",
              artwork_path: "records/record-2/artwork.webp",
              fusion_path: "",
              source_photo_path: "",
              status: "succeeded"
            }
          }, { status: 201 });
        }
        return Response.json({
          record: {
            id: "record-1",
            type: "painting",
            artwork_path: "records/record-1/artwork.webp",
            fusion_path: "",
            source_photo_path: body.source_photo_path ? "records/record-1/source-photo.webp" : "",
            recommended_artwork_size: {
              preset_id: "square_scene",
              label: "方形点景",
              width_cm: 50,
              height_cm: 50,
              reason: "根据环境图片比例推算，适合作为方形点景作品。"
            },
            generation_complexity: body.generation_complexity,
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
        if (holdFusionResponse) {
          return new Promise<Response>((resolve) => {
            releaseFusionResponse = () => resolve(Response.json({
              record: {
                id: "record-1",
                type: "painting",
                artwork_path: "records/record-1/artwork.webp",
                fusion_path: "records/record-1/fusion.webp",
                source_photo_path: body.source_photo_path || "records/upload-1/source-photo.webp",
                status: "succeeded",
                has_fusion: true
              }
            }, { status: 201 }));
          });
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
            id: "ord-k8p4x2q9",
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
          source_photo_path: recordOneSourcePhotoPath,
          generation_complexity: recordOneGenerationComplexity,
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

  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    cleanup();
    window.history.pushState(null, "", "/");
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders 墨起 and the three mobile nav buttons", async () => {
    renderApp({ initialRoute: "/library" });

    expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
    expect(screen.getAllByText("园林卷轴里的书画生成")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "画案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "雅匠" })).toBeInTheDocument();
  });

  it("seeds the browser router helper with the requested initial route", async () => {
    renderApp({ initialRoute: "/library" });

    expect(window.location.pathname).toBe("/library");
    expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
  });

  it("highlights tabs from URL routes", async () => {
    renderApp({ initialRoute: "/library" });

    expect(await screen.findByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "false");
  });

  it("aligns the 墨起 title left and the language selector right", async () => {
    const styles = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toMatch(/\.topbar\s*{[^}]*width:\s*100%/s);
    expect(styles).toMatch(/\.topbar-title\s*{[^}]*text-align:\s*left/s);
    expect(styles).toMatch(/\.language-select\s*{[^}]*margin-left:\s*auto/s);
  });

  it("restores an active job as the Studio loading page from the server", async () => {
    activeJobsResponse = [
      {
        id: "job-active",
        recordId: "record-1",
        stage: "artwork",
        origin_tab: "studio",
        operation: "create",
        title: "山水",
        status: "running"
      }
    ];

    renderApp();

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    expect(screen.getByText("通常约 30 秒，请稍候。")).toBeInTheDocument();
    expect(screen.queryByText("山水 作品图")).not.toBeInTheDocument();
  });

  it("keeps Studio generation available when other tabs have active jobs", async () => {
    const user = userEvent.setup();
    activeJobsResponse = [
      { id: "job-a", recordId: "record-a", stage: "artwork", origin_tab: "library", title: "山水", status: "running" },
      { id: "job-b", recordId: "record-b", stage: "fusion_render", origin_tab: "experts", title: "花鸟", status: "queued" }
    ];

    renderApp();

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));

    const skipPhoto = screen.getByRole("button", { name: "不需要效果图，直接生成" });
    expect(skipPhoto).toBeEnabled();
    expect(screen.queryByText("画案已有生成任务，请等它完成后再开始。")).not.toBeInTheDocument();
    expect(screen.queryByText("山水 作品图 · 花鸟 效果图")).not.toBeInTheDocument();
  });

  it("does not show photo controls before the final photo step", async () => {
    const user = userEvent.setup();
    renderApp();

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

  it("hides bottom navigation while the image viewer is open and keeps the viewer back action compact", async () => {
    const styles = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toMatch(/\.image-viewer-open\s+\.bottom-tabs\s*{[^}]*display:\s*none/s);
    expect(styles).toMatch(/\.image-viewer-back\s*{[^}]*min-height:\s*38px/s);
    expect(styles).toMatch(/\.image-viewer-back\s*{[^}]*font-size:\s*13px/s);
  });

  it("uses a gesture-first image viewer layout on narrow screens", async () => {
    const styles = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toMatch(/\.image-viewer-stage\s*{[^}]*touch-action:\s*none/s);
    expect(styles).toMatch(/\.image-viewer-mobile-hint\s*{/);
    expect(styles).toMatch(/\.image-viewer-mobile-reset\s*{/);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)[\s\S]*\.image-viewer-controls\s*{[^}]*display:\s*none/s);
    expect(styles).toMatch(/@media \(max-width:\s*520px\)[\s\S]*\.image-viewer-mobile-reset\s*{[^}]*display:\s*inline-grid/s);
  });

  it("shows photo selection as the final explicit step", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);

    expect(screen.getByRole("heading", { name: "可选：添加环境照片" })).toBeInTheDocument();
    expect(screen.getByText("用于生成摆放效果图；不添加也能直接生成作品图。")).toBeInTheDocument();
    expect(screen.getByText("第 3 / 3 步")).toBeInTheDocument();
    expect(screen.getByLabelText("相册")).toBeInTheDocument();
    expect(screen.getByLabelText("拍照")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不需要效果图，直接生成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  });

  it("keeps the final photo step after switching from studio to library and back", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingQuestions(user);
    expect(screen.getByRole("heading", { name: "可选：添加环境照片" })).toBeInTheDocument();
    expect(window.location.search).toBe("?step=photo");

    await user.click(screen.getByRole("button", { name: "藏卷" }));
    expect(await screen.findByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(await screen.findByRole("heading", { name: "可选：添加环境照片" })).toBeInTheDocument();
    expect(screen.getByText("第 3 / 3 步")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "先定作品类型" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?step=photo");
  });

  it("keeps a later painting question step after switching from studio to library and back", async () => {
    configResponse = {
      ...publicConfig,
      questions: {
        ...publicConfig.questions,
        painting: [
          publicConfig.questions.painting[0],
          {
            ...publicConfig.questions.painting[0],
            id: "painting_palette",
            title: {
              "zh-Hans": "偏好哪种设色？",
              "zh-Hant": "偏好哪種設色？",
              en: "Which color treatment do you prefer?"
            },
            options: {
              "zh-Hans": ["水墨", "青绿", "浅绛", "由墨起决定"],
              "zh-Hant": ["水墨", "青綠", "淺絳", "由墨起決定"],
              en: ["Ink wash", "Blue-green", "Light umber", "Let Inkspire decide"]
            }
          }
        ]
      }
    };
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    expect(screen.getByRole("heading", { name: "偏好哪种设色？" })).toBeInTheDocument();
    expect(screen.getByText("第 3 / 4 步")).toBeInTheDocument();
    expect(window.location.search).toBe("?step=question&index=1");

    await user.click(screen.getByRole("button", { name: "藏卷" }));
    expect(await screen.findByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(await screen.findByRole("heading", { name: "偏好哪种设色？" })).toBeInTheDocument();
    expect(screen.getByText("第 3 / 4 步")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "先定作品类型" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?step=question&index=1");
  });

  it("writes question answers to the studio draft before the next render cycle", async () => {
    configResponse = {
      ...publicConfig,
      questions: {
        ...publicConfig.questions,
        painting: [
          publicConfig.questions.painting[0],
          {
            ...publicConfig.questions.painting[0],
            id: "painting_palette",
            title: {
              "zh-Hans": "偏好哪种设色？",
              "zh-Hant": "偏好哪種設色？",
              en: "Which color treatment do you prefer?"
            },
            options: {
              "zh-Hans": ["水墨", "青绿", "浅绛", "由墨起决定"],
              "zh-Hant": ["水墨", "青綠", "淺絳", "由墨起決定"],
              en: ["Ink wash", "Blue-green", "Light umber", "Let Inkspire decide"]
            }
          }
        ]
      }
    };
    renderApp({ initialRoute: "/studio" });

    fireEvent.click(await screen.findByRole("button", { name: "国画" }));
    fireEvent.click(screen.getByRole("button", { name: "山水" }));

    const draft = JSON.parse(window.localStorage.getItem("inkspire.studioDraft.v1") ?? "{}") as {
      answers?: Record<string, string>;
    };
    expect(draft.answers).toMatchObject({
      work_type: "painting",
      painting_subject: "山水"
    });
    expect(screen.getByRole("heading", { name: "偏好哪种设色？" })).toBeInTheDocument();
  });

  it("warns before uploading an oversized setup photo", async () => {
    configResponse = {
      ...publicConfig,
      image: { maxInputSizeMb: 1 }
    };
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    await user.upload(
      screen.getByLabelText("相册"),
      new File([new Uint8Array(1024 * 1024 + 1)], "too-large.png", { type: "image/png" })
    );

    expect(await screen.findByText("照片过大，请选择较小图片或先压缩。")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/uploads/photo"))).toBe(false);
  });

  it("shows the same clear upload size message when the API rejects a setup photo as too large", async () => {
    failUploadTooLarge = true;
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "server-large.png", { type: "image/png" }));

    expect(await screen.findByText("照片过大，请选择较小图片或先压缩。")).toBeInTheDocument();
    expect(screen.queryByText("暂时无法完成，请稍后再试。")).not.toBeInTheDocument();
  });

  it("renders option preview images without repeating visible labels", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    await screen.findByRole("button", { name: "国画" });

    expect(screen.getByRole("button", { name: "国画" }).textContent).not.toBe("国国画");
    expect(container.querySelectorAll(".option-preview-fallback")).toHaveLength(0);
    expect(container.querySelectorAll(".option-preview-image")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "国画" }));

    expect(screen.getByRole("button", { name: "山水" }).textContent).not.toBe("山山水");
    expect(container.querySelectorAll(".option-preview-fallback")).toHaveLength(0);
    expect(container.querySelectorAll(".option-preview-image")).toHaveLength(4);
  });

  it("requires the photo step after branch questions before showing generation", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await user.click(await screen.findByRole("button", { name: "国画" }));

    expect(screen.getByRole("button", { name: "上一步" })).toHaveClass("back-action");
  });

  it("shows the full expected progress on the first step", async () => {
    renderApp();

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
    renderApp();

    await screen.findByRole("heading", { name: "墨起" });
    await user.selectOptions(screen.getByLabelText("语言"), "en");

    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Artisans" })).toBeInTheDocument();
  });

  it("localizes the language selector label itself", async () => {
    const user = userEvent.setup();
    renderApp();

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
    const view = renderApp();

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();

    view.unmount();
    renderApp();

    expect(await screen.findByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
  });

  it("renders visual previews for options without leaking Chinese preview text in English", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");

    expect(screen.getByText("Choose the work type")).toBeInTheDocument();
    expect(screen.queryByText("选择国画或书法创作方向")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preview the artwork direction" })).toBeInTheDocument();
    const workTypePreviews = [...container.querySelectorAll(".option-preview-image")].map((image) => image.getAttribute("src"));
    expect(workTypePreviews).toHaveLength(2);
    expect(new Set(workTypePreviews).size).toBe(2);

    await user.click(screen.getByRole("button", { name: "Painting" }));

    expect(screen.getByRole("heading", { name: "What subject should the painting show?" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "What subject should the painting show?" })).toBeInTheDocument();
    const subjectPreviews = [...container.querySelectorAll(".option-preview-image")].map((image) => image.getAttribute("src"));
    expect(subjectPreviews).toHaveLength(4);
    expect(new Set(subjectPreviews).size).toBe(4);
  });

  it("leaves option preview frames empty before images decode", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    await user.click(await screen.findByRole("button", { name: "书法" }));

    expect(screen.getByRole("heading", { name: "偏好哪种书体？" })).toBeInTheDocument();
    expect(container.querySelectorAll(".option-preview-fallback")).toHaveLength(0);
    expect(container.querySelectorAll(".option-preview-image")).toHaveLength(4);
  });

  it("advances the question flow after clicking 国画", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await user.click(await screen.findByRole("button", { name: "书法" }));

    expect(screen.getByRole("heading", { name: "想写什么正文？" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("例如：年年有余、平安喜乐，或一两句祝福语"), "年年有余");
    await user.click(screen.getByRole("button", { name: "继续定书体" }));
    await user.click(screen.getByRole("button", { name: "行书" }));
    await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));
    await user.click(screen.getByRole("button", { name: /均衡/ }));
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
    const view = renderApp();

    await user.click(await screen.findByRole("button", { name: "国画" }));
    expect(screen.getByText("想画什么主题？")).toBeInTheDocument();

    view.unmount();
    renderApp();

    expect(await screen.findByText("想画什么主题？")).toBeInTheDocument();
    expect(screen.queryByText("先定作品类型")).not.toBeInTheDocument();
  });

  it("keeps the library tab selected when opened from the library URL", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];

    renderApp({ initialRoute: "/library" });

    expect(await screen.findByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "藏卷山水" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
  });

  it("shows question progress and can go back without losing the uploaded photo", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));
    expect(await screen.findByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();

    expect(screen.getByText("第 3 / 3 步")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "上一步" }));

    expect(screen.getByRole("heading", { name: "可选：添加环境照片" })).toBeInTheDocument();
    expect(screen.getByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();
  });

  it("moves back from notes to complexity when the browser back action is used", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    expect(await screen.findByRole("heading", { name: "想让作品丰富到什么程度？" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  });

  it("uses studio step URLs so browser back can move through multiple previous steps", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await user.click(await screen.findByRole("button", { name: "国画" }));
    expect(window.location.pathname).toBe("/studio");
    expect(window.location.search).toBe("?step=question&index=0");

    await user.click(screen.getByRole("button", { name: "山水" }));
    expect(window.location.search).toBe("?step=photo");

    await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));
    expect(window.location.search).toBe("?step=complexity");
    expect(screen.getByRole("heading", { name: "想让作品丰富到什么程度？" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /均衡/ }));
    expect(window.location.search).toBe("?step=notes");
    expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    expect(await screen.findByRole("heading", { name: "想让作品丰富到什么程度？" })).toBeInTheDocument();
    expect(window.location.search).toBe("?step=complexity");

    await act(async () => {
      window.history.back();
    });

    expect(await screen.findByRole("heading", { name: "可选：添加环境照片" })).toBeInTheDocument();
    expect(window.location.search).toBe("?step=photo");

    await act(async () => {
      window.history.back();
    });

    expect(await screen.findByText("想画什么主题？")).toBeInTheDocument();
    expect(window.location.search).toBe("?step=question&index=0");
  });

  it("uses an app URL replace instead of browser history for the in-app studio back button", async () => {
    const user = userEvent.setup();
    const historyBack = vi.spyOn(window.history, "back");
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    expect(window.location.search).toBe("?step=notes");

    await user.click(screen.getByRole("button", { name: "上一步" }));

    expect(historyBack).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "想让作品丰富到什么程度？" })).toBeInTheDocument();
    expect(window.location.search).toBe("?step=complexity");
  });

  it("keeps generation as the only submit action after questions complete", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);

    expect(screen.getByText("将生成作品图。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "可以开始生成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更雅" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "墨色淡些" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();
  });

  it("summarizes when generation will include a placement preview", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);

    expect(screen.getByText("将生成作品图和摆放效果图。")).toBeInTheDocument();
  });

  it("restores active job loading from the server with origin metadata", async () => {
    activeJobsResponse = [{
      id: "job-active-1",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      type: "painting",
      title: "藏卷山水",
      status: "running"
    }];

    renderApp();

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    expect(screen.queryByText("藏卷山水 作品图")).not.toBeInTheDocument();
  });

  it("keeps active job loading when switching tabs", async () => {
    activeJobsResponse = [{
      id: "job-active-1",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      type: "painting",
      title: "藏卷山水",
      status: "queued"
    }];
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "藏卷" }));
    expect(await screen.findByText("藏卷还空着")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
  });

  it("clears a stale stored running loading session when active jobs restore empty", async () => {
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-stale",
        resultRecordId: "record-stale",
        startedAt: Date.now(),
        status: "running",
        payload: { type: "painting", answers: {}, conversationNotes: "" }
      }
    }));
    activeJobsResponse = [];

    renderApp();

    expect(await screen.findByRole("button", { name: "国画" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "艺术家正在构思" })).not.toBeInTheDocument();
  });

  it("restores a metadata-less active job to the stored Library loading session after refresh", async () => {
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      library: {
        originTab: "library",
        operation: "adjust",
        jobId: "job-library-refresh",
        resultRecordId: "record-2",
        startedAt: Date.now(),
        status: "running",
        payload: { source_photo_path: "records/record-1/source-photo.webp" }
      }
    }));
    activeJobsResponse = [{
      id: "job-library-refresh",
      recordId: "record-2",
      stage: "fusion_render",
      status: "running"
    }];
    const user = userEvent.setup();

    renderApp({ initialRoute: "/studio" });

    expect(await screen.findByRole("button", { name: "国画" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "艺术家正在构思" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "艺术家正在理解原作" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "藏卷" }));

    expect(await screen.findByRole("heading", { name: "艺术家正在理解原作" })).toBeInTheDocument();
    await waitFor(() => {
      const sessions = JSON.parse(window.localStorage.getItem("inkspire.generationSessions.v1") ?? "{}");
      expect(sessions.library?.jobId).toBe("job-library-refresh");
      expect(sessions.studio).toBeUndefined();
    });
  });

  it("deduplicates a metadata-less active job when a stored Library session owns it", async () => {
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-duplicate-owner",
        resultRecordId: "record-2",
        startedAt: Date.now(),
        status: "running",
        payload: { type: "painting", answers: {}, conversationNotes: "" }
      },
      library: {
        originTab: "library",
        operation: "adjust",
        jobId: "job-duplicate-owner",
        resultRecordId: "record-2",
        startedAt: Date.now(),
        status: "running",
        payload: { source_photo_path: "records/record-1/source-photo.webp" }
      }
    }));
    activeJobsResponse = [{
      id: "job-duplicate-owner",
      recordId: "record-2",
      stage: "fusion_render",
      status: "running"
    }];
    const user = userEvent.setup();

    renderApp({ initialRoute: "/studio" });

    expect(await screen.findByRole("button", { name: "国画" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "艺术家正在构思" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "藏卷" }));
    expect(await screen.findByRole("heading", { name: "艺术家正在理解原作" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画案" }));
    expect(await screen.findByRole("button", { name: "国画" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "艺术家正在构思" })).not.toBeInTheDocument();
    await waitFor(() => {
      const sessions = JSON.parse(window.localStorage.getItem("inkspire.generationSessions.v1") ?? "{}");
      expect(sessions.library?.jobId).toBe("job-duplicate-owner");
      expect(sessions.studio).toBeUndefined();
    });
  });

  it("does not apply other tabs' active jobs to the Studio limit", async () => {
    activeJobsResponse = [{
      id: "job-active-1",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "library",
      type: "painting",
      title: "山水",
      status: "running"
    }, {
      id: "job-active-2",
      recordId: "record-2",
      stage: "fusion_render",
      origin_tab: "experts",
      type: "painting",
      title: "花鸟",
      status: "queued"
    }];
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));

    expect(screen.queryByText("画案已有生成任务，请等它完成后再开始。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不需要效果图，直接生成" })).toBeEnabled();
  });

  it("generates from empty notes with the primary generate button", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(generationRequestBodies()).toHaveLength(1);
    });
    expect(generationRequestBodies()[0].conversationNotes).toBe("");
    expect(generationRequestBodies()[0].source_photo_path).toBe("");
  });

  it("shows complexity selection after skipping the environment photo and sends the selected size", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));

    expect(screen.getByRole("heading", { name: "想让作品丰富到什么程度？" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /丰富/ }));
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(generationRequestBodies()).toHaveLength(1);
    });
    expect(generationRequestBodies()[0].source_photo_path).toBe("");
    expect(generationRequestBodies()[0].generation_complexity).toBe("large");
  });

  it("skips complexity selection when an environment photo is provided", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);

    expect(screen.queryByRole("heading", { name: "想让作品丰富到什么程度？" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(generationRequestBodies()).toHaveLength(1);
    });
    expect(generationRequestBodies()[0].source_photo_path).toBe("records/upload-1/source-photo.webp");
    expect(generationRequestBodies()[0]).not.toHaveProperty("generation_complexity");
  });

  it("shows Studio create loading copy after starting a queued origin job", async () => {
    queuedGenerationJob = {
      id: "job-studio-create",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "queued",
    };
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    expect(screen.getByText("通常约 30 秒，请稍候。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
    expect(generationRequestBodies()[0].origin_tab).toBe("studio");
    expect(generationRequestBodies()[0].operation).toBe("create");
    expect(JSON.parse(window.localStorage.getItem("inkspire.generationSessions.v1") ?? "{}")).toEqual(
      expect.objectContaining({
        studio: expect.objectContaining({
          payload: expect.objectContaining({
            generation_complexity: "medium"
          })
        })
      })
    );
    expect(window.location.pathname).toBe("/studio");
  });

  it("shows Studio loading while the generation request is still pending", async () => {
    holdGenerationResponse = true;
    queuedGenerationJob = {
      id: "job-studio-pending",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "queued",
    };
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    try {
      await waitFor(() => {
        expect(generationRequestBodies()).toHaveLength(1);
      });
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
      });
    } finally {
      releaseGenerationResponse?.();
    }
  });

  it("shows the longer Studio loading estimate when an uploaded photo will create a preview", async () => {
    queuedGenerationJob = {
      id: "job-studio-create-preview",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "queued",
    };
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    expect(screen.getByText("通常约 50 秒，请稍候。")).toBeInTheDocument();
    expect(generationRequestBodies()[0].source_photo_path).toBe("records/upload-1/source-photo.webp");
  });

  it("keeps bottom tabs usable while Studio loading exists and restores loading when returning", async () => {
    queuedGenerationJob = {
      id: "job-studio-switch",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "running",
    };
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "藏卷" }));

    expect(await screen.findByText("藏卷还空着")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the studio-origin result and clears loading when polling completes", async () => {
    activeJobsResponse = [{
      id: "job-origin-complete",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "running",
    }];
    jobResponses = {
      "job-origin-complete": {
        id: "job-origin-complete",
        recordId: "record-1",
        stage: "artwork",
        origin_tab: "studio",
        operation: "create",
        status: "succeeded"
      }
    };

    renderApp();

    expect(await screen.findByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.pathname).toBe("/records/record-1");
      expect(window.location.search).toBe("?from=studio");
    }, { timeout: 2500 });

    expect(screen.queryByRole("heading", { name: "艺术家正在构思" })).not.toBeInTheDocument();
  });

  it("hides retry when a restored active job fails without retryable payload", async () => {
    activeJobsResponse = [{
      id: "job-origin-failed",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "running"
    }];
    jobResponses = {
      "job-origin-failed": {
        id: "job-origin-failed",
        recordId: "record-1",
        stage: "artwork",
        origin_tab: "studio",
        operation: "create",
        status: "failed",
        error: "failed"
      }
    };

    renderApp();

    expect(await screen.findByRole("heading", { name: "生成没有完成" }, { timeout: 2500 })).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新尝试" })).not.toBeInTheDocument();
  });

  it("keeps generation complexity when retrying a failed generation session", async () => {
    activeJobsResponse = [{
      id: "job-origin-failed",
      recordId: "record-1",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "running"
    }];
    jobResponses = {
      "job-origin-failed": {
        id: "job-origin-failed",
        recordId: "record-1",
        stage: "artwork",
        origin_tab: "studio",
        operation: "create",
        status: "failed",
        error: "failed"
      }
    };
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-origin-failed",
        startedAt: Date.now(),
        status: "running",
        payload: {
          type: "painting",
          answers: { work_type: "painting", painting_subject: "山水" },
          conversationNotes: "",
          source_photo_path: "",
          generation_complexity: "large"
        }
      }
    }));
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "重新尝试" }, { timeout: 2500 }));

    const retryBodies = generationRequestBodies();
    expect(retryBodies[retryBodies.length - 1]).toEqual(expect.objectContaining({
      generation_complexity: "large",
      operation: "create",
      origin_tab: "studio"
    }));
  });

  it("puts refinement suggestions into notes before generating", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "更雅" }));

    expect(screen.getByLabelText("也可以补一句想法")).toHaveValue("更雅");
    expect(generationRequestBodies()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(generationRequestBodies()).toHaveLength(1);
    });
    expect(generationRequestBodies()[0].conversationNotes).toBe("更雅");
  });

  it("shows a clear action inside the notes field and clears the draft", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "更有气韵" }));

    expect(screen.getByLabelText("也可以补一句想法")).toHaveValue("更有气韵");
    await user.click(screen.getByRole("button", { name: "清除想法" }));

    expect(screen.getByLabelText("也可以补一句想法")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "清除想法" })).not.toBeInTheDocument();
  });

  it("persists notes and uploaded photo path across remounts", async () => {
    const user = userEvent.setup();
    const view = renderApp();

    await completePaintingWithPhoto(user);
    await user.type(screen.getByPlaceholderText("也可以补一句想法"), "更像家里玄关");

    view.unmount();
    renderApp();

    expect(await screen.findByDisplayValue("更像家里玄关")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "上一步" }));

    expect(screen.getByRole("heading", { name: "可选：添加环境照片" })).toBeInTheDocument();
    expect(screen.getByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();
  });

  it("shows when an optional photo is ready for fusion", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));

    expect(await screen.findByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "已选照片预览" })).toHaveAttribute("src", "blob:photo-preview");
    expect(screen.getByText("sample.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除照片" })).toBeInTheDocument();
    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "先不放照片" })).not.toBeInTheDocument();
  });

  it("uses a clean placeholder when the selected photo preview cannot load", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await completePaintingQuestions(user);
    await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));
    expect(await screen.findByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除照片" }));

    expect(screen.queryByText("已提供环境图片，将用于生成效果图。")).not.toBeInTheDocument();
    expect(screen.getByLabelText("相册")).toBeInTheDocument();
  });

  it("creates a fusion render after generating from an uploaded photo", async () => {
    const user = userEvent.setup();
    renderApp();

    const photo = new File(["sample"], "sample.png", { type: "image/png" });
    await completePaintingWithPhoto(user, photo);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1/fusion", expect.objectContaining({ method: "POST" }));
    });
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调整作品" })).toBeInTheDocument();
  });

  it("keeps Studio loading visible while automatic fusion is pending", async () => {
    holdFusionResponse = true;
    const user = userEvent.setup();
    renderApp();

    const photo = new File(["sample"], "sample.png", { type: "image/png" });
    await completePaintingWithPhoto(user, photo);
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1/fusion", expect.objectContaining({ method: "POST" }));
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "艺术家正在构思" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();

    releaseFusionResponse?.();

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
  });

  it("keeps a captured camera photo selected when the browser reports it through input", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    const cameraInput = screen.getByLabelText("拍照");
    const photo = new File(["camera"], "camera.png", { type: "image/png" });

    fireEvent.input(cameraInput, { target: { files: [photo] } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
    });
    expect(await screen.findByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();
    expect(screen.getByText("camera.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeInTheDocument();
  });

  it("keeps a captured camera photo when the input file list is only reliable during the event", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    const cameraInput = screen.getByLabelText("拍照") as HTMLInputElement;
    const photo = new File(["camera"], "camera-mobile.png", { type: "image/png" });
    let currentFiles: File[] = [photo];
    Object.defineProperty(cameraInput, "files", {
      configurable: true,
      get: () => currentFiles
    });

    fireEvent.input(cameraInput);
    currentFiles = [];

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
    });
    expect(await screen.findByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();
    expect(screen.getByText("camera-mobile.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeInTheDocument();
  });

  it("applies a captured camera photo when both input and change fire", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingQuestions(user);
    const cameraInput = screen.getByLabelText("拍照");
    const photo = new File(["camera"], "camera.png", { type: "image/png" });

    fireEvent.input(cameraInput, { target: { files: [photo] } });
    fireEvent.change(cameraInput, { target: { files: [photo] } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
    });
    const uploadCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([request]) => String(request))
      .filter((request) => request.endsWith("/api/uploads/photo"));

    expect(uploadCalls).toHaveLength(1);
    expect(await screen.findByText("已提供环境图片，将用于生成效果图。")).toBeInTheDocument();
    expect(screen.getByText("camera.png")).toBeInTheDocument();
  });

  it("puts the fusion image below the artwork before result actions on narrow screens", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const user = userEvent.setup();
    const { container } = renderApp();

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    const actions = container.querySelector(".result-actions");
    const artworkFigure = screen.getByRole("img", { name: "作品图" }).closest("figure");
    const fusionFigure = screen.getByRole("img", { name: "效果图" }).closest("figure");

    expect(actions).toBeTruthy();
    expect(artworkFigure).toBeTruthy();
    expect(fusionFigure).toBeTruthy();
    expect(artworkFigure!.compareDocumentPosition(fusionFigure!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fusionFigure!.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses compact square result media on narrow screens only", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toHaveClass("compact-result-media");
  });

  it("keeps the taller result media treatment on wide screens", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).not.toHaveClass("compact-result-media");
  });

  it("restores the current record after remounting", async () => {
    const user = userEvent.setup();
    const view = renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    const currentRoute = `${window.location.pathname}${window.location.search}`;
    view.unmount();
    renderApp({ initialRoute: currentRoute });

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
  });

  it("hides pre-generation controls and opens an adjust page from the result", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("也可以补一句想法")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByText("可先看尺寸和估价，确认意向后再联系制作。")).toBeInTheDocument();
    expect(container.querySelector(".result-actions")?.firstElementChild).toHaveTextContent("制作作品");

    await user.click(screen.getByRole("button", { name: "调整作品" }));

    expect(screen.getByRole("heading", { name: "调整这张作品" })).toBeInTheDocument();
    expect(screen.getByLabelText("调整这张作品")).toHaveFocus();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
  });

  it("uses a polished failure state when the artwork image cannot load", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    const image = await screen.findByRole("img", { name: "作品图" });
    image.dispatchEvent(new Event("error"));

    expect(await screen.findByText("作品图暂时无法显示")).toBeInTheDocument();
    expect(screen.getByText("可以补充要求后再生成，或稍后从藏卷重新打开。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整作品" })).not.toBeInTheDocument();
  });

  it("scrolls the generated result into view", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it("can attach a photo after artwork generation and then create a fusion render", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "效果图" })).not.toBeInTheDocument();

    const photo = new File(["late sample"], "late.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("添加环境照片生成效果图"), photo);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/fusion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            source_photo_path: "records/upload-1/source-photo.webp",
            origin_tab: "studio",
            operation: "adjust"
          })
        })
      );
    });
    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
  });

  it("uses the saved environment image to generate a fusion render without another upload", async () => {
    recordOneSourcePhotoPath = "records/record-1/source-photo.webp";
    const user = userEvent.setup();
    renderApp({ initialRoute: "/records/record-1?from=library" });

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成效果图" })).toBeInTheDocument();
    expect(screen.queryByLabelText("添加环境照片生成效果图")).not.toBeInTheDocument();

    vi.mocked(fetch).mockClear();
    await user.click(screen.getByRole("button", { name: "生成效果图" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/fusion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            source_photo_path: "records/record-1/source-photo.webp",
            origin_tab: "library",
            operation: "adjust"
          })
        })
      );
    });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/uploads/photo"))).toBe(false);
    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
  });

  it("can reupload an environment photo after a fusion render exists", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    expect(screen.getByLabelText("重新上传环境照片")).toBeInTheDocument();
    expect(screen.getByLabelText("重新上传环境照片")).not.toHaveAttribute("capture");

    vi.mocked(fetch).mockClear();
    await user.upload(screen.getByLabelText("重新上传环境照片"), new File(["new room"], "new-room.png", { type: "image/png" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/fusion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            source_photo_path: "records/upload-1/source-photo.webp",
            origin_tab: "studio",
            operation: "adjust"
          })
        })
      );
    });
    expect(screen.getByRole("img", { name: "效果图" })).toBeInTheDocument();
  });

  it("warns before attaching an oversized result photo", async () => {
    configResponse = {
      ...publicConfig,
      image: { maxInputSizeMb: 1 }
    };
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    vi.mocked(fetch).mockClear();

    await user.upload(
      screen.getByLabelText("添加环境照片生成效果图"),
      new File([new Uint8Array(1024 * 1024 + 1)], "late-large.png", { type: "image/png" })
    );

    expect(await screen.findByText("照片过大，请选择较小图片或先压缩。")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/uploads/photo"))).toBe(false);
  });

  it("shows an error if attaching a photo for fusion fails", async () => {
    failLateFusion = true;
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(screen.getByLabelText("添加环境照片生成效果图"), new File(["sample"], "late.png", { type: "image/png" }));

    expect(await screen.findByText("暂时无法完成，请稍后再试。")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "效果图" })).not.toBeInTheDocument();
  });

  it("shows the upload size message when attaching a result photo is rejected by the API", async () => {
    failUploadTooLarge = true;
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(await screen.findByLabelText("添加环境照片生成效果图"), new File(["sample"], "late-large.png", { type: "image/png" }));

    expect(await screen.findByText("照片过大，请选择较小图片或先压缩。")).toBeInTheDocument();
    expect(screen.queryByText("暂时无法完成，请稍后再试。")).not.toBeInTheDocument();
  });

  it("keeps artwork visible when fusion returns a failed job", async () => {
    failLateFusionJob = true;
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(screen.getByLabelText("添加环境照片生成效果图"), new File(["sample"], "late.png", { type: "image/png" }));

    expect(await screen.findByText("暂时无法完成，请稍后再试。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "效果图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成效果图" })).toBeInTheDocument();
    expect(screen.queryByLabelText("添加环境照片生成效果图")).not.toBeInTheDocument();
    expect(screen.queryByText("生成未完成")).not.toBeInTheDocument();
  });

  it("opens the production dialog with both service tiers after generation", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps keyboard focus inside the production dialog and closes with Escape", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    const makeButton = await screen.findByRole("button", { name: "制作作品" });
    await user.click(makeButton);

    expect(await screen.findByRole("dialog", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/records/record-1");
    expect(window.location.search).toBe("?from=studio");
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
  });

  it("restores the production dialog from a production URL", async () => {
    renderApp({ initialRoute: "/records/record-1/production?from=library" });

    expect(await screen.findByRole("dialog", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows only the selected artist reference hint in the production dialog", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(screen.getAllByText("推荐")).toHaveLength(1);
    expect(screen.getByText("慎选")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /第3级/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("保留整体布局与气势，细节交由艺术家自由发挥与提升。")).toBeInTheDocument();
    expect(screen.queryByText("几乎照搬 AI 图的构图与细节，艺术家发挥空间较小，不太推荐。")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /第1级/ }));

    expect(screen.getByText("几乎照搬 AI 图的构图与细节，艺术家发挥空间较小，不太推荐。")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /第5级/ }));

    expect(screen.getByText("AI 图仅作灵感参考，画面主要交给艺术家自由发挥与创作。")).toBeInTheDocument();
    expect(screen.queryByText("保留整体布局与气势，细节交由艺术家自由发挥与提升。")).not.toBeInTheDocument();
  });

  it("uses short visible labels for artist reference choices on mobile", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    await user.click(await screen.findByRole("button", { name: "调整尺寸" }));
    expect(screen.getByRole("radio", { name: /厅堂主景 · 约 75 × 75 cm/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /60 × 90 cm/ })).not.toBeInTheDocument();
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
    const writeText = vi.fn().mockResolvedValue(undefined);
    Element.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByText("专家定制")).toBeInTheDocument();
    expect(screen.queryByText(/020-12345678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/InkspireArt/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认制作意向" }));

    expect(screen.getByRole("heading", { name: "制作意向已记录" })).toBeInTheDocument();
    expect(screen.getByText(/电话：020-12345678/)).toBeInTheDocument();
    expect(screen.getByText(/微信：InkspireArt（点击拷贝）/)).toBeInTheDocument();
    expect(screen.getByText(/单号：ord-k8p4x2q9（点击拷贝）/)).toBeInTheDocument();
    expect(screen.getByText("保留整体布局与气势，细节交由艺术家自由发挥与提升。")).toBeInTheDocument();
    expect(screen.queryByText("第3级 布局参考")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整尺寸" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认制作意向" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /第3级/ })).not.toBeInTheDocument();
    const wechatButton = screen.getByRole("button", { name: /微信：InkspireArt（点击拷贝）/ });
    const orderButton = screen.getByRole("button", { name: /单号：ord-k8p4x2q9（点击拷贝）/ });

    expect(wechatButton.compareDocumentPosition(orderButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(orderButton);
    expect(screen.getByRole("status")).toHaveTextContent("已拷贝单号");
    await user.click(wechatButton);
    expect(screen.getByRole("status")).toHaveTextContent("已拷贝微信");

    expect(writeText).toHaveBeenNthCalledWith(1, "ord-k8p4x2q9");
    expect(writeText).toHaveBeenNthCalledWith(2, "InkspireArt");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("prefills inferred artwork size, supports friendly size adjustment, and submits reference level", async () => {
    const user = userEvent.setup();
    renderApp();

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

  it("can reupload an environment photo from the result picker input event", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    const reuploadInput = screen.getByLabelText("重新上传环境照片");
    const photo = new File(["camera room"], "camera-room.png", { type: "image/png" });

    vi.mocked(fetch).mockClear();
    fireEvent.input(reuploadInput, { target: { files: [photo] } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/fusion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            source_photo_path: "records/upload-1/source-photo.webp",
            origin_tab: "studio",
            operation: "adjust"
          })
        })
      );
    });
  });

  it("keeps a reuploaded result picker photo when the input file list is only reliable during the event", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    const reuploadInput = screen.getByLabelText("重新上传环境照片") as HTMLInputElement;
    const photo = new File(["camera room"], "camera-room.png", { type: "image/png" });
    let currentFiles: File[] = [photo];
    Object.defineProperty(reuploadInput, "files", {
      configurable: true,
      get: () => currentFiles
    });

    vi.mocked(fetch).mockClear();
    fireEvent.input(reuploadInput);
    currentFiles = [];

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
      expect(fetch).toHaveBeenCalledWith(
        "/api/records/record-1/fusion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            source_photo_path: "records/upload-1/source-photo.webp",
            origin_tab: "studio",
            operation: "adjust"
          })
        })
      );
    });
  });

  it("uploads a reuploaded result picker photo once when input and change both fire", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "效果图" })).toBeInTheDocument();
    const reuploadInput = screen.getByLabelText("重新上传环境照片");
    const photo = new File(["camera room"], "camera-room.png", { type: "image/png" });

    vi.mocked(fetch).mockClear();
    fireEvent.input(reuploadInput, { target: { files: [photo] } });
    fireEvent.change(reuploadInput, { target: { files: [photo] } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/photo", expect.objectContaining({ method: "POST" }));
    });
    const uploadCalls = vi.mocked(fetch).mock.calls
      .map(([request]) => String(request))
      .filter((request) => request.endsWith("/api/uploads/photo"));

    expect(uploadCalls).toHaveLength(1);
  });

  it("localizes production contact labels in English", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(await screen.findByRole("button", { name: "Make Artwork" }));
    await user.click(await screen.findByRole("button", { name: "Confirm production" }));

    expect(screen.getByRole("heading", { name: "Production request recorded" })).toBeInTheDocument();
    expect(screen.getByText(/Phone: 020-12345678/)).toBeInTheDocument();
    expect(screen.getByText(/WeChat: InkspireArt \(click to copy\)/)).toBeInTheDocument();
    expect(screen.getByText(/Order: ord-k8p4x2q9 \(click to copy\)/)).toBeInTheDocument();
    expect(screen.getByText("Keeps the overall layout while artists refine the details freely.")).toBeInTheDocument();
    expect(screen.queryByText("Level 3 Layout")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adjust" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm production" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Level 3/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Order: ord-k8p4x2q9 \(click to copy\)/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Copied order number");
    await user.click(screen.getByRole("button", { name: /WeChat: InkspireArt \(click to copy\)/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Copied WeChat");

    expect(writeText).toHaveBeenNthCalledWith(1, "ord-k8p4x2q9");
    expect(writeText).toHaveBeenNthCalledWith(2, "InkspireArt");
    expect(screen.queryByText(/电话：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/微信：/)).not.toBeInTheDocument();
  });

  it("localizes production size copy and custom size fields in English", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(await screen.findByRole("button", { name: "Make Artwork" }));

    expect(await screen.findByText("Square accent · approx. 50 × 50 cm")).toBeInTheDocument();
    expect(screen.getByText("Suggested from the artwork size estimate.")).toBeInTheDocument();
    expect(screen.queryByText(/方形点景/)).not.toBeInTheDocument();
    expect(screen.queryByText(/适合方形留白/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adjust" }));
    await user.click(screen.getByRole("radio", { name: /Custom size/ }));

    expect(screen.getByLabelText("Width cm")).toBeInTheDocument();
    expect(screen.getByLabelText("Height cm")).toBeInTheDocument();
    expect(screen.queryByLabelText("宽度 cm")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("高度 cm")).not.toBeInTheDocument();
  });

  it("creates a brand-new artwork from the adjust page and returns to the base on back", async () => {
    recordOneGenerationComplexity = "large";
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      generation_complexity: "large",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: /查看作品 藏卷山水/ }));
    expect(await screen.findByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );

    await user.click(screen.getByRole("button", { name: "调整作品" }));
    await user.type(screen.getByLabelText("调整这张作品"), "换成竖幅");
    await user.click(screen.getByRole("button", { name: "生成调整后的作品" }));

    const adjustmentBodies = generationRequestBodies();
    expect(adjustmentBodies[adjustmentBodies.length - 1]).toEqual(expect.objectContaining({
      origin_tab: "library",
      operation: "adjust",
      generation_complexity: "large",
      conversationNotes: "换成竖幅"
    }));
    expect(await screen.findByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-2/images/artwork"
    );

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "作品图" })).toHaveAttribute(
        "src",
        "/api/records/record-1/images/artwork"
      );
    });
  });

  it("starts a fresh studio flow when re-tapping the active 画案 tab on a result", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(screen.getByText("先定作品类型")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
  });

  it("shows library-owned adjustment loading when a saved result adjustment is queued", async () => {
    queuedGenerationJob = {
      id: "job-library-adjust",
      recordId: "record-2",
      stage: "artwork",
      origin_tab: "library",
      operation: "adjust",
      status: "queued"
    };
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp({ initialRoute: "/library" });

    await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
    await user.click(await screen.findByRole("button", { name: "调整作品" }));
    await user.type(screen.getByLabelText("调整这张作品"), "换成竖幅");
    await user.click(screen.getByRole("button", { name: "生成调整后的作品" }));

    expect(await screen.findByRole("heading", { name: "艺术家正在理解原作" })).toBeInTheDocument();
    expect(screen.getByText("通常约 30 秒，请稍候。")).toBeInTheDocument();
    const adjustmentBodies = generationRequestBodies();
    expect(adjustmentBodies[adjustmentBodies.length - 1]).toEqual(expect.objectContaining({
      origin_tab: "library",
      operation: "adjust"
    }));
    expect(window.location.pathname).toBe("/library");
  });

  it("returns to the result when leaving the adjust page via back", async () => {
    const user = userEvent.setup();
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "调整作品" }));
    expect(screen.getByRole("heading", { name: "调整这张作品" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回作品" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "调整这张作品" })).not.toBeInTheDocument();
  });

  it("returns to the source record route when opening adjust from a deep link", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/records/record-1/adjust?from=library" });

    expect(await screen.findByRole("heading", { name: "调整这张作品" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回作品" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/records/record-1");
      expect(window.location.search).toBe("?from=library");
    });
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
  });

  it("shows the generated artwork thumbnail in the library without reloading", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

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
    const { container } = renderApp();

    await user.click(await screen.findByRole("button", { name: "雅匠" }));

    expect(screen.getByText("可咨询方向")).toBeInTheDocument();
    expect(screen.getByText("专家定制")).toBeInTheDocument();
    expect(screen.getByText("专家指导")).toBeInTheDocument();
    expect(screen.getByText("装裱与落地咨询")).toBeInTheDocument();
    expect(screen.getByText("中国书法家协会会员")).toBeInTheDocument();
    expect(screen.getByText("中山大学中国美学博士")).toBeInTheDocument();
    expect(screen.getByText("风格样张")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /风格样张/ })).toHaveLength(2);
    expect(container.querySelectorAll(".expert-sample-fallback")).toHaveLength(0);
    expect(screen.queryByText("联系方式待确认")).not.toBeInTheDocument();
  });

  it("opens a saved library item as the current result", async () => {
    const user = userEvent.setup();
    renderApp();

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
    expect(screen.getByLabelText("添加环境照片生成效果图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "false");
  });

  it("returns to a fresh studio flow after opening a record from the library", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp({ initialRoute: "/library" });

    await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画案" }));

    expect(await screen.findByText("先定作品类型")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio");

    await user.click(screen.getByRole("button", { name: "藏卷" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/records/record-1");
    expect(window.location.search).toBe("?from=library");
  });

  it("returns to the library grid when navigating back from a library-opened record", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp({ initialRoute: "/library" });

    await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(screen.getByRole("button", { name: /查看作品 藏卷山水/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
  });

  it("returns to the library grid via the in-app back button on a library-opened record", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp({ initialRoute: "/library" });

    await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回藏卷" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(screen.getByRole("button", { name: /查看作品 藏卷山水/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
  });

  it("navigates to a studio record URL after generation", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/records/record-1");
    expect(window.location.search).toBe("?from=studio");
    expect(screen.queryByRole("button", { name: "返回藏卷" })).not.toBeInTheDocument();
  });

  it("opens and closes the artwork image viewer from the result page", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "查看作品图" }));

    const viewer = screen.getByRole("dialog", { name: "作品图" });
    const viewerScope = within(viewer);
    expect(viewer).toBeInTheDocument();
    expect(document.body).toHaveClass("image-viewer-open");
    expect(viewerScope.getByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );

    const transformedContent = viewer.querySelector(".image-viewer-transform-content") as HTMLElement;
    const transformedScale = () => Number(transformedContent.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? "1");

    await user.click(screen.getByRole("button", { name: "放大" }));
    await waitFor(() => {
      expect(transformedScale()).toBeGreaterThan(1);
    });

    await user.click(screen.getByRole("button", { name: "重置" }));
    await waitFor(() => {
      expect(transformedScale()).toBe(1);
    });

    await user.click(screen.getByRole("button", { name: "放大" }));
    await waitFor(() => {
      expect(transformedScale()).toBeGreaterThan(1.2);
    });
    const scaleBeforeZoomOut = transformedScale();
    const zoomOutButton = screen.getByRole("button", { name: "缩小" });
    await waitFor(() => {
      expect(zoomOutButton).toBeEnabled();
    });
    await user.click(zoomOutButton);
    await waitFor(() => {
      expect(transformedScale()).toBeGreaterThanOrEqual(1);
      expect(transformedScale()).toBeLessThan(scaleBeforeZoomOut);
    });

    const wheelViewer = screen.getByRole("dialog", { name: "作品图" });
    fireEvent.wheel(wheelViewer.querySelector(".image-viewer-stage") as Element, {
      deltaY: -100
    });
    await waitFor(() => {
      expect(transformedScale()).toBeGreaterThan(1);
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "作品图" })).not.toBeInTheDocument();
    });
    expect(document.body).not.toHaveClass("image-viewer-open");

    await user.click(screen.getByRole("button", { name: "查看作品图" }));
    expect(document.body).toHaveClass("image-viewer-open");
    await user.click(screen.getByRole("button", { name: "返回" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "作品图" })).not.toBeInTheDocument();
    });
    expect(document.body).not.toHaveClass("image-viewer-open");
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
  });

  it("opens the fusion image viewer from the result page", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "查看效果图" }));

    const viewer = screen.getByRole("dialog", { name: "效果图" });
    const viewerScope = within(viewer);
    expect(viewer).toBeInTheDocument();
    expect(viewerScope.getByRole("img", { name: "效果图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/fusion"
    );

    await user.click(screen.getByRole("button", { name: "返回" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "效果图" })).not.toBeInTheDocument();
    });
  });

  it("closes the result image viewer when browser back is used", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "查看作品图" }));

    expect(screen.getByRole("dialog", { name: "作品图" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "作品图" })).not.toBeInTheDocument();
    });
    expect(document.body).not.toHaveClass("image-viewer-open");
    expect(window.location.pathname).toBe("/records/record-1");
    expect(window.location.search).toBe("?from=studio");
    expect(screen.queryByText("确定要退出制作作品吗？")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
  });

  it("keeps browser back inside the studio tab after generation", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    expect(await screen.findByText("确定要退出制作作品吗？")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/records/record-1");
    });

    await user.click(screen.getByRole("button", { name: "确定返回" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/studio");
    });
    expect(screen.getByText("先定作品类型")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
  });

  it("confirms before leaving a studio result via the in-app back button", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回画案" }));
    expect(screen.getByText("确定要退出制作作品吗？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "继续查看" }));
    expect(screen.queryByText("确定要退出制作作品吗？")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/records/record-1");

    await user.click(screen.getByRole("button", { name: "返回画案" }));
    await user.click(screen.getByRole("button", { name: "确定返回" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/studio");
    });
    expect(screen.getByText("先定作品类型")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
  });

  it("restores a library record page from the URL", async () => {
    renderApp({ initialRoute: "/records/record-1?from=library" });

    expect(await screen.findByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the source tab when a record URL is missing", async () => {
    renderApp({ initialRoute: "/records/missing-record?from=library" });

    expect(await screen.findByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.pathname).toBe("/library");
  });

  it("canonicalizes unknown URLs back to the studio route", async () => {
    renderApp({ initialRoute: "/unknown/path" });

    expect(await screen.findByText("先定作品类型")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/studio");
  });

  it("migrates legacy activeTab and currentRecordId into the router URL once", async () => {
    window.localStorage.setItem("inkspire.activeTab", "library");
    window.localStorage.setItem("inkspire.currentRecordId", "record-1");

    renderApp({ initialRoute: "/" });

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/records/record-1");
    expect(window.location.search).toBe("?from=library");
    expect(window.localStorage.getItem("inkspire.activeTab")).toBeNull();
    expect(window.localStorage.getItem("inkspire.currentRecordId")).toBeNull();
  });

  it("returns to the library record page when switching away and back to the library tab", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp({ initialRoute: "/library" });

    await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "雅匠" }));
    expect(await screen.findByText("可咨询方向")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "藏卷" }));
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not show queued or running records in the library", async () => {
    libraryRecords = [
      {
        id: "queued-record",
        type: "painting",
        title: "排队作品",
        thumbnail_path: "records/queued-record/artwork.webp",
        artwork_path: "records/queued-record/artwork.webp",
        status: "queued",
        favorite: true
      },
      {
        id: "running-record",
        type: "calligraphy",
        title: "生成中作品",
        thumbnail_path: "records/running-record/artwork.webp",
        artwork_path: "records/running-record/artwork.webp",
        status: "running",
        favorite: true
      },
      {
        id: "failed-record",
        type: "painting",
        title: "失败作品",
        status: "failed",
        favorite: true
      },
      {
        id: "finished-record",
        type: "painting",
        title: "完成作品",
        thumbnail_path: "records/finished-record/artwork.webp",
        artwork_path: "records/finished-record/artwork.webp",
        status: "succeeded",
        favorite: true
      }
    ];
    renderApp({ initialRoute: "/library" });

    expect(await screen.findByRole("button", { name: /查看作品 完成作品/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /查看作品 失败作品/ })).toBeInTheDocument();
    expect(screen.queryByText("排队作品")).not.toBeInTheDocument();
    expect(screen.queryByText("生成中作品")).not.toBeInTheDocument();
  });

  it("keeps browser back at the current tab root instead of crossing tabs", async () => {
    renderApp({ historyEntries: ["/library", "/studio"] });

    expect(await screen.findByText("先定作品类型")).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/studio");
    });
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "藏卷还空着" })).not.toBeInTheDocument();
  });

  it("does not add a second window popstate listener for tab back handling", async () => {
    const popstateListeners: EventListenerOrEventListenerObject[] = [];
    const addEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "popstate") {
        popstateListeners.push(listener);
      }
      return addEventListener(type, listener, options);
    });

    renderApp({ initialRoute: "/studio" });

    await screen.findByText("先定作品类型");
    expect(popstateListeners).toHaveLength(1);
  });

  it("keeps browser back at the selected tab root after switching with bottom tabs", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await screen.findByText("先定作品类型");
    await user.click(screen.getByRole("button", { name: "藏卷" }));
    expect(await screen.findByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/library");
    });
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("先定作品类型")).not.toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("keeps production browser back inside the source tab", async () => {
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    const user = userEvent.setup();
    renderApp({ initialRoute: "/library" });

    await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));
    expect(await screen.findByRole("dialog", { name: "制作作品" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe("/records/record-1");
      expect(window.location.search).toBe("?from=library");
    });
    expect(screen.queryByRole("dialog", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the adjust page from a saved result even when the studio draft is still on the photo step", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("inkspire.studioDraft.v1", JSON.stringify({
      answers: { work_type: "painting", painting_subject: "山水" },
      photoStepComplete: false
    }));
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    renderApp();

    await user.click(await screen.findByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: /查看作品 藏卷山水/ }));
    await user.click(await screen.findByRole("button", { name: "调整作品" }));

    expect(screen.getByRole("heading", { name: "调整这张作品" })).toBeInTheDocument();
    expect(screen.getByLabelText("调整这张作品")).toHaveFocus();
    expect(screen.queryByRole("heading", { name: "可选：添加环境照片" })).not.toBeInTheDocument();
  });

  it("opens and closes the image viewer from the adjust page", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "调整作品" }));
    await user.click(screen.getByRole("button", { name: "查看当前作品 作品图" }));

    const viewer = screen.getByRole("dialog", { name: "当前作品 作品图" });
    expect(viewer).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.queryByRole("dialog", { name: "当前作品 作品图" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("调整这张作品")).toBeInTheDocument();
  });

  it("closes the adjust image viewer when browser back is used", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "调整作品" }));
    await user.click(screen.getByRole("button", { name: "查看当前作品 作品图" }));

    expect(screen.getByRole("dialog", { name: "当前作品 作品图" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "当前作品 作品图" })).not.toBeInTheDocument();
    });
    expect(document.body).not.toHaveClass("image-viewer-open");
    expect(window.location.pathname).toBe("/records/record-1/adjust");
    expect(window.location.search).toBe("?from=studio");
    expect(screen.getByLabelText("调整这张作品")).toBeInTheDocument();
  });

  it("keeps the adjust submit disabled until a direction is written", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("inkspire.studioDraft.v1", JSON.stringify({
      answers: { work_type: "painting", painting_subject: "山水" },
      photoStepComplete: false
    }));
    libraryRecords = [{
      id: "record-1",
      type: "painting",
      title: "藏卷山水",
      thumbnail_path: "records/record-1/artwork.webp",
      artwork_path: "records/record-1/artwork.webp",
      status: "succeeded",
      favorite: true
    }];
    renderApp();

    await user.click(await screen.findByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: /查看作品 藏卷山水/ }));
    await user.click(await screen.findByRole("button", { name: "调整作品" }));

    const submit = screen.getByRole("button", { name: "生成调整后的作品" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("调整这张作品"), "留白更多");
    expect(submit).toBeEnabled();
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
    renderApp();

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
    renderApp();

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(await screen.findByText(`Artwork · ${expectedDate}`)).toBeInTheDocument();
  });

  it("can remove a generated artwork from the library", async () => {
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

    await completePaintingWithoutPhoto(user);
    await user.type(screen.getByPlaceholderText("也可以补一句想法"), "fail");
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByText("生成未完成")).toBeInTheDocument();
    expect(screen.getByText("可以补充要求后再试一次，或稍后重新生成。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调整作品" })).not.toBeInTheDocument();
  });
});
