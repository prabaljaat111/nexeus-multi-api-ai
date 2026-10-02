import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path d="M8 10.5 16 6l8 4.5-8 4.5-8-4.5Z" stroke="var(--brand-mark-ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m8 15.5 8 4.5 8-4.5M8 20.5l8 4.5 8-4.5" stroke="var(--brand-mark-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="15" r="1.7" fill="var(--brand-mark-accent)" />
    </svg>
  );
}

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark className="text-foreground" />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">Unified AI Workspace</span>
          <span className="block text-[10px] font-medium uppercase text-muted-foreground">Secure multi-model chat</span>
        </span>
      )}
    </span>
  );
}