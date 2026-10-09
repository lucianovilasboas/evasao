import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Número no padrão pt-BR. */
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–"
  return n.toLocaleString("pt-BR")
}

/** Taxa (0..1) -> "12,7%". */
export function fmtPct(n: number | null | undefined, casas = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–"
  return `${(n * 100).toFixed(casas).replace(".", ",")}%`
}

/** Data ISO -> "07/10/2026 14:32". */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "–"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "–"
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

/** Divide [a,b] em faixas de cor por taxa (0..1). */
export function corPorTaxa(taxa: number): "baixa" | "media" | "alta" {
  if (taxa < 0.1) return "baixa"
  if (taxa < 0.25) return "media"
  return "alta"
}
