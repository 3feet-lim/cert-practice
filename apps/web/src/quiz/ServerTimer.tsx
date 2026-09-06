import { useEffect, useRef, useState } from "react";

export interface ServerTimerProps {
  /** Server-clock samples from the active exam response. */
  serverNow: string;
  expiresAt: string;
  onExpire: () => void;
}

function remainingMilliseconds(serverNow: string, expiresAt: string): number {
  return Math.max(0, Date.parse(expiresAt) - Date.parse(serverNow));
}

function formatRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

/**
 * Countdown anchored to a server-clock sample and advanced by a monotonic clock.
 * Later server samples may correct it downward, but never make the visible clock grow.
 */
export function ServerTimer({ serverNow, expiresAt, onExpire }: ServerTimerProps) {
  const initialSeconds = Math.ceil(remainingMilliseconds(serverNow, expiresAt) / 1000);
  const deadlineRef = useRef<number | null>(null);
  const visibleSecondsRef = useRef(initialSeconds);
  const expiredRef = useRef(false);
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    const sampledSeconds = Math.ceil(
      remainingMilliseconds(serverNow, expiresAt) / 1000,
    );
    const sampledDeadline = performance.now() + sampledSeconds * 1000;
    deadlineRef.current =
      deadlineRef.current === null
        ? sampledDeadline
        : Math.min(deadlineRef.current, sampledDeadline);
    visibleSecondsRef.current = Math.min(visibleSecondsRef.current, sampledSeconds);
    setSeconds(visibleSecondsRef.current);
  }, [expiresAt, serverNow]);

  useEffect(() => {
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) {
        return;
      }
      const next = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      const monotonicNext = Math.min(visibleSecondsRef.current, next);
      visibleSecondsRef.current = monotonicNext;
      setSeconds(monotonicNext);
    };
    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (seconds === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
  }, [onExpire, seconds]);

  return (
    <output aria-label="서버 기준 남은 시간" className="font-mono text-2xl font-bold">
      {formatRemaining(seconds)}
    </output>
  );
}
