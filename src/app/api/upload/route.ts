import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { BRUTOS, executarEtl, nomeArquivoSeguro } from "@/lib/etl"
import { getMeta } from "@/lib/dados"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const LIMITE = 80 * 1024 * 1024 // 80 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const arquivo = form.get("arquivo")
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: "envie um arquivo .xlsx no campo 'arquivo'" }, { status: 400 })
    }
    if (arquivo.size === 0) {
      return NextResponse.json({ error: "arquivo vazio" }, { status: 400 })
    }
    if (arquivo.size > LIMITE) {
      return NextResponse.json({ error: "arquivo maior que 80 MB" }, { status: 413 })
    }

    const nome = nomeArquivoSeguro(arquivo.name)
    if (!nome) {
      return NextResponse.json({ error: "nome ou extensão inválidos — use um .xlsx" }, { status: 400 })
    }

    fs.mkdirSync(BRUTOS, { recursive: true })
    const destino = path.join(BRUTOS, nome)
    fs.writeFileSync(destino, Buffer.from(await arquivo.arrayBuffer()))
    try {
      fs.chmodSync(destino, 0o666)
    } catch {
      /* host pode não permitir chmod */
    }

    const { code, log } = await executarEtl()
    const meta = getMeta()

    if (code !== 0) {
      return NextResponse.json({ ok: false, arquivo: nome, log }, { status: 422 })
    }
    return NextResponse.json({ ok: true, arquivo: nome, log, meta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
