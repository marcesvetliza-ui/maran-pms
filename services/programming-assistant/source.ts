import { readdir, realpath, readFile } from "node:fs/promises";
import path from "node:path";
// This service exposes code inspection only. No shell, imports, tests or database tools.
const roots = ["server", "client/src", "shared", "docs"];
// Investigator tests verify code discovery, not the behavior of hotel operations.
const investigatorTest = (p:string) => /programming-(?:assistant|diagnosis|support)/.test(path.basename(p));
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
  async findFiles(term: string, prefix = "") {
    if (typeof term !== "string" || term.trim().length < 3 || term.length > 120)
      throw new Error("Nombre entre 3 y 120 caracteres.");
    const needle = term.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!needle) throw new Error("Nombre inválido.");
    const files = (await this.files()).filter(
      (p) =>
        (!prefix || p.startsWith(prefix)) &&
        p
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .includes(needle),
    );
    return { files: files.slice(0, 60), limited: files.length > 60 };
  }
  async inspectSymbol(symbol: string, limits={maxDefinitions:3,maxTests:2,lines:140}) {
    if (typeof symbol !== "string" || !/^[A-Za-z_$][\w$]{2,79}$/.test(symbol)) throw new Error("Símbolo inválido.");
    const escaped=symbol.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const definition=new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s+${escaped}\\b|(?:const|let|class)\\s+${escaped}\\b)`);
    const occurrence=new RegExp(`\\b${escaped}\\b`);
    const definitions: Awaited<ReturnType<CodeSource["read"]>>[]=[];
    const tests: Awaited<ReturnType<CodeSource["read"]>>[]=[];
    for (const file of (await this.files()).filter(f=>/\.(ts|tsx)$/.test(f))) {
      const isTest=file.includes("/tests/") || file.includes(".test.");
      if(isTest && investigatorTest(file)) continue;
      if (isTest && tests.length>=limits.maxTests) continue;
      if (!isTest && definitions.length>=limits.maxDefinitions) continue;
      const lines=(await this.content(file)).split("\n");
      const index=lines.findIndex(line=>isTest ? occurrence.test(line) : definition.test(line));
      if(index<0) continue;
      const start=Math.max(1,index+1-3);
      // A short function must not drag in the next unrelated operation.
      const following = isTest ? -1 : lines.findIndex((line, i) => i > index && /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let)\s+[A-Za-z_$]/.test(line));
      const end = Math.min(start + limits.lines - 1, following < 0 ? lines.length : following);
      (isTest?tests:definitions).push(await this.read(file,start,end));
    }
    this.searches.push(`symbol:${symbol}`);
    return {symbol,definitions,tests,partial:true,
      guidance:"Fragmentos leídos, no funciones ejecutadas. Si no termina el cuerpo, continuar con read_code. Los tests sin mención literal del símbolo no están incluidos: buscar también por endpoint y comportamiento."};
  }
  async traceEndpoint(endpoint: string, options = { includeTests: true }) {
    if(typeof endpoint!=="string" || !/^\/api\/[A-Za-z0-9_/:.-]{1,180}$/.test(endpoint)) throw new Error("Endpoint inválido.");
    const escaped=endpoint.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const route=new RegExp(`\\b(?:app|router)\\.(?:get|post|put|patch|delete)\\s*\\(\\s*['\"]${escaped}['\"]`);
    const nextRoute=/\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(/;
    const callers:Awaited<ReturnType<CodeSource["read"]>>[]=[];
    const handlers:Awaited<ReturnType<CodeSource["read"]>>[]=[];
    const dependencies:Awaited<ReturnType<CodeSource["inspectSymbol"]>>[]=[];
    const tests:Awaited<ReturnType<CodeSource["read"]>>[]=[];
    const symbols=new Set<string>();
    for(const file of (await this.files()).filter(f=>f.startsWith("server/") && /\.tsx?$/.test(f))){
      const text=await this.content(file),lines=text.split("\n");
      if(file.includes("/tests/")){
        if(!options.includeTests || investigatorTest(file))continue;
        const index=lines.findIndex(line=>line.includes(endpoint));
        if(index>=0 && tests.length<1){const start=Math.max(1,index-8);tests.push(await this.read(file,start,start+59));}
        continue;
      }
      if(handlers.length>=1)continue;
      const index=lines.findIndex(line=>route.test(line));
      if(index<0)continue;
      const following=lines.findIndex((line,i)=>i>index && nextRoute.test(line));
      const end=Math.min(index+80,following<0?lines.length:following);
      const handler=await this.read(file,index+1,end);
      handlers.push(handler);
      for(const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['\"][^'\"]+['\"]/g)){
        for(const part of match[1].split(',')){
          if(/^\s*type\b/.test(part))continue;
          const [original,alias]=part.trim().split(/\s+as\s+/),local=alias||original;
          if(!/^[A-Za-z_$][\w$]{2,79}$/.test(original))continue;
          const escapedLocal=local.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
          if(new RegExp(`\\b${escapedLocal}\\s*\\(`).test(handler.content))symbols.add(original);
        }
      }
    }
    for(const file of (await this.files()).filter(f=>f.startsWith("client/src/") && /\.tsx?$/.test(f) && !f.includes(".test."))) {
      if(callers.length>=2)break;
      const lines=(await this.content(file)).split("\n");
      const index=lines.findIndex(line=>line.includes(endpoint));
      if(index>=0){const start=Math.max(1,index+1-12);callers.push(await this.read(file,start,start+69));}
    }
    for(const symbol of [...symbols].slice(0,4))dependencies.push(await this.inspectSymbol(symbol,{maxDefinitions:1,maxTests:0,lines:80}));
    // Follow one further import hop (e.g. unitFactor -> inventoryUnitFactor).
    const extra=new Set<string>();
    for(const dependency of dependencies)for(const definition of dependency.definitions){
      const text=await this.content(definition.path);
      for(const match of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g))for(const part of match[1].split(',')){
        if(/^\s*type\b/.test(part))continue;
        const [original,alias]=part.trim().split(/\s+as\s+/),local=alias||original;
        if(!/^[A-Za-z_$][\w$]{2,79}$/.test(original) || symbols.has(original))continue;
        const escapedLocal=local.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        if(new RegExp(`\\b${escapedLocal}\\s*\\(`).test(definition.content))extra.add(original);
      }
    }
    for(const symbol of [...extra].slice(0,2))dependencies.push(await this.inspectSymbol(symbol,{maxDefinitions:1,maxTests:0,lines:80}));
    return {endpoint,callers,handlers,dependencies,tests,partial:true,guidance:"Fragmentos realmente leídos. Continuar cuerpos parciales con read_code; no ejecutar ni inferir ausencia de otros tests."};
  }
  async search(term: string, prefix = "") {
    if (typeof term !== "string" || term.trim().length < 3 || term.length > 120)
      throw new Error("Búsqueda entre 3 y 120 caracteres.");
    const priority = (p: string) =>
      p.startsWith("shared/") ||
      (p.startsWith("server/") && !p.includes("/tests/"))
        ? 0
        : p.startsWith("client/src/") && !p.includes(".test.")
          ? 1
          : p.startsWith("docs/")
            ? 3
            : 2;
    const files = (await this.files())
      .filter((p) => !prefix || p.startsWith(prefix))
      .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
    const matches: Array<{ path: string; line: number; snippet: string }> = [];
    let limited = false;
    for (const f of files) {
      const lines = (await this.content(f)).split("\n");
      let fileMatches = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(term.toLowerCase())) {
          if (fileMatches++ >= 4) {
            limited = true;
            continue;
          }
          matches.push({
            path: f,
            line: i + 1,
            snippet: lines[i].trim().slice(0, 240),
          });
          if (matches.length >= 30) {
            limited = true;
            break;
          }
        }
      }
      if (matches.length >= 30) break;
    }
    this.searches.push(term);
    return { matches, limited };
  }
  validates(ref: { path: string; start: number; end: number }) {
    if (!Number.isInteger(ref.start) || !Number.isInteger(ref.end) || ref.start < 1 || ref.end < ref.start) return false;
    // A citation can cover several adjacent reads, but never an unread gap.
    let next = ref.start;
    for (const [start,end] of [...(this.readRanges.get(ref.path) || [])].sort((a,b)=>a[0]-b[0])) {
      if (end < next) continue;
      if (start > next) return false;
      next = Math.max(next,end+1);
      if (next > ref.end) return true;
    }
    return false;
  }
}
