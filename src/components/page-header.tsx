import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
