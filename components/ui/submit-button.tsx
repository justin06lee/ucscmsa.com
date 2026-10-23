"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * A form's submit button that says it's working (useFormStatus), for forms
 * whose action is a Server Function on a server page (the login, say).
 */
export function SubmitButton({
  pendingText,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
