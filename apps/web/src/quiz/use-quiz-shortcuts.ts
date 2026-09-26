import { useEffect, useRef } from "react";

export interface QuizShortcutHandlers {
  previous?: () => void;
  next?: () => void;
  /** Receives the zero-based choice index for keys 1-9 and A-I. */
  choose?: (index: number) => void;
  toggleFlag?: () => void;
  submit?: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["radio", "checkbox", "button", "submit"].includes(type);
  }
  return false;
}

/**
 * Document-level quiz shortcuts: ←/→ navigate, 1-9 or A-I choose, F flags,
 * Enter submits. Ignored while typing, while a dialog is open, or with modifiers.
 */
export function useQuizShortcuts(handlers: QuizShortcutHandlers, enabled = true) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
        return;
      if (isEditableTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const current = latest.current;
      const key = event.key;
      let handled = true;

      if (key === "ArrowLeft" && current.previous) current.previous();
      else if (key === "ArrowRight" && current.next) current.next();
      else if ((key === "f" || key === "F") && current.toggleFlag) current.toggleFlag();
      else if (key === "Enter" && current.submit) {
        // Let focused buttons and links keep their native Enter behaviour.
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "BUTTON" || target.tagName === "A")
        ) {
          handled = false;
        } else current.submit();
      } else if (/^[1-9]$/.test(key) && current.choose) current.choose(Number(key) - 1);
      else if (/^[a-iA-I]$/.test(key) && key.toLowerCase() !== "f" && current.choose)
        current.choose(key.toLowerCase().charCodeAt(0) - "a".charCodeAt(0));
      else handled = false;

      if (handled) event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Warns before closing or reloading the tab while `active` is true. */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by some browsers to show the native confirmation.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
