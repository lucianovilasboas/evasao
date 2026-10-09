import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { BRUTOS, INCOMING, executarEtl } from "@/lib/etl"
import { faltandoClassificar, inspecionarArquivo, nomeValido } from "@/lib/importacao"
import { salvarMapeamento } from "@/lib/mapeamentos"
import { getMeta } from "@/lib/dados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

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
      return NextResponse.json({ error: "informe o mapeamento das situações" }, { status: 400 })
    }

    const origem = path.join(INCOMING, arquivo)
    if (!fs.existsSync(origem)) {
      return NextResponse.json({ error: "planilha não encontrada em staging (reenvie o arquivo)" }, { status: 404 })
    }

    const insp = await inspecionarArquivo(origem)
    if (!insp.ok) return NextResponse.json({ error: insp.erro }, { status: 422 })

    const faltando = faltandoClassificar(insp.dados.valores, mapeamento)
    if (faltando.length > 0) {
      return NextResponse.json(
        { error: `classifique todas as situações: ${faltando.map((v) => `"${v}"`).join(", ")}` },
        { status: 400 },
      )
    }

    salvarMapeamento(arquivo, { coluna: insp.dados.coluna, classes: mapeamento })

    fs.mkdirSync(BRUTOS, { recursive: true })
    fs.renameSync(origem, path.join(BRUTOS, arquivo))

    const { code, log } = await executarEtl()
    const meta = getMeta()
    if (code !== 0) return NextResponse.json({ ok: false, arquivo, log }, { status: 422 })
    return NextResponse.json({ ok: true, arquivo, log, meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
