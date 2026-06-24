import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

const publicConfig = {
  questions: {
    painting: [
      {
        id: "painting_subject",
        applies_to: ["painting", "fusion"],
        preview_prompt: "中国画主题选择，留白构图",
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
        preview_prompt: "书法字体选择，行草楷隶",
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

describe("App", () => {
  let failLateFusion = false;
  let failLateFusionJob = false;

  beforeEach(() => {
    failLateFusion = false;
    failLateFusionJob = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/config/public")) {
        return Response.json(publicConfig);
      }
      if (url.endsWith("/api/library")) {
        return Response.json({ records: [] });
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders 墨起 and the three mobile nav buttons", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "藏卷" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "雅匠" })).toBeInTheDocument();
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

  it("renders visual previews for options without leaking Chinese preview text in English", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByLabelText("语言");
    await user.selectOptions(screen.getByLabelText("语言"), "en");

    expect(screen.getByText("Choose the work type")).toBeInTheDocument();
    expect(screen.queryByText("选择国画或书法创作方向")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".option-preview")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Painting" }));

    expect(screen.getByRole("heading", { name: "What subject should the painting show?" })).toBeInTheDocument();
    expect(container.querySelectorAll(".option-preview")).toHaveLength(4);
  });

  it("advances the question flow after clicking 国画", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));

    expect(screen.getByText("想画什么主题？")).toBeInTheDocument();
  });

  it("shows the default generation suggestion after questions complete", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));

    expect(screen.getByRole("button", { name: "可以开始生成" })).toBeInTheDocument();
  });

  it("shows when an optional photo is ready for fusion", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(await screen.findByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));

    expect(await screen.findByText("照片已准备，将生成融合图")).toBeInTheDocument();
  });

  it("clears the optional photo ready state when skipping the photo", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(await screen.findByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));
    expect(await screen.findByText("照片已准备，将生成融合图")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "先不放照片" }));

    expect(screen.queryByText("照片已准备，将生成融合图")).not.toBeInTheDocument();
  });

  it("creates a fusion render after generating from an uploaded photo", async () => {
    const user = userEvent.setup();
    render(<App />);

    const photo = new File(["sample"], "sample.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText("相册"), photo);
    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1/fusion", expect.objectContaining({ method: "POST" }));
    });
    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "融合图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续生成" })).toBeInTheDocument();
  });

  it("can attach a photo after artwork generation and then create a fusion render", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "融合图" })).not.toBeInTheDocument();

    const photo = new File(["late sample"], "late.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("补图生成融合图"), photo);

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
    expect(await screen.findByRole("img", { name: "融合图" })).toBeInTheDocument();
  });

  it("shows an error if attaching a photo for fusion fails", async () => {
    failLateFusion = true;
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(screen.getByLabelText("补图生成融合图"), new File(["sample"], "late.png", { type: "image/png" }));

    expect(await screen.findByText("暂时无法完成，请稍后再试。")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "融合图" })).not.toBeInTheDocument();
  });

  it("keeps artwork visible when fusion returns a failed job", async () => {
    failLateFusionJob = true;
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.upload(screen.getByLabelText("补图生成融合图"), new File(["sample"], "late.png", { type: "image/png" }));

    expect(await screen.findByText("暂时无法完成，请稍后再试。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "融合图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByLabelText("补图生成融合图")).toBeInTheDocument();
    expect(screen.queryByText("生成未完成")).not.toBeInTheDocument();
  });

  it("opens the production dialog with both service tiers after generation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "制作作品" })).toBeInTheDocument();
    });
    expect(screen.getByText("专家定制")).toBeInTheDocument();
    expect(screen.getByText("专家指导")).toBeInTheDocument();
  });

  it("updates production estimates when selecting a larger size", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByRole("radio", { name: /中幅/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /大幅/ }));

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
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));
    await user.click(await screen.findByRole("button", { name: "制作作品" }));

    expect(await screen.findByText("专家定制")).toBeInTheDocument();
    expect(screen.queryByText(/020-12345678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/InkspireArt/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认制作意向" }));

    expect(screen.getByText(/电话：020-12345678/)).toBeInTheDocument();
    expect(screen.getByText(/微信：InkspireArt/)).toBeInTheDocument();
  });

  it("localizes production contact labels in English", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));
    await user.selectOptions(screen.getByLabelText("语言"), "en");
    await user.click(await screen.findByRole("button", { name: "Make Artwork" }));
    await user.click(await screen.findByRole("button", { name: "Confirm production" }));

    expect(screen.getByText(/Phone: 020-12345678/)).toBeInTheDocument();
    expect(screen.getByText(/WeChat: InkspireArt/)).toBeInTheDocument();
    expect(screen.queryByText(/电话：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/微信：/)).not.toBeInTheDocument();
  });

  it("returns to the conversation panel when continuing after a result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));
    await user.click(await screen.findByRole("button", { name: "继续生成" }));

    expect(screen.queryByRole("img", { name: "作品图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();
  });

  it("focuses the notes box from the result add-notes action without hiding the result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "可以开始生成" }));

    expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "补充要求" }));

    expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("也可以补一句想法")).toHaveFocus();
  });

  it("shows the generated artwork thumbnail in the library without reloading", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "藏卷" }));

    expect(screen.getByRole("img", { name: "record-1" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );
  });

  it("opens a saved library item as the current result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "藏卷" }));
    await user.click(screen.getByRole("button", { name: /查看 record-1/ }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/records/record-1", undefined);
    });
    expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
    expect(screen.getByLabelText("补图生成融合图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  });

  it("can remove a generated artwork from the library", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "藏卷" }));

    expect(screen.getByRole("img", { name: "record-1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "移出藏卷" }));

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
    expect(screen.getByText("还没有收藏作品")).toBeInTheDocument();
  });

  it("shows a failed-result state without production actions when generation fails", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "国画" }));
    await user.click(screen.getByRole("button", { name: "山水" }));
    await user.type(screen.getByPlaceholderText("也可以补一句想法"), "fail");
    await user.click(screen.getByRole("button", { name: "生成" }));

    expect(await screen.findByText("生成未完成")).toBeInTheDocument();
    expect(screen.getByText("可以补充要求后再试一次，或稍后重新生成。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "制作作品" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续生成" })).toBeInTheDocument();
  });
});
