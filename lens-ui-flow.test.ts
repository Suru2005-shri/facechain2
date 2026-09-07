import { describe, expect, it } from "vitest";
import { candidateEvidenceFields, lensSearchButtonLabel, parseLensResults } from "./lens-ui-flow";

describe("Create Evidence Lens interaction flow", () => {
  it("switches the action label after results are captured", () => {
    expect(lensSearchButtonLabel("")).toBe("Open Google Lens");
    expect(lensSearchButtonLabel("  [{\"title\":\"Actual result\"}]  ")).toBe("Process Lens results");
  });

  it("parses the exact captured JSON array and rejects non-arrays", () => {
    expect(parseLensResults("[{\"title\":\"Actual\",\"url\":\"https://instagram.com/example\"}]")).toEqual([
      { title: "Actual", url: "https://instagram.com/example" },
    ]);
    expect(() => parseLensResults("{\"title\":\"not an array\"}")).toThrow("Lens results must be a JSON array");
  });

  it("hands the selected backend candidate into the evidence draft", () => {
    expect(candidateEvidenceFields({
      title: "Actual Instagram result",
      url: "https://instagram.com/example",
      snippet: "Observed source text",
      platform: "instagram.com",
    })).toEqual({
      title: "Actual Instagram result",
      sourceUrl: "https://instagram.com/example",
      contentExcerpt: "Observed source text",
      matchRationale: "Candidate selected for human review",
    });
  });
});
