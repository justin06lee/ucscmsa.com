import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger" | "danger-outline";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

/** The button look, for links that act as buttons (an RSVP form, say). Drawn
 *  slim over a 44px tap target: .btn in app/globals.css. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md"): string {
  return `btn btn-${variant} ${sizeClasses[size]}`;
}

const sizeClasses: Record<Size, string> = {
  sm: "px-3",
  md: "px-4",
  lg: "px-5",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className = "", type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...rest}
    />
  );
});
