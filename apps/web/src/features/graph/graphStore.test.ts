import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "./graphStore";
import type { GraphPayload } from "@/lib/types";

const payload: GraphPayload = {
  nodes: [
    { id: "person_01", labels: ["Person"], properties: { name: "A" }, label_display: "A" },
    { id: "account_01", labels: ["BankAccount"], properties: {}, label_display: "Conta" },
  ],
  relationships: [
    {
      id: "rel_001",
      type: "OWNS_ACCOUNT",
      start_id: "person_01",
      end_id: "account_01",
      properties: {},
    },
  ],
};

describe("graphStore.merge", () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it("records newly seen ids in recentIds", () => {
    const first = useGraphStore.getState().merge(payload);
    expect(first.sort()).toEqual(["account_01", "person_01", "rel_001"]);
    expect(useGraphStore.getState().recentIds.sort()).toEqual(first.sort());

    const second = useGraphStore.getState().merge(payload);
    expect(second).toEqual([]);
    expect(useGraphStore.getState().recentIds.sort()).toEqual(first.sort());

    const third = useGraphStore.getState().merge({
      nodes: [{ id: "person_02", labels: ["Person"], properties: {}, label_display: "B" }],
      relationships: [],
    });
    expect(third).toEqual(["person_02"]);
    expect(useGraphStore.getState().recentIds).toEqual(["person_02"]);
    expect(Object.keys(useGraphStore.getState().nodesById)).toHaveLength(3);
  });
});
