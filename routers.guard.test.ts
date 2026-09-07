import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const request = { protocol: "https", headers: {} } as TrpcContext["req"];
const response = { clearCookie: () => undefined } as TrpcContext["res"];

const user = {
  id: 7,
  openId: "regular-user",
  email: "regular@example.com",
  name: "Regular User",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const admin = { ...user, id: 8, openId: "admin-user", role: "admin" as const };

describe("workspace authorization", () => {
  it("rejects unauthenticated access to private cases", async () => {
    const caller = appRouter.createCaller({ user: undefined, req: request, res: response });
    await expect(caller.cases.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects regular users from admin diagnostics", async () => {
    const caller = appRouter.createCaller({ user, req: request, res: response });
    await expect(caller.cases.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permits the admin route only for admin users", async () => {
    const caller = appRouter.createCaller({ user: admin, req: request, res: response });
    await expect(caller.cases.adminList()).resolves.toBeInstanceOf(Array);
  });
});
