import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import Experts from "./Experts";

afterEach(cleanup);

describe("Experts", () => {
  test("shows Wu Jiayin's verified profile and authorized works without attribution labels", () => {
    render(<Experts
      experts={[{
        id: "wu_jiayin",
        name: { "zh-Hans": "吴嘉茵", "zh-Hant": "吳嘉茵", en: "Wu Jiayin" },
        region: { "zh-Hans": "广东省", "zh-Hant": "廣東省", en: "Guangdong, China" },
        bio: {
          "zh-Hans": "中山大学哲学博士，中国书法家协会会员。",
          "zh-Hant": "中山大學哲學博士，中國書法家協會會員。",
          en: "PhD in Philosophy from Sun Yat-sen University and member of the China Calligraphers Association."
        },
        credentials: [{
          "zh-Hans": "中国书法家协会会员",
          "zh-Hant": "中國書法家協會會員",
          en: "China Calligraphers Association member"
        }],
        sampleImages: ["/one.webp", "/two.webp", "/three.webp", "/four.webp"], services: []
      }]}
      title="雅匠" locale="zh-Hans" serviceHeading="可咨询方向" extraServiceName="装裱咨询"
      extraServiceDescription="说明" credentialsLabel="专业资历" sampleHeading="代表作品"
      sampleHint="左右滑动查看更多作品"
      profileNotice="吴嘉茵为平台已入驻专家。" serviceBoundary="服务范围、修改轮次与交付时间以双方确认为准。"
      consultLabel="咨询吴嘉茵" consultHint="复制平台微信后发起咨询" copiedLabel="平台微信已复制"
      consultWechat="InkspireArt"
    />);
    expect(screen.getByRole("heading", { name: "吴嘉茵" })).toBeInTheDocument();
    expect(screen.getByText("广东省")).toBeInTheDocument();
    expect(screen.getByText(/中山大学哲学博士/)).toBeInTheDocument();
    expect(screen.getByText("中国书法家协会会员")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "代表作品" })).toBeInTheDocument();
    expect(screen.getByText("左右滑动查看更多作品")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem", { name: /代表作品/ })).toHaveLength(4);
    expect(screen.getAllByRole("img", { name: /代表作品/ })).toHaveLength(4);
    expect(screen.getByText("服务范围、修改轮次与交付时间以双方确认为准。")).toBeInTheDocument();
    expect(screen.queryByText(/价格|金额|费用|报价|估算/)).not.toBeInTheDocument();
    expect(screen.queryByText(/非专家作品|承接人待确认|媒体来源|授权/)).not.toBeInTheDocument();
  });

  test("turns the artisan service card into a working consultation entry", async () => {
    const user = userEvent.setup();
    render(<Experts
      experts={[{
        id: "wu_jiayin",
        name: { "zh-Hans": "吴嘉茵" },
        region: { "zh-Hans": "广东省" },
        bio: { "zh-Hans": "书法家" },
        services: []
      }]}
      title="雅匠" locale="zh-Hans" serviceHeading="可咨询方向" extraServiceName="装裱咨询"
      extraServiceDescription="说明" credentialsLabel="专业资历" sampleHeading="代表作品"
      sampleHint="左右滑动查看更多作品" profileNotice="已入驻" serviceBoundary="确认后承接"
      consultLabel="咨询吴嘉茵" consultHint="复制平台微信后发起咨询" copiedLabel="平台微信已复制"
      consultWechat="InkspireArt"
    />);

    await user.click(screen.getByRole("button", { name: "咨询吴嘉茵" }));
    expect(await navigator.clipboard.readText()).toBe("InkspireArt");
    expect(screen.getByRole("status")).toHaveTextContent("平台微信已复制");
  });

  test("localizes Wu Jiayin's onboarded profile", () => {
    render(<Experts
      experts={[{
        id: "wu_jiayin",
        name: { "zh-Hans": "吴嘉茵", en: "Wu Jiayin" },
        region: { "zh-Hans": "广东省", en: "Guangdong, China" },
        bio: { "zh-Hans": "书法家", en: "Calligrapher" },
        services: []
      }]}
      title="Artisans" locale="en" serviceHeading="Consultation" extraServiceName="Mounting"
      extraServiceDescription="Details" credentialsLabel="Credentials" sampleHeading="References"
      sampleHint="Swipe sideways to see more works"
      profileNotice="Identity confirmed later." serviceBoundary="Final scope is confirmed separately."
    />);

    expect(screen.getByRole("heading", { name: "Wu Jiayin" })).toBeInTheDocument();
    expect(screen.getByText("Guangdong, China")).toBeInTheDocument();
    expect(screen.getByText("Calligrapher")).toBeInTheDocument();
    expect(screen.queryByText("广东省")).not.toBeInTheDocument();
  });
});
