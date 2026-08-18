import { describe, expect, it } from "vitest";
import {
  edgeLabelCapacity,
  extractEventTimestamp,
  isMoneyRelationship,
  shouldShowAllEdgeLabels,
  visualFor,
} from "./nodeVisuals";

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

describe("edge label density", () => {
  it("labels every edge of a small case at the zoom FIT settles on", () => {
    expect(shouldShowAllEdgeLabels(14, 0.7)).toBe(true);
    expect(shouldShowAllEdgeLabels(9, 1)).toBe(true);
  });

  it("falls back to hover-only when a dense view is zoomed out", () => {
    expect(shouldShowAllEdgeLabels(40, 0.5)).toBe(false);
    expect(shouldShowAllEdgeLabels(26, 1)).toBe(false);
  });

  it("gives more room as the camera zooms in, within limits", () => {
    expect(edgeLabelCapacity(2)).toBeGreaterThan(edgeLabelCapacity(1));
    expect(edgeLabelCapacity(0.45)).toBe(16);
    expect(edgeLabelCapacity(10)).toBe(30);
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
