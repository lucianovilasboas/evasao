import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function NarrativeBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("border-l-4 border-[#2e7d32] bg-card py-2 pl-3 text-xs text-muted-foreground", className)}>
      {children}
    </p>
  )
}

export function InsightCard({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#e3a008]/40 bg-[#e3a008]/10 p-3">
      <p className="text-[11px] font-bold tracking-wide text-[#a16207] uppercase">{titulo}</p>
      <p className="mt-1 text-xs text-foreground">{children}</p>
    </div>
  )
}
