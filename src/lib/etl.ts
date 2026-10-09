import { spawn } from "child_process"
import path from "path"

const DADOS = path.resolve(process.cwd(), "dados")
export const BRUTOS = path.join(DADOS, "brutos")
export const INCOMING = path.join(DADOS, "incoming")

export interface ResultadoEtl {
  code: number
  log: string
}

/** Executa um módulo Python do ETL com timeout e captura de saída. */
function rodarPython(args: string[], timeoutMs: number): Promise<ResultadoEtl> {
  return new Promise((resolve) => {
    const proc = spawn("python3", args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    })
    let log = ""
    const append = (d: Buffer) => {
      log += d.toString()
      if (log.length > 20000) log = log.slice(-20000)
    }
    proc.stdout.on("data", append)
    proc.stderr.on("data", append)
    const timer = setTimeout(() => {
      append(Buffer.from("\n[timeout] ETL excedeu o tempo limite\n"))
      proc.kill("SIGKILL")
    }, timeoutMs)
    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ code: -1, log: log + String(err) })
    })
    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, log })
    })
  })
}

/** Reprocessa dados/brutos (modelo temporal + validação). */
export function executarEtl(timeoutMs = 240_000): Promise<ResultadoEtl> {
  return rodarPython(["-m", "etl.processar", "--selftest"], timeoutMs)
}

/** Inspeciona uma planilha (etapa de mapeamento). O stdout é JSON. */
export function inspecionar(caminho: string, timeoutMs = 120_000): Promise<ResultadoEtl> {
  return rodarPython(["-m", "etl.inspecionar", caminho], timeoutMs)
}

/** Sanitiza o nome do arquivo e exige extensão .xlsx. */
export function nomeArquivoSeguro(entrada: string): string | null {
  const base = path.basename(entrada).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  const limpo = base.replace(/[^\w.\-() ]+/g, "_").trim().replace(/\s+/g, " ")
  if (!limpo.toLowerCase().endsWith(".xlsx")) return null
  if (limpo.length < 6 || limpo.length > 140) return null
  return limpo
}
