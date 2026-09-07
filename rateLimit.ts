const windows = new Map<string, number[]>();

export function enforceRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter(timestamp => now - timestamp < windowMs);
  if (recent.length >= maxRequests) {
    throw new Error("RATE_LIMITED");
  }
  recent.push(now);
  windows.set(key, recent);
}
