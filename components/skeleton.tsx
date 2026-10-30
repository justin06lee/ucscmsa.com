// Quiet placeholders for routes that are still loading (loading.tsx): the
// page's shape in faint blocks, so a click shows something at once.

export function Bone({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse bg-ink/[0.06] ${className}`} />;
}

export function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" data-loading="">
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </div>
  );
}

/** A list page: a title, a toolbar and a few rows. */
export function ListSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <Loading label={label}>
      <Bone className="mb-6 h-9 w-48" />
      <Bone className="mb-6 h-11 w-full" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Bone key={i} className="h-20" />
        ))}
      </div>
    </Loading>
  );
}
