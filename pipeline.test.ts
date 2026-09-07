import { describe, expect, it, vi } from "vitest";
import { buildPipelineLogs, createReverseSearchProvider, filterSocialCandidates, gateFaceCount, normalizeReverseSearchResults, ReverseSearchConfigurationError, SerpApiGoogleLensProvider, validateImageBuffer } from "./pipeline";

const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64]);
const validPng = Buffer.concat([pngHeader, Buffer.alloc(200)]);

describe("pipeline image validation", () => {
  it("accepts a supported PNG signature with valid dimensions", () => {
    const result = validateImageBuffer(validPng, "image/png");
    expect(result.valid).toBe(true);
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it("rejects missing, corrupt, and mismatched inputs", () => {
    expect(validateImageBuffer(Buffer.alloc(0), "image/png").reason).toContain("empty");
    expect(validateImageBuffer(Buffer.from("not-an-image"), "image/png").valid).toBe(false);
    expect(validateImageBuffer(validPng, "image/jpeg").valid).toBe(false);
  });
});

describe("candidate filtering and audit logs", () => {
  it("stops for zero or multiple faces and continues for one", () => {
    expect(gateFaceCount(0)).toMatchObject({ ok: false, code: "no_face" });
    expect(gateFaceCount(2)).toMatchObject({ ok: false, code: "multiple_faces" });
    expect(gateFaceCount(1)).toMatchObject({ ok: true, code: "single_face" });
  });

  it("keeps only supported social-platform candidates from real result fields", () => {
    const candidates = normalizeReverseSearchResults([
      { title: "Public profile", url: "https://instagram.com/example", snippet: "Observed source" },
      { title: "Unrelated site", url: "https://example.org/page", snippet: "Observed source" },
    ]);
    expect(filterSocialCandidates(candidates)).toHaveLength(1);
    expect(candidates[0]?.platform).toBe("instagram.com");
    expect(candidates[0]).not.toHaveProperty("matchScore");
  });

  it("emits auditable stage logs", () => {
    const validation = validateImageBuffer(validPng, "image/png");
    const gate = gateFaceCount(1);
    const logs = buildPipelineLogs(validation, gate, "passed", 1);
    expect(logs.map(log => log.stage)).toEqual(["image.validation", "face.detection", "face.encoding", "reverse.search", "candidate.filter", "match.validation"]);
    expect(logs[2]?.detail).toContain("no embedding persisted");
  });
});

describe("SerpApi Google Lens provider", () => {
  it("uploads the image and searches with the returned image_id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ image_id: "img_123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ visual_matches: [{ title: "Observed profile", link: "https://instagram.com/example", snippet: "Real provider field", image: "https://cdn.example/profile.jpg" }] }), { status: 200 }));
    const provider = new SerpApiGoogleLensProvider("test-key", fetchMock as typeof fetch);
    const result = await provider.search(validPng, "image/png");
    expect(result.provider).toBe("SerpApi Google Lens");
    expect(result.mode).toBe("automated-api");
    expect(result.results[0]).toMatchObject({ title: "Observed profile", url: "https://instagram.com/example", imageUrl: "https://cdn.example/profile.jpg" });
    expect(result.searchUrl).not.toContain("test-key");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("image_id=img_123");
  });

  it("requires server configuration instead of falling back to manual search", () => {
    const previous = process.env.SERPAPI_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    expect(() => createReverseSearchProvider()).toThrow(ReverseSearchConfigurationError);
    if (previous) process.env.SERPAPI_API_KEY = previous;
  });
});
