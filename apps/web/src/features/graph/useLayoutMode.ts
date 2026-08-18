/**
 * Which of the workspace's three shapes fits the current viewport.
 *
 * The war room used to be a fixed 304 / 1fr / 344 grid, which left the canvas
 * unusably narrow on a 13" laptop and broke outright below that. The rails
 * collapse into drawers instead of permanently spending ~650px.
 *
 *   wide    ≥ 1440px — both rails docked (the 1440x900 design target)
 *   medium  ≥ 1080px — case rail docked, the AI copilot becomes a drawer
 *   compact  < 1080px — canvas full width, both rails are drawers
 */
import { useEffect, useState } from "react";

export type LayoutMode = "wide" | "medium" | "compact";

export const LAYOUT_MEDIUM_MIN_PX = 1080;
export const LAYOUT_WIDE_MIN_PX = 1440;

function currentMode(): LayoutMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "wide";
  if (window.matchMedia(`(min-width: ${LAYOUT_WIDE_MIN_PX}px)`).matches) return "wide";
  if (window.matchMedia(`(min-width: ${LAYOUT_MEDIUM_MIN_PX}px)`).matches) return "medium";
  return "compact";
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(currentMode);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const queries = [
      window.matchMedia(`(min-width: ${LAYOUT_WIDE_MIN_PX}px)`),
      window.matchMedia(`(min-width: ${LAYOUT_MEDIUM_MIN_PX}px)`),
    ];
    const onChange = () => setMode(currentMode());
    queries.forEach((query) => query.addEventListener("change", onChange));
    onChange();
    return () => queries.forEach((query) => query.removeEventListener("change", onChange));
  }, []);

  return mode;
}
