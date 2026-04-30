import { TextareaHTMLAttributes, forwardRef } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { className = "", ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={`w-full resize-y rounded-md border border-ink/20 bg-paper px-3 py-2 transition-colors placeholder:text-dim/70 focus:border-ink focus:outline-none ${className}`}
      {...rest}
    />
  );
});
