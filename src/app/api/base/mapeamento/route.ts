import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { BRUTOS, executarEtl } from "@/lib/etl"
import { faltandoClassificar, inspecionarArquivo, nomeValido } from "@/lib/importacao"
import { lerMapeamentos, salvarMapeamento } from "@/lib/mapeamentos"
import { getMeta } from "@/lib/dados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Lê as situações e o mapeamento vigente de uma planilha já na base. */
export async function GET(req: NextRequest) {
  try {
    const arquivo = req.nextUrl.searchParams.get("arquivo")
    if (!arquivo || !nomeValido(arquivo)) {
      return NextResponse.json({ error: "arquivo inválido" }, { status: 400 })
    }
    const local = path.join(BRUTOS, arquivo)
    if (!fs.existsSync(local)) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 })
    const insp = await inspecionarArquivo(local)
    if (!insp.ok) return NextResponse.json({ error: insp.erro }, { status: 422 })
    const mapeamento = lerMapeamentos()[arquivo] ?? null
    return NextResponse.json({ ok: true, ...insp.dados, mapeamento })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Salva um novo mapeamento para uma planilha já na base e reprocessa o ETL. */
export async function POST(req: NextRequest) {
  try {
    const { arquivo, mapeamento } = (await req.json()) as {
      arquivo?: string
      mapeamento?: Record<string, string>
    }
    if (!arquivo || !nomeValido(arquivo)) {
      return NextResponse.json({ error: "arquivo inválido" }, { status: 400 })
    }
    if (!mapeamento || typeof mapeamento !== "object") {
      return NextResponse.json({ error: "informe o mapeamento" }, { status: 400 })
    }
    const local = path.join(BRUTOS, arquivo)
    if (!fs.existsSync(local)) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 })

    const insp = await inspecionarArquivo(local)
    if (!insp.ok) return NextResponse.json({ error: insp.erro }, { status: 422 })
    const faltando = faltandoClassificar(insp.dados.valores, mapeamento)
    if (faltando.length > 0) {
      return NextResponse.json(
        { error: `classifique todas as situações: ${faltando.map((v) => `"${v}"`).join(", ")}` },
        { status: 400 },
      )
    }

    salvarMapeamento(arquivo, { coluna: insp.dados.coluna, classes: mapeamento })
    const { code, log } = await executarEtl()
    const meta = getMeta()
    if (code !== 0) return NextResponse.json({ ok: false, arquivo, log }, { status: 422 })
    return NextResponse.json({ ok: true, arquivo, log, meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
