"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import { CORES_CLASSE, CORES_TIPO, PALETA, type CategoriaPerfil, type ItemContagem, type PontoEvolucao, type TipoSaidaItem } from "@/types"
import { fmt, fmtPct } from "@/lib/utils"

const eixo = { fontSize: 10, fill: PALETA.cinza }

interface TooltipItem {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string
  payload?: Record<string, unknown>
}
interface TooltipProps {
  active?: boolean
  payload?: TooltipItem[]
  label?: string | number
}

function TooltipBox({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      {label !== undefined && <p className="mb-1 font-bold text-primary">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">
            {p.dataKey === "taxa" ? fmtPct(Number(p.value)) : fmt(Number(p.value))}
          </span>
        </p>
      ))}
    </div>
  )
}

/** Barras (matrículas/saídas) + linha de taxa, com média e pico. */
export function EvolucaoChart({
  pontos,
  altura = 340,
  referencia,
}: {
  pontos: PontoEvolucao[]
  altura?: number
  referencia?: number | null
}) {
  if (pontos.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">Sem dados para esta seleção.</p>
  const pico = [...pontos].filter((p) => p.matriculas >= 10 && p.taxa !== null).sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0))[0]
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={pontos} margin={{ top: 18, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETA.linha} vertical={false} />
        <XAxis dataKey="periodo" tick={eixo} minTickGap={16} />
        <YAxis yAxisId="left" tick={eixo} width={38} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={eixo} width={44} domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Bar yAxisId="left" dataKey="matriculas" name="Matrículas" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false}>
          {pontos.map((p, i) => (
            <Cell key={i} fill={p.matriculas < 10 ? "#cbd5e1" : PALETA.azulClaro} />
          ))}
        </Bar>
        <Bar yAxisId="left" dataKey="saidas" name="Saídas" fill={PALETA.vermelho} radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
        {referencia != null && (
          <ReferenceLine
            yAxisId="right"
            y={referencia}
            stroke={PALETA.cinza}
            strokeDasharray="5 4"
            label={{ value: `média ${fmtPct(referencia)}`, position: "insideTopRight", fontSize: 10, fill: PALETA.cinza }}
          />
        )}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="taxa"
          name="Taxa de saída"
          stroke={PALETA.roxo}
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#fff", strokeWidth: 2, stroke: PALETA.roxo }}
          activeDot={{ r: 5 }}
          connectNulls
          isAnimationActive={false}
        />
        {pico && pico.taxa != null && (
          <ReferenceDot
            yAxisId="right"
            x={pico.periodo}
            y={pico.taxa}
            r={5}
            fill={PALETA.vermelho}
            stroke="#fff"
            strokeWidth={2}
            label={{ value: `pico ${fmtPct(pico.taxa)}`, position: "top", fontSize: 10, fill: PALETA.vermelho }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Ranking horizontal (taxa por categoria). */
export function RankingChart({
  itens,
  altura = 420,
  cor = PALETA.vermelho,
}: {
  itens: { rotulo: string; base: number; taxa: number; aviso?: boolean }[]
  altura?: number
  cor?: string
}) {
  if (itens.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">Sem categorias com base mínima.</p>
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={itens} layout="vertical" margin={{ top: 6, right: 48, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETA.linha} horizontal={false} />
        <XAxis type="number" tick={eixo} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} domain={[0, "auto"]} />
        <YAxis type="category" dataKey="rotulo" tick={eixo} width={170} />
        <Tooltip content={<TooltipBox />} />
        <Bar dataKey="taxa" name="Taxa de saída" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {itens.map((it, i) => (
            <Cell key={i} fill={it.aviso ? PALETA.cinza : cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

interface CursoPonto {
  cod: string
  nome: string
  campus: string
  estudantes: number
  saidas: number
  taxa: number
}

/** Dispersão: taxa de saída × nº de estudantes, por curso. */
export function DispersaoCursos({
  cursos,
  referencia,
  altura = 340,
}: {
  cursos: CursoPonto[]
  referencia?: number | null
  altura?: number
}) {
  const dados = cursos.map((c) => ({ ...c, x: c.estudantes, y: c.taxa }))
  if (dados.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">Sem cursos na seleção.</p>
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETA.linha} />
        <XAxis
          type="number"
          dataKey="x"
          name="Estudantes"
          tick={eixo}
          domain={[0, "dataMax + 40"]}
          label={{ value: "nº de estudantes (base)", position: "insideBottom", offset: -10, fontSize: 10, fill: PALETA.cinza }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Taxa de saída"
          tick={eixo}
          width={44}
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
        />
        <ZAxis type="number" dataKey="x" range={[45, 260]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<CursoTooltip />} />
        {referencia != null && (
          <ReferenceLine
            y={referencia}
            stroke={PALETA.cinza}
            strokeDasharray="5 4"
            label={{ value: `média ${fmtPct(referencia)}`, position: "insideTopRight", fontSize: 10, fill: PALETA.cinza }}
          />
        )}
        <Scatter data={dados} fill={PALETA.azulMedio} fillOpacity={0.7} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function CursoTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const c = payload[0].payload as unknown as CursoPonto | undefined
  if (!c) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-bold text-primary">{c.nome}</p>
      <p className="text-muted-foreground">{c.campus}</p>
      <p className="text-muted-foreground">
        Base: <b className="text-foreground">{fmt(c.estudantes)}</b> · Saídas: <b className="text-foreground">{fmt(c.saidas)}</b>
      </p>
      <p className="text-muted-foreground">
        Taxa: <b className="text-foreground">{fmtPct(c.taxa)}</b>
      </p>
    </div>
  )
}

/** Composição 100% empilhada das saídas por classe (barras). */
export function ComposicaoClassesChart({ tipos, altura = 96 }: { tipos: TipoSaidaItem[]; altura?: number }) {
  if (tipos.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">Sem saídas na seleção.</p>
  const linha: Record<string, number | string> = { rotulo: "saídas" }
  for (const t of tipos) linha[t.classe] = t.pct
  return (
    <div>
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={[linha]} layout="vertical" margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <XAxis type="number" domain={[0, 1]} hide />
          <YAxis type="category" dataKey="rotulo" hide />
          <Tooltip content={<ComposicaoTooltip tipos={tipos} />} cursor={{ fill: "transparent" }} />
          {tipos.map((t) => (
            <Bar key={t.classe} dataKey={t.classe} stackId="a" name={t.rotulo} fill={CORES_CLASSE[t.classe] ?? PALETA.cinza} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 space-y-1">
        {tipos.map((t) => (
          <div key={t.classe} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm" style={{ background: CORES_CLASSE[t.classe] ?? PALETA.cinza }} />
              <span className="text-muted-foreground">{t.rotulo}</span>
            </span>
            <span className="font-semibold">
              {fmt(t.valor)} <span className="font-normal text-muted-foreground">({fmtPct(t.pct)})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ComposicaoTooltip({ active, payload, tipos }: TooltipProps & { tipos?: TipoSaidaItem[] }) {
  if (!active || !payload || payload.length === 0) return null
  const classe = payload[0]?.dataKey
  const t = tipos?.find((x) => x.classe === classe)
  if (!t) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-bold text-primary">{t.rotulo}</p>
      <p className="text-muted-foreground">
        {fmt(t.valor)} saídas ({fmtPct(t.pct)})
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Situações: {t.situacoes.map((s) => `${s.valor} (${fmt(s.contagem)})`).join(", ")}
      </p>
    </div>
  )
}

/** Contagem simples em barras horizontais, com cor por classe opcional. */
export function ContagemChart({
  itens,
  altura = 200,
  cor = PALETA.azulMedio,
}: {
  itens: ItemContagem[]
  altura?: number
  cor?: string
}) {
  if (itens.length === 0) return <p className="py-8 text-center text-xs text-muted-foreground">Sem dados.</p>
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={itens} layout="vertical" margin={{ top: 6, right: 40, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={PALETA.linha} horizontal={false} />
        <XAxis type="number" tick={eixo} allowDecimals={false} />
        <YAxis type="category" dataKey="rotulo" tick={eixo} width={170} />
        <Tooltip content={<TooltipBox />} />
        <Bar dataKey="valor" name="Registros" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {itens.map((it, i) => (
            <Cell key={i} fill={it.classe ? CORES_CLASSE[it.classe] ?? cor : cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export { CORES_TIPO }
export type { CategoriaPerfil }
