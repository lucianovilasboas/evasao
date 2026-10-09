import path from "path"
import { lerJsonCacheado } from "./cache"
import { lerConfig } from "./config"
import {
  DIMENSOES_FILTRO,
  DIMENSOES_PERFIL,
  type Centroide,
  type CategoriaPerfil,
  type DimensaoPerfil,
  type Evolucao,
  type Filtros,
  type GrupoResumo,
  type ItemContagem,
  type MetaDados,
  type Municipio,
  type Opcoes,
  type Overview,
  type Perfis,
  type PontoEvolucao,
  type Registro,
  type Territorio,
} from "@/types"

const DADOS = path.resolve(process.cwd(), "dados")
const F_BASE = path.join(DADOS, "base_temporal.json")
const F_META = path.join(DADOS, "meta.json")
const F_GEO = path.join(DADOS, "geo", "municipios_mg_centroides.json")

const META_VAZIO: MetaDados = {
  ultimaAtualizacao: "",
  geradoEm: "",
  campi: [],
  grupos: [],
  cursos: [],
  validacao: { validos: 0, excluidos: 0, motivoExclusao: "", detalheExcluidos: [], porCampus: {} },
  fontes: [],
  nota: "",
}

export function getMeta(): MetaDados {
  const meta = lerJsonCacheado<MetaDados>(F_META, META_VAZIO)
  return { ...meta, campiRotulos: getCampusRotulos() }
}

/** Rótulos de exibição dos campi definidos em dados/config.json (opcional). */
export function getCampusRotulos(): Record<string, string> {
  const cfg = lerConfig()
  const out: Record<string, string> = {}
  for (const [campus, info] of Object.entries(cfg.campi ?? {})) {
    if (info?.nome) out[campus] = info.nome
  }
  return out
}

function rotuloDe(dim: string, valor: string, meta: MetaDados): string {
  if (dim === "campus") return meta.campiRotulos?.[valor] ?? valor
  if (dim === "grupo") return meta.grupos.find((g) => g.chave === valor)?.label ?? valor
  if (dim === "curso") {
    const c = meta.cursos.find((x) => x.cod === valor)
    if (!c) return valor
    return meta.campi.length > 1 ? `${c.nome} (${c.campus})` : c.nome
  }
  return valor
}

export function getRegistros(): Registro[] {
  return lerJsonCacheado<Registro[]>(F_BASE, [])
}

function getCentroides(): Record<string, Centroide> {
  return lerJsonCacheado<Record<string, Centroide>>(F_GEO, {})
}

// --------------------------------------------------------------------------- //
// filtros
// --------------------------------------------------------------------------- //
export function valorDe(r: Registro, chave: string): string {
  switch (chave) {
    case "campus":
      return r.campus
    case "grupo":
      return r.grupo
    case "curso":
      return r.codCurso
    case "Ano de Ingresso":
      return String(r.anoIngresso)
    case "Situação no Curso":
      return r.situacao
    default:
      return (r.perfil as unknown as Record<string, string>)[chave] ?? "Não informado"
  }
}

export function filtrar(registros: Registro[], filtros: Filtros): Registro[] {
  const ativos = Object.entries(filtros).filter(([, v]) => v && v !== "__TOTAL__")
  if (ativos.length === 0) return registros
  return registros.filter((r) => ativos.every(([k, v]) => valorDe(r, k) === v))
}

const CLASSE_TIPO: Record<string, string> = {
  evasao: "Evasão",
  cancelamento: "Cancelamento/Desligamento",
  transferencia: "Transferência externa",
  nao_saida: "Não saída",
}

const DIMENSOES_OPCOES = ["campus", "grupo", "curso", ...DIMENSOES_FILTRO]

/**
 * Opções de cada filtro em cascata: os valores de uma dimensão são calculados
 * sobre os registros que satisfazem TODOS os outros filtros ativos (AJAX).
 */
export function getOpcoes(filtros: Filtros = {}): Opcoes {
  const meta = getMeta()
  const registros = getRegistros()
  const opcoes: Opcoes = {}
  for (const dim of DIMENSOES_OPCOES) {
    const outros = Object.entries(filtros).filter(([k, v]) => k !== dim && v && v !== "__TOTAL__")
    const candidatos = outros.length
      ? registros.filter((r) => outros.every(([k, v]) => valorDe(r, k) === v))
      : registros
    const set = new Set<string>()
    for (const r of candidatos) set.add(valorDe(r, dim))
    opcoes[dim] = [...set]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
      .map((valor) => ({ valor, rotulo: rotuloDe(dim, valor, meta) }))
  }
  return opcoes
}

// --------------------------------------------------------------------------- //
// agregações
// --------------------------------------------------------------------------- //
function taxa(saidas: number, base: number): number {
  return base > 0 ? saidas / base : 0
}

export function getOverview(filtros: Filtros): Overview {
  const meta = getMeta()
  const todas = getRegistros()
  const campusSel = filtros.campus && filtros.campus !== "__TOTAL__" ? filtros.campus : undefined
  const base = campusSel ? todas.filter((r) => r.campus === campusSel) : todas
  const registros = filtrar(todas, filtros)

  const porGrupo = new Map<string, GrupoResumo>()
  for (const g of meta.grupos) {
    porGrupo.set(g.chave, { ...g, estudantes: 0, saidas: 0, taxa: 0 })
  }
  for (const r of registros) {
    const g = porGrupo.get(r.grupo) ?? {
      chave: r.grupo,
      label: r.grupoLabel,
      periodicidade: r.periodicidade,
      estudantes: 0,
      saidas: 0,
      taxa: 0,
    }
    g.estudantes += 1
    if (r.saida) g.saidas += 1
    porGrupo.set(r.grupo, g)
  }
  for (const g of porGrupo.values()) g.taxa = taxa(g.saidas, g.estudantes)

  const tipos = new Map<string, { classe: string; valor: number; situacoes: Map<string, number> }>()
  const situacoes = new Map<string, { rotulo: string; valor: number; classe: string }>()
  const cursos = new Map<string, Overview["cursos"][number]>()
  for (const c of meta.cursos) {
    cursos.set(c.cod, { ...c, estudantes: 0, saidas: 0, taxa: 0 })
  }
  for (const r of registros) {
    const chaveSit = `${r.situacao}|${r.classe}`
    const sit = situacoes.get(chaveSit) ?? { rotulo: r.situacao, valor: 0, classe: r.classe }
    sit.valor += 1
    situacoes.set(chaveSit, sit)
    if (r.saida) {
      const t = tipos.get(r.classe) ?? { classe: r.classe, valor: 0, situacoes: new Map<string, number>() }
      t.valor += 1
      t.situacoes.set(r.situacao, (t.situacoes.get(r.situacao) ?? 0) + 1)
      tipos.set(r.classe, t)
    }
    const c = cursos.get(r.codCurso) ?? {
      cod: r.codCurso, nome: r.curso, campus: r.campus, grupo: r.grupo,
      grupoLabel: r.grupoLabel, modalidade: r.modalidade, nivel: r.nivel,
      estudantes: 0, saidas: 0, taxa: 0,
    }
    c.estudantes += 1
    if (r.saida) c.saidas += 1
    cursos.set(r.codCurso, c)
  }
  for (const c of cursos.values()) c.taxa = taxa(c.saidas, c.estudantes)

  const saidas = registros.filter((r) => r.saida).length

  const arquivosRel = (meta.arquivos ?? []).filter((a) => !campusSel || a.campi.includes(campusSel))
  const modos = new Set(arquivosRel.map((a) => (a.mapeamentoExplicito ? "proprio" : "padrao")))
  const mapeamentoModo: Overview["mapeamentoModo"] =
    modos.size === 0 ? "padrao" : modos.size > 1 ? "misto" : ([...modos][0] as "padrao" | "proprio")

  const tiposOrdenados = [...tipos.values()]
    .sort((a, b) => b.valor - a.valor)
    .map((t) => ({
      classe: t.classe,
      rotulo: CLASSE_TIPO[t.classe] ?? t.classe,
      valor: t.valor,
      pct: saidas > 0 ? t.valor / saidas : 0,
      situacoes: [...t.situacoes.entries()]
        .map(([valor, contagem]) => ({ valor, contagem }))
        .sort((a, b) => b.contagem - a.contagem),
    }))

  return {
    registros: registros.length,
    saidas,
    taxa: taxa(saidas, registros.length),
    totalBase: base.length,
    grupos: [...porGrupo.values()].filter((g) => g.estudantes > 0),
    tipos: tiposOrdenados,
    cursos: [...cursos.values()].filter((c) => c.estudantes > 0).sort((a, b) => b.estudantes - a.estudantes),
    situacoes: [...situacoes.values()].sort((a, b) => b.valor - a.valor),
    campiSelecionados: campusSel ? 1 : meta.campi.length,
    mapeamentoModo,
  }
}

function acumularPeriodo(acc: Map<string, PontoEvolucao>, periodo: string): PontoEvolucao {
  let p = acc.get(periodo)
  if (!p) {
    p = { periodo, matriculas: 0, saidas: 0, taxa: null, evasao: 0, cancelDeslig: 0, transfExterna: 0 }
    acc.set(periodo, p)
  }
  return p
}

export function getEvolucao(filtros: Filtros): Evolucao {
  const meta = getMeta()
  const registros = filtrar(getRegistros(), filtros)
  const series = meta.grupos.map((g) => {
    const acc = new Map<string, PontoEvolucao>()
    for (const r of registros) {
      if (r.grupo !== g.chave) continue
      for (const p of r.periodos) acumularPeriodo(acc, p).matriculas += 1
      if (r.saida) {
        const p = acumularPeriodo(acc, r.ultimaMatricula)
        p.saidas += 1
        if (r.tipoSaida === "Evasão") p.evasao += 1
        else if (r.tipoSaida === "Transferência externa") p.transfExterna += 1
        else p.cancelDeslig += 1
      }
    }
    const pontos = [...acc.values()]
      .map((p) => ({ ...p, taxa: p.matriculas > 0 ? p.saidas / p.matriculas : null }))
      .sort((a, b) => {
        const [ay, ap] = a.periodo.split(".").map(Number)
        const [by, bp] = b.periodo.split(".").map(Number)
        return ay - by || ap - bp
      })
    return { chave: g.chave, label: g.label, periodicidade: g.periodicidade, pontos }
  })
  return { series: series.filter((s) => s.pontos.length > 0) }
}

export function getPerfis(filtros: Filtros): Perfis {
  const registros = filtrar(getRegistros(), filtros)
  const total = registros.length
  const totalSaidas = registros.filter((r) => r.saida).length
  const taxaGrupo = taxa(totalSaidas, total)

  const dimensoes: DimensaoPerfil[] = DIMENSOES_PERFIL.map((dim) => {
    const acc = new Map<string, { base: number; saidas: number }>()
    for (const r of registros) {
      const cat = valorDe(r, dim)
      if (cat === "Não informado") continue
      const a = acc.get(cat) ?? { base: 0, saidas: 0 }
      a.base += 1
      if (r.saida) a.saidas += 1
      acc.set(cat, a)
    }
    const categorias: CategoriaPerfil[] = [...acc.entries()]
      .map(([categoria, v]) => {
        const t = taxa(v.saidas, v.base)
        return {
          categoria,
          base: v.base,
          saidas: v.saidas,
          taxa: t,
          riscoRelativo: taxaGrupo > 0 ? t / taxaGrupo : 0,
          aviso: v.base < 10,
        }
      })
      .sort((a, b) => b.taxa - a.taxa || b.saidas - a.saidas || b.base - a.base)
    return { dimensao: dim, taxaGrupo, categorias }
  }).filter((d) => d.categorias.length > 0)

  return { dimensoes }
}

export function getTerritorio(filtros: Filtros): Territorio {
  const registros = filtrar(getRegistros(), filtros)
  const centroides = getCentroides()
  const acc = new Map<string, { base: number; saidas: number; nomes: Map<string, number> }>()
  const zona = new Map<string, number>()
  let semMunicipio = 0

  for (const r of registros) {
    zona.set(r.perfil["Zona Residencial"], (zona.get(r.perfil["Zona Residencial"]) ?? 0) + 1)
    const cod = r.codIbge
    const nomePerfil = r.perfil["Município de Residência"]
    if (!cod || nomePerfil === "Não informado" || !centroides[cod]) {
      semMunicipio += 1
      continue
    }
    const a = acc.get(cod) ?? { base: 0, saidas: 0, nomes: new Map<string, number>() }
    a.base += 1
    if (r.saida) a.saidas += 1
    a.nomes.set(nomePerfil, (a.nomes.get(nomePerfil) ?? 0) + 1)
    acc.set(cod, a)
  }

  const municipios: Municipio[] = [...acc.entries()].map(([cod, v]) => {
    // Usa o nome como aparece no perfil (para o filtro por município casar exatamente).
    const nomePerfil = [...v.nomes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      codIbge: cod,
      ...centroides[cod],
      nome: nomePerfil ?? centroides[cod].nome,
      base: v.base,
      saidas: v.saidas,
      taxa: taxa(v.saidas, v.base),
    }
  })

  return {
    municipios: municipios.sort((a, b) => b.base - a.base),
    zona: [...zona.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor),
    semMunicipio,
  }
}

export function getValidacao(): { meta: MetaDados; porGrupo: GrupoResumo[]; tipos: ItemContagem[] } {
  const meta = getMeta()
  const registros = getRegistros()
  const porGrupo = getOverview({}).grupos
  const tipos = new Map<string, number>()
  for (const r of registros) if (r.saida) tipos.set(r.tipoSaida, (tipos.get(r.tipoSaida) ?? 0) + 1)
  return {
    meta,
    porGrupo,
    tipos: [...tipos.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor),
  }
}
