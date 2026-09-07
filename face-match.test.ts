import { describe, expect, it } from "vitest";
import { candidateEvidenceFields, compareCandidateFaces } from "./face-match";

describe("candidate face comparison", () => {
  it("does not fabricate a similarity score without a provider image URL", async () => {
    const candidate = { title: "Public profile", url: "https://instagram.com/example", snippet: "Observed result" };
    const [result] = await compareCandidateFaces(new Float32Array([0, 1]), [candidate]);
    expect(result).toMatchObject({ matchStatus: "unavailable", similarityScore: null });
    expect(result).not.toHaveProperty("matchScore");
  });

  it("maps only public candidate metadata into the evidence draft", () => {
    expect(candidateEvidenceFields({ title: "Profile", url: "https://x.com/example", snippet: "Observed" })).toEqual({
      title: "Profile",
      sourceUrl: "https://x.com/example",
      contentExcerpt: "Observed",
      matchRationale: "Candidate selected for human review",
    });
  });
});
