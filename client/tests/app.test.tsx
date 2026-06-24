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
      phone: "020-12345678",
      wechat: "InkspireArt",
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
  beforeEach(() => {
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
        return Response.json({
          record: {
            id: "record-1",
            type: "painting",
            artwork_path: "records/record-1/artwork.webp",
            fusion_path: "records/record-1/fusion.webp",
            source_photo_path: "records/upload-1/source-photo.webp",
            status: "succeeded",
            has_fusion: true
          }
        }, { status: 201 });
      }
      if (url.endsWith("/api/records/record-1/production-estimate")) {
        return Response.json({
          expert_id: "wu_jiayin",
          estimates: {
            expert_custom: { amount: 1800, currency: "CNY", rule: "按尺寸、复杂度和交付周期估算" },
            expert_guided: { amount: 600, currency: "CNY", rule: "按咨询次数、修改轮次和复杂度估算" }
          }
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
