#!/usr/bin/env python3
"""Inspeciona uma planilha para a etapa de mapeamento da importação.

Lê a coluna de situação sem processar a base e devolve, em JSON no stdout:
{arquivo, linhas, coluna, campus: [...], valores: [{valor, contagem}]}

    python3 -m etl.inspecionar dados/incoming/arquivo.xlsx
"""

from __future__ import annotations

import json
import os
import sys

import pandas as pd


def achar_coluna(colunas: list[str]) -> str | None:
    if "Situação no Curso" in colunas:
        return "Situação no Curso"
    for c in colunas:
        baixo = c.lower()
        if "situa" in baixo and "curso" in baixo:
            return c
    return None


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"erro": "informe o caminho da planilha"}))
        return 2
    caminho = sys.argv[1]
    if not os.path.exists(caminho):
        print(json.dumps({"erro": "arquivo não encontrado"}))
        return 2
    try:
        df = pd.read_excel(caminho, sheet_name="Registros", engine="openpyxl", dtype=str)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"erro": f"falha ao ler a planilha: {exc}"}))
        return 2

    df.columns = [c.strip() for c in df.columns]
    coluna = achar_coluna(list(df.columns))
    if not coluna:
        print(json.dumps({"erro": "coluna de situação do curso não encontrada", "colunas": list(df.columns)}))
        return 2

    serie = df[coluna].fillna("(vazio)").astype(str).str.strip().replace("", "(vazio)")
    contagem = serie.value_counts()
    campi = sorted({str(c).strip() for c in df["Campus"].dropna()}) if "Campus" in df.columns else []

    print(json.dumps({
        "arquivo": os.path.basename(caminho),
        "linhas": int(len(df)),
        "coluna": coluna,
        "campus": campi,
        "valores": [{"valor": str(v), "contagem": int(n)} for v, n in contagem.items()],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
