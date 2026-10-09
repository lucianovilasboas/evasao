"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const CORES_KPI: Record<string, string> = {
  azul: "border-l-[#17365d]",
  azulClaro: "border-l-[#5b9bd5]",
  vermelho: "border-l-[#c00000]",
  roxo: "border-l-[#7030a0]",
  laranja: "border-l-[#e3a008]",
  verde: "border-l-[#2e7d32]",
}

export function KpiCard({
  label,
  value,
  sub,
  cor = "azul",
}: {
  label: string
  value: string | number
  sub?: string
  cor?: keyof typeof CORES_KPI
}) {
  return (
    <div className={cn("rounded-xl border-l-[6px] bg-card p-3 shadow-sm ring-1 ring-foreground/10 sm:p-4", CORES_KPI[cor])}>
      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-2xl leading-tight font-bold sm:text-[28px]">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function GradeKpi({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">{children}</div>
}
