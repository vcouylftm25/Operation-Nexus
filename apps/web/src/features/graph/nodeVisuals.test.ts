import { describe, expect, it } from "vitest";
import { extractEventTimestamp, isMoneyRelationship, visualFor } from "./nodeVisuals";

describe("isMoneyRelationship", () => {
  it("flags relationship types that move or control money", () => {
    expect(isMoneyRelationship("TRANSFERRED_TO")).toBe(true);
    expect(isMoneyRelationship("OWNS_ACCOUNT")).toBe(true);
    expect(isMoneyRelationship("CONTROLLED_BY")).toBe(true);
  });

  it("does not flag unrelated relationship types", () => {
    expect(isMoneyRelationship("USED_DEVICE")).toBe(false);
    expect(isMoneyRelationship("MENTIONS")).toBe(false);
  });
});

describe("extractEventTimestamp", () => {
  it("reads the first known date-like property", () => {
    expect(extractEventTimestamp({ occurred_at: "2026-01-12" })).toBe("2026-01-12");
    expect(extractEventTimestamp({ sent_at: "2026-01-05T19:40:00Z" })).toBe("2026-01-05T19:40:00Z");
  });

  it("returns null when nothing date-like is present", () => {
    expect(extractEventTimestamp({ content: "hello" })).toBeNull();
    expect(extractEventTimestamp({})).toBeNull();
  });
});

describe("visualFor", () => {
  it("resolves the visual for the primary label", () => {
    expect(visualFor(["Person"]).shape).toBe("circle");
    expect(visualFor(["BankAccount"]).shape).toBe("diamond");
  });

  it("falls back to a default visual for unknown labels", () => {
    expect(visualFor(["SomethingNew"]).shape).toBe("default");
  });
});
