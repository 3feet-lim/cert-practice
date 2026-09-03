import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { Button } from "./ui/Button";

export interface AccessibleDialogProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  confirmAction?: { label: string; onConfirm: () => void; disabled?: boolean };
  cancelLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Modal dialog backed by Radix's keyboard focus trap and focus restoration. */
export function AccessibleDialog({
  trigger,
  title,
  description,
  children,
  confirmAction,
  cancelLabel = "취소",
  open,
  onOpenChange,
}: AccessibleDialogProps) {
  return (
    <DialogPrimitive.Root modal open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/45 data-[state=open]:animate-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[85vh] w-[min(32rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl focus:outline-none">
          <header>
            <DialogPrimitive.Title className="text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-slate-600">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </header>
          <div>{children}</div>
          <footer className="flex justify-end gap-3">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </DialogPrimitive.Close>
            {confirmAction ? (
              <Button disabled={confirmAction.disabled} onClick={confirmAction.onConfirm}>
                {confirmAction.label}
              </Button>
            ) : null}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
