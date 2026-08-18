import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_JOIN_CODE } from "@/lib/constants";
import { investigate, joinTeam, resetMockState } from "@/lib/mock/mockApi";

describe("mock /inspect DSL", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("charges 5 credits and returns person_01 in the subgraph", async () => {
    const joined = await joinTeam(MOCK_JOIN_CODE);
    const result = await investigate(joined.team_id, "/inspect person_01", joined.session_token);

    expect(result.plan.intent).toBe("ENTITY_LOOKUP");
    expect(result.plan.tool_calls[0]?.tool).toBe("inspect_entity");
    expect(result.credits_charged).toBe(5);
    expect(result.subgraph.nodes.map((n) => n.id)).toContain("person_01");
    expect(result.answer.discovered_node_ids).toContain("person_01");
  });
});
