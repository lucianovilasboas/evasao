#!/usr/bin/env python3
"""Gate de validação do ETL.

Confere contagens, consistência temporal e classificação de todos os campi.
Opcionalmente compara Ponte Nova com ``Relatorio_Evasao_IFMG_PN_.xlsx`` quando
esse campus está presente e todas as suas fontes usam o mapeamento padrão.

Também pode ser executado isoladamente:

    python3 -m etl.validacao
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CAMPUS_REF = "PONTE NOVA"

# Referência: Relatório IFMG Ponte Nova.
REF = {
    "validos": 1451,
    "excluidos": 2,
    "grupos": {
        "integrados": {"estudantes": 1186, "saidas": 132},
        "superior": {"estudantes": 265, "saidas": 107},
    },
    "serie_anual": {"2016.1": (185, 17), "2021.1": (279, 21), "2026.1": (316, 7)},
    "serie_semestral": {"2024.2": (86, 18), "2021.2": (68, 9)},
}


def _chave_campus(meta: dict) -> str | None:
    for nome in meta["validacao"]["porCampus"]:
        if CAMPUS_REF in nome.upper():
            return nome
    return None


def _agregar(registros: list[dict], grupo: str, campus: str) -> dict[str, dict]:
    acc: dict[str, dict] = {}
    for r in registros:
        if r["grupo"] != grupo or r["campus"] != campus:
            continue
        for p in r["periodos"]:
            acc.setdefault(p, {"m": 0, "s": 0})["m"] += 1
        if r["saida"]:
            acc.setdefault(r["ultimaMatricula"], {"m": 0, "s": 0})["s"] += 1
    return acc


def _validar_geral(registros: list[dict], meta: dict, ok) -> None:
    """Recalcula os totais sem depender de nenhum campus de referência."""
    por_campus: dict[str, dict] = {}
    classes = Counter()
    saidas = {"evasao", "cancelamento", "transferencia"}
    for indice, r in enumerate(registros, 1):
        nome = f"registro {indice} ({r.get('campus', '?')})"
        ok(f"{nome} campus informado", bool(r["campus"].strip()), True)
        ok(f"{nome} classe válida", r["classe"] in saidas | {"nao_saida"}, True)
        ok(f"{nome} saída/classificação", r["saida"], r["classe"] in saidas)
        ok(f"{nome} saída booleana", type(r["saida"]) is bool, True)
        periodos = r["periodos"]
        ok(f"{nome} períodos presentes", bool(periodos), True)
        ok(f"{nome} tamanho do vínculo", r["vinculoPeriodos"], len(periodos))
        ok(f"{nome} períodos únicos e ordenados", periodos, sorted(set(periodos)))
        ok(f"{nome} última matrícula", periodos[-1] if periodos else None, r["ultimaMatricula"])
        ok(f"{nome} periodicidade", r["periodicidade"] in {"anual", "semestral"}, True)
        ok(f"{nome} grupo/periodicidade", r["periodicidade"],
           "anual" if r["grupo"] == "integrados" else "semestral")
        ok(f"{nome} formato dos períodos",
           all(re.fullmatch(r"\d{4}\.[12]", p) is not None for p in periodos), True)
        ultimo = re.fullmatch(r"(\d{4})\.([12])", r["ultimaMatricula"])
        ok(f"{nome} formato última matrícula", ultimo is not None, True)
        if ultimo:
            ano, semestre = map(int, ultimo.groups())
            inicio = (r["anoIngresso"], r["perIngresso"])
            ok(f"{nome} semestre de ingresso", inicio[1] in (1, 2), True)
            if r["periodicidade"] == "anual":
                esperados = [f"{a}.1" for a in range(inicio[0], ano + 1)]
            else:
                esperados = [f"{a}.{s}" for a in range(inicio[0], ano + 1)
                             for s in (1, 2) if inicio <= (a, s) <= (ano, semestre)]
            ok(f"{nome} expansão temporal", periodos, esperados)
        classes[r["classe"]] += 1
        c = por_campus.setdefault(r["campus"], {"estudantes": 0, "saidas": 0, "grupos": {}})
        c["estudantes"] += 1
        c["saidas"] += int(r["saida"])
        g = c["grupos"].setdefault(r["grupo"], {"estudantes": 0, "saidas": 0})
        g["estudantes"] += 1
        g["saidas"] += int(r["saida"])

    v = meta["validacao"]
    ok("total de válidos", v["validos"], len(registros))
    ok("total de excluídos", v["excluidos"], len(v["detalheExcluidos"]))
    ok("campi", meta["campi"], sorted(por_campus))
    ok("contagens por campus e grupo", v["porCampus"], por_campus)

    # As contagens por arquivo abrangem somente os registros temporalmente válidos.
    arquivos = meta["arquivos"]
    ok("fontes", sorted(a["arquivo"] for a in arquivos), sorted(meta["fontes"]))
    for campo, esperado in (("estudantes", len(registros)),
                            ("saidas", sum(r["saida"] for r in registros)),
                            ("excluidos", len(v["detalheExcluidos"]))):
        ok(f"total por arquivo/{campo}", sum(a[campo] for a in arquivos), esperado)
    ok("campi por arquivo", sorted({c for a in arquivos for c in a["campi"]}), meta["campi"])
    classes_arquivos = Counter()
    for a in arquivos:
        nome = a["arquivo"]
        ok(f"{nome} situações pendentes", a["pendentes"], [])
        cc = a["contagemClasses"]
        ok(f"{nome} classes válidas", set(cc) <= saidas | {"nao_saida"}, True)
        ok(f"{nome} contagem por classe", sum(cc.values()), a["estudantes"])
        ok(f"{nome} saídas por classe", sum(cc.get(c, 0) for c in saidas), a["saidas"])
        valores_classes = Counter()
        for valor in a["valores"]:
            valores_classes[valor["classe"]] += valor["contagem"]
        ok(f"{nome} contagem das situações", dict(valores_classes), cc)
        classes_arquivos.update(cc)
    ok("classes de arquivos/registros", dict(classes_arquivos), dict(classes))


def validar(registros: list[dict], meta: dict, comparar_referencia: bool = True) -> int:
    falhas: list[str] = []

    def ok(nome: str, obtido, esperado) -> None:
        # Evita milhares de linhas no log do upload; imprime apenas divergências.
        if obtido != esperado:
            falhas.append(f"[FALHA] {nome}: obtido {obtido}, esperado {esperado}")

    try:
        _validar_geral(registros, meta, ok)
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        falhas.append(f"[FALHA] estrutura de registros/metadados inválida: {exc}")
    if falhas:
        print("\n".join(falhas))
        print(f"\n[GATE] {len(falhas)} divergência(s) na validação geral.")
        return 1
    print("[ok] validação geral de todos os campi: contagens, vínculos e classificações")

    campus = _chave_campus(meta)
    if not comparar_referencia:
        print("[i] comparação com o relatório PN não solicitada.")
        return 0
    if not campus:
        print(f"[i] {CAMPUS_REF} ausente; referência numérica PN não aplicável.")
        return 0

    # Qualquer fonte PN com mapeamento próprio torna a referência inaplicável,
    # inclusive quando outra planilha PN usa o padrão. Não olhar só a primeira.
    fontes_pn = [a for a in meta["arquivos"]
                 if any(CAMPUS_REF in str(c).upper() for c in a["campi"])]
    if any(a.get("mapeamentoExplicito") for a in fontes_pn):
        print("[i] PN usa mapeamento próprio; referência numérica ignorada (validação geral mantida).")
        return 0

    pn = meta["validacao"]["porCampus"][campus]
    ok(f"{CAMPUS_REF} válidos", pn["estudantes"], REF["validos"])
    excl_pn = [
        e for e in meta["validacao"]["detalheExcluidos"]
        if CAMPUS_REF in str(e.get("campus", "")).upper()
    ]
    ok(f"{CAMPUS_REF} excluídos", len(excl_pn), REF["excluidos"])

    for chave, ref in REF["grupos"].items():
        g = pn["grupos"].get(chave, {"estudantes": 0, "saidas": 0})
        ok(f"{CAMPUS_REF}/{chave} estudantes", g["estudantes"], ref["estudantes"])
        ok(f"{CAMPUS_REF}/{chave} saídas", g["saidas"], ref["saidas"])

    anual = _agregar(registros, "integrados", campus)
    for per, (m, s) in REF["serie_anual"].items():
        got = anual.get(per, {"m": 0, "s": 0})
        ok(f"INT {per} matrículas", got["m"], m)
        ok(f"INT {per} saídas", got["s"], s)

    semestral = _agregar(registros, "superior", campus)
    for per, (m, s) in REF["serie_semestral"].items():
        got = semestral.get(per, {"m": 0, "s": 0})
        ok(f"SUP {per} matrículas", got["m"], m)
        ok(f"SUP {per} saídas", got["s"], s)

    print(f"\n[campi na base] {', '.join(meta['campi'])}")
    if falhas:
        print("\n".join(falhas))
        print(f"\n[GATE] {len(falhas)} divergência(s) no campus de referência.")
        return 1
    print(f"[GATE] ETL reproduz o relatório IFMG {CAMPUS_REF} com exatidão.")
    return 0


def main() -> int:
    with open(os.path.join(ROOT, "dados", "base_temporal.json"), encoding="utf-8") as fh:
        registros = json.load(fh)
    with open(os.path.join(ROOT, "dados", "meta.json"), encoding="utf-8") as fh:
        meta = json.load(fh)
    return validar(registros, meta)


if __name__ == "__main__":
    raise SystemExit(main())
