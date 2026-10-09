import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { BRUTOS, INCOMING } from "@/lib/etl"
import { getCampusRotulos, getMeta } from "@/lib/dados"
import { lerConfig } from "@/lib/config"
import type { CampusConfig } from "@/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const meta = getMeta()
    const rotulos = getCampusRotulos()
    const cfg = lerConfig()

    const arquivos = (meta.arquivos ?? []).map((a) => {
      let tamanho = 0
      let modificadoEm: string | null = null
      try {
        const st = fs.statSync(path.join(BRUTOS, a.arquivo))
        tamanho = st.size
        modificadoEm = st.mtime.toISOString()
      } catch {
        /* arquivo ausente */
      }
      return { ...a, tamanho, modificadoEm }
    })

    const campi: CampusConfig[] = meta.campi.map((raw) => ({
      raw,
      rotulo: rotulos[raw] ?? raw,
      nota: cfg.campi?.[raw]?.nota ?? "",
    }))

    let staging: string[] = []
    try {
      staging = fs.readdirSync(INCOMING).filter((f) => f.toLowerCase().endsWith(".xlsx"))
    } catch {
      /* sem staging */
    }

    return NextResponse.json({
      arquivos,
      campi,
      staging,
      totalArquivos: arquivos.length,
      ultimaAtualizacao: meta.ultimaAtualizacao,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
