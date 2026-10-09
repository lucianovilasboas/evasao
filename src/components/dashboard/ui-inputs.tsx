"use client"

import { cn } from "@/lib/utils"

interface Opcao {
  valor: string
  rotulo: string
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  todos = "Todos",
}: {
  label: string
  value: string
  options: Opcao[]
  onChange: (v: string) => void
  todos?: string
}) {
  return (
    <label className="grid gap-1 text-[11px] font-bold text-primary">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-[#a9bfd6] bg-card px-2 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="__TOTAL__">{todos}</option>
        {options.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ChipBar({
  options,
  value,
  onChange,
  allLabel = "Todos",
}: {
  options: Opcao[]
  value: string
  onChange: (v: string) => void
  allLabel?: string
}) {
  const chip = (ativo: boolean) =>
    cn(
      "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
      ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
    )
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
      <button type="button" onClick={() => onChange("__TOTAL__")} className={chip(value === "__TOTAL__")}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button key={o.valor} type="button" onClick={() => onChange(o.valor)} className={chip(value === o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}
