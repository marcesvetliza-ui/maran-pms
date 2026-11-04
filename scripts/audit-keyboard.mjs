// Read-only inventory. Run: node scripts/audit-keyboard.mjs
// Import counts show reach, not browser verification or module coverage.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) :
      file.endsWith(".tsx") && !/\.(test|spec)\./.test(file) ? [file] : [];
  });
}
const rows = [];
for (const file of [...files("client/src/pages"), ...files("client/src/components")]) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const counts = { input: 0, select: 0, command: 0, popover: 0, dialog: 0, key: 0, focus: 0 };
  const selects = [];
  const events = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^(input|Input|textarea|Textarea|select|Select|KeyboardSelect|CommandInput)$/.test(tag)) counts.input++;
      if (/^(Select|KeyboardSelect)$/.test(tag)) {
        counts.select++;
        selects.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
      if (tag === "Command") counts.command++;
      if (tag === "Popover") counts.popover++;
      if (/^(Dialog|AlertDialog|Sheet|Drawer)$/.test(tag)) counts.dialog++;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (/^onKey(Down|Up|Press)(Capture)?$/.test(name)) counts.key++;
      if (/^(autoFocus|tabIndex|onCloseAutoFocus|onOpenAutoFocus|onFocus|onBlur)$/.test(name)) counts.focus++;
      if (/^(onKeyDown|onKeyDownCapture|autoFocus|tabIndex|onCloseAutoFocus|onOpenAutoFocus)$/.test(name)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        events.push(`${name}:${line}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (Object.values(counts).some(Boolean)) rows.push({ file, ...counts, selects, events });
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else {
  console.log("# Inventario estático de navegación por teclado\n");
  console.log("Generado desde el código actual. No implica verificación de cada flujo.\n");
  console.log("| Archivo | Campos | Select | Command | Popover | Diálogos | Teclado | Foco |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) console.log(`| ${r.file} | ${r.input} | ${r.select} | ${r.command} | ${r.popover} | ${r.dialog} | ${r.key} | ${r.focus} |`);
  console.log(`\nTotal: ${rows.length} archivos con controles; ${rows.reduce((n, r) => n + r.select, 0)} selectores JSX.`);
  console.log("\n## Eventos locales que requieren revisión por flujo\n");
  for (const r of rows.filter(r => r.events.length)) console.log(`- ${r.file}: ${r.events.join(", ")}`);
}
