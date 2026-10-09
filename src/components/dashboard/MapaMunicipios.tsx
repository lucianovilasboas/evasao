"use client"

import { useEffect, useMemo, useState } from "react"
import { CORES_MAPA, MAPA_BASE_MINIMA, type Municipio } from "@/types"
import { corPorTaxa, fmt, fmtPct } from "@/lib/utils"

interface Forma {
  cod: string
  nome: string
  d: string
}
interface MapaGeo {
  viewBox: string
  municipios: Forma[]
}

let promessa: Promise<MapaGeo> | null = null
function carregarMapa(): Promise<MapaGeo> {
  if (!promessa) {
    promessa = fetch("/geo/mapa_mg.json", { cache: "force-cache" }).then((r) => r.json() as Promise<MapaGeo>)
  }
  return promessa
}

interface Hover {
  x: number
  y: number
  nome: string
  dados: Municipio | null
}

export function MapaMunicipios({
  municipios,
  onSelecionar,
}: {
  municipios: Municipio[]
  onSelecionar?: (municipio: string) => void
}) {
  const [mapa, setMapa] = useState<MapaGeo | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    let vivo = true
    carregarMapa()
      .then((m) => vivo && setMapa(m))
      .catch(() => vivo && setMapa(null))
    return () => {
      vivo = false
    }
  }, [])

  const porCod = useMemo(() => {
    const m = new Map<string, Municipio>()
    for (const x of municipios) m.set(x.codIbge, x)
    return m
  }, [municipios])

  if (!mapa) {
    return <p className="py-10 text-center text-xs text-muted-foreground">Carregando mapa de Minas Gerais…</p>
  }

  const corDe = (cod: string) => {
    const d = porCod.get(cod)
    if (!d) return "#eef2f6"
    if (d.base < MAPA_BASE_MINIMA) return "url(#hachura)"
    return CORES_MAPA[corPorTaxa(d.taxa)]
  }

  return (
    <div className="relative">
      <div className="mx-auto w-full max-w-[300px] sm:max-w-[380px] lg:max-w-[460px]">
        <svg viewBox={mapa.viewBox} className="h-auto w-full" role="img" aria-label="Mapa coroplético de Minas Gerais">
          <defs>
            <pattern id="hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#eef2f6" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="2" />
            </pattern>
          </defs>
          {mapa.municipios.map((f) => {
            const d = porCod.get(f.cod)
            return (
              <path
                key={f.cod}
                d={f.d}
                fill={corDe(f.cod)}
                stroke="#ffffff"
                strokeWidth={0.7}
                className={d && onSelecionar ? "cursor-pointer" : undefined}
                onClick={() => {
                  if (d && onSelecionar) onSelecionar(d.nome)
                }}
                onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, nome: f.nome, dados: d ?? null })}
                onMouseLeave={() => setHover(null)}
              />
            )
          })}
        </svg>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-40 max-w-[240px] rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <p className="font-bold text-primary">{hover.dados?.nome ?? hover.nome}</p>
          {hover.dados ? (
            <>
              <p className="text-muted-foreground">
                Base: <b className="text-foreground">{fmt(hover.dados.base)}</b> · Saídas:{" "}
                <b className="text-foreground">{fmt(hover.dados.saidas)}</b>
              </p>
              <p className="text-muted-foreground">
                Taxa: <b className="text-foreground">{fmtPct(hover.dados.taxa)}</b>
              </p>
              {hover.dados.base < 10 && (
                <p className="mt-0.5 text-[10px] text-[#a16207]">⚠ base pequena ({hover.dados.base})</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Sem estudantes na seleção</p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-sm" style={{ background: CORES_MAPA.baixa }} /> &lt; 10%
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-sm" style={{ background: CORES_MAPA.media }} /> 10–25%
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-sm" style={{ background: CORES_MAPA.alta }} /> ≥ 25%
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-sm border border-border" style={{ background: CORES_MAPA.poucos }} /> base &lt; {MAPA_BASE_MINIMA}
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-3 rounded-sm border border-border" style={{ background: "#eef2f6" }} /> sem dados
        </span>
      </div>
    </div>
  )
}
