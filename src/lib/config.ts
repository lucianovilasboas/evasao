import fs from "fs"
import path from "path"
import { lerJsonCacheado } from "./cache"

const ARQUIVO = path.resolve(process.cwd(), "dados", "config.json")

export interface CampusConfig {
  nome?: string
  nota?: string
}

export interface ConfigBase {
  campi?: Record<string, CampusConfig>
}

export function lerConfig(): ConfigBase {
  return lerJsonCacheado<ConfigBase>(ARQUIVO, {})
}

export function salvarConfig(cfg: ConfigBase): void {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true })
  fs.writeFileSync(ARQUIVO, JSON.stringify(cfg, null, 2))
  try {
    fs.chmodSync(ARQUIVO, 0o666)
  } catch {
    /* host pode não permitir chmod */
  }
}
