import fs from "fs"
import path from "path"
import { lerJsonCacheado } from "./cache"

const ARQUIVO = path.resolve(process.cwd(), "dados", "mapeamentos.json")

export interface MapeamentoArquivo {
  coluna?: string
  classes: Record<string, string>
}
export type Mapeamentos = Record<string, MapeamentoArquivo>

export function lerMapeamentos(): Mapeamentos {
  return lerJsonCacheado<Mapeamentos>(ARQUIVO, {})
}

export function salvarMapeamento(arquivo: string, mapeamento: MapeamentoArquivo): void {
  const atuais = { ...lerMapeamentos() }
  atuais[arquivo] = mapeamento
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true })
  fs.writeFileSync(ARQUIVO, JSON.stringify(atuais, null, 2))
  try {
    fs.chmodSync(ARQUIVO, 0o666)
  } catch {
    /* host pode não permitir chmod */
  }
}
