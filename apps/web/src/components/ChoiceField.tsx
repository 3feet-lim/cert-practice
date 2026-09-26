import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn";

export interface ChoiceFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  type: "radio" | "checkbox";
  label: ReactNode;
  description?: ReactNode;
}

/** A labeled radio/checkbox with a keyboard-visible focus target. */
export function ChoiceField({
  id: providedId,
  label,
  description,
  className,
  disabled,
  type,
  ...inputProps
}: ChoiceFieldProps) {
  const generatedId = useId();
  const inputId = providedId ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div
      className={cn("relative rounded-lg border border-border bg-card p-4", className)}
    >
      <div className="flex items-start gap-3">
        <input
          {...inputProps}
          id={inputId}
          type={type}
          disabled={disabled}
          aria-describedby={descriptionId}
          className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed"
        />
        <div className="min-w-0">
          <label
            htmlFor={inputId}
            className={cn(
              "block font-medium text-foreground",
              disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer",
            )}
          >
            {label}
          </label>
          {description ? (
            <p
              id={descriptionId}
              className="mt-1 text-sm leading-6 text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
