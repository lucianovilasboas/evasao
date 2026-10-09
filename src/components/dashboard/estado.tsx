import { Loader2 } from "lucide-react"

export function Carregando() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Carregando dados…
    </div>
  )
}

export function Erro({ msg }: { msg?: string | null }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro ao carregar dados{msg ? `: ${msg}` : ""}.
    </div>
  )
}
