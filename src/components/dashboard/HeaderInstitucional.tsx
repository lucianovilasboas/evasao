import { fmtData } from "@/lib/utils"

export function HeaderInstitucional({
  ultimaAtualizacao,
  campi,
}: {
  ultimaAtualizacao: string
  campi: string[]
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-[#0f2744] bg-gradient-to-r from-[#17365d] to-[#2f75b5] text-white">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base leading-tight font-bold sm:text-lg">
            Evasão nos campi do IFMG
          </h1>
          <p className="truncate text-[11px] opacity-90">
            Matrículas e saídas por período · {campi.join(", ") || "sem dados"}
          </p>
        </div>
        <p className="shrink-0 text-[10px] opacity-90">Atualizado em {fmtData(ultimaAtualizacao)}</p>
      </div>
    </header>
  )
}
