import { NextRequest, NextResponse } from "next/server"
import {
  getEvolucao,
  getMeta,
  getOpcoes,
  getOverview,
  getPerfis,
  getTerritorio,
  getValidacao,
} from "@/lib/dados"
import { DIMENSOES_FILTRO, type Filtros } from "@/types"

export const dynamic = "force-dynamic"

const CHAVES = ["campus", "grupo", "curso", ...DIMENSOES_FILTRO]

function lerFiltros(sp: URLSearchParams): Filtros {
  const filtros: Filtros = {}
  for (const chave of CHAVES) {
    const valor = sp.get(chave)
    if (valor) filtros[chave] = valor
  }
  return filtros
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const view = sp.get("view") ?? "meta"
  try {
    switch (view) {
      case "meta":
        return NextResponse.json(getMeta())
      case "opcoes":
        return NextResponse.json(getOpcoes(lerFiltros(sp)))
      case "overview":
        return NextResponse.json(getOverview(lerFiltros(sp)))
      case "evolucao":
        return NextResponse.json(getEvolucao(lerFiltros(sp)))
      case "perfis":
        return NextResponse.json(getPerfis(lerFiltros(sp)))
      case "territorio":
        return NextResponse.json(getTerritorio(lerFiltros(sp)))
      case "validacao":
        return NextResponse.json(getValidacao())
      default:
        return NextResponse.json({ error: `view inválida: ${view}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
