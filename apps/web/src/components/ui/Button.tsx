import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import {
  buttonBaseClassName,
  buttonVariants,
  type ButtonVariant,
} from "./button-styles";

export type { ButtonVariant } from "./button-styles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, type = "button", variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonBaseClassName, buttonVariants[variant], className)}
      {...props}
    />
  );
});
