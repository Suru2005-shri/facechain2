export const EVIDENCE_SCHEMA_VERSION = "facechain-evidence-v1";
export const EVIDENCE_DOMAIN = "FACECHAIN_EVIDENCE_V1";

export type EvidencePayload = {
  schemaVersion: string;
  sourceUrl: string;
  retrievedAt: string;
  title: string;
  publicAuthorLabel: string;
  contentExcerpt: string;
  provider: string;
  queryMethod: string;
  matchRationale: string;
};

export function normalizeEvidence(payload: EvidencePayload): EvidencePayload {
  const normalize = (value: string) => value.normalize("NFC").replace(/\r\n/g, "\n").trim();
  return {
    schemaVersion: normalize(payload.schemaVersion),
    sourceUrl: normalize(payload.sourceUrl),
    retrievedAt: normalize(payload.retrievedAt),
    title: normalize(payload.title),
    publicAuthorLabel: normalize(payload.publicAuthorLabel),
    contentExcerpt: normalize(payload.contentExcerpt),
    provider: normalize(payload.provider),
    queryMethod: normalize(payload.queryMethod),
    matchRationale: normalize(payload.matchRationale),
  };
}

export function canonicalEvidenceJson(payload: EvidencePayload): string {
  const normalized = normalizeEvidence(payload);
  return JSON.stringify(normalized, Object.keys(normalized).sort(), 0);
}

export function toDomainSeparatedMessage(payload: EvidencePayload): string {
  return `${EVIDENCE_DOMAIN}\n${canonicalEvidenceJson(payload)}`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
