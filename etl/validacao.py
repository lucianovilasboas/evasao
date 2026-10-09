#!/usr/bin/env python3
"""Gate de validação do ETL.

Confere que o modelo derivado da planilha bruta reproduz, para o Campus Ponte
Nova, os números do ``Relatorio_Evasao_IFMG_PN_.xlsx``. O gate é escopado no
campus de referência para continuar válido quando outros campi forem
adicionados via upload.

Também pode ser executado isoladamente:

    python3 -m etl.validacao
"""

from __future__ import annotations

import json
import os

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


def validar(registros: list[dict], meta: dict) -> int:
    falhas: list[str] = []

    def ok(nome: str, obtido, esperado) -> None:
        if obtido == esperado:
            print(f"[ok] {nome}: {obtido}")
        else:
            falhas.append(f"[FALHA] {nome}: obtido {obtido}, esperado {esperado}")

    campus = _chave_campus(meta)
    if not campus:
        print(f"[FALHA] campus de referência '{CAMPUS_REF}' ausente na base")
        print("\n[GATE] campus de referência ausente — ETL não validável.")
        return 1

    # Se o campus de referência usa mapeamento próprio, a referência numérica do
    # relatório (construída com o mapeamento padrão) não se aplica.
    arq_ref = next(
        (a for a in (meta.get("arquivos") or [])
         if any(CAMPUS_REF in str(c).upper() for c in a.get("campi", []))),
        None,
    )
    if arq_ref and arq_ref.get("mapeamentoExplicito"):
        pendentes = arq_ref.get("pendentes") or []
        print(f"[i] {CAMPUS_REF} usa mapeamento de saída próprio:")
        for valor, classe in sorted((arq_ref.get("mapeamento") or {}).items()):
            print(f"      {valor!r} -> {classe}")
        if pendentes:
            print(f"[FALHA] situações não classificadas em {CAMPUS_REF}: {pendentes}")
            print("\n[GATE] há situações pendentes — classifique-as na importação.")
            return 1
        com_pendencia = [r for r in registros if r.get("classe") == "pendente"]
        if com_pendencia:
            print(f"[FALHA] {len(com_pendencia)} registro(s) com classe pendente na base")
            return 1
        print("[GATE] mapeamento próprio aplicado; referência numérica do relatório PN ignorada.")
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
