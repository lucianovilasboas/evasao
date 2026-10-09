"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw, Save, SlidersHorizontal, Trash2, Upload, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CLASSES_ORDEM, CLASSE_LABEL, ehClasse, sugerirClasse } from "@/lib/mapeamento"
import { cn, fmt, fmtData } from "@/lib/utils"
import type { ArquivoBase, CampusConfig, ClasseDesfecho, ValorSituacao } from "@/types"

interface Resposta {
  arquivos: ArquivoBase[]
  campi: CampusConfig[]
  staging: string[]
  totalArquivos: number
  ultimaAtualizacao: string
}

type Mapa = Record<string, ClasseDesfecho | "">
type Mensagem = { tipo: "ok" | "erro"; texto: string } | null

/** Pré-preenchimento da classe a partir do rótulo ("" quando indefinido). */
function classeInicial(valor: string): ClasseDesfecho | "" {
  const c = sugerirClasse(valor)
  return c === "pendente" ? "" : c
}

function EditorMapeamento({
  valores,
  mapa,
  onChange,
}: {
  valores: ValorSituacao[]
  mapa: Mapa
  onChange: (m: Mapa) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Situação no curso</TableHead>
          <TableHead className="text-right">Registros</TableHead>
          <TableHead>Classe de desfecho</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {valores.map((v) => {
          const classe = mapa[v.valor]
          const ok = ehClasse(classe)
          return (
            <TableRow key={v.valor}>
              <TableCell className="font-medium">
                {v.valor} {!ok && <Badge variant="alerta">pendente</Badge>}
              </TableCell>
              <TableCell className="text-right">{fmt(v.contagem)}</TableCell>
              <TableCell>
                <select
                  value={classe ?? ""}
                  onChange={(e) => onChange({ ...mapa, [v.valor]: e.target.value as ClasseDesfecho })}
                  className={cn(
                    "h-9 w-full max-w-[260px] rounded-md border bg-card px-2 text-xs",
                    ok ? "border-[#a9bfd6]" : "border-[#e3a008]",
                  )}
                >
                  <option value="" disabled>
                    — escolha —
                  </option>
                  {CLASSES_ORDEM.map((c) => (
                    <option key={c} value={c}>
                      {CLASSE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function AbaBase({ onMudouBase }: { onMudouBase: (campus?: string) => void }) {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<Mensagem>(null)
  const [edits, setEdits] = useState<Record<string, { nome: string; nota: string }>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  // staging (etapa de importação)
  const [stagingArquivo, setStagingArquivo] = useState<string | null>(null)
  const [stagingColuna, setStagingColuna] = useState("Situação no Curso")
  const [stagingValores, setStagingValores] = useState<ValorSituacao[]>([])
  const [stagingMapa, setStagingMapa] = useState<Mapa>({})

  // revisão de mapeamento de arquivo já na base
  const [revArquivo, setRevArquivo] = useState<string | null>(null)
  const [revValores, setRevValores] = useState<ValorSituacao[]>([])
  const [revMapa, setRevMapa] = useState<Mapa>({})

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch("/api/base", { cache: "no-store" })
      const j = (await r.json()) as Resposta
      setDados(j)
      setEdits(Object.fromEntries((j.campi ?? []).map((c) => [c.raw, { nome: c.rotulo, nota: c.nota }])))
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro ao carregar" })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // ---- etapa 1: escolher arquivo -> staging + inspeção
  async function escolherArquivo(file: File) {
    setOcupado("analisar")
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append("arquivo", file)
      const r = await fetch("/api/base/analisar", { method: "POST", body: fd })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `falha (HTTP ${r.status})`)
      setStagingArquivo(j.arquivo as string)
      setStagingColuna(j.coluna as string)
      setStagingValores(j.valores as ValorSituacao[])
      setStagingMapa(
        Object.fromEntries((j.valores as ValorSituacao[]).map((v) => [v.valor, classeInicial(v.valor)])),
      )
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro na análise" })
    } finally {
      setOcupado(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  // ---- etapa 3: confirmar importação
  async function confirmarImportacao() {
    if (!stagingArquivo) return
    setOcupado("confirmar")
    setMsg(null)
    try {
      const r = await fetch("/api/base/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo: stagingArquivo, mapeamento: stagingMapa }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? j.log ?? `falha (HTTP ${r.status})`)
      const lista: string[] = j.meta?.campi ?? []
      const antes = new Set((dados?.campi ?? []).map((c) => c.raw))
      const adicionado = lista.find((c) => !antes.has(c))
      setMsg({ tipo: "ok", texto: `"${stagingArquivo}" importado. Campi na base: ${lista.join(", ")}.` })
      setStagingArquivo(null)
      setStagingValores([])
      setStagingMapa({})
      onMudouBase(adicionado)
      await carregar()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro ao confirmar" })
    } finally {
      setOcupado(null)
    }
  }

  // ---- revisão de mapeamento
  async function abrirRevisao(arquivo: string) {
    setOcupado(`rev:${arquivo}`)
    setMsg(null)
    try {
      const r = await fetch(`/api/base/mapeamento?arquivo=${encodeURIComponent(arquivo)}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `falha (HTTP ${r.status})`)
      const valores = j.valores as ValorSituacao[]
      const classes = (j.mapeamento?.classes as Record<string, string> | undefined) ?? {}
      setRevArquivo(arquivo)
      setRevValores(valores)
      setRevMapa(
        Object.fromEntries(
          valores.map((v) => {
            const c = classes[v.valor]
            return [v.valor, ehClasse(c) ? c : classeInicial(v.valor)]
          }),
        ),
      )
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro ao abrir mapeamento" })
    } finally {
      setOcupado(null)
    }
  }

  async function salvarRevisao() {
    if (!revArquivo) return
    setOcupado("rev-salvar")
    setMsg(null)
    try {
      const r = await fetch("/api/base/mapeamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo: revArquivo, mapeamento: revMapa }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? j.log ?? `falha (HTTP ${r.status})`)
      setMsg({ tipo: "ok", texto: `Mapeamento de "${revArquivo}" salvo e base reprocessada.` })
      setRevArquivo(null)
      onMudouBase()
      await carregar()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro ao salvar" })
    } finally {
      setOcupado(null)
    }
  }

  async function excluir(arquivo: string) {
    if (!window.confirm(`Excluir a planilha "${arquivo}"? O campus correspondente sairá da base.`)) return
    setOcupado(arquivo)
    setMsg(null)
    try {
      const r = await fetch("/api/base/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? j.log ?? `falha (HTTP ${r.status})`)
      setMsg({ tipo: "ok", texto: `Planilha "${arquivo}" excluída e base reprocessada.` })
      onMudouBase()
      await carregar()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro ao excluir" })
    } finally {
      setOcupado(null)
    }
  }

  async function salvarConfig() {
    setOcupado("config")
    setMsg(null)
    try {
      const campi = Object.fromEntries(
        Object.entries(edits).map(([raw, v]) => [raw, { nome: v.nome.trim(), nota: v.nota.trim() }]),
      )
      const r = await fetch("/api/base/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campi }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `falha (HTTP ${r.status})`)
      setMsg({ tipo: "ok", texto: "Informações dos campi salvas." })
      onMudouBase()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "erro ao salvar" })
    } finally {
      setOcupado(null)
    }
  }

  const bytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)
  const stagingIncompleto = stagingValores.some((v) => !ehClasse(stagingMapa[v.valor]))
  const revIncompleto = revValores.some((v) => !ehClasse(revMapa[v.valor]))

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando base…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p
          className={cn(
            "rounded-md px-3 py-2 text-xs",
            msg.tipo === "ok" ? "bg-[#2e7d32]/10 text-[#2e7d32]" : "bg-destructive/10 text-destructive",
          )}
        >
          {msg.tipo === "ok" ? "✓ " : "✗ "}
          {msg.texto}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Importar planilha</CardTitle>
          <CardDescription>
            Etapa 1 escolhe o .xlsx · Etapa 2 define quais situações contam como saída · Etapa 3 confirma e
            reprocessa o ETL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void escolherArquivo(f)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => inputRef.current?.click()} disabled={ocupado !== null}>
              {ocupado === "analisar" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {ocupado === "analisar" ? "Analisando planilha…" : "Escolher planilha (.xlsx)"}
            </Button>
            <Button variant="outline" onClick={() => void carregar()} disabled={ocupado !== null}>
              <RefreshCw className="size-4" /> Recarregar
            </Button>
            {(dados?.staging?.length ?? 0) > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {dados?.staging.length} arquivo(s) em staging
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {stagingArquivo && (
        <Card className="ring-2 ring-[#2f75b5]/40">
          <CardHeader>
            <CardTitle>
              Etapa 2 — mapeamento das situações de “{stagingColuna}”
            </CardTitle>
            <CardDescription>
              Arquivo <b>{stagingArquivo}</b>. Marque quais situações formam a saída (evasão). Nada entra na
              base até confirmar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <EditorMapeamento valores={stagingValores} mapa={stagingMapa} onChange={setStagingMapa} />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void confirmarImportacao()} disabled={stagingIncompleto || ocupado !== null}>
                {ocupado === "confirmar" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Confirmar importação
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStagingArquivo(null)
                  setStagingValores([])
                  setStagingMapa({})
                }}
                disabled={ocupado !== null}
              >
                <X className="size-4" /> Cancelar
              </Button>
              {stagingIncompleto && (
                <span className="text-[11px] text-[#a16207]">
                  Classifique todas as situações para liberar a confirmação.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {revArquivo && (
        <Card className="ring-2 ring-[#7030a0]/40">
          <CardHeader>
            <CardTitle>Editar mapeamento — {revArquivo}</CardTitle>
            <CardDescription>Salvar reprocessa o ETL do campus e atualiza todos os indicadores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <EditorMapeamento valores={revValores} mapa={revMapa} onChange={setRevMapa} />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void salvarRevisao()} disabled={revIncompleto || ocupado !== null}>
                {ocupado === "rev-salvar" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar e reprocessar
              </Button>
              <Button variant="ghost" onClick={() => setRevArquivo(null)} disabled={ocupado !== null}>
                <X className="size-4" /> Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Planilhas na base ({dados?.totalArquivos ?? 0})</CardTitle>
          <CardDescription>Excluir remove o arquivo e reprocessa o ETL</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead className="text-right">Estudantes</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead>Mapeamento</TableHead>
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(dados?.arquivos ?? []).map((a) => (
                <TableRow key={a.arquivo}>
                  <TableCell className="font-medium break-all">{a.arquivo}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {a.campi.map((c) => (
                        <Badge key={c} variant="muted">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{fmt(a.estudantes)}</TableCell>
                  <TableCell className="text-right">{fmt(a.saidas)}</TableCell>
                  <TableCell>
                    {a.mapeamentoExplicito ? (
                      <Badge variant="ok">próprio</Badge>
                    ) : (
                      <Badge variant="muted">padrão</Badge>
                    )}
                    {(a.pendentes?.length ?? 0) > 0 && <Badge variant="perigo">pendentes</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{bytes(a.tamanho)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void abrirRevisao(a.arquivo)}
                        disabled={ocupado !== null}
                      >
                        {ocupado === `rev:${a.arquivo}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <SlidersHorizontal className="size-3.5" />
                        )}
                        Mapeamento
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void excluir(a.arquivo)} disabled={ocupado !== null}>
                        {ocupado === a.arquivo ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Última atualização: {fmtData(dados?.ultimaAtualizacao)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações dos campi</CardTitle>
          <CardDescription>Nome de exibição e observação por campus (não alteram os dados da planilha)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(dados?.campi ?? []).map((c) => (
            <div key={c.raw} className="grid gap-2 sm:grid-cols-[200px_1fr_1fr] sm:items-end">
              <div className="text-xs">
                <span className="font-bold text-primary">{c.raw}</span>
              </div>
              <label className="grid gap-1 text-[11px] font-bold text-primary">
                Nome de exibição
                <input
                  value={edits[c.raw]?.nome ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, [c.raw]: { nome: e.target.value, nota: s[c.raw]?.nota ?? "" } }))}
                  className="h-9 rounded-md border border-[#a9bfd6] bg-card px-2 text-xs font-normal"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-bold text-primary">
                Observação
                <input
                  value={edits[c.raw]?.nota ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, [c.raw]: { nome: s[c.raw]?.nome ?? "", nota: e.target.value } }))}
                  className="h-9 rounded-md border border-[#a9bfd6] bg-card px-2 text-xs font-normal"
                />
              </label>
            </div>
          ))}
          <Button onClick={() => void salvarConfig()} disabled={ocupado !== null}>
            {ocupado === "config" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar informações
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
