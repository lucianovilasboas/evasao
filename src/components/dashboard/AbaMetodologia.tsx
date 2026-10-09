"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NarrativeBox } from "./narrative"
import { GradeKpi, KpiCard } from "./kpi-cards"
import { Carregando, Erro } from "./estado"
import { useDados } from "./hooks"
import { fmt, fmtPct } from "@/lib/utils"
import { CLASSES_DESFECHO, CLASSES_SAIDA, type ArquivoBase, type ClasseDesfecho, type GrupoResumo, type ItemContagem, type MetaDados } from "@/types"

interface Resposta {
  meta: MetaDados
  porGrupo: GrupoResumo[]
  tipos: ItemContagem[]
}

/** Situações que contam como saída, agrupadas por classe. */
function saidasPorClasse(a: ArquivoBase): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [valor, classe] of Object.entries(a.mapeamento ?? {})) {
    if ((CLASSES_SAIDA as string[]).includes(classe)) {
      ;(out[classe] ??= []).push(valor)
    }
  }
  return out
}

export function AbaMetodologia() {
  const { data, loading, error } = useDados<Resposta>("validacao")
  const [arquivos, setArquivos] = useState<ArquivoBase[] | null>(null)

  useEffect(() => {
    fetch("/api/base", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setArquivos(j.arquivos as ArquivoBase[]))
      .catch(() => setArquivos([]))
  }, [])

  if (loading) return <Carregando />
  if (!data) return <Erro msg={error} />
  const { meta, porGrupo, tipos } = data
  const v = meta.validacao
  const assinaturas = new Set((arquivos ?? []).map((a) => (a.mapeamentoExplicito ? JSON.stringify(a.mapeamento) : "padrao")))

  return (
    <div className="space-y-4">
      <GradeKpi>
        <KpiCard label="Registros válidos" value={fmt(v.validos)} cor="azul" />
        <KpiCard label="Excluídos (temporal)" value={fmt(v.excluidos)} cor="laranja" />
        <KpiCard label="Campi" value={meta.campi.length} cor="azulClaro" />
        <KpiCard label="Cursos" value={meta.cursos.length} cor="azulClaro" />
      </GradeKpi>

      {assinaturas.size > 1 && (
        <p className="rounded-md bg-[#e3a008]/12 px-3 py-2 text-xs text-[#a16207]">
          ⚠ Os campi usam <b>definições de saída diferentes</b>. Comparar ou somar campi exige cautela — veja a
          tabela abaixo.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Como cada campus define a saída</CardTitle>
          <CardDescription>
            Situações de cada planilha que contam como saída (evasão). As listadas como “não saída” não entram na
            taxa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!arquivos ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus</TableHead>
                  <TableHead>Definição</TableHead>
                  <TableHead>Contam como saída</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arquivos.map((a) => {
                  const porClasse = saidasPorClasse(a)
                  return (
                    <TableRow key={a.arquivo}>
                      <TableCell className="font-medium">{a.campi.join(", ")}</TableCell>
                      <TableCell>
                        {a.mapeamentoExplicito ? <Badge variant="ok">próprio</Badge> : <Badge variant="muted">padrão</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {CLASSES_SAIDA.map((c) =>
                            porClasse[c]?.length ? (
                              <div key={c} className="text-[11px]">
                                <span className="font-semibold text-primary">{CLASSES_DESFECHO[c as ClasseDesfecho]}:</span>{" "}
                                <span className="text-muted-foreground">{porClasse[c].join(", ")}</span>
                              </div>
                            ) : null,
                          )}
                          {(a.naoMapeados?.length ?? 0) > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              Tratadas como não saída: {a.naoMapeados?.join(", ")}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelo temporal e validação</CardTitle>
          <CardDescription>Reproduz o Relatório de Evasão IFMG Ponte Nova (mapeamento padrão)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <NarrativeBox>{meta.nota}</NarrativeBox>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>Cada estudante é contado em todos os períodos entre ingresso e última matrícula, inclusive.</li>
            <li>Nos integrados o período é anual (o 2º semestre é normalizado para o 1º).</li>
            <li>A saída é atribuída uma única vez, ao último período de matrícula normalizado.</li>
            <li>
              Exclusões: {fmt(v.excluidos)} registros ({v.motivoExclusao.toLowerCase()}) saem apenas do modelo
              temporal.
            </li>
            <li>
              Indicadores de C.R., frequência e progresso são marcadores exploratórios; sua data de referência deve
              ser validada antes de virarem alerta prospectivo.
            </li>
          </ul>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead>Periodicidade</TableHead>
                <TableHead>Estudantes</TableHead>
                <TableHead>Saídas</TableHead>
                <TableHead>Taxa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porGrupo.map((g) => (
                <TableRow key={g.chave}>
                  <TableCell className="font-medium">{g.label}</TableCell>
                  <TableCell className="text-muted-foreground">{g.periodicidade}</TableCell>
                  <TableCell>{fmt(g.estudantes)}</TableCell>
                  <TableCell>{fmt(g.saidas)}</TableCell>
                  <TableCell className="font-semibold">{fmtPct(g.taxa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tipos de saída</CardTitle>
            <CardDescription>Total na base completa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tipos.map((t) => (
              <div key={t.rotulo} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t.rotulo}</span>
                <span className="font-semibold">{fmt(t.valor)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fontes e cobertura</CardTitle>
            <CardDescription>Arquivos de entrada do ETL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-1.5">
              {meta.fontes.map((f) => (
                <Badge key={f} variant="muted">
                  {f}
                </Badge>
              ))}
            </div>
            <p>Campi: {meta.campi.join(", ")}</p>
            <p>
              Para incluir outro campus, use a aba <b>Importação &amp; base</b>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
