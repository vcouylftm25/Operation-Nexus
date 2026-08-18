import { describe, expect, it } from "vitest";
import { formatPropertyValue, propertyRows } from "./properties";

describe("formatPropertyValue", () => {
  it("renders money, confidence and dates the way a Brazilian player reads them", () => {
    expect(formatPropertyValue("amount", 85000)).toContain("85.000,00");
    expect(formatPropertyValue("income_declared", 6400)).toContain("6.400,00");
    expect(formatPropertyValue("confidence", 0.91)).toBe("91%");
    expect(formatPropertyValue("opened_at", "2025-11-04T00:00:00Z")).toBe("04/11/2025");
    expect(formatPropertyValue("sent_at", "2026-02-09T20:41:00Z")).toBe("09/02/2026, 20:41");
  });

  it("keeps plain values plain and never shows an empty cell", () => {
    expect(formatPropertyValue("credit_score", 701)).toBe("701");
    expect(formatPropertyValue("os", "Android 14")).toBe("Android 14");
    expect(formatPropertyValue("anything", null)).toBe("—");
    expect(formatPropertyValue("anything", "")).toBe("—");
    expect(formatPropertyValue("flag", true)).toBe("sim");
    expect(formatPropertyValue("mentions", ["a", "b"])).toBe("a, b");
  });
});

describe("propertyRows", () => {
  it("returns every property the API sent, translated, not a hardcoded subset", () => {
    const rows = propertyRows({
      name: "Marcos Duarte",
      cpf_masked: "***.112.334-**",
      occupation: "Consultor financeiro",
      unknown_future_field: "algo novo",
    });
    expect(rows.map((row) => row.key)).toEqual([
      "name",
      "cpf_masked",
      "occupation",
      "unknown_future_field",
    ]);
    expect(rows[0].label).toBe("Nome");
    expect(rows[3].label).toBe("unknown future field");
  });

  it("flags long free text so it can be laid out as a paragraph", () => {
    const [short, long] = propertyRows({
      channel: "whatsapp",
      content: "ele só precisa assinar, o carro fica no nome dele e eu cuido do resto",
    });
    expect(short.long).toBe(false);
    expect(long.long).toBe(true);
  });
});
