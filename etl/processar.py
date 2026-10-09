#!/usr/bin/env python3
"""ETL do dashboard de evasão IFMG.

Lê todas as planilhas .xlsx em ``dados/brutos/`` (uma por campus, mesmo layout
de 99 colunas com a aba ``Registros``), aplica o modelo temporal de matrículas
e saídas do Campus Ponte Nova e grava:

  - ``dados/base_temporal.json``  -> um registro por estudante válido
  - ``dados/meta.json``           -> cobertura, campi, cursos e validação

Modelo temporal (idêntico ao Relatório IFMG PN):
  * Agrupamento por modalidade -> periodicidade anual (Integrado) ou semestral.
  * Um estudante é contado em todos os períodos entre ingresso e última
    matrícula, inclusive. Na modalidade anual o período .2 é normalizado p/ .1.
  * Quais situações contam como "saída" é configurável por campus em
    ``dados/mapeamentos.json`` (etapa de mapeamento na importação). A saída é
    atribuída UMA vez, ao último período de matrícula normalizado.
  * Registros com ingresso posterior à última matrícula são excluídos do modelo
    temporal e contabilizados no relatório de validação.

Uso:
    python3 etl/processar.py            # processa dados/brutos/*.xlsx
    python3 etl/processar.py --selftest # + gate de reprodução do relatório
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from datetime import datetime, timezone

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRUTOS = os.path.join(ROOT, "dados", "brutos")
SAIDA = os.path.join(ROOT, "dados")

COLUNA_SITUACAO = "Situação no Curso"

# Classes de desfecho; as três primeiras formam a "saída".
CLASSES_SAIDA = ("evasao", "cancelamento", "transferencia")
CLASSE_PARA_TIPO = {
    "evasao": "Evasão",
    "cancelamento": "Cancelamento/Desligamento",
    "transferencia": "Transferência externa",
    "nao_saida": "Não saída",
    "pendente": "Não saída",
}

# Mapeamento padrão (usado quando o campus não tem mapeamento próprio).
DEFAULT_CLASSES = {
    "Evasão": "evasao",
    "Cancelado": "cancelamento",
    "Cancelamento por Desligamento": "cancelamento",
    "Transferido Externo": "transferencia",
}


def carregar_mapeamentos() -> dict:
    """Lê dados/mapeamentos.json ({arquivo: {coluna, classes}})."""
    caminho = os.path.join(SAIDA, "mapeamentos.json")
    try:
        with open(caminho, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def classe_de(situacao: str, classes: dict, explicito: bool) -> str:
    """Classe de desfecho de uma situação. Sem mapeamento explícito, o valor
    desconhecido é tratado como não-saída (comportamento histórico)."""
    if situacao in classes:
        return classes[situacao]
    return "pendente" if explicito else "nao_saida"

# Salário mínimo de referência usado para faixas de renda per capita (valor 2025).
SALARIO_MINIMO = 1518.0

DIMS = [
    "Sexo",
    "Cota Inscrito",
    "Faixa etária no ingresso",
    "Tipo de Escola de Origem",
    "Etnia/Raça",
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
]


# --------------------------------------------------------------------------- #
# utilidades de parsing
# --------------------------------------------------------------------------- #
def _num_ptbr(valor) -> float | None:
    """Converte '1.234,56' / '67,80' / '0' em float. '-' ou vazio -> None."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return None
    txt = str(valor).strip()
    if txt in {"", "-", "nan", "None"}:
        return None
    txt = txt.replace(".", "").replace(",", ".")
    try:
        return float(txt)
    except ValueError:
        return None


def _periodo(txt) -> tuple[int | None, int | None]:
    """'2016.1' -> (2016, 1)."""
    try:
        ano, per = str(txt).split(".")
        return int(ano), int(per)
    except (ValueError, AttributeError):
        return None, None


def _faixa(valor: float | None, cortes: list[float], rotulos: list[str]) -> str:
    """Classifica um número em faixas [.., corte)."""
    if valor is None:
        return rotulos[-1]
    for corte, rotulo in zip(cortes, rotulos):
        if valor < corte:
            return rotulo
    return rotulos[-1]


# --------------------------------------------------------------------------- #
# dimensões derivadas (regras idênticas às do relatório)
# --------------------------------------------------------------------------- #
def _faixa_etaria(ano_ingresso: int | None, data_nasc) -> str:
    if not ano_ingresso:
        return "Não informado"
    try:
        nasc = pd.to_datetime(data_nasc, format="%d/%m/%Y", errors="coerce")
        if pd.isna(nasc):
            return "Não informado"
        idade = int(ano_ingresso) - int(nasc.year)
    except (ValueError, TypeError):
        return "Não informado"
    if idade < 18:
        return "< 18"
    if idade <= 20:
        return "18–20"
    if idade <= 24:
        return "21–24"
    if idade <= 29:
        return "25–29"
    if idade <= 39:
        return "30–39"
    return "40+"


def _faixa_renda(renda_bruta, domicilio) -> str:
    renda = _num_ptbr(renda_bruta)
    dom = _num_ptbr(domicilio)
    if renda is None or dom is None or dom <= 0:
        return "Não informado"
    pc = (renda / dom) / SALARIO_MINIMO
    if pc <= 0.5:
        return "Até 0,5 SM"
    if pc <= 1:
        return ">0,5–1 SM"
    if pc <= 1.5:
        return ">1–1,5 SM"
    if pc <= 2.5:
        return ">1,5–2,5 SM"
    return ">2,5 SM"


def _split_municipio(bruto: str) -> tuple[str, str]:
    """'Ponte Nova-MG' -> ('Ponte Nova', 'MG'); '-' -> ('Não informado','')."""
    txt = (bruto or "").strip()
    if txt in {"", "-"}:
        return "Não informado", ""
    if "-" in txt:
        nome, uf = txt.rsplit("-", 1)
        return nome.strip(), uf.strip().upper()
    return txt, ""


def _grupo_de(modalidade: str) -> dict:
    mod = (modalidade or "").lower()
    if "integrado" in mod:
        return {"chave": "integrados", "label": "Cursos Técnicos Integrados", "periodicidade": "anual"}
    if "subsequente" in mod or "concomitante" in mod:
        return {"chave": "subsequentes", "label": "Cursos Técnicos Subsequentes", "periodicidade": "semestral"}
    return {"chave": "superior", "label": "Cursos Superiores e Tecnológicos", "periodicidade": "semestral"}


# --------------------------------------------------------------------------- #
# expansão temporal
# --------------------------------------------------------------------------- #
def _periodos_do_vinculo(grupo: dict, ano_ing: int, per_ing: int, ult_ano: int, ult_per: int) -> list[str]:
    periodos: list[str] = []
    if grupo["periodicidade"] == "anual":
        for ano in range(int(ano_ing), int(ult_ano) + 1):
            periodos.append(f"{ano}.1")
        return periodos
    ano, per = int(ano_ing), int(per_ing)
    while (ano, per) <= (int(ult_ano), int(ult_per)):
        periodos.append(f"{ano}.{per}")
        per += 1
        if per > 2:
            per = 1
            ano += 1
    return periodos


def _ultimo_periodo(grupo: dict, ult_ano: int, ult_per: int) -> str:
    if grupo["periodicidade"] == "anual":
        return f"{int(ult_ano)}.1"
    return f"{int(ult_ano)}.{int(ult_per)}"


# --------------------------------------------------------------------------- #
# leitura de uma planilha (um campus)
# --------------------------------------------------------------------------- #
def processar_planilha(caminho: str, classes_custom: dict | None = None) -> tuple[list[dict], dict]:
    explicito = classes_custom is not None
    classes = dict(classes_custom) if explicito else dict(DEFAULT_CLASSES)

    df = pd.read_excel(caminho, sheet_name="Registros", engine="openpyxl", dtype=str)
    df.columns = [c.strip() for c in df.columns]

    obrigatorias = {
        "Código Curso", "Descrição do Curso", "Modalidade", "Nível de Ensino",
        "Ano de Ingresso", "Período de Ingresso", "Última matrícula em período letivo",
        "Situação no Curso", "Campus", "Sexo",
    }
    faltando = obrigatorias - set(df.columns)
    if faltando:
        raise ValueError(f"{os.path.basename(caminho)}: colunas ausentes {sorted(faltando)}")

    registros: list[dict] = []
    excluidos: list[dict] = []
    cursos: dict[str, dict] = {}
    contagem_valores: dict[str, int] = {}
    contagem_classes: dict[str, int] = {}

    for r in df.to_dict("records"):
        grupo = _grupo_de(str(r.get("Modalidade", "")))
        ano_ing = int(float(r["Ano de Ingresso"])) if str(r["Ano de Ingresso"]).strip() not in {"", "-"} else None
        per_ing = int(float(r["Período de Ingresso"])) if str(r["Período de Ingresso"]).strip() not in {"", "-"} else None
        ult_ano, ult_per = _periodo(r["Última matrícula em período letivo"])

        if ano_ing is None or ult_ano is None:
            excluidos.append({
                "motivo": "Ingresso ou última matrícula ausente",
                "campus": str(r.get("Campus", "")).strip(),
                "situacao": r["Situação no Curso"],
            })
            continue

        # validação temporal (anual normaliza o período; semestral compara período)
        if grupo["periodicidade"] == "anual":
            valido = ano_ing <= ult_ano
        else:
            valido = (ano_ing, per_ing or 1) <= (ult_ano, ult_per or 1)

        if not valido:
            excluidos.append({
                "motivo": "Ingresso posterior à última matrícula",
                "campus": str(r.get("Campus", "")).strip(),
                "curso": r["Código Curso"], "anoIngresso": ano_ing,
                "ingresso": f"{ano_ing}.{per_ing}", "ultimaMatricula": r["Última matrícula em período letivo"],
                "situacao": r["Situação no Curso"],
            })
            continue

        municipio, uf = _split_municipio(str(r.get("Município de Residência", "")))
        cod_ibge = str(r.get("Município de Residência (Código IBGE)", "")).strip()
        situacao = str(r["Situação no Curso"]).strip() or "(vazio)"
        classe = classe_de(situacao, classes, explicito)
        saida = classe in CLASSES_SAIDA
        contagem_valores[situacao] = contagem_valores.get(situacao, 0) + 1
        contagem_classes[classe] = contagem_classes.get(classe, 0) + 1

        perfil = {
            "Sexo": str(r.get("Sexo", "-")).strip() or "Não informado",
            "Cota Inscrito": str(r.get("Cota Inscrito", "-")).strip() or "Não informado",
            "Faixa etária no ingresso": _faixa_etaria(ano_ing, r.get("Data de Nascimento")),
            "Tipo de Escola de Origem": str(r.get("Tipo de Escola de Origem", "-")).strip() or "Não informado",
            "Etnia/Raça": str(r.get("Etnia/Raça", "-")).strip() or "Não informado",
            "Município de Residência": municipio,
            "Faixa renda": _faixa_renda(r.get("Renda bruta familiar"), r.get("Número de pessoas no domicílio")),
            "Turma": str(r.get("Turma", "-")).strip() or "Não informado",
            "Turno": str(r.get("Turno", "-")).strip() or "Não informado",
            "Zona Residencial": (str(r.get("Zona Residencial", "-")).strip() or "Não informado"),
            "Forma de Ingresso": str(r.get("Forma de Ingresso", "-")).strip() or "Não informado",
            "Nível de Ensino Anterior": str(r.get("Nível de Ensino Anterior", "-")).strip() or "Não informado",
            "NAPNEE": str(r.get("Aluno assistido pelo NAPNEE?", "-")).strip() or "Não informado",
            "AEE": str(r.get("Aluno em AEE (Atendimento Educacional Especializado)?", "-")).strip() or "Não informado",
            "Faixa C.R.": _faixa(_num_ptbr(r.get("C.R.")), [5.0, 7.0], ["< 5,0", "5,0–6,9", "≥ 7,0"]),
            "Faixa Frequência": _faixa(_num_ptbr(r.get("Frequência no Período")), [50.0, 75.0], ["< 50%", "50%–74%", "≥ 75%"]),
            "Faixa Progresso": _faixa(_num_ptbr(r.get("Percentual de Progresso")), [25.0, 50.0, 75.0], ["< 25%", "25%–49%", "50%–74%", "≥ 75%"]),
        }

        periodos = _periodos_do_vinculo(grupo, ano_ing, per_ing or 1, ult_ano, ult_per or 1)

        registros.append({
            "id": f"{str(r['Código Curso']).strip()}-{len(registros) + 1:04d}",
            "campus": str(r.get("Campus", "")).strip(),
            "codCurso": str(r["Código Curso"]).strip(),
            "curso": str(r.get("Descrição do Curso", "")).strip(),
            "grupo": grupo["chave"],
            "grupoLabel": grupo["label"],
            "periodicidade": grupo["periodicidade"],
            "modalidade": str(r.get("Modalidade", "")).strip(),
            "nivel": str(r.get("Nível de Ensino", "")).strip(),
            "anoIngresso": ano_ing,
            "perIngresso": per_ing or 1,
            "ultimaMatricula": _ultimo_periodo(grupo, ult_ano, ult_per or 1),
            "vinculoPeriodos": len(periodos),
            "situacao": situacao,
            "classe": classe,
            "saida": saida,
            "tipoSaida": CLASSE_PARA_TIPO.get(classe, "Não saída"),
            "ufResidencia": uf,
            "codIbge": cod_ibge,
            "perfil": perfil,
            "periodos": periodos,
        })

        ck = str(r["Código Curso"]).strip()
        campus = str(r.get("Campus", "")).strip()
        cursos[f"{campus}|{ck}"] = {
            "cod": ck, "nome": str(r.get("Descrição do Curso", "")).strip(),
            "campus": campus, "grupo": grupo["chave"],
            "grupoLabel": grupo["label"], "modalidade": str(r.get("Modalidade", "")).strip(),
            "nivel": str(r.get("Nível de Ensino", "")).strip(),
        }

    valores = [
        {"valor": v, "contagem": n, "classe": classe_de(v, classes, explicito)}
        for v, n in sorted(contagem_valores.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return registros, {
        "excluidos": excluidos,
        "cursos": list(cursos.values()),
        "coluna": COLUNA_SITUACAO,
        "classes": classes,
        "explicito": explicito,
        "contagemClasses": contagem_classes,
        "valores": valores,
        "pendentes": sorted(v for v in contagem_valores if classe_de(v, classes, explicito) == "pendente"),
        "naoMapeados": sorted(v for v in contagem_valores if v not in classes),
    }


# --------------------------------------------------------------------------- #
# meta + validação
# --------------------------------------------------------------------------- #
def montar_meta(registros: list[dict], excluidos: list[dict], cursos: list[dict], fontes: list[str]) -> dict:
    campus = sorted({r["campus"] for r in registros})
    grupos = sorted({(r["grupo"], r["grupoLabel"], r["periodicidade"]) for r in registros})
    por_campus: dict[str, dict] = {}
    for r in registros:
        c = por_campus.setdefault(r["campus"], {"estudantes": 0, "saidas": 0, "grupos": {}})
        c["estudantes"] += 1
        if r["saida"]:
            c["saidas"] += 1
        g = c["grupos"].setdefault(r["grupo"], {"estudantes": 0, "saidas": 0})
        g["estudantes"] += 1
        if r["saida"]:
            g["saidas"] += 1

    return {
        "ultimaAtualizacao": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "geradoEm": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "campi": campus,
        "grupos": [{"chave": g, "label": l, "periodicidade": p} for g, l, p in grupos],
        "cursos": cursos,
        "validacao": {
            "validos": len(registros),
            "excluidos": len(excluidos),
            "motivoExclusao": "Ingresso posterior à última matrícula (e afins)",
            "detalheExcluidos": excluidos,
            "porCampus": por_campus,
        },
        "fontes": fontes,
        "nota": (
            "Base integral de matrículas elegíveis (não é amostra). Saídas atribuídas "
            "uma vez ao último período de vínculo. Faixas de renda usam salário mínimo "
            f"de referência {SALARIO_MINIMO:.0f}."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selftest", action="store_true", help="roda o gate de reprodução do relatório")
    args = parser.parse_args()

    arquivos = sorted(glob.glob(os.path.join(BRUTOS, "*.xlsx")))
    if not arquivos:
        print(f"[ERRO] nenhuma planilha em {BRUTOS}", file=sys.stderr)
        return 2

    mapeamentos = carregar_mapeamentos()
    todos: list[dict] = []
    excluidos_todos: list[dict] = []
    cursos_todos: dict[str, dict] = {}
    arquivos_info: list[dict] = []
    for caminho in arquivos:
        nome = os.path.basename(caminho)
        cfg = mapeamentos.get(nome) or {}
        classes_custom = cfg.get("classes") or None
        regs, info = processar_planilha(caminho, classes_custom)
        for r in regs:
            r["id"] = f"{r['campus'][:3].upper()}-{r['id']}" if r["campus"] else r["id"]
        todos.extend(regs)
        excluidos_todos.extend(info["excluidos"])
        for c in info["cursos"]:
            cursos_todos[f"{c['campus']}|{c['cod']}"] = c
        arquivos_info.append({
            "arquivo": nome,
            "campi": sorted({r["campus"] for r in regs}),
            "estudantes": len(regs),
            "saidas": sum(1 for r in regs if r["saida"]),
            "excluidos": len(info["excluidos"]),
            "coluna": info["coluna"],
            "mapeamento": info["classes"],
            "mapeamentoExplicito": info["explicito"],
            "contagemClasses": info["contagemClasses"],
            "valores": info["valores"],
            "pendentes": info["pendentes"],
            "naoMapeados": info["naoMapeados"],
        })
        aviso = f" | pendentes: {info['pendentes']}" if info["pendentes"] else ""
        print(f"[ok] {nome}: {len(regs)} válidos, {len(info['excluidos'])} excluídos{aviso}")

    meta = montar_meta(todos, excluidos_todos, sorted(cursos_todos.values(), key=lambda c: c["cod"]),
                       [os.path.basename(f) for f in arquivos])
    meta["arquivos"] = arquivos_info

    os.makedirs(SAIDA, exist_ok=True)
    with open(os.path.join(SAIDA, "base_temporal.json"), "w", encoding="utf-8") as fh:
        json.dump(todos, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(SAIDA, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    # Deixa os arquivos graváveis pelo usuário do host (upload roda como conteiner).
    for nome in ("base_temporal.json", "meta.json"):
        try:
            os.chmod(os.path.join(SAIDA, nome), 0o666)
        except OSError:
            pass

    print(f"[ok] {len(todos)} estudantes | {sum(1 for r in todos if r['saida'])} saídas | "
          f"{len(excluidos_todos)} excluídos temporalmente")
    print(f"[ok] campi: {', '.join(meta['campi'])}")
    print(f"[ok] gravado dados/base_temporal.json e dados/meta.json")

    if args.selftest:
        from etl.validacao import validar
        return validar(todos, meta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
