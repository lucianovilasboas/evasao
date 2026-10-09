import { NextRequest, NextResponse } from "next/server"
import { lerConfig, salvarConfig } from "@/lib/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { campi?: Record<string, { nome?: string; nota?: string }> }
    if (!body?.campi || typeof body.campi !== "object") {
      return NextResponse.json({ error: "envie { campi: { '<CAMPUS>': { nome, nota } } }" }, { status: 400 })
    }
    const cfg = lerConfig()
    cfg.campi = cfg.campi ?? {}
    for (const [raw, info] of Object.entries(body.campi)) {
      const nome = (info?.nome ?? "").trim()
      const nota = (info?.nota ?? "").trim()
      cfg.campi[raw] = { nome: nome || undefined, nota: nota || undefined }
    }
    salvarConfig(cfg)
    return NextResponse.json({ ok: true, campi: cfg.campi })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
