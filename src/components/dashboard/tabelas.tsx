"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmt, fmtPct } from "@/lib/utils"
import type { CategoriaPerfil, Municipio } from "@/types"

type Dir = 1 | -1

function useOrdenacao<T>(itens: T[], campoInicial: keyof T, dirInicial: Dir = -1) {
  const [campo, setCampo] = useState<keyof T>(campoInicial)
  const [dir, setDir] = useState<Dir>(dirInicial)
  const ordenados = useMemo(() => {
    const copia = [...itens]
    copia.sort((a, b) => {
      const va = a[campo]
      const vb = b[campo]
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir
    })
    return copia
  }, [itens, campo, dir])
  const alternar = (c: keyof T) => {
    if (c === campo) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setCampo(c)
      setDir(-1)
    }
  }
  return { ordenados, campo, dir, alternar }
}

function Th({ children, onClick, dir, ativo }: { children: React.ReactNode; onClick: () => void; dir: Dir; ativo: boolean }) {
  return (
    <TableHead>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-primary/80">
        {children}
        <span className="text-[9px] opacity-70">{ativo ? (dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </TableHead>
  )
}

export function TabelaPerfis({ categorias }: { categorias: CategoriaPerfil[] }) {
  const { ordenados, campo, dir, alternar } = useOrdenacao(categorias, "taxa")
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <Th onClick={() => alternar("categoria")} dir={dir} ativo={campo === "categoria"}>
            Categoria
          </Th>
          <Th onClick={() => alternar("base")} dir={dir} ativo={campo === "base"}>
            Base
          </Th>
          <Th onClick={() => alternar("saidas")} dir={dir} ativo={campo === "saidas"}>
            Saídas
          </Th>
          <Th onClick={() => alternar("taxa")} dir={dir} ativo={campo === "taxa"}>
            Taxa
          </Th>
          <Th onClick={() => alternar("riscoRelativo")} dir={dir} ativo={campo === "riscoRelativo"}>
            RR
          </Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordenados.map((c, i) => (
          <TableRow key={c.categoria}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">
              {c.categoria} {c.aviso && <Badge variant="alerta">n&lt;10</Badge>}
            </TableCell>
            <TableCell>{fmt(c.base)}</TableCell>
            <TableCell>{fmt(c.saidas)}</TableCell>
            <TableCell className="font-semibold">{fmtPct(c.taxa)}</TableCell>
            <TableCell>{c.riscoRelativo.toFixed(2).replace(".", ",")}×</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function TabelaMunicipios({ municipios }: { municipios: Municipio[] }) {
  const { ordenados, campo, dir, alternar } = useOrdenacao(municipios, "base")
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th onClick={() => alternar("nome")} dir={dir} ativo={campo === "nome"}>
            Município
          </Th>
          <TableHead>UF</TableHead>
          <Th onClick={() => alternar("base")} dir={dir} ativo={campo === "base"}>
            Base
          </Th>
          <Th onClick={() => alternar("saidas")} dir={dir} ativo={campo === "saidas"}>
            Saídas
          </Th>
          <Th onClick={() => alternar("taxa")} dir={dir} ativo={campo === "taxa"}>
            Taxa
          </Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordenados.map((m) => (
          <TableRow key={m.codIbge}>
            <TableCell className="font-medium">{m.nome}</TableCell>
            <TableCell className="text-muted-foreground">{m.uf === 31 ? "MG" : "outra"}</TableCell>
            <TableCell>{fmt(m.base)}</TableCell>
            <TableCell>{fmt(m.saidas)}</TableCell>
            <TableCell className="font-semibold">{fmtPct(m.taxa)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
