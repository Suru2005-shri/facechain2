import { describe, expect, it } from "vitest";
import { enforceRateLimit } from "./rateLimit";

describe("rate limiting", () => {
  it("allows the configured burst and rejects the next request", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(() => enforceRateLimit(key, 2, 60_000)).not.toThrow();
    expect(() => enforceRateLimit(key, 2, 60_000)).not.toThrow();
    expect(() => enforceRateLimit(key, 2, 60_000)).toThrow("RATE_LIMITED");
  });
});
