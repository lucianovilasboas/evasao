#!/usr/bin/env python3
"""Gera um mapa SVG compacto dos municípios de MG a partir da malha do IBGE.

Entrada : GeoJSON de municípios (padrão: /tmp/opencode/mg_mun.json)
Saída   : public/geo/mapa_mg.json  -> { viewBox, municipios: [{cod, nome, d}] }

Projeção equirretangular local (suficiente para um estado). Reduz pontos por
distância mínima para deixar o SVG leve.

    python3 -m etl.gerar_mapa [origem.geojson] [destino.json]
"""

from __future__ import annotations

import json
import math
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opencode/mg_mun.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join("public", "geo", "mapa_mg.json")
LARGURA = 1000.0
MIN_DIST = float(os.environ.get("MIN_DIST", "0.6"))


def _aneis(geom: dict):
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    if geom["type"] == "MultiPolygon":
        return [anel for poly in geom["coordinates"] for anel in poly]
    return []


def main() -> int:
    gj = json.load(open(SRC, encoding="utf-8"))
    feats = gj["features"]

    lons = [c[0] for f in feats for anel in _aneis(f["geometry"]) for c in anel]
    lats = [c[1] for f in feats for anel in _aneis(f["geometry"]) for c in anel]
    minlon, maxlon = min(lons), max(lons)
    minlat, maxlat = min(lats), max(lats)
    k = math.cos(math.radians((minlat + maxlat) / 2))
    escala = LARGURA / ((maxlon - minlon) * k)
    altura = round((maxlat - minlat) * escala, 1)

    def ponto(lon: float, lat: float):
        return round((lon - minlon) * k * escala, 1), round((maxlat - lat) * escala, 1)

    municipios = []
    for f in feats:
        partes = []
        for anel in _aneis(f["geometry"]):
            if len(anel) < 3:
                continue
            px = [ponto(*c) for c in anel]
            mantidos = [px[0]]
            for p in px[1:-1]:
                dx, dy = p[0] - mantidos[-1][0], p[1] - mantidos[-1][1]
                if dx * dx + dy * dy >= MIN_DIST * MIN_DIST:
                    mantidos.append(p)
            if px[-1] != mantidos[-1]:
                mantidos.append(px[-1])
            partes.append("M" + " ".join(f"{x} {y}" for x, y in mantidos) + "Z")
        if partes:
            municipios.append({
                "cod": str(f["properties"]["id"]),
                "nome": f["properties"].get("name") or f["properties"].get("description", ""),
                "d": "".join(partes),
            })

    destino = {"viewBox": f"0 0 {int(LARGURA)} {int(math.ceil(altura))}", "municipios": municipios}
    os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(destino, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[ok] {len(municipios)} municípios -> {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB, viewBox {destino['viewBox']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
