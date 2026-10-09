import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { BRUTOS, executarEtl } from "@/lib/etl"
import { getMeta } from "@/lib/dados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const { arquivo } = (await req.json()) as { arquivo?: string }
    if (!arquivo) return NextResponse.json({ error: "informe o arquivo" }, { status: 400 })

    // Somente o nome-base, dentro de dados/brutos, com extensão .xlsx.
    if (path.basename(arquivo) !== arquivo || !arquivo.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "nome de arquivo inválido" }, { status: 400 })
    }
    const destino = path.join(BRUTOS, arquivo)
    if (!fs.existsSync(destino)) {
      return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 })
    }

    const existentes = fs.readdirSync(BRUTOS).filter((f) => f.toLowerCase().endsWith(".xlsx"))
    if (existentes.length <= 1) {
      return NextResponse.json(
        { error: "não é possível excluir a última planilha — a base ficaria vazia" },
        { status: 409 },
      )
    }

    fs.unlinkSync(destino)
    const { code, log } = await executarEtl()
    const meta = getMeta()
    if (code !== 0) return NextResponse.json({ ok: false, arquivo, log }, { status: 422 })
    return NextResponse.json({ ok: true, arquivo, log, meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
