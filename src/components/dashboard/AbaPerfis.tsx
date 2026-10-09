"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RankingChart } from "./graficos"
import { NarrativeBox } from "./narrative"
import { TabelaPerfis } from "./tabelas"
import { Carregando, Erro } from "./estado"
import { useDados } from "./hooks"
import { fmtPct } from "@/lib/utils"
import type { Filtros, Perfis } from "@/types"

export function AbaPerfis({ filtros }: { filtros: Filtros }) {
  const { data, loading, error } = useDados<Perfis>("perfis", filtros)
  const [dimensao, setDimensao] = useState<string>("")
  const [minBase, setMinBase] = useState(10)

  if (loading) return <Carregando />
  if (error || !data) return <Erro msg={error} />

  const atual = data.dimensoes.find((d) => d.dimensao === dimensao) ?? data.dimensoes[0]
  if (!atual) return <p className="py-10 text-center text-sm text-muted-foreground">Sem dados na seleção.</p>

  const categorias = atual.categorias.filter((c) => c.base >= minBase)
  const destaque = categorias[0]

  return (
    <div className="space-y-4">
      <NarrativeBox>
        Análise descritiva da população. Associações de perfil <strong>não demonstram causalidade</strong> e
        categorias com base pequena têm taxas instáveis — por isso o filtro de base mínima.{" "}
        {destaque
          ? `Na dimensão ${atual.dimensao}, a maior taxa é "${destaque.categoria}" (${destaque.saidas}/${destaque.base}; ${fmtPct(destaque.taxa)}; RR ${destaque.riscoRelativo.toFixed(2).replace(".", ",")}×).`
          : ""}
      </NarrativeBox>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de perfis por taxa de saída</CardTitle>
          <CardDescription>
            Taxa média do grupo: {fmtPct(atual.taxaGrupo)} · categorias com base &lt; {minBase} ficam ocultas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[11px] font-bold text-primary">
              Dimensão
              <select
                value={atual.dimensao}
                onChange={(e) => setDimensao(e.target.value)}
                className="h-9 rounded-md border border-[#a9bfd6] bg-card px-2 text-xs font-normal"
              >
                {data.dimensoes.map((d) => (
                  <option key={d.dimensao} value={d.dimensao}>
                    {d.dimensao}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-bold text-primary">
              Base mínima
              <select
                value={minBase}
                onChange={(e) => setMinBase(Number(e.target.value))}
                className="h-9 rounded-md border border-[#a9bfd6] bg-card px-2 text-xs font-normal"
              >
                {[5, 10, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <RankingChart
            itens={categorias.map((c) => ({ rotulo: c.categoria, base: c.base, taxa: c.taxa, aviso: c.aviso }))}
            altura={Math.max(200, categorias.length * 30)}
          />

          <TabelaPerfis categorias={categorias} />
        </CardContent>
      </Card>
    </div>
  )
}
