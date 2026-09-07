import { z } from "zod";
import { isHttpUrl } from "@shared/evidence";

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];
export type PipelineStage = "image.validation" | "face.detection" | "face.encoding" | "reverse.search" | "candidate.filter" | "match.validation";
export type StageLog = { stage: PipelineStage; status: "passed" | "failed" | "skipped"; timestamp: string; detail: string };
export type LensResultInput = { title: string; url: string; snippet?: string; imageUrl?: string };
export type SearchCandidate = { title: string; url: string; snippet: string; platform: string; imageUrl?: string };
export type ImageValidation = { valid: boolean; mimeType: SupportedImageType | null; sizeBytes: number; width: number | null; height: number | null; reason: string | null };
export type ReverseSearchResult = { provider: string; mode: string; searchUrl: string; results: LensResultInput[] };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linkedin.com", "x.com", "twitter.com", "tiktok.com"];
const SERPAPI_IMAGE_ENDPOINT = "https://serpapi.com/image";
const SERPAPI_SEARCH_ENDPOINT = "https://serpapi.com/search.json";

export class ReverseSearchConfigurationError extends Error {
  readonly code = "reverse_search_not_configured" as const;
  constructor(message = "Automated reverse-image search is not configured. Add SERPAPI_API_KEY on the server.") { super(message); }
}

export class ReverseSearchProviderError extends Error {
  readonly code = "reverse_search_provider_failed" as const;
  constructor(message: string) { super(message); }
}

export interface ReverseSearchProvider {
  readonly provider: string;
  readonly mode: "automated-api";
  search(image: Buffer, mimeType: SupportedImageType): Promise<ReverseSearchResult>;
}

function jpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

export function validateImageBuffer(buffer: Buffer, declaredMimeType?: string): ImageValidation {
  const sizeBytes = buffer.length;
  if (!sizeBytes) return { valid: false, mimeType: null, sizeBytes, width: null, height: null, reason: "Image is empty" };
  if (sizeBytes > MAX_IMAGE_BYTES) return { valid: false, mimeType: null, sizeBytes, width: null, height: null, reason: "Image exceeds the 8 MB limit" };
  const isPng = buffer.length > 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  const mimeType: SupportedImageType | null = isPng ? "image/png" : isJpeg ? "image/jpeg" : null;
  if (!mimeType || (declaredMimeType && declaredMimeType !== mimeType)) return { valid: false, mimeType, sizeBytes, width: null, height: null, reason: "Unsupported or mismatched image format; use JPG, JPEG, or PNG" };
  const dimensions = isPng ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : jpegDimensions(buffer);
  if (!dimensions || dimensions.width < 32 || dimensions.height < 32 || dimensions.width > 12000 || dimensions.height > 12000) return { valid: false, mimeType, sizeBytes, width: dimensions?.width ?? null, height: dimensions?.height ?? null, reason: "Unreadable image dimensions" };
  return { valid: true, mimeType, sizeBytes, width: dimensions.width, height: dimensions.height, reason: null };
}

export function gateFaceCount(faceCount: number) {
  if (!Number.isInteger(faceCount) || faceCount < 0) return { ok: false, code: "invalid_face_count", message: "Face detector returned an invalid count" } as const;
  if (faceCount === 0) return { ok: false, code: "no_face", message: "No face detected; processing stopped" } as const;
  if (faceCount > 1) return { ok: false, code: "multiple_faces", message: "Multiple faces detected; choose a target face before continuing" } as const;
  return { ok: true, code: "single_face", message: "Exactly one face detected; continue to ephemeral encoding" } as const;
}

function socialPlatform(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SOCIAL_DOMAINS.find(domain => host === domain || host.endsWith(`.${domain}`)) ?? null;
  } catch { return null; }
}

export function normalizeReverseSearchResults(results: LensResultInput[]): SearchCandidate[] {
  return results.flatMap(result => {
    const platform = socialPlatform(result.url);
    if (!result.title.trim() || !isHttpUrl(result.url) || !platform) return [];
    return [{ title: result.title.trim(), url: result.url, snippet: result.snippet?.trim() || "Reverse-search result; inspect the source during review", platform, ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}) }];
  }).slice(0, 12);
}

export const filterSocialCandidates = normalizeReverseSearchResults;

function asLensResults(payload: unknown): LensResultInput[] {
  if (!payload || typeof payload !== "object") return [];
  const visualMatches = (payload as { visual_matches?: unknown }).visual_matches;
  if (!Array.isArray(visualMatches)) return [];
  return visualMatches.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const title = typeof value.title === "string" ? value.title : "";
    const url = typeof value.link === "string" ? value.link : typeof value.url === "string" ? value.url : "";
    const snippet = typeof value.snippet === "string" ? value.snippet : undefined;
    const imageUrl = typeof value.image === "string" ? value.image : undefined;
    return title && url ? [{ title, url, snippet, imageUrl }] : [];
  });
}

export class SerpApiGoogleLensProvider implements ReverseSearchProvider {
  readonly provider = "SerpApi Google Lens" as const;
  readonly mode = "automated-api" as const;
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async search(image: Buffer, mimeType: SupportedImageType): Promise<ReverseSearchResult> {
    const form = new FormData();
    form.append("api_key", this.apiKey);
    form.append("image", new Blob([new Uint8Array(image)], { type: mimeType }), mimeType === "image/png" ? "input.png" : "input.jpg");
    const uploadResponse = await this.fetchImpl(SERPAPI_IMAGE_ENDPOINT, { method: "POST", body: form });
    const uploadPayload = await uploadResponse.json().catch(() => ({})) as { image_id?: string; error?: string };
    if (!uploadResponse.ok || !uploadPayload.image_id) throw new ReverseSearchProviderError(uploadPayload.error || `SerpApi image upload failed with HTTP ${uploadResponse.status}`);

    const requestParams = new URLSearchParams({ engine: "google_lens", image_id: uploadPayload.image_id, api_key: this.apiKey });
    const searchUrl = `${SERPAPI_SEARCH_ENDPOINT}?${requestParams.toString()}`;
    const publicSearchUrl = `${SERPAPI_SEARCH_ENDPOINT}?engine=google_lens&image_id=${encodeURIComponent(uploadPayload.image_id)}`;
    const searchResponse = await this.fetchImpl(searchUrl);
    const searchPayload = await searchResponse.json().catch(() => ({}));
    if (!searchResponse.ok || (searchPayload && typeof searchPayload === "object" && "error" in searchPayload)) {
      throw new ReverseSearchProviderError((searchPayload as { error?: string }).error || `SerpApi Lens search failed with HTTP ${searchResponse.status}`);
    }
    return { provider: this.provider, mode: this.mode, searchUrl: publicSearchUrl, results: asLensResults(searchPayload) };
  }
}

export function createReverseSearchProvider(fetchImpl: typeof fetch = fetch): ReverseSearchProvider {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new ReverseSearchConfigurationError();
  return new SerpApiGoogleLensProvider(apiKey, fetchImpl);
}

export function recordStage(stage: PipelineStage, status: StageLog["status"], detail: string): StageLog {
  const log = { stage, status, timestamp: new Date().toISOString(), detail } satisfies StageLog;
  console.info(JSON.stringify({ pipeline: "facetrace", ...log }));
  return log;
}

export function buildPipelineLogs(validation: ImageValidation, faceGate: ReturnType<typeof gateFaceCount>, searchStatus: "passed" | "failed" | "skipped", resultCount = 0, matchDetail = "Candidate matching is pending") {
  return [
    recordStage("image.validation", validation.valid ? "passed" : "failed", validation.valid ? `${validation.mimeType} ${validation.width}x${validation.height}` : validation.reason ?? "Invalid image"),
    recordStage("face.detection", faceGate.ok ? "passed" : "failed", faceGate.message),
    recordStage("face.encoding", faceGate.ok ? "passed" : "skipped", faceGate.ok ? "Ephemeral client-side embedding permitted; no embedding persisted" : "Encoding not reached"),
    recordStage("reverse.search", searchStatus, searchStatus === "passed" ? `${resultCount} actual ${process.env.REVERSE_SEARCH_PROVIDER ?? "automated reverse-search"} result(s) received` : searchStatus === "skipped" ? "Automated reverse search was not requested" : "Automated reverse-search provider failed"),
    recordStage("candidate.filter", resultCount ? "passed" : "skipped", resultCount ? `${resultCount} supported social-platform candidate(s)` : "No supported social-platform candidates returned"),
    recordStage("match.validation", resultCount ? "passed" : "skipped", matchDetail),
  ];
}

export const pipelineInput = z.object({
  imageBase64: z.string().min(16).max(11_000_000),
  declaredMimeType: z.enum(SUPPORTED_IMAGE_TYPES),
  faceCount: z.number().int().min(0).max(8),
});
