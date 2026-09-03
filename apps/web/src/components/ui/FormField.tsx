import {
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../../lib/cn";

interface FormControlAccessibilityProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

export interface FormFieldProps {
  id: string;
  label: ReactNode;
  control: ReactElement<FormControlAccessibilityProps>;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  className?: string;
}

export function FormField({
  id,
  label,
  control,
  description,
  error,
  required = false,
  optionalLabel = "선택",
  className,
}: FormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={id} className="text-sm font-bold text-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            {optionalLabel}
          </span>
        )}
      </label>
      {cloneElement(control, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}
      {description ? (
        <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-semibold leading-5 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const formControlClassName =
  "min-h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-focus/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
