import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerTimer } from "./ServerTimer";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("ServerTimer", () => {
  it("accepts a reconnect server sample, corrects downward, and never grows from a stale sample", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const { rerender } = render(
      <ServerTimer
        expiresAt="2026-03-23T12:00:10.000Z"
        onExpire={onExpire}
        serverNow="2026-03-23T12:00:00.000Z"
      />,
    );
    expect(screen.getByLabelText("서버 기준 남은 시간")).toHaveTextContent("00:00:10");
    act(() => vi.advanceTimersByTime(1_100));
    expect(screen.getByLabelText("서버 기준 남은 시간")).toHaveTextContent("00:00:09");
    // A refetch after reconnect reports a later server sample for the same expiry.
    rerender(
      <ServerTimer
        expiresAt="2026-03-23T12:00:10.000Z"
        onExpire={onExpire}
        serverNow="2026-03-23T12:00:04.000Z"
      />,
    );
    expect(screen.getByLabelText("서버 기준 남은 시간")).toHaveTextContent("00:00:06");
    // A delayed sample cannot increase a timer that was already corrected downward.
    rerender(
      <ServerTimer
        expiresAt="2026-03-23T12:00:10.000Z"
        onExpire={onExpire}
        serverNow="2026-03-23T12:00:00.000Z"
      />,
    );
    expect(screen.getByLabelText("서버 기준 남은 시간")).toHaveTextContent("00:00:06");
    act(() => vi.advanceTimersByTime(6_250));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("서버 기준 남은 시간")).toHaveTextContent("00:00:00");
  });
});
