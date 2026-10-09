"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EvolucaoChart } from "./graficos"
import { NarrativeBox } from "./narrative"
import { Carregando, Erro } from "./estado"
import { useDados } from "./hooks"
import { fmt, fmtPct } from "@/lib/utils"
import type { Evolucao, Filtros, PontoEvolucao } from "@/types"

const JANELAS = [
  { valor: "tudo", rotulo: "Todo o período" },
  { valor: "10", rotulo: "Últimos 10 anos" },
  { valor: "5", rotulo: "Últimos 5 anos" },
]

function recortar(pontos: PontoEvolucao[], janela: string): PontoEvolucao[] {
  if (janela === "tudo" || pontos.length === 0) return pontos
  const anos = Number(janela)
  const ultimo = Math.max(...pontos.map((p) => Number(p.periodo.split(".")[0])))
  return pontos.filter((p) => Number(p.periodo.split(".")[0]) > ultimo - anos)
}

export function AbaEvolucao({ filtros }: { filtros: Filtros }) {
  const { data, loading, error } = useDados<Evolucao>("evolucao", filtros)
  const [janela, setJanela] = useState("10")
  const campusDefinido = Boolean(filtros.campus && filtros.campus !== "__TOTAL__")

  const series = useMemo(
    () => (data?.series ?? []).map((s) => ({ ...s, pontos: recortar(s.pontos, janela) })),
    [data, janela],
  )

  if (loading) return <Carregando />
  if (error || !data) return <Erro msg={error} />
  if (data.series.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Sem dados na seleção.</p>

  return (
    <div className="space-y-4">
      {!campusDefinido && (
        <p className="rounded-md bg-[#e3a008]/12 px-3 py-2 text-[11px] text-[#a16207]">
          ⚠ Seleção com <b>vários campi</b>. Como cada campus pode ter periodicidade e definição de saída
          diferentes, os períodos ficam combinados — escolha um campus no filtro para uma leitura mais precisa.
        </p>
      )}

      <NarrativeBox>
        Matrículas são contabilizadas em todos os períodos entre ingresso e última matrícula; as saídas, uma
        única vez, no último período do vínculo. A linha roxa é a taxa do período (escala 0–100%). Barras
        <span className="mx-1 inline-block size-2 rounded-sm bg-[#cbd5e1] align-middle" />
        em cinza indicam períodos com base &lt; 10 (taxa instável).
      </NarrativeBox>

      <div className="flex flex-wrap items-center gap-2">
        <label className="grid gap-1 text-[11px] font-bold text-primary">
          Período
          <select
            value={janela}
            onChange={(e) => setJanela(e.target.value)}
            className="h-9 rounded-md border border-[#a9bfd6] bg-card px-2 text-xs font-normal"
          >
            {JANELAS.map((j) => (
              <option key={j.valor} value={j.valor}>
                {j.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {series.map((serie) => {
        const totalMatriculas = serie.pontos.reduce((s, p) => s + p.matriculas, 0)
        const totalSaidas = serie.pontos.reduce((s, p) => s + p.saidas, 0)
        const referencia = totalMatriculas > 0 ? totalSaidas / totalMatriculas : null
        return (
          <Card key={serie.chave}>
            <CardHeader>
              <CardTitle>{serie.label}</CardTitle>
              <CardDescription>
                {serie.periodicidade === "anual" ? "Periodicidade anual" : "Periodicidade semestral"} ·{" "}
                {serie.pontos.length} períodos · {fmt(totalMatriculas)} matrículas · {fmt(totalSaidas)} saídas
                {referencia != null ? ` · taxa média ${fmtPct(referencia)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EvolucaoChart pontos={serie.pontos} referencia={referencia} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
