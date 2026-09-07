import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  addVerificationEvent,
  createCase,
  createEvidenceRecord,
  getAuditHistory,
  getDashboardActivity,
  deleteCaseForUser,
  getCaseForUser,
  getCasesForUser,
  getAllCasesForAdmin,
  getEvidenceById,
  getEvidenceForCase,
  getVerificationHistory,
  grantConsent,
  recordAuditEvent,
  updateEvidenceAnchor,
} from "./db";
import { evidenceDigest, evidenceId, sourceUrlDigest } from "./crypto";
import { enforceRateLimit } from "./rateLimit";
import { EvidencePayload } from "@shared/evidence";
import { buildPipelineLogs, createReverseSearchProvider, gateFaceCount, pipelineInput, ReverseSearchConfigurationError, ReverseSearchProviderError, validateImageBuffer, normalizeReverseSearchResults } from "./pipeline";

const evidenceInput = z.object({
  schemaVersion: z.string().min(1).max(32),
  sourceUrl: z.string().url().max(2000),
  retrievedAt: z.string().datetime(),
  title: z.string().min(1).max(500),
  publicAuthorLabel: z.string().max(160),
  contentExcerpt: z.string().max(1200),
  provider: z.string().min(1).max(120),
  queryMethod: z.string().min(1).max(160),
  matchRationale: z.string().min(1).max(1200),
});

const caseIdInput = z.object({ caseId: z.number().int().positive() });

function getEvidencePayload(input: z.infer<typeof evidenceInput>): EvidencePayload {
  return input;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export const appRouter = router({
  system: systemRouter,
  dashboard: router({
    activity: protectedProcedure.query(({ ctx }) => getDashboardActivity(ctx.user.id)),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  cases: router({
    list: protectedProcedure.query(({ ctx }) => getCasesForUser(ctx.user.id)),
    adminList: adminProcedure.query(() => getAllCasesForAdmin()),
    create: protectedProcedure.input(z.object({ title: z.string().min(3).max(160), retentionDays: z.number().int().min(1).max(30).default(7) })).mutation(({ ctx, input }) => createCase(ctx.user.id, input.title, input.retentionDays)),
    delete: protectedProcedure.input(caseIdInput).mutation(({ ctx, input }) => deleteCaseForUser(ctx.user.id, input.caseId)),
    get: protectedProcedure.input(caseIdInput).query(({ ctx, input }) => getCaseForUser(ctx.user.id, input.caseId)),
    consent: protectedProcedure.input(z.object({ caseId: z.number().int().positive(), retentionDays: z.number().int().min(1).max(30) })).mutation(({ ctx, input }) => grantConsent(ctx.user.id, input.caseId, input.retentionDays)),
    timeline: protectedProcedure.input(caseIdInput).query(async ({ ctx, input }) => ({
      verifications: await getVerificationHistory(ctx.user.id, input.caseId),
      audit: await getAuditHistory(ctx.user.id, input.caseId),
    })),
  }),
  pipeline: router({
    run: protectedProcedure.input(pipelineInput).mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.imageBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
      const validation = validateImageBuffer(buffer, input.declaredMimeType);
      const faceGate = gateFaceCount(input.faceCount);
      if (!validation.valid || !faceGate.ok) {
        const logs = buildPipelineLogs(validation, faceGate, "skipped");
        await recordAuditEvent(ctx.user.id, null, "pipeline.rejected", { reason: validation.reason ?? faceGate.code, stages: logs });
        return { status: "rejected" as const, validation, faceGate, candidates: [], socialCandidates: [], logs, embedding: null, matchThreshold: Number(process.env.FACE_MATCH_THRESHOLD ?? "0.82") };
      }

      let provider;
      try {
        provider = createReverseSearchProvider();
      } catch (error) {
        const reason = error instanceof ReverseSearchConfigurationError ? error.message : "Automated reverse search is unavailable";
        const logs = buildPipelineLogs(validation, faceGate, "failed", 0, reason);
        await recordAuditEvent(ctx.user.id, null, "pipeline.provider_unconfigured", { reason, stages: logs });
        return { status: "provider_unconfigured" as const, validation, faceGate, candidates: [], socialCandidates: [], logs, embedding: null, matchThreshold: Number(process.env.FACE_MATCH_THRESHOLD ?? "0.82"), error: reason };
      }

      try {
        const search = await provider.search(buffer, validation.mimeType!);
        const candidates = normalizeReverseSearchResults(search.results);
        const searchStatus = "passed" as const;
        const resultState = candidates.length ? "ready" as const : "no_supported_social_results" as const;
        const logs = buildPipelineLogs(validation, faceGate, searchStatus, candidates.length);
        await recordAuditEvent(ctx.user.id, null, "pipeline.completed", { provider: search.provider, mode: search.mode, rawResultCount: search.results.length, resultCount: candidates.length, resultState, stages: logs });
        return { status: resultState, provider: search.provider, mode: search.mode, searchUrl: search.searchUrl, validation, faceGate, candidates, socialCandidates: candidates, logs, embedding: { model: process.env.FACE_MODEL_NAME ?? "client-ephemeral-model", persisted: false }, matchValidation: { status: "pending" as const, threshold: Number(process.env.FACE_MATCH_THRESHOLD ?? "0.82"), reason: "Candidate images returned by the provider are ready for face comparison" } };
      } catch (error) {
        const reason = error instanceof ReverseSearchProviderError ? error.message : "Automated reverse-search provider failed";
        const logs = buildPipelineLogs(validation, faceGate, "failed", 0, reason);
        await recordAuditEvent(ctx.user.id, null, "pipeline.provider_failed", { provider: provider.provider, reason, stages: logs });
        return { status: "provider_failed" as const, provider: provider.provider, mode: provider.mode, validation, faceGate, candidates: [], socialCandidates: [], logs, embedding: null, matchThreshold: Number(process.env.FACE_MATCH_THRESHOLD ?? "0.82"), error: reason };
      }
    }),
  }),
  evidence: router({
    list: protectedProcedure.input(caseIdInput).query(({ ctx, input }) => getEvidenceForCase(ctx.user.id, input.caseId)),
    create: protectedProcedure.input(evidenceInput.extend({ caseId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { caseId, ...raw } = input;
      const payload = getEvidencePayload(raw);
      const digest = evidenceDigest(payload);
      const recordId = await createEvidenceRecord(ctx.user.id, caseId, {
        caseId,
        sourceUrl: payload.sourceUrl,
        sourceUrlDigest: sourceUrlDigest(payload.sourceUrl),
        evidenceDigest: digest,
        schemaVersion: payload.schemaVersion,
        provider: payload.provider,
        queryMethod: payload.queryMethod,
        matchRationale: payload.matchRationale,
        retrievalTimestamp: new Date(payload.retrievedAt),
        title: payload.title,
        publicAuthorLabel: payload.publicAuthorLabel,
        contentExcerpt: payload.contentExcerpt,
        evidenceId: evidenceId(payload),
      });
      return { recordId, digest, evidenceId: evidenceId(payload), sourceUrlDigest: sourceUrlDigest(payload.sourceUrl), canonicalRecord: payload };
    }),
    anchor: protectedProcedure.input(z.object({
      evidenceRecordId: z.number().int().positive(),
      chainNetwork: z.string().min(2).max(80),
      contractAddress: z.string().min(10).max(64),
      transactionHash: z.string().min(10).max(96),
      evidenceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    })).mutation(({ ctx, input }) => updateEvidenceAnchor(ctx.user.id, input.evidenceRecordId, {
      chainNetwork: input.chainNetwork,
      contractAddress: input.contractAddress,
      transactionHash: input.transactionHash,
      evidenceId: input.evidenceId,
    })),
    verify: protectedProcedure.input(evidenceInput.extend({ caseId: z.number().int().positive(), evidenceRecordId: z.number().int().positive(), onChainDigest: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(), onChainExists: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const { caseId, evidenceRecordId, ...raw } = input;
      const owned = await getEvidenceById(ctx.user.id, evidenceRecordId);
      if (!owned || owned.evidence.caseId !== caseId) {
        await addVerificationEvent(ctx.user.id, caseId, { state: "missing", notes: "No user-owned evidence record was found" });
        return { state: "missing" as const, candidateDigest: null, recordedDigest: null };
      }
      const candidateDigest = evidenceDigest(getEvidencePayload(raw));
      const recordedDigest = owned.evidence.evidenceDigest;
      const chainChecked = input.onChainExists !== undefined;
      const chainMatches = input.onChainExists === true && input.onChainDigest?.toLowerCase() === recordedDigest.toLowerCase() && candidateDigest.toLowerCase() === input.onChainDigest.toLowerCase();
      const state = chainChecked ? (input.onChainExists === false ? "missing" : chainMatches ? "valid" : "altered") : (candidateDigest === recordedDigest ? "valid" : "altered");
      await addVerificationEvent(ctx.user.id, caseId, { evidenceId: evidenceRecordId, state, candidateDigest, recordedDigest, notes: state === "valid" ? "Canonical digest matches" : "Canonical digest mismatch" });
      return { state: state as "valid" | "altered", candidateDigest, recordedDigest, transactionHash: owned.evidence.transactionHash,         explorerUrl: owned.evidence.chainNetwork && owned.evidence.transactionHash ? `${process.env.EXPLORER_BASE_URL ?? "https://sepolia.etherscan.io/tx"}/${owned.evidence.transactionHash}` : null };
    }),
  }),
  ai: router({
    contractReview: protectedProcedure.mutation(async ({ ctx }) => {
      try { enforceRateLimit(`ai-contract:${ctx.user.id}`, 3, 60_000); } catch { throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI review rate limit reached. Try again shortly." }); }
      const { data } = await listLLMModels();
      const model = data.find(candidate => candidate.id === "gpt-5")?.id ?? data[0]?.id;
      if (!model) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "No review model is currently available" });
      const contractDesign = `ProofRegistry design: a public mapping from bytes32 evidenceId to evidenceDigest, sourceUrlDigest, submitter, createdAt, exists; registerProof rejects duplicate evidenceId; ProofRegistered event exposes indexed evidenceId, evidenceDigest and submitter; verifyProof compares a candidate digest with the stored digest; no raw images, embeddings, names, URLs or source content are stored.`;
      const result = await invokeLLM({
        model,
        reasoning: { effort: "medium" },
        messages: [
          { role: "system", content: "You are a senior smart-contract security reviewer. Review only the supplied design. Do not claim that an AI review is a formal audit. Return structured JSON with concrete risks and mitigations." },
          { role: "user", content: contractDesign },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "contract_security_review",
            strict: true,
            schema: {
              type: "object",
              properties: {
                posture: { type: "string", enum: ["mvp_ready_with_review", "needs_changes", "insufficient_context"] },
                summary: { type: "string" },
                strengths: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
                mitigations: { type: "array", items: { type: "string" } },
              },
              required: ["posture", "summary", "strengths", "risks", "mitigations"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = result.choices[0]?.message?.content;
      if (typeof content !== "string") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Security review returned no structured result" });
      return { model, review: JSON.parse(content) as { posture: string; summary: string; strengths: string[]; risks: string[]; mitigations: string[] } };
    }),
    review: protectedProcedure.input(z.object({ provider: z.string(), queryMethod: z.string(), title: z.string(), url: z.string().url(), snippet: z.string().max(1000) })).mutation(async ({ ctx, input }) => {
      try { enforceRateLimit(`ai-review:${ctx.user.id}`, 8, 60_000); } catch { throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI review rate limit reached. Try again shortly." }); }
      const { data } = await listLLMModels();
      const model = data.find(candidate => candidate.id === "gpt-5-mini")?.id ?? data[0]?.id;
      if (!model) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "No review model is currently available" });
      const result = await invokeLLM({
        model,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: "You review public evidence candidates for a privacy-first integrity workflow. Never infer or claim a person's identity from a face. Do not calculate or invent visual similarity or identity scores. Return only structured JSON about provenance and missing metadata." },
          { role: "user", content: `Review this candidate using only the supplied public metadata. Identify provenance risks, missing evidence fields, and whether a human reviewer should inspect it. Candidate: ${JSON.stringify(input)}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "evidence_review",
            strict: true,
            schema: {
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["review", "cautious", "ready_for_human_review"] },
                rationale: { type: "string" },
                risks: { type: "array", items: { type: "string" } },
                suggestedChecks: { type: "array", items: { type: "string" } },
              },
              required: ["verdict", "rationale", "risks", "suggestedChecks"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = result.choices[0]?.message?.content;
      if (typeof content !== "string") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Review model returned no structured result" });
      return { model, review: JSON.parse(content) as { verdict: string; rationale: string; risks: string[]; suggestedChecks: string[] } };
    }),
  }),
  audit: router({
    all: protectedProcedure.query(({ ctx }) => getAuditHistory(ctx.user.id)),
  }),
});

export type AppRouter = typeof appRouter;
