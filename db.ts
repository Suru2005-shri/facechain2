import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditEvents,
  cases,
  evidenceRecords,
  InsertUser,
  users,
  verificationEvents,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createCase(userId: number, title: string, retentionDays = 7) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(cases).values({
    userId,
    title,
    retentionDays,
    status: "draft",
    consentGranted: 0,
  });
  await recordAuditEvent(userId, Number(result[0].insertId), "case.created", { title });
  return Number(result[0].insertId);
}

export async function grantConsent(userId: number, caseId: number, retentionDays: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(cases).set({ consentGranted: 1, retentionDays, status: "consented" })
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)));
  await recordAuditEvent(userId, caseId, "consent.granted", { retentionDays });
}

export async function deleteCaseForUser(userId: number, caseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ownedCase = await getCaseForUser(userId, caseId);
  if (!ownedCase) throw new Error("Case not found");
  await recordAuditEvent(userId, null, "case.deleted", { caseId });
  await db.delete(verificationEvents).where(eq(verificationEvents.caseId, caseId));
  await db.delete(evidenceRecords).where(eq(evidenceRecords.caseId, caseId));
  await db.delete(auditEvents).where(eq(auditEvents.caseId, caseId));
  await db.delete(cases).where(and(eq(cases.id, caseId), eq(cases.userId, userId)));
}

export async function getAllCasesForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cases).orderBy(desc(cases.updatedAt));
}

export async function getCasesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cases).where(eq(cases.userId, userId)).orderBy(desc(cases.updatedAt));
}

export async function getCaseForUser(userId: number, caseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId))).limit(1);
  return result[0];
}

export async function createEvidenceRecord(userId: number, caseId: number, data: typeof evidenceRecords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ownedCase = await getCaseForUser(userId, caseId);
  if (!ownedCase || !ownedCase.consentGranted) throw new Error("Consent is required before evidence creation");
  const result = await db.insert(evidenceRecords).values({ ...data, caseId });
  await db.update(cases).set({ status: "evidence_ready" }).where(eq(cases.id, caseId));
  await recordAuditEvent(userId, caseId, "evidence.created", {
    evidenceDigest: data.evidenceDigest,
    provider: data.provider,
  });
  return Number(result[0].insertId);
}

export async function getEvidenceForCase(userId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  const ownedCase = await getCaseForUser(userId, caseId);
  if (!ownedCase) return [];
  return db.select().from(evidenceRecords)
    .where(eq(evidenceRecords.caseId, caseId)).orderBy(desc(evidenceRecords.createdAt));
}

export async function getEvidenceById(userId: number, evidenceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ evidence: evidenceRecords, case: cases })
    .from(evidenceRecords)
    .innerJoin(cases, eq(evidenceRecords.caseId, cases.id))
    .where(and(eq(evidenceRecords.id, evidenceId), eq(cases.userId, userId))).limit(1);
  return result[0];
}

export async function updateEvidenceAnchor(userId: number, evidenceId: number, anchor: {
  chainNetwork: string;
  contractAddress: string;
  transactionHash: string;
  evidenceId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const owned = await getEvidenceById(userId, evidenceId);
  if (!owned) throw new Error("Evidence not found");
  await db.update(evidenceRecords).set(anchor).where(eq(evidenceRecords.id, evidenceId));
  await db.update(cases).set({ status: "anchored" }).where(eq(cases.id, owned.evidence.caseId));
  await recordAuditEvent(userId, owned.evidence.caseId, "evidence.anchored", anchor);
}

export async function addVerificationEvent(userId: number, caseId: number, data: {
  evidenceId?: number;
  state: string;
  candidateDigest?: string;
  recordedDigest?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ownedCase = await getCaseForUser(userId, caseId);
  if (!ownedCase) throw new Error("Case not found");
  await db.insert(verificationEvents).values({ caseId, ...data });
  await recordAuditEvent(userId, caseId, `verification.${data.state}`, {
    candidateDigest: data.candidateDigest,
    recordedDigest: data.recordedDigest,
  });
}

export async function getVerificationHistory(userId: number, caseId: number) {
  const db = await getDb();
  if (!db) return [];
  const ownedCase = await getCaseForUser(userId, caseId);
  if (!ownedCase) return [];
  return db.select().from(verificationEvents)
    .where(eq(verificationEvents.caseId, caseId)).orderBy(desc(verificationEvents.createdAt));
}

export async function recordAuditEvent(userId: number, caseId: number | null, eventType: string, payload: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditEvents).values({
    userId,
    caseId,
    eventType,
    eventPayload: JSON.stringify(payload),
  });
}

export async function getAuditHistory(userId: number, caseId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = caseId === undefined
    ? eq(auditEvents.userId, userId)
    : and(eq(auditEvents.userId, userId), eq(auditEvents.caseId, caseId));
  return db.select().from(auditEvents).where(conditions).orderBy(desc(auditEvents.createdAt));
}

export async function getDashboardActivity(userId: number) {
  const db = await getDb();
  if (!db) return { counts: { valid: 0, altered: 0, missing: 0, duplicate: 0 }, total: 0, recentAudits: [] };

  const verificationRows = await db.select({ state: verificationEvents.state })
    .from(verificationEvents)
    .innerJoin(cases, eq(verificationEvents.caseId, cases.id))
    .where(eq(cases.userId, userId));
  const counts = { valid: 0, altered: 0, missing: 0, duplicate: 0 };
  for (const row of verificationRows) {
    if (row.state === "valid" || row.state === "altered" || row.state === "missing" || row.state === "duplicate") counts[row.state] += 1;
  }

  const recentAudits = await db.select({
    id: auditEvents.id,
    eventType: auditEvents.eventType,
    caseId: auditEvents.caseId,
    caseTitle: cases.title,
    createdAt: auditEvents.createdAt,
  }).from(auditEvents)
    .leftJoin(cases, eq(auditEvents.caseId, cases.id))
    .where(eq(auditEvents.userId, userId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(6);
  return { counts, total: verificationRows.length, recentAudits };
}
