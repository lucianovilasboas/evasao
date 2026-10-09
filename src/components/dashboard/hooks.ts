"use client"

import { useCallback, useEffect, useState } from "react"

export function useDados<T>(
  view: string,
  params: Record<string, string | undefined> = {},
  versao?: string,
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const chaveParams = JSON.stringify(params)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("view", view)
      for (const [k, v] of Object.entries(params)) {
        if (v && v !== "__TOTAL__") qs.set(k, v)
      }
      const res = await fetch(`/api/dados?${qs.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as T)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, chaveParams, versao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return { data, loading, error, recarregar: carregar }
}
