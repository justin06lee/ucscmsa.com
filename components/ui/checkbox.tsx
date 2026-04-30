"use client";

import { Check } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  label?: string;
};

export function Checkbox({
  id,
  className = "",
  label,
  checked,
  defaultChecked,
  onChange,
  ...rest
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const isControlled = checked !== undefined;
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const current = isControlled ? checked : internal;

  return (
    <label
      htmlFor={inputId}
      className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm ${className}`}
    >
      <span
        aria-hidden
        data-checked={current ? "true" : "false"}
        className="relative inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border border-ink/30 bg-paper transition-colors data-[checked=true]:border-ink data-[checked=true]:bg-ink"
      >
        {current ? <Check size={12} strokeWidth={3} className="text-paper" /> : null}
      </span>
      <input
        id={inputId}
        type="checkbox"
        checked={isControlled ? checked : undefined}
        defaultChecked={isControlled ? undefined : defaultChecked}
        onChange={(e) => {
          if (!isControlled) setInternal(e.target.checked);
          onChange?.(e);
        }}
        className="sr-only"
        {...rest}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
