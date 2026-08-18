import { describe, expect, it } from "vitest";
import { formatClock, propertyText } from "@/lib/utils";

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(125)).toBe("02:05");
    expect(formatClock(0)).toBe("00:00");
  });

  it("keeps counting past the hour instead of wrapping", () => {
    expect(formatClock(3_725)).toBe("62:05");
  });
});

describe("propertyText", () => {
  it("renders a dash for missing values so a card never shows 'undefined'", () => {
    expect(propertyText(null)).toBe("—");
    expect(propertyText(undefined)).toBe("—");
  });

  it("keeps scalars readable and serialises anything else", () => {
    expect(propertyText(42)).toBe("42");
    expect(propertyText(["a", "b"])).toBe('["a","b"]');
  });
});
