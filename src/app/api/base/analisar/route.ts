import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { INCOMING, nomeArquivoSeguro } from "@/lib/etl"
import { inspecionarArquivo } from "@/lib/importacao"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const LIMITE = 80 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const arquivo = form.get("arquivo")
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: "envie um arquivo .xlsx no campo 'arquivo'" }, { status: 400 })
    }
    const nome = nomeArquivoSeguro(arquivo.name)
    if (!nome) return NextResponse.json({ error: "nome ou extensão inválidos — use um .xlsx" }, { status: 400 })
    if (arquivo.size > LIMITE) return NextResponse.json({ error: "arquivo maior que 80 MB" }, { status: 413 })

    fs.mkdirSync(INCOMING, { recursive: true })
    const destino = path.join(INCOMING, nome)
    fs.writeFileSync(destino, Buffer.from(await arquivo.arrayBuffer()))
    try {
      fs.chmodSync(destino, 0o666)
    } catch {
      /* ok */
    }

    const insp = await inspecionarArquivo(destino)
    if (!insp.ok) {
      fs.rmSync(destino, { force: true })
      return NextResponse.json({ error: insp.erro }, { status: 422 })
    }
    return NextResponse.json({ ok: true, ...insp.dados })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
