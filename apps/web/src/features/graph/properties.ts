/**
 * Formatting for the raw `properties` bag that comes back on nodes and
 * relationships. The scenario carries its detail there (messages, devices,
 * IPs, addresses, amounts) instead of in the label, so the Inspector renders
 * whatever the API sends rather than a hand-picked list of keys.
 */
import { propertyText } from "@/lib/utils";
import { propertyDisplay } from "./colors";

const MONEY_KEYS = /(amount|valor|income|renda|balance|saldo|limit|limite)/i;
const PERCENT_KEYS = /(confidence|confianca|confiança|probability|score_ratio)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
// Case timestamps are read back exactly as the evidence records them, so the
// clock in the Inspector matches the clock in the message the team just read —
// the browser's timezone must not shift an event to the previous day.
const dateOnly = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
/** A midnight-UTC stamp is a date the source recorded without a time. */
const MIDNIGHT = /T00:00(:00)?(\.0+)?(Z|\+00:?00)?$/;

export function formatPropertyKey(key: string): string {
  return propertyDisplay(key);
}

export function formatPropertyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map((item) => formatPropertyValue(key, item)).join(", ");
  }
  if (typeof value === "number") {
    if (PERCENT_KEYS.test(key) && value <= 1) return `${Math.round(value * 100)}%`;
    if (MONEY_KEYS.test(key)) return brl.format(value);
    return new Intl.NumberFormat("pt-BR").format(value);
  }
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return value.includes("T") && !MIDNIGHT.test(value)
        ? dateTime.format(parsed)
        : dateOnly.format(parsed);
    }
  }
  return propertyText(value);
}

/**
 * Long free text (a seized message, an analyst note) reads as a paragraph, not
 * as a value squeezed into the right column of a key/value row.
 */
export function isLongTextProperty(value: string): boolean {
  return value.length > 48;
}

export interface PropertyRow {
  key: string;
  label: string;
  value: string;
  long: boolean;
}

export function propertyRows(properties: Record<string, unknown>): PropertyRow[] {
  return Object.entries(properties).map(([key, raw]) => {
    const value = formatPropertyValue(key, raw);
    return { key, label: formatPropertyKey(key), value, long: isLongTextProperty(value) };
  });
}
