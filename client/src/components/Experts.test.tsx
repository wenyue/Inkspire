import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Experts from "./Experts";

describe("Experts", () => {
  test("labels reference images and unverified profile boundaries explicitly", () => {
    render(<Experts
      experts={[{
        id: "one", name: "某艺术家", region: "广东", bio: "未经核验履历", credentials: ["未经核验资质"],
        sampleImages: ["/sample.webp"], services: []
      }]}
      title="雅匠" locale="zh-Hans" serviceHeading="可咨询方向" extraServiceName="装裱咨询"
      extraServiceDescription="说明" expectationLabel="按需评估" sampleHeading="参考方向（非专家作品）"
      profileNotice="身份、履历与档期需在咨询前另行确认。" serviceBoundary="服务范围、费用与交付以双方确认为准。"
    />);
    expect(screen.getByText("参考方向（非专家作品）")).toBeInTheDocument();
    expect(screen.getByText("身份、履历与档期需在咨询前另行确认。")).toBeInTheDocument();
    expect(screen.getByText("服务范围、费用与交付以双方确认为准。")).toBeInTheDocument();
    expect(screen.queryByText("未经核验履历")).not.toBeInTheDocument();
    expect(screen.queryByText("未经核验资质")).not.toBeInTheDocument();
  });

  test("localizes the platform matching profile", () => {
    render(<Experts
      experts={[{
        id: "platform_artisan_match",
        name: { "zh-Hans": "平台合作雅匠", en: "Platform artisan matching" },
        region: { "zh-Hans": "承接人待确认", en: "Artisan to be confirmed" },
        bio: {},
        services: []
      }]}
      title="Artisans" locale="en" serviceHeading="Consultation" extraServiceName="Mounting"
      extraServiceDescription="Details" expectationLabel="Estimated" sampleHeading="References"
      profileNotice="Identity confirmed later." serviceBoundary="Final scope is confirmed separately."
    />);

    expect(screen.getByRole("heading", { name: "Platform artisan matching" })).toBeInTheDocument();
    expect(screen.getByText("Artisan to be confirmed")).toBeInTheDocument();
    expect(screen.queryByText("承接人待确认")).not.toBeInTheDocument();
  });
});
