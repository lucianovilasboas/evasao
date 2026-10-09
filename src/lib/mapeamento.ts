import type { ClasseDesfecho } from "@/types"
import { CLASSES_DESFECHO } from "@/types"

// Ordem de exibição das classes no editor de mapeamento.
export const CLASSES_ORDEM: ClasseDesfecho[] = ["evasao", "cancelamento", "transferencia", "nao_saida"]

export const CLASSE_LABEL = CLASSES_DESFECHO

const REGRAS: [RegExp, ClasseDesfecho][] = [
  [/evas|abandon|desist|jubil|falec|tranc|reprov|cancelament.*compuls/i, "evasao"],
  [/cancel|deslig|exclu/i, "cancelamento"],
  [/transfer.*extern|transferência.*extern/i, "transferencia"],
  [/formad|conclu|matricul|transfer.*intern|interc|integraliz|v[ií]nculo|isolad|ativo|regular/i, "nao_saida"],
]

/** Sugestão de classe a partir do rótulo da situação (apenas pré-preenchimento). */
export function sugerirClasse(valor: string): ClasseDesfecho | "pendente" {
  for (const [re, classe] of REGRAS) if (re.test(valor)) return classe
  return "pendente"
}

export function ehClasse(v: unknown): v is ClasseDesfecho {
  return typeof v === "string" && v in CLASSES_DESFECHO
}
