import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "tailwind.config.ts",
  "drizzle.config.ts",
  "components.json",
  "shared/schema.ts",
  "server/index.ts",
  "server/routes.ts",
  "server/storage.ts",
  "server/vite.ts",
  "server/static.ts",
  "script/build.ts",
  "client/index.html",
  "client/src/main.tsx",
  "client/src/App.tsx",
  "client/src/index.css",
  "client/src/lib/queryClient.ts",
  "client/src/lib/utils.ts",
  "client/src/hooks/use-toast.ts",
  "client/src/hooks/use-mobile.tsx",
  "client/src/components/app-sidebar.tsx",
  "client/src/components/theme-provider.tsx",
  "client/src/components/theme-toggle.tsx",
  "client/src/components/entity-selector.tsx",
  "client/src/pages/dashboard.tsx",
  "client/src/pages/rooms.tsx",
  "client/src/pages/guests.tsx",
  "client/src/pages/companies.tsx",
  "client/src/pages/reservations.tsx",
  "client/src/pages/new-reservation.tsx",
  "client/src/pages/planning.tsx",
  "client/src/pages/check-in.tsx",
  "client/src/pages/check-out.tsx",
  "client/src/pages/restaurant.tsx",
  "client/src/pages/spa.tsx",
  "client/src/pages/events.tsx",
  "client/src/pages/housekeeping.tsx",
  "client/src/pages/maintenance.tsx",
  "client/src/pages/inventory.tsx",
  "client/src/pages/administration.tsx",
  "client/src/pages/hospitality.tsx",
  "client/src/pages/chatbot-dashboard.tsx",
  "client/src/pages/web-checkin-public.tsx",
  "client/src/pages/groups.tsx",
  "client/src/pages/group-detail.tsx",
  "client/src/pages/packages.tsx",
  "client/src/pages/rate-plans.tsx",
  "client/src/pages/ota-channels.tsx",
  "client/src/pages/reviews.tsx",
  "client/src/pages/not-found.tsx",
];

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 40, bottom: 40, left: 40, right: 40 },
  bufferPages: true,
});

const output = fs.createWriteStream("/home/runner/workspace/MARAN_SUITE_CODIGO_COMPLETO.pdf");
doc.pipe(output);

doc.fontSize(22).font("Helvetica-Bold").text("MARAN SUITE SYSTEM", { align: "center" });
doc.moveDown(0.5);
doc.fontSize(14).font("Helvetica").text("Código Fuente Completo", { align: "center" });
doc.moveDown(0.3);
doc.fontSize(10).text(`Generado: ${new Date().toLocaleString("es-AR")}`, { align: "center" });
doc.moveDown(1);

doc.fontSize(11).font("Helvetica-Bold").text("ÍNDICE DE ARCHIVOS", { underline: true });
doc.moveDown(0.5);
doc.fontSize(8).font("Courier");
FILES.forEach((f, i) => {
  doc.text(`${(i + 1).toString().padStart(2, " ")}. ${f}`);
});

for (const file of FILES) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) continue;

  doc.addPage();

  doc.fontSize(12).font("Helvetica-Bold")
    .fillColor("#1a56db")
    .text(`📄 ${file}`, 40, 40);
  
  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");
  doc.fillColor("#666666").fontSize(8).font("Helvetica")
    .text(`${lines.length} líneas`, { align: "right" });
  
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke("#cccccc");
  doc.moveDown(0.3);

  doc.fillColor("#000000").fontSize(6.5).font("Courier");
  
  const MAX_LINES = 5000;
  const linesToWrite = lines.slice(0, MAX_LINES);
  
  for (let i = 0; i < linesToWrite.length; i++) {
    const lineNum = (i + 1).toString().padStart(4, " ");
    let lineText = linesToWrite[i].replace(/\t/g, "  ");
    if (lineText.length > 120) lineText = lineText.substring(0, 117) + "...";
    
    if (doc.y > 780) {
      doc.addPage();
      doc.fontSize(8).font("Helvetica").fillColor("#999999")
        .text(`${file} (cont.)`, 40, 40);
      doc.moveDown(0.3);
      doc.fontSize(6.5).font("Courier").fillColor("#000000");
    }
    
    doc.text(`${lineNum} │ ${lineText}`, { width: 515, lineBreak: false });
    doc.moveDown(0.15);
  }
  
  if (lines.length > MAX_LINES) {
    doc.moveDown(0.5);
    doc.fontSize(8).font("Helvetica").fillColor("#cc0000")
      .text(`... ${lines.length - MAX_LINES} líneas adicionales truncadas ...`);
  }
}

doc.end();
output.on("finish", () => {
  const stats = fs.statSync("/home/runner/workspace/MARAN_SUITE_CODIGO_COMPLETO.pdf");
  console.log(`PDF generado: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
});
