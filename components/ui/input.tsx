import { InputHTMLAttributes, forwardRef } from "react";

type Props = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`min-h-11 w-full rounded-[2px] border border-ink/20 bg-scrap px-3 py-2 transition-colors placeholder:text-dim/70 focus:border-ink focus:outline-none ${className}`}
      {...rest}
    />
  );
});
