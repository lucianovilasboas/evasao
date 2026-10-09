"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ContagemChart } from "./graficos"
import { MapaMunicipios } from "./MapaMunicipios"
import { NarrativeBox } from "./narrative"
import { TabelaMunicipios } from "./tabelas"
import { Carregando, Erro } from "./estado"
import { useDados } from "./hooks"
import { fmt, fmtPct } from "@/lib/utils"
import type { Filtros, Territorio } from "@/types"

export function AbaTerritorio({
  filtros,
  onSelecionarMunicipio,
}: {
  filtros: Filtros
  onSelecionarMunicipio?: (municipio: string) => void
}) {
  const { data, loading, error } = useDados<Territorio>("territorio", filtros)
  if (loading) return <Carregando />
  if (!data) return <Erro msg={error} />

  const mg = data.municipios.filter((m) => m.uf === 31)
  const comBase = mg.filter((m) => m.base >= 10)
  const hotspots = [...comBase].sort((a, b) => b.taxa - a.taxa).slice(0, 3)

  return (
    <div className="space-y-4">
      <NarrativeBox>
        Município de <strong>residência</strong> do estudante (não do campus), sobre a malha municipal de Minas
        Gerais. Clique em um município para filtrar o dashboard.{" "}
        {hotspots.length > 0
          ? `Maiores taxas entre municípios com base ≥ 10: ${hotspots.map((m) => `${m.nome} (${fmtPct(m.taxa)})`).join(", ")}.`
          : "Sem municípios com base suficiente para leitura."}{" "}
        {data.semMunicipio > 0 && `${fmt(data.semMunicipio)} registros sem município mapeável ficam fora do mapa.`}
      </NarrativeBox>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mapa coroplético por município de residência</CardTitle>
            <CardDescription>Cor = taxa de saída · clique para filtrar · hachura = base &lt; 5</CardDescription>
          </CardHeader>
          <CardContent>
            <MapaMunicipios municipios={data.municipios} onSelecionar={onSelecionarMunicipio} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zona residencial</CardTitle>
            <CardDescription>Urbana, rural ou não informada</CardDescription>
          </CardHeader>
          <CardContent>
            <ContagemChart itens={data.zona} altura={240} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranking municipal</CardTitle>
          <CardDescription>Ordenável por qualquer coluna</CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaMunicipios municipios={data.municipios} />
        </CardContent>
      </Card>
    </div>
  )
}
