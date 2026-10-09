import path from "path"
import { inspecionar } from "./etl"
import { ehClasse } from "./mapeamento"

export interface ValorInspecionado {
  valor: string
  contagem: number
}
export interface Inspecao {
  arquivo: string
  linhas: number
  coluna: string
  campus: string[]
  valores: ValorInspecionado[]
}

export function nomeValido(arquivo: string): boolean {
  return path.basename(arquivo) === arquivo && arquivo.toLowerCase().endsWith(".xlsx")
}

/** Extrai o JSON impresso pelo inspetor, ignorando avisos (stderr). */
function extrairJson(log: string): Record<string, unknown> | null {
  const linhas = log.split("\n").map((l) => l.trim()).filter(Boolean)
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i]
    if (l.startsWith("{") && l.endsWith("}")) {
      try {
        return JSON.parse(l) as Record<string, unknown>
      } catch {
        /* tenta a linha anterior */
      }
    }
  }
  return null
}

export async function inspecionarArquivo(
  caminho: string,
): Promise<{ ok: true; dados: Inspecao } | { ok: false; erro: string }> {
  const { log } = await inspecionar(caminho)
  const json = extrairJson(log)
  if (!json) return { ok: false, erro: `falha ao inspecionar: ${log.slice(-300)}` }
  if (json.erro) return { ok: false, erro: String(json.erro) }
  return { ok: true, dados: json as unknown as Inspecao }
}

/** Situações presentes na planilha que ficaram sem classe válida. */
export function faltandoClassificar(valores: ValorInspecionado[], classes: Record<string, string>): string[] {
  return valores.filter((v) => !ehClasse(classes[v.valor])).map((v) => v.valor)
}
