import { describe, expect, it } from "vitest";
import { canonicalEvidenceJson, EVIDENCE_DOMAIN, EvidencePayload } from "@shared/evidence";
import { canonicalEvidenceBytes, evidenceDigest, evidenceId, sourceUrlDigest } from "./crypto";

const sample: EvidencePayload = {
  schemaVersion: "facechain-evidence-v1",
  sourceUrl: "https://example.org/public-post",
  retrievedAt: "2026-08-31T10:30:00.000Z",
  title: "Consent-based demonstration post",
  publicAuthorLabel: "demo-account",
  contentExcerpt: "A public excerpt used only for verification.",
  provider: "SerpApi Google Lens",
  queryMethod: "automated-api",
  matchRationale: "Candidate selected for human review",
};

describe("evidence hashing", () => {
  it("is deterministic and uses the declared domain separator", () => {
    expect(canonicalEvidenceBytes(sample)).toContain(`${EVIDENCE_DOMAIN}\n`);
    expect(evidenceDigest(sample)).toBe(evidenceDigest({ ...sample }));
    expect(evidenceId(sample)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sourceUrlDigest(sample.sourceUrl)).toHaveLength(64);
  });

  it("is stable when object key order changes", () => {
    const reordered = {
      matchRationale: sample.matchRationale,
      provider: sample.provider,
      contentExcerpt: sample.contentExcerpt,
      sourceUrl: sample.sourceUrl,
      title: sample.title,
      publicAuthorLabel: sample.publicAuthorLabel,
      queryMethod: sample.queryMethod,
      retrievedAt: sample.retrievedAt,
      schemaVersion: sample.schemaVersion,
    } as EvidencePayload;
    expect(canonicalEvidenceJson(reordered)).toBe(canonicalEvidenceJson(sample));
    expect(evidenceDigest(reordered)).toBe(evidenceDigest(sample));
  });

  it("changes when a meaningful field changes", () => {
    expect(evidenceDigest({ ...sample, title: "Altered title" })).not.toBe(evidenceDigest(sample));
    expect(evidenceDigest({ ...sample, contentExcerpt: `${sample.contentExcerpt} changed` })).not.toBe(evidenceDigest(sample));
    expect(evidenceDigest({ ...sample, schemaVersion: "facechain-evidence-v2" })).not.toBe(evidenceDigest(sample));
  });

  it("normalizes equivalent Unicode and line endings", () => {
    const equivalent = { ...sample, title: "Consent-based demonstration post\r\n" };
    expect(evidenceDigest(equivalent)).toBe(evidenceDigest(sample));
  });
});
