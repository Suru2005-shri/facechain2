import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  status: varchar("status", { length: 32 }).default("draft").notNull(),
  consentGranted: int("consentGranted").default(0).notNull(),
  retentionDays: int("retentionDays").default(7).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const evidenceRecords = mysqlTable("evidenceRecords", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  sourceUrlDigest: varchar("sourceUrlDigest", { length: 64 }).notNull(),
  evidenceDigest: varchar("evidenceDigest", { length: 64 }).notNull(),
  schemaVersion: varchar("schemaVersion", { length: 32 }).default("facechain-evidence-v1").notNull(),
  provider: varchar("provider", { length: 120 }).notNull(),
  queryMethod: varchar("queryMethod", { length: 160 }).notNull(),
  matchRationale: text("matchRationale"),
  retrievalTimestamp: timestamp("retrievalTimestamp").notNull(),
  title: text("title"),
  publicAuthorLabel: varchar("publicAuthorLabel", { length: 160 }),
  contentExcerpt: text("contentExcerpt"),
  chainNetwork: varchar("chainNetwork", { length: 80 }),
  contractAddress: varchar("contractAddress", { length: 64 }),
  transactionHash: varchar("transactionHash", { length: 96 }),
  evidenceId: varchar("evidenceId", { length: 66 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const verificationEvents = mysqlTable("verificationEvents", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("caseId").notNull(),
  evidenceId: int("evidenceId"),
  state: varchar("state", { length: 32 }).notNull(),
  candidateDigest: varchar("candidateDigest", { length: 64 }),
  recordedDigest: varchar("recordedDigest", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  caseId: int("caseId"),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  eventPayload: text("eventPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type VerificationEvent = typeof verificationEvents.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
