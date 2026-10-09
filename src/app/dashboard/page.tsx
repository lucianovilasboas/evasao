import { DashboardTabs } from "@/components/dashboard/DashboardTabs"
import { HeaderInstitucional } from "@/components/dashboard/HeaderInstitucional"
import { getMeta } from "@/lib/dados"

export const dynamic = "force-dynamic"

export default function DashboardPage() {
  const meta = getMeta()
  return (
    <>
      <HeaderInstitucional
        ultimaAtualizacao={meta.ultimaAtualizacao}
        campi={meta.campi.map((c) => meta.campiRotulos?.[c] ?? c)}
      />
      <main className="mx-auto max-w-[1540px] px-4 pt-24 pb-12 sm:px-6 sm:pt-20">
        <DashboardTabs meta={meta} />
      </main>
      <footer className="border-t bg-muted/40 py-4 text-center text-[11px] text-muted-foreground">
        Fonte: planilha de alunos (Técnico Integrado e Graduação) · ETL próprio reproduz o Relatório de
        Evasão IFMG Ponte Nova.
      </footer>
    </>
  )
}
