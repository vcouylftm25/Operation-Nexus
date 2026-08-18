import { describe, expect, it } from "vitest";
import { computeBackoffDelay } from "@/lib/ws";

describe("computeBackoffDelay", () => {
  it("grows exponentially without jitter", () => {
    expect(computeBackoffDelay(0, { minMs: 500, maxMs: 30_000, jitter: false })).toBe(500);
    expect(computeBackoffDelay(1, { minMs: 500, maxMs: 30_000, jitter: false })).toBe(1000);
    expect(computeBackoffDelay(2, { minMs: 500, maxMs: 30_000, jitter: false })).toBe(2000);
    expect(computeBackoffDelay(10, { minMs: 500, maxMs: 8_000, jitter: false })).toBe(8000);
  });

  it("stays within [0, cap] with jitter", () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const delay = computeBackoffDelay(attempt, { minMs: 500, maxMs: 4_000, jitter: true });
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(4_000);
    }
  });
});
