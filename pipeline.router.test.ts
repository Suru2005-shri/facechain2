import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const request = { protocol: "https", headers: {} } as TrpcContext["req"];
const response = { clearCookie: () => undefined } as TrpcContext["res"];
const user = {
  id: 71,
  openId: "pipeline-user",
  email: "pipeline@example.com",
  name: "Pipeline User",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAElEQVR42mNk+M/wHwAF/gL+Rk8uWQAAAABJRU5ErkJggg==";

function caller() {
  return appRouter.createCaller({ user, req: request, res: response });
}

function providerFetch(resultPayload: unknown, uploadStatus = 200) {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ image_id: "img_test" }), { status: uploadStatus }))
    .mockResolvedValueOnce(new Response(JSON.stringify(resultPayload), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pipeline.run automated reverse search", () => {
  it("returns provider_unconfigured when no server key exists", async () => {
    const previous = process.env.SERPAPI_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    const result = await caller().pipeline.run({ imageBase64: pngBase64, declaredMimeType: "image/png", faceCount: 1 });
    expect(result.status).toBe("provider_unconfigured");
    if (previous) process.env.SERPAPI_API_KEY = previous;
  });

  it("returns provider_failed when the automated provider rejects the upload", async () => {
    process.env.SERPAPI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "quota exceeded" }), { status: 429 })));
    const result = await caller().pipeline.run({ imageBase64: pngBase64, declaredMimeType: "image/png", faceCount: 1 });
    expect(result.status).toBe("provider_failed");
    expect(result.error).toContain("quota exceeded");
  });

  it("returns no_supported_social_results for genuine non-social provider results", async () => {
    process.env.SERPAPI_API_KEY = "test-key";
    vi.stubGlobal("fetch", providerFetch({ visual_matches: [{ title: "Observed article", link: "https://example.org/article", snippet: "Actual provider result" }] }));
    const result = await caller().pipeline.run({ imageBase64: pngBase64, declaredMimeType: "image/png", faceCount: 1 });
    expect(result.status).toBe("no_supported_social_results");
    expect(result.socialCandidates).toHaveLength(0);
  });

  it("returns ready with a normalized genuine social candidate", async () => {
    process.env.SERPAPI_API_KEY = "test-key";
    vi.stubGlobal("fetch", providerFetch({ visual_matches: [{ title: "Observed Instagram profile", link: "https://instagram.com/example", snippet: "Actual provider result", image: "https://cdn.example/profile.jpg" }] }));
    const result = await caller().pipeline.run({ imageBase64: pngBase64, declaredMimeType: "image/png", faceCount: 1 });
    expect(result.status).toBe("ready");
    expect(result.socialCandidates[0]).toMatchObject({ title: "Observed Instagram profile", platform: "instagram.com", imageUrl: "https://cdn.example/profile.jpg" });
    expect(JSON.stringify(result)).not.toContain("test-key");
    expect(result).toHaveProperty("matchValidation.status", "pending");
  });
});
