// ---------------------------------------------------------------------------
// Tipos centrais, labels e paleta. Fonte única para o restante do dashboard.
// ---------------------------------------------------------------------------

export interface GrupoInfo {
  chave: string
  label: string
  periodicidade: "anual" | "semestral"
}

export interface CursoInfo {
  cod: string
  nome: string
  campus: string
  grupo: string
  grupoLabel: string
  modalidade: string
  nivel: string
}

export interface ValidacaoInfo {
  validos: number
  excluidos: number
  motivoExclusao: string
  detalheExcluidos: unknown[]
  porCampus: Record<
    string,
    { estudantes: number; saidas: number; grupos: Record<string, { estudantes: number; saidas: number }> }
  >
}

export interface MetaDados {
  ultimaAtualizacao: string
  geradoEm: string
  campi: string[]
  grupos: GrupoInfo[]
  cursos: CursoInfo[]
  validacao: ValidacaoInfo
  fontes: string[]
  nota: string
  arquivos?: Omit<ArquivoBase, "tamanho" | "modificadoEm">[]
  campiRotulos?: Record<string, string>
}

export interface Perfil {
  Sexo: string
  "Cota Inscrito": string
  "Faixa etária no ingresso": string
  "Tipo de Escola de Origem": string
  "Etnia/Raça": string
  "Município de Residência": string
  "Faixa renda": string
  Turma: string
  Turno: string
  "Zona Residencial": string
  "Forma de Ingresso": string
  "Nível de Ensino Anterior": string
  NAPNEE: string
  AEE: string
  "Faixa C.R.": string
  "Faixa Frequência": string
  "Faixa Progresso": string
}

export interface Registro {
  id: string
  campus: string
  codCurso: string
  curso: string
  grupo: string
  grupoLabel: string
  periodicidade: "anual" | "semestral"
  modalidade: string
  nivel: string
  anoIngresso: number
  perIngresso: number
  ultimaMatricula: string
  vinculoPeriodos: number
  situacao: string
  classe: string
  saida: boolean
  tipoSaida: string
  ufResidencia: string
  codIbge: string
  perfil: Perfil
  periodos: string[]
}

export type Filtros = Record<string, string | undefined>

export interface Centroide {
  nome: string
  uf: number
  lat: number
  lon: number
}

// -------- respostas da API --------------------------------------------------

export interface Opcao {
  valor: string
  rotulo: string
}

export type Opcoes = Record<string, Opcao[]>

export interface ValorSituacao {
  valor: string
  contagem: number
  classe?: string
}

export interface ArquivoBase {
  arquivo: string
  campi: string[]
  estudantes: number
  saidas: number
  excluidos: number
  coluna?: string
  mapeamento?: Record<string, string>
  mapeamentoExplicito?: boolean
  contagemClasses?: Record<string, number>
  valores?: ValorSituacao[]
  pendentes?: string[]
  naoMapeados?: string[]
  tamanho: number
  modificadoEm: string | null
}

/** Classes de desfecho de uma situação; as três primeiras formam a saída. */
export const CLASSES_DESFECHO = {
  evasao: "Evasão",
  cancelamento: "Cancelamento/Desligamento",
  transferencia: "Transferência externa",
  nao_saida: "Não saída",
} as const

export type ClasseDesfecho = keyof typeof CLASSES_DESFECHO

export const CLASSES_SAIDA: ClasseDesfecho[] = ["evasao", "cancelamento", "transferencia"]

export interface CampusConfig {
  raw: string
  rotulo: string
  nota: string
}

export interface GrupoResumo {
  chave: string
  label: string
  periodicidade: string
  estudantes: number
  saidas: number
  taxa: number
}

export interface ItemContagem {
  rotulo: string
  valor: number
  classe?: string
}

export interface TipoSaidaItem {
  classe: string
  rotulo: string
  valor: number
  pct: number
  situacoes: { valor: string; contagem: number }[]
}

export type MapeamentoModo = "padrao" | "proprio" | "misto"

export interface Overview {
  registros: number
  saidas: number
  taxa: number
  totalBase: number
  grupos: GrupoResumo[]
  tipos: TipoSaidaItem[]
  cursos: (CursoInfo & { estudantes: number; saidas: number; taxa: number })[]
  situacoes: ItemContagem[]
  campiSelecionados: number
  mapeamentoModo: MapeamentoModo
}

export interface PontoEvolucao {
  periodo: string
  matriculas: number
  saidas: number
  taxa: number | null
  evasao: number
  cancelDeslig: number
  transfExterna: number
}

export interface SerieGrupo {
  chave: string
  label: string
  periodicidade: string
  pontos: PontoEvolucao[]
}

export interface Evolucao {
  series: SerieGrupo[]
}

export interface CategoriaPerfil {
  categoria: string
  base: number
  saidas: number
  taxa: number
  riscoRelativo: number
  aviso: boolean
}

export interface DimensaoPerfil {
  dimensao: string
  taxaGrupo: number
  categorias: CategoriaPerfil[]
}

export interface Perfis {
  dimensoes: DimensaoPerfil[]
}

export interface Municipio extends Centroide {
  codIbge: string
  base: number
  saidas: number
  taxa: number
}

export interface Territorio {
  municipios: Municipio[]
  zona: ItemContagem[]
  semMunicipio: number
}

// -------- visual ------------------------------------------------------------

export const PALETA = {
  azul: "#17365d",
  azulMedio: "#2f75b5",
  azulClaro: "#5b9bd5",
  vermelho: "#c00000",
  roxo: "#7030a0",
  laranja: "#e3a008",
  cinza: "#607385",
  linha: "#d6e2ef",
  verde: "#2e7d32",
} as const

export const CORES_TIPO: Record<string, string> = {
  "Transferência externa": PALETA.azulClaro,
  "Cancelamento/Desligamento": PALETA.vermelho,
  Evasão: PALETA.laranja,
  "Não saída": PALETA.cinza,
}

export const CORES_CLASSE: Record<string, string> = {
  evasao: "#e3a008",
  cancelamento: "#c00000",
  transferencia: "#5b9bd5",
  nao_saida: "#cbd5e1",
}

// Paleta sequencial (amarelo -> vermelho), segura para daltonismo por variar a luminância.
export const CORES_MAPA = {
  poucos: "#cbd5e1",
  baixa: "#fee8c8",
  media: "#fdae61",
  alta: "#d7301f",
} as const

/** Base mínima para colorir o mapa por taxa (evita ruído de municípios com 1 caso). */
export const MAPA_BASE_MINIMA = 5

// Dimensões disponíveis como filtro global (espelha o modelo HTML).
export const DIMENSOES_FILTRO: string[] = [
  "Sexo",
  "Cota Inscrito",
  "Faixa etária no ingresso",
  "Tipo de Escola de Origem",
  "Etnia/Raça",
  "Ano de Ingresso",
  "Turno",
  "Zona Residencial",
  "Faixa C.R.",
  "Faixa Frequência",
  "Faixa Progresso",
  "Situação no Curso",
  "Município de Residência",
]

export const LABELS_FILTRO: Record<string, string> = {
  "Sexo": "Sexo",
  "Cota Inscrito": "Cota",
  "Faixa etária no ingresso": "Faixa etária",
  "Tipo de Escola de Origem": "Escola de origem",
  "Etnia/Raça": "Etnia/Raça",
  "Ano de Ingresso": "Ano de ingresso",
  "Turno": "Turno",
  "Zona Residencial": "Zona residencial",
  "Faixa C.R.": "Faixa de C.R.",
  "Faixa Frequência": "Faixa de frequência",
  "Faixa Progresso": "Faixa de progresso",
  "Situação no Curso": "Situação no curso",
  "Município de Residência": "Município de residência",
}

// Dimensões usadas no ranking de perfis.
export const DIMENSOES_PERFIL: string[] = [
  "Curso",
  "Ano de Ingresso",
  "Sexo",
  "Faixa etária no ingresso",
  "Cota Inscrito",
  "Tipo de Escola de Origem",
  "Etnia/Raça",
  "Município de Residência",
  "Faixa renda",
  "Turma",
  "Turno",
  "Zona Residencial",
  "Forma de Ingresso",
  "Nível de Ensino Anterior",
  "NAPNEE",
  "AEE",
  "Faixa C.R.",
  "Faixa Frequência",
  "Faixa Progresso",
  "Situação no Curso",
]

export const TIPO_SAIDA_LABELS = [
  "Transferência externa",
  "Cancelamento/Desligamento",
  "Evasão",
] as const
