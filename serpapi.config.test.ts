import { describe, expect, it } from "vitest";

describe("SerpApi configuration", () => {
  it("accepts the configured server-side key", async () => {
    const key = process.env.SERPAPI_API_KEY;
    expect(key, "SERPAPI_API_KEY must be configured for automated reverse search").toBeTruthy();

    const response = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key!)}`);
    expect(response.ok, `SerpApi account check failed with HTTP ${response.status}`).toBe(true);
    const payload = await response.json() as { error?: string; plan_searches_left?: number };
    expect(payload.error, "SerpApi rejected the configured key").toBeUndefined();
    expect(typeof payload.plan_searches_left).toBe("number");
  }, 15_000);
});
