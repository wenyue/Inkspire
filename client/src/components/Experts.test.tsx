import { cleanup, render, screen } from "@testing-library/react";
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
        sampleImages: ["/one.webp", "/two.webp", "/three.webp"], services: []
      }]}
      title="雅匠" locale="zh-Hans" serviceHeading="可咨询方向" extraServiceName="装裱咨询"
      extraServiceDescription="说明" expectationLabel="专业资历" sampleHeading="代表作品"
      profileNotice="吴嘉茵为平台已入驻专家。" serviceBoundary="服务范围、费用与交付以双方确认为准。"
    />);
    expect(screen.getByRole("heading", { name: "吴嘉茵" })).toBeInTheDocument();
    expect(screen.getByText("广东省")).toBeInTheDocument();
    expect(screen.getByText(/中山大学哲学博士/)).toBeInTheDocument();
    expect(screen.getByText("中国书法家协会会员")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /代表作品/ })).toHaveLength(3);
    expect(screen.getByText("服务范围、费用与交付以双方确认为准。")).toBeInTheDocument();
    expect(screen.queryByText(/非专家作品|承接人待确认|媒体来源|授权/)).not.toBeInTheDocument();
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
      extraServiceDescription="Details" expectationLabel="Estimated" sampleHeading="References"
      profileNotice="Identity confirmed later." serviceBoundary="Final scope is confirmed separately."
    />);

    expect(screen.getByRole("heading", { name: "Wu Jiayin" })).toBeInTheDocument();
    expect(screen.getByText("Guangdong, China")).toBeInTheDocument();
    expect(screen.getByText("Calligrapher")).toBeInTheDocument();
    expect(screen.queryByText("广东省")).not.toBeInTheDocument();
  });
});
