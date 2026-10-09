import { readdir, realpath, readFile } from "node:fs/promises";
import path from "node:path";
// This service exposes code inspection only. No shell, imports, tests or database tools.
const roots = ["server", "client/src", "shared", "docs"];
const allowed = (p: string) =>
  !p
    .split("/")
    .some(
      (v) =>
        v.startsWith(".") ||
        /^(node_modules|dist|attached_assets|certs|secrets)$/i.test(v),
    ) &&
  /\.(ts|tsx|md|json)$/.test(p) &&
  !/(credential|secret|backup|snapshot|dump)/i.test(path.basename(p));
export class CodeSource {
  private manifest?: string[];
  public readRanges = new Map<string, Array<[number, number]>>();
  public searches: string[] = [];
  constructor(
    readonly root: string,
    readonly version: string,
  ) {}
  async files() {
    if (this.manifest) return this.manifest;
    const result: string[] = [];
    const walk = async (rel: string) => {
      const entries = await readdir(path.join(this.root, rel), {
        withFileTypes: true,
      }).catch(() => []);
      for (const e of entries) {
        if (
          e.isSymbolicLink() ||
          e.name.startsWith(".") ||
          /^(node_modules|dist|certs)$/.test(e.name)
        )
          continue;
        const p = `${rel}/${e.name}`;
        if (e.isDirectory()) await walk(p);
        else if (e.isFile() && allowed(p)) result.push(p);
      }
    };
    for (const r of roots) await walk(r);
    if (result.length > 10000)
      throw new Error("El catálogo de código excede el límite del piloto.");
    return (this.manifest = result.sort());
  }
  private async content(rel: string) {
    if (!(await this.files()).includes(rel))
      throw new Error("Archivo fuera del catálogo autorizado.");
    const abs = await realpath(path.join(this.root, rel));
    const root = await realpath(this.root);
    if (!abs.startsWith(root + path.sep))
      throw new Error("Ruta fuera del código autorizado.");
    const content = await readFile(abs, "utf8");
    if (content.length > 1200000) throw new Error("Archivo demasiado grande.");
    // Do not transmit accidentally committed key material or common credential literals.
    return content
      .replace(
        /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
        (m) => "[CLAVE OMITIDA]" + "\n".repeat((m.match(/\n/g) || []).length),
      )
      .replace(
        /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        "[TOKEN OMITIDO]",
      )
      .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/g, "[CONEXIÓN OMITIDA]");
  }
  async read(rel: string, start = 1, end = start + 119) {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start ||
      end - start >= 160
    )
      throw new Error("Rango inválido: máximo 160 líneas.");
    const lines = (await this.content(rel)).split("\n");
    if (start > lines.length) throw new Error("Línea fuera del archivo.");
    end = Math.min(end, lines.length);
    const selected: string[] = [];
    let length = 0;
    for (let i = start - 1; i < end; i++) {
      const line = `${i + 1}: ${lines[i]}`;
      if (length + line.length + 1 > 16000) break;
      selected.push(line);
      length += line.length + 1;
    }
    if (!selected.length)
      throw new Error("Línea demasiado extensa para inspeccionar.");
    end = start + selected.length - 1;
    const list = this.readRanges.get(rel) || [];
    list.push([start, end]);
    this.readRanges.set(rel, list);
    return { path: rel, start, end, content: selected.join("\n") };
  }
  async search(term: string, prefix = "") {
    if (term.trim().length < 3 || term.length > 120)
      throw new Error("Búsqueda entre 3 y 120 caracteres.");
    const files = (await this.files()).filter(
      (p) => !prefix || p.startsWith(prefix),
    );
    const matches: Array<{ path: string; line: number; snippet: string }> = [];
    for (const f of files) {
      const lines = (await this.content(f)).split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(term.toLowerCase())) {
          matches.push({
            path: f,
            line: i + 1,
            snippet: lines[i].trim().slice(0, 240),
          });
          if (matches.length >= 30) break;
        }
      }
      if (matches.length >= 30) break;
    }
    this.searches.push(term);
    return { matches, limited: matches.length >= 30 };
  }
  validates(ref: { path: string; start: number; end: number }) {
    return (
      ref.end >= ref.start &&
      (this.readRanges.get(ref.path) || []).some(
        ([a, b]) => ref.start >= a && ref.end <= b,
      )
    );
  }
}
