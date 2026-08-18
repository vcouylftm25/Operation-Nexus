import { describe, expect, it } from "vitest";
import { formatClock, remainingSeconds } from "@/lib/utils";

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(125)).toBe("02:05");
    expect(formatClock(0)).toBe("00:00");
  });
});

describe("remainingSeconds", () => {
  it("prefers the live tick when present", () => {
    expect(remainingSeconds("2026-01-01T00:00:00.000Z", 120, 44)).toBe(44);
  });
});
