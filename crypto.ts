import { createHash } from "node:crypto";
import { keccak256, toUtf8Bytes } from "ethers";
import {
  canonicalEvidenceJson,
  EVIDENCE_DOMAIN,
  EvidencePayload,
  normalizeEvidence,
} from "@shared/evidence";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalEvidenceBytes(payload: EvidencePayload): string {
  return `${EVIDENCE_DOMAIN}\n${canonicalEvidenceJson(normalizeEvidence(payload))}`;
}

export function evidenceDigest(payload: EvidencePayload): string {
  return sha256Hex(canonicalEvidenceBytes(payload));
}

export function sourceUrlDigest(sourceUrl: string): string {
  return sha256Hex(sourceUrl.normalize("NFC").trim());
}

export function evidenceId(payload: EvidencePayload): string {
  return keccak256(toUtf8Bytes(canonicalEvidenceBytes(payload)));
}
