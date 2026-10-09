"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DIMENSOES_FILTRO,
  LABELS_FILTRO,
  type Filtros,
  type MetaDados,
  type Opcao,
  type Opcoes,
} from "@/types"
import { useDados } from "./hooks"
import { SelectField } from "./ui-inputs"
import { AbaVisaoGeral } from "./AbaVisaoGeral"
import { AbaEvolucao } from "./AbaEvolucao"
import { AbaPerfis } from "./AbaPerfis"
import { AbaTerritorio } from "./AbaTerritorio"
import { AbaMetodologia } from "./AbaMetodologia"
import { AbaBase } from "./AbaBase"

const ABAS = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "evolucao", rotulo: "Evolução" },
  { id: "perfis", rotulo: "Perfis de risco" },
  { id: "territorio", rotulo: "Território" },
  { id: "importacao", rotulo: "Importação & base" },
  { id: "metodologia", rotulo: "Metodologia & dados" },
] as const

type AbaId = (typeof ABAS)[number]["id"]

/** Campus padrão do painel: Ponte Nova, senão o primeiro disponível. */
function campusPadrao(nomes: string[]): string | undefined {
  return nomes.find((c) => c.toUpperCase().includes("PONTE NOVA")) ?? nomes[0]
}

export function DashboardTabs({ meta }: { meta: MetaDados }) {
  const [metaAtual, setMetaAtual] = useState(meta)
  const [versao, setVersao] = useState(0)
  const [aba, setAba] = useState<AbaId>("geral")
  const [filtros, setFiltros] = useState<Filtros>(() => {
    const padrao = campusPadrao(meta.campi)
    return padrao ? { campus: padrao } : {}
  })
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Opções em cascata: recalculadas no servidor a cada mudança de filtro.
  const { data: opcoes } = useDados<Opcoes>("opcoes", filtros, String(versao))

  // Se uma seleção deixar de existir com o efeito cascata, volta para "Todos".
  useEffect(() => {
    if (!opcoes) return
    setFiltros((f) => {
      let mudou = false
      const novo: Filtros = { ...f }
      for (const [k, v] of Object.entries(f)) {
        if (!v || v === "__TOTAL__") continue
        const valores = (opcoes[k] ?? []).map((o) => o.valor)
        if (valores.length > 0 && !valores.includes(v)) {
          novo[k] = "__TOTAL__"
          mudou = true
        }
      }
      return mudou ? novo : f
    })
  }, [opcoes])

  const set = (chave: string, valor: string) => setFiltros((f) => ({ ...f, [chave]: valor }))
  const limpar = () => setFiltros({})
  const ativos = Object.entries(filtros).filter(([, v]) => v && v !== "__TOTAL__").length

  async function recarregarMeta(campus?: string) {
    try {
      const r = await fetch("/api/dados?view=meta", { cache: "no-store" })
      if (r.ok) setMetaAtual((await r.json()) as MetaDados)
    } catch {
      /* mantém a meta atual */
    }
    if (campus) setFiltros({ campus })
    setVersao((v) => v + 1)
  }

  const arquivosBase = metaAtual.arquivos ?? []
  const assinaturasSaida = new Set(
    arquivosBase.map((a) => (a.mapeamentoExplicito ? JSON.stringify(a.mapeamento) : "padrao")),
  )
  const multiCampus = !filtros.campus || filtros.campus === "__TOTAL__"
  const avisoMapeamento = multiCampus && assinaturasSaida.size > 1

  const opCampus: Opcao[] =
    opcoes?.campus ?? metaAtual.campi.map((c) => ({ valor: c, rotulo: metaAtual.campiRotulos?.[c] ?? c }))
  const opGrupo: Opcao[] = opcoes?.grupo ?? metaAtual.grupos.map((g) => ({ valor: g.chave, rotulo: g.label }))
  const opCurso: Opcao[] = opcoes?.curso ?? metaAtual.cursos.map((c) => ({ valor: c.cod, rotulo: c.nome }))

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors",
              aba === a.id ? "bg-primary text-primary-foreground" : "bg-card text-foreground ring-1 ring-border hover:bg-muted",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          <SelectField
            label="Campus"
            value={filtros.campus ?? "__TOTAL__"}
            options={opCampus}
            onChange={(v) => set("campus", v)}
          />
          <SelectField
            label="Grupo"
            value={filtros.grupo ?? "__TOTAL__"}
            options={opGrupo}
            onChange={(v) => set("grupo", v)}
          />
          <SelectField
            label="Curso"
            value={filtros.curso ?? "__TOTAL__"}
            options={opCurso}
            onChange={(v) => set("curso", v)}
          />
        </div>

        {mostrarFiltros && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-border pt-3 sm:grid-cols-4 lg:grid-cols-6">
            {DIMENSOES_FILTRO.map((dim) => (
              <SelectField
                key={dim}
                label={LABELS_FILTRO[dim] ?? dim}
                value={filtros[dim] ?? "__TOTAL__"}
                options={opcoes?.[dim] ?? []}
                onChange={(v) => set(dim, v)}
              />
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMostrarFiltros((s) => !s)}>
            {mostrarFiltros ? "Ocultar filtros de perfil" : "Filtros de perfil"}
          </Button>
          <Button variant="ghost" size="sm" onClick={limpar}>
            Limpar filtros
          </Button>
          <span className="text-[11px] text-muted-foreground">{ativos} filtro(s) ativo(s)</span>
        </div>
      </section>

      {avisoMapeamento && (
        <p className="rounded-md bg-[#e3a008]/12 px-3 py-2 text-[11px] text-[#a16207]">
          ⚠ Os campi usam <b>definições de saída diferentes</b> — a comparação ou soma entre eles pode não ser
          equivalente. Detalhes em <b>Metodologia &amp; dados</b>.
        </p>
      )}

      {aba === "importacao" ? (
        <AbaBase onMudouBase={recarregarMeta} />
      ) : (
        <div key={versao}>
          {aba === "geral" && <AbaVisaoGeral filtros={filtros} />}
          {aba === "evolucao" && <AbaEvolucao filtros={filtros} />}
          {aba === "perfis" && <AbaPerfis filtros={filtros} />}
          {aba === "territorio" && (
            <AbaTerritorio
              filtros={filtros}
              onSelecionarMunicipio={(m) => setFiltros((f) => ({ ...f, "Município de Residência": m }))}
            />
          )}
          {aba === "metodologia" && <AbaMetodologia />}
        </div>
      )}
    </div>
  )
}
