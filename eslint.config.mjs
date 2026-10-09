import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

// eslint-config-next 16 exporta flat config (CJS); normaliza default/interop.
const cwv = nextCoreWebVitals.default ?? nextCoreWebVitals
const ts = nextTypescript.default ?? nextTypescript

const eslintConfig = [
  ...(Array.isArray(cwv) ? cwv : [cwv]),
  ...(Array.isArray(ts) ? ts : [ts]),
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    // O hook useDados faz data fetching no efeito (padrão padrão do template);
    // a regra nova reage ao setLoading(true) síncrono. Mantida desligada aqui.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]

export default eslintConfig
