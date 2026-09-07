import { describe, expect, it } from "vitest";
import { lensStatusDescription, lensStatusLabel, lensStatusTone } from "./lens-status";

describe("frontend automated reverse-search status binding", () => {
  it("renders distinct labels for every backend state", () => {
    expect(lensStatusLabel("provider_unconfigured")).toBe("provider unconfigured");
    expect(lensStatusLabel("provider_failed")).toBe("provider failed");
    expect(lensStatusLabel("no_supported_social_results")).toBe("no supported social results");
    expect(lensStatusLabel("ready")).toBe("ready");
  });

  it("maps statuses to intentional visual tones", () => {
    expect(lensStatusTone("ready")).toBe("success");
    expect(lensStatusTone("provider_failed")).toBe("error");
    expect(lensStatusTone("provider_unconfigured")).toBe("error");
    expect(lensStatusTone("no_supported_social_results")).toBe("warning");
  });

  it("keeps configuration and provider boundaries explicit", () => {
    expect(lensStatusDescription("provider_unconfigured")).toContain("server-side provider key");
    expect(lensStatusDescription("provider_failed")).toContain("No result was fabricated");
    expect(lensStatusDescription("no_supported_social_results")).toContain("social-platform");
    expect(lensStatusDescription("ready")).toContain("face comparison");
  });
});
