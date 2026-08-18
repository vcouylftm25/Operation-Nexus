import { useEffect, useState } from "react";
import { formatClock, remainingSeconds } from "@/lib/utils";
import { useLiveStore } from "./liveStore";

export function useRoundCountdown(): { seconds: number | null; label: string } {
  const startedAt = useLiveStore((s) => s.roundStartedAt);
  const duration = useLiveStore((s) => s.durationSeconds);
  const tick = useLiveStore((s) => s.tickRemaining);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const seconds = remainingSeconds(startedAt, duration, tick, now);
  return { seconds, label: seconds === null ? "—" : formatClock(seconds) };
}
