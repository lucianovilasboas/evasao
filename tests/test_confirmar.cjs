// Synthetic filesystem fixtures; run manually with: node --test tests/test_confirmar.cjs
// Uses the project's existing TypeScript devDependency, no new test framework.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

function fixture(t, { code = 1, exception = false, mappingException = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evasao-confirmar-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const brutos = path.join(dir, "brutos")
  const incoming = path.join(dir, "incoming")
  fs.mkdirSync(brutos)
  fs.mkdirSync(incoming)
  const arquivo = "sintetico.xlsx"
  const origem = path.join(incoming, arquivo)
  const destino = path.join(brutos, arquivo)
  const mappings = path.join(dir, "mapeamentos.json")
  const previous = '{"anterior.xlsx":{"classes":{"Ativo":"nao_saida"}}}\n'
  fs.writeFileSync(origem, "planilha sintetica; leitura inspecionada por mock")
  fs.writeFileSync(mappings, previous)
  fs.writeFileSync(path.join(dir, "base_temporal.json"), '["base anterior"]')
  fs.writeFileSync(path.join(dir, "meta.json"), '{"anterior":true}')
  let calls = 0
  const dependencies = {
    fs, path,
    "next/server": { NextResponse: {
      json: (body, options = {}) => ({ body, status: options.status ?? 200 }),
    } },
    "@/lib/etl": {
      BRUTOS: brutos, INCOMING: incoming,
      executarEtl: async () => {
        calls++
        if (exception) throw new Error("falha de execução sintética")
        return { code, log: "gate sintético" }
      },
    },
    "@/lib/importacao": {
      nomeValido: (name) => name === arquivo,
      inspecionarArquivo: async () => ({ ok: true, dados: {
        coluna: "Situação no Curso", valores: [{ valor: "Evasão", contagem: 1 }],
      } }),
      faltandoClassificar: () => [],
    },
    "@/lib/mapeamentos": {
      salvarMapeamento: (name, mapping) => {
        const current = fs.existsSync(mappings) ? JSON.parse(fs.readFileSync(mappings, "utf8")) : {}
        current[name] = mapping
        fs.writeFileSync(mappings, JSON.stringify(current))
        if (mappingException) throw new Error("falha após escrita do mapeamento")
      },
    },
    "@/lib/dados": { getMeta: () => ({ campi: ["CAMPUS SINTETICO"] }) },
  }
  const source = fs.readFileSync(path.join(__dirname, "../src/app/api/base/confirmar/route.ts"), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const module = { exports: {} }
  new Function("require", "module", "exports", compiled)((name) => {
    if (!(name in dependencies)) throw new Error(`dependência inesperada: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return { origem, destino, mappings, previous, dir, calls: () => calls,
    confirm: () => module.exports.POST({ json: async () => ({
      arquivo, mapeamento: { "Evasão": "evasao" },
    }) }),
  }
}

for (const options of [{ code: 1 }, { exception: true }, { mappingException: true }]) {
  test(`rollback de staging e mapeamento: ${JSON.stringify(options)}`, async (t) => {
    const f = fixture(t, options)
    const before = fs.readFileSync(f.origem)
    const response = await f.confirm()
    assert.equal(response.status, options.code === 1 ? 422 : 500)
    assert.deepEqual(fs.readFileSync(f.origem), before)
    assert.equal(fs.existsSync(f.destino), false)
    assert.equal(fs.readFileSync(f.mappings, "utf8"), f.previous)
    assert.equal(fs.readFileSync(path.join(f.dir, "base_temporal.json"), "utf8"), '["base anterior"]')
    assert.equal(fs.readFileSync(path.join(f.dir, "meta.json"), "utf8"), '{"anterior":true}')
  })
}

test("rollback remove mapeamentos.json quando não existia antes", async (t) => {
  const f = fixture(t)
  fs.unlinkSync(f.mappings)
  const response = await f.confirm()
  assert.equal(response.status, 422)
  assert.equal(fs.existsSync(f.mappings), false)
  assert.equal(fs.existsSync(f.origem), true)
  assert.equal(fs.existsSync(f.destino), false)
})

test("colisão não sobrescreve planilha nem altera mapeamento", async (t) => {
  const f = fixture(t)
  fs.writeFileSync(f.destino, "planilha anterior")
  const response = await f.confirm()
  assert.equal(response.status, 409)
  assert.equal(fs.readFileSync(f.destino, "utf8"), "planilha anterior")
  assert.equal(fs.existsSync(f.origem), true)
  assert.equal(fs.readFileSync(f.mappings, "utf8"), f.previous)
  assert.equal(f.calls(), 0)
})

test("sucesso mantém planilha e mapeamento publicados", async (t) => {
  const f = fixture(t, { code: 0 })
  const response = await f.confirm()
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.equal(fs.existsSync(f.origem), false)
  assert.equal(fs.existsSync(f.destino), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(f.mappings, "utf8"))["sintetico.xlsx"], {
    coluna: "Situação no Curso", classes: { "Evasão": "evasao" },
  })
  assert.equal(f.calls(), 1)
})
