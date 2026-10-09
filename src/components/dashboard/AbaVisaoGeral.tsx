"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ComposicaoClassesChart, ContagemChart, DispersaoCursos } from "./graficos"
import { NarrativeBox } from "./narrative"
import { GradeKpi, KpiCard } from "./kpi-cards"
import { Carregando, Erro } from "./estado"
import { useDados } from "./hooks"
import { fmt, fmtPct } from "@/lib/utils"
import type { Filtros, Overview } from "@/types"

const MODO_LABEL: Record<string, string> = {
  padrao: "mapeamento padrão",
  proprio: "mapeamento próprio",
  misto: "mapeamentos mistos",
}

export function AbaVisaoGeral({ filtros }: { filtros: Filtros }) {
  const { data, loading, error } = useDados<Overview>("overview", filtros)
  if (loading) return <Carregando />
  if (error || !data) return <Erro msg={error} />

  const grupoCritico = [...data.grupos].sort((a, b) => b.taxa - a.taxa)[0]
  const classeTop = data.tipos[0]
  const cursoTop = [...data.cursos].sort((a, b) => b.taxa - a.taxa)[0]
  const titulo = classeTop
    ? `${classeTop.rotulo} responde por ${fmtPct(classeTop.pct)} das saídas`
    : "Seleção sem estudantes"

  return (
    <div className="space-y-4">
      <GradeKpi>
        <KpiCard label="Registros na seleção" value={fmt(data.registros)} cor="azul" />
        <KpiCard label="Saídas" value={fmt(data.saidas)} cor="vermelho" />
        <KpiCard label="Taxa de saída" value={fmtPct(data.taxa)} cor="roxo" />
        <KpiCard label="Registros na base" value={fmt(data.totalBase)} cor="azulClaro" />
      </GradeKpi>

      <NarrativeBox>
        <strong className="text-foreground">{titulo}.</strong>{" "}
        {grupoCritico ? `${grupoCritico.label} concentra a maior taxa (${fmtPct(grupoCritico.taxa)}). ` : ""}
        {cursoTop ? `Maior taxa por curso: ${cursoTop.nome} (${fmtPct(cursoTop.taxa)}, n=${fmt(cursoTop.estudantes)}). ` : ""}
        A saída agrega as classes definidas no mapeamento de cada campus.
      </NarrativeBox>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.grupos.map((g) => (
          <Card key={g.chave}>
            <CardHeader>
              <CardTitle>{g.label}</CardTitle>
              <CardDescription>Periodicidade {g.periodicidade}</CardDescription>
            </CardHeader>
            <CardContent>
              <GradeKpi>
                <KpiCard label="Estudantes" value={fmt(g.estudantes)} cor="azul" />
                <KpiCard label="Saídas" value={fmt(g.saidas)} cor="vermelho" />
                <KpiCard label="Taxa de saída" value={fmtPct(g.taxa)} cor="roxo" />
              </GradeKpi>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Composição das saídas por classe</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1.5">
              Barras 100% empilhadas · definição de saída
              <Badge variant={data.mapeamentoModo === "proprio" ? "ok" : data.mapeamentoModo === "misto" ? "alerta" : "muted"}>
                {MODO_LABEL[data.mapeamentoModo] ?? data.mapeamentoModo}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComposicaoClassesChart tipos={data.tipos} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Passe o mouse nas barras para ver quais situações compõem cada classe (definidas em Importação &amp; base).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taxa de saída × tamanho do curso</CardTitle>
            <CardDescription>
              Cada ponto é um curso · eixo X = nº de estudantes · linha = média da seleção
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DispersaoCursos cursos={data.cursos} referencia={data.taxa} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Situação no curso</CardTitle>
          <CardDescription>Cores pela classe de desfecho definida no mapeamento</CardDescription>
        </CardHeader>
        <CardContent>
          <ContagemChart itens={data.situacoes} altura={Math.max(200, data.situacoes.length * 22)} />
        </CardContent>
      </Card>
    </div>
  )
}
