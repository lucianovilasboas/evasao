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

    const destino = path.join(BRUTOS, arquivo)
    if (fs.existsSync(destino)) {
      return NextResponse.json(
        { error: "já existe uma planilha com esse nome na base; renomeie o novo arquivo" },
        { status: 409 },
      )
    }
    const arquivoMapeamentos = path.join(path.dirname(BRUTOS), "mapeamentos.json")
    const mapeamentosAnteriores = fs.existsSync(arquivoMapeamentos)
      ? fs.readFileSync(arquivoMapeamentos)
      : null
    let copiado = false
    let mapeamentoAlterado = false
    let removidoDoStaging = false
    const rollback = () => {
      const falhas: string[] = []
      // Tenta ambas as restaurações, mesmo se uma delas falhar.
      try {
        if (copiado) {
          if (removidoDoStaging) {
            // Não sobrescreve um novo upload que tenha chegado ao staging.
            fs.copyFileSync(destino, origem, fs.constants.COPYFILE_EXCL)
          }
          fs.unlinkSync(destino)
        }
      } catch (err) {
        falhas.push(`planilha: ${String(err)}`)
      }
      try {
        if (mapeamentoAlterado) {
          if (mapeamentosAnteriores === null) {
            if (fs.existsSync(arquivoMapeamentos)) fs.unlinkSync(arquivoMapeamentos)
          } else {
            fs.writeFileSync(arquivoMapeamentos, mapeamentosAnteriores)
          }
        }
      } catch (err) {
        falhas.push(`mapeamento: ${String(err)}`)
      }
      if (falhas.length) throw new Error(`falha no rollback da importação: ${falhas.join("; ")}`)
    }

    let resultado: Awaited<ReturnType<typeof executarEtl>>
    try {
      fs.mkdirSync(BRUTOS, { recursive: true })
      // COPYFILE_EXCL também protege da colisão entre a checagem e a cópia.
      fs.copyFileSync(origem, destino, fs.constants.COPYFILE_EXCL)
      copiado = true
      mapeamentoAlterado = true // Inclusive se a escrita falhar parcialmente.
      salvarMapeamento(arquivo, { coluna: insp.dados.coluna, classes: mapeamento })
      fs.unlinkSync(origem)
      removidoDoStaging = true
      resultado = await executarEtl()
    } catch (err) {
      rollback()
      throw err
    }
    const { code, log } = resultado
    if (code !== 0) {
      rollback()
      return NextResponse.json({ ok: false, arquivo, log }, { status: 422 })
    }
    // Somente após o gate e a publicação dos JSON terem sido concluídos.
    return NextResponse.json({ ok: true, arquivo, log, meta: getMeta() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
