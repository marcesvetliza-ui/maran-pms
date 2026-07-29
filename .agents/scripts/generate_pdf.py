from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

OUTPUT = "attached_assets/Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=2*cm, leftMargin=2*cm,
    topMargin=2.2*cm, bottomMargin=2*cm,
    title="Respuesta Informe Colobig — Implementación Gastronómica",
    author="Maran PMS"
)

W = A4[0] - 4*cm  # usable width

# ── Color palette ──────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#1a2e4a")
BLUE   = colors.HexColor("#1e4d8c")
TEAL   = colors.HexColor("#0e7490")
LIGHT  = colors.HexColor("#e8f0f8")
YELLOW = colors.HexColor("#fef9c3")
GREEN  = colors.HexColor("#166534")
GREEN_BG  = colors.HexColor("#dcfce7")
RED    = colors.HexColor("#991b1b")
RED_BG = colors.HexColor("#fee2e2")
AMBER_BG  = colors.HexColor("#fef3c7")
AMBER  = colors.HexColor("#92400e")
GREY   = colors.HexColor("#6b7280")
GREY_BG   = colors.HexColor("#f3f4f6")
BORDER = colors.HexColor("#cbd5e1")

styles = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

S_TITLE = style("title",
    fontSize=20, textColor=NAVY, fontName="Helvetica-Bold",
    spaceAfter=4, leading=24)
S_SUBTITLE = style("subtitle",
    fontSize=11, textColor=TEAL, fontName="Helvetica",
    spaceAfter=2, leading=14)
S_META = style("meta",
    fontSize=9, textColor=GREY, fontName="Helvetica",
    spaceAfter=12, leading=12)
S_H1 = style("h1",
    fontSize=13, textColor=NAVY, fontName="Helvetica-Bold",
    spaceBefore=14, spaceAfter=4, leading=16,
    borderPad=4)
S_H2 = style("h2",
    fontSize=11, textColor=BLUE, fontName="Helvetica-Bold",
    spaceBefore=10, spaceAfter=3, leading=14)
S_H3 = style("h3",
    fontSize=10, textColor=TEAL, fontName="Helvetica-Bold",
    spaceBefore=7, spaceAfter=2, leading=13)
S_BODY = style("body",
    fontSize=9, textColor=colors.HexColor("#1f2937"), fontName="Helvetica",
    spaceAfter=3, leading=13)
S_SMALL = style("small",
    fontSize=8, textColor=GREY, fontName="Helvetica",
    spaceAfter=2, leading=11)
S_QUOTE = style("quote",
    fontSize=9, textColor=colors.HexColor("#374151"), fontName="Helvetica-Oblique",
    spaceAfter=4, leading=13, leftIndent=12, rightIndent=12,
    backColor=LIGHT, borderPad=6)
S_NOTE = style("note",
    fontSize=8.5, textColor=colors.HexColor("#374151"), fontName="Helvetica",
    spaceAfter=2, leading=12, leftIndent=8)
S_TC = style("tc",
    fontSize=8.5, textColor=colors.HexColor("#1f2937"), fontName="Helvetica",
    leading=11)
S_TC_BOLD = style("tcb",
    fontSize=8.5, textColor=NAVY, fontName="Helvetica-Bold",
    leading=11)
S_TC_GREY = style("tcg",
    fontSize=8.5, textColor=GREY, fontName="Helvetica",
    leading=11)

def hr(color=BORDER, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=6, spaceBefore=2)

def h1(text):
    return [hr(NAVY, 1.5), Paragraph(text, S_H1)]

def h2(text):
    return [Paragraph(text, S_H2)]

def h3(text):
    return [Paragraph(text, S_H3)]

def body(text):
    return Paragraph(text, S_BODY)

def quote(text):
    return Paragraph("<i>\u201c" + text + "\u201d</i>", S_QUOTE)

def sp(h=4):
    return Spacer(1, h)


# ── Icon helpers ───────────────────────────────────────────────────────────────
TICK   = "✅"
CROSS  = "❌"
WARN   = "⚠️"

def status_cell(st):
    if st == "ok":
        return Paragraph(f'<font color="#166534">✔ Implementado</font>', S_TC)
    if st == "no":
        return Paragraph(f'<font color="#991b1b">✘ Pendiente</font>', S_TC)
    if st == "partial":
        return Paragraph(f'<font color="#92400e">◑ Parcial</font>', S_TC)
    return Paragraph(st, S_TC)

def std_table(headers, rows, col_widths=None, row_colors=None):
    data = [[Paragraph(h, S_TC_BOLD) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), S_TC) if isinstance(c, str) else c for c in row])
    cw = col_widths or [W/len(headers)]*len(headers)
    t = Table(data, colWidths=cw, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 8.5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, GREY_BG]),
        ("GRID",       (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING", (0,0),(-1,-1), 6),
        ("RIGHTPADDING",(0,0),(-1,-1), 6),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t

# ── Priority badge ─────────────────────────────────────────────────────────────
def priority_tag(n, bg, fg):
    return Paragraph(f'<font color="{fg}"><b>P{n}</b></font>', 
        ParagraphStyle(f"pt{n}", fontSize=8.5, fontName="Helvetica-Bold",
            backColor=bg, textColor=colors.HexColor(fg), leading=11, alignment=TA_CENTER))

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD STORY
# ═══════════════════════════════════════════════════════════════════════════════
story = []

# ── COVER BLOCK ───────────────────────────────────────────────────────────────
cover_data = [[
    Paragraph("MARAN SUITES &amp; TOWERS", style("ch",
        fontSize=10, textColor=colors.HexColor("#93c5fd"), fontName="Helvetica-Bold", leading=13)),
    ""
],[
    Paragraph("Respuesta al Informe de Implementación<br/>Sistema de Gestión Gastronómica", style("ct",
        fontSize=18, textColor=colors.white, fontName="Helvetica-Bold", leading=22, spaceAfter=6)),
    ""
],[
    Paragraph("Juan Matías Colobig — Dpto. AA&amp;BB — Julio 2026", style("cs",
        fontSize=9, textColor=colors.HexColor("#93c5fd"), fontName="Helvetica", leading=12)),
    Paragraph("Estado de implementación en Maran PMS — Julio 2026", style("cs2",
        fontSize=9, textColor=colors.HexColor("#bfdbfe"), fontName="Helvetica-Oblique",
        leading=12, alignment=TA_RIGHT))
]]
cover = Table(cover_data, colWidths=[W*0.7, W*0.3])
cover.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,-1), NAVY),
    ("TOPPADDING",    (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING",   (0,0), (-1,-1), 14),
    ("RIGHTPADDING",  (0,0), (-1,-1), 14),
    ("SPAN",          (0,1), (-1,1)),
    ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
]))
story.append(cover)
story.append(sp(10))

# ── INTRO ─────────────────────────────────────────────────────────────────────
story += h1("Resumen Ejecutivo")
story.append(body(
    "El informe de Colobig define los requerimientos mínimos para un sistema de gestión "
    "gastronómica integral. A continuación se presenta el estado de implementación de cada "
    "punto en el sistema Maran PMS, los cambios realizados y los pendientes priorizados."
))
story.append(sp(4))

# Estado general
summary_data = [
    ["Módulo", "Estado General"],
    ["1. Integración con Sistema Administrativo", status_cell("ok")],
    ["2.1 Maestro de Insumos y Productos", status_cell("partial")],
    ["2.2 Recetas Estandarizadas", status_cell("partial")],
    ["2.3 Recetas de Producción Intermedias", status_cell("ok")],
    ["2.4 Inventarios por Depósitos", status_cell("partial")],
    ["2.5 Gestión de Bajas", status_cell("partial")],
    ["2.6 Estadísticas de Ventas", status_cell("partial")],
    ["2.7 Food Cost y Beverage Cost", status_cell("partial")],
    ["3. KPIs / Dashboard", status_cell("no")],
]
story.append(std_table(["Módulo", "Estado General"], summary_data[1:],
    col_widths=[W*0.75, W*0.25]))
story.append(sp(8))

# ── SECTION 1 ──────────────────────────────────────────────────────────────────
story += h1("1. Integración con el Sistema Administrativo")
story.append(quote("Toda factura de compra registrada debe impactar automáticamente en: Stock, Costos, Cuentas Corrientes, Contabilidad, Información Financiera."))
story.append(body(
    "El sistema cuenta con integración nativa completa. El módulo de Facturas de Compra "
    "registra el comprobante contable, genera el asiento automático, actualiza la cuenta "
    "corriente del proveedor e ingresa el stock de los artículos indicados en el Paso 5 "
    "— todo en el mismo sistema, sin exportación ni intervención manual."
))
story.append(std_table(
    ["Integración", "Estado"],
    [
        ["Factura de compra → Stock (entrada automática)", status_cell("ok")],
        ["Factura de compra → Costos (actualiza precio del artículo)", status_cell("ok")],
        ["Factura de compra → Asiento contable automático", status_cell("ok")],
        ["Factura de compra → Cuenta corriente del proveedor", status_cell("ok")],
        ["Sistema integral nativo (todo en un mismo sistema)", status_cell("ok")],
    ],
    col_widths=[W*0.75, W*0.25]
))

# ── SECTION 2.1 ────────────────────────────────────────────────────────────────
story += h1("2.1 Maestro de Insumos y Productos")
story.append(quote("El maestro constituye la base de toda la operación."))
story.append(std_table(
    ["Campo solicitado", "Estado", "Observación"],
    [
        ["Código / SKU", status_cell("ok"), Paragraph("Auto-generado por área (RST-0042, SPA-0001)", S_TC)],
        ["Nombre, Categoría con área", status_cell("ok"), Paragraph("Categorías por área: Restaurante, SPA, General...", S_TC)],
        ["Proveedor habitual", status_cell("ok"), Paragraph("Selector de proveedor en la ficha del artículo", S_TC)],
        ["Unidad (kg, g, litro, ml, caja...)", status_cell("ok"), Paragraph("8 unidades disponibles", S_TC)],
        ["Precio de compra / Costo unitario", status_cell("ok"), Paragraph("Se actualiza automáticamente con cada factura de compra", S_TC)],
        ["Stock mínimo + alertas", status_cell("ok"), Paragraph("Panel de alertas de stock bajo", S_TC)],
        ["Historial de precios", status_cell("ok"), Paragraph("Evolución del costo por artículo", S_TC)],
        ["Tipo: Materia Prima / Venta Directa", status_cell("ok"), Paragraph("", S_TC)],
        ["Unidad de compra vs. Unidad de uso", status_cell("no"), Paragraph("Una sola unidad por artículo — sin conversión automática", S_TC)],
        ["Factor de conversión (compra → uso)", status_cell("no"), Paragraph("Conversión manual al cargar la factura", S_TC)],
        ["IVA en la ficha del artículo", status_cell("no"), Paragraph("IVA registrado a nivel del comprobante, no del artículo", S_TC)],
    ],
    col_widths=[W*0.35, W*0.20, W*0.45]
))

# ── SECTION 2.2 ────────────────────────────────────────────────────────────────
story += h1("2.2 Recetas Estandarizadas")
story.append(quote("Cada plato debe encontrarse completamente parametrizado: ingredientes, gramajes, mermas, rendimiento, costo, Food Cost, precio sugerido, Margen Bruto."))
story.append(std_table(
    ["Campo", "Estado", "Observación"],
    [
        ["Ingredientes con cantidades / gramajes", status_cell("ok"), Paragraph("Se ingresa en la unidad del artículo", S_TC)],
        ["Costo de producción total", status_cell("ok"), Paragraph("Calculado automáticamente", S_TC)],
        ["Costo por porción", status_cell("ok"), Paragraph("", S_TC)],
        ["Food Cost %", status_cell("ok"), Paragraph("Costo / Precio de venta", S_TC)],
        ["Precio de venta en el menú", status_cell("ok"), Paragraph("", S_TC)],
        ["Mermas por ingrediente (%)", status_cell("no"), Paragraph("No hay campo de merma porcentual", S_TC)],
        ["Precio sugerido por margen objetivo", status_cell("partial"), Paragraph("Precio visible pero sin objetivo de margen configurable", S_TC)],
        ["Margen Bruto explícito", status_cell("partial"), Paragraph("Calculable desde Food Cost, no mostrado como campo", S_TC)],
    ],
    col_widths=[W*0.38, W*0.20, W*0.42]
))

# ── SECTION 2.3 ────────────────────────────────────────────────────────────────
story += h1("2.3 Recetas de Producción Intermedias — Elaboraciones Base")
story.append(quote("Salsa Filetto, fondo oscuro, masa de pizza, caldos... Permite calcular el Consumo Teórico."))
story.append(body(
    "Esta funcionalidad fue implementada en su totalidad. El tab 'Elaboraciones Base' en "
    "Recetas &amp; Costos permite crear producciones intermedias con sus ingredientes, "
    "rendimiento total y costo calculado. Al asociar una elaboración como ingrediente de "
    "un plato y cerrar una orden, la deducción de stock es recursiva: "
    "plato → elaboración → materias primas."
))
story.append(std_table(
    ["Requerimiento", "Estado"],
    [
        ["Tab 'Elaboraciones Base' con ingredientes y rendimiento", status_cell("ok")],
        ["Costo de la elaboración calculado automáticamente", status_cell("ok")],
        ["Asociar elaboración como ingrediente de otra receta", status_cell("ok")],
        ["Deducción recursiva de stock al cerrar una orden", status_cell("ok")],
        ["Consumo Teórico automático según ventas", status_cell("ok")],
        ["Dashboard Teórico vs Real con desvíos", status_cell("no")],
    ],
    col_widths=[W*0.75, W*0.25]
))

# ── SECTION 2.4 ────────────────────────────────────────────────────────────────
story += h1("2.4 Inventarios")
story.append(quote("El sistema debe administrar inventarios por sectores o depósitos. Stock Inicial + Compras − Stock Final = Consumo."))
story.append(std_table(
    ["Requerimiento", "Estado", "Observación"],
    [
        ["Múltiples depósitos (Central, Cocina, Bar, Eventos...)", status_cell("ok"), Paragraph("ABM de depósitos en el módulo Inventario", S_TC)],
        ["Transferencias entre depósitos", status_cell("ok"), Paragraph("", S_TC)],
        ["Trazabilidad / historial de movimientos", status_cell("ok"), Paragraph("Pestaña 'Movimientos' con historial completo", S_TC)],
        ["Stock por depósito en tiempo real", status_cell("ok"), Paragraph("", S_TC)],
        ["Toma de inventario (stock real contado)", status_cell("no"), Paragraph("No hay proceso formal de conteo de inventario", S_TC)],
        ["Fórmula: Stock Ini + Compras − Stock Final = Consumo", status_cell("no"), Paragraph("Datos disponibles pero sin pantalla que calcule la fórmula", S_TC)],
        ["Consumo Teórico vs Real — desvíos en unidades y $", status_cell("no"), Paragraph("Pendiente prioritario", S_TC)],
        ["Ranking de mayores desvíos", status_cell("no"), Paragraph("", S_TC)],
        ["Impacto económico de los desvíos", status_cell("no"), Paragraph("", S_TC)],
        ["Ajustes manuales de stock", status_cell("partial"), Paragraph("Eliminados intencionalmente — solo por comprobantes de compra", S_TC)],
    ],
    col_widths=[W*0.42, W*0.18, W*0.40]
))

# ── SECTION 2.5 ────────────────────────────────────────────────────────────────
story += h1("2.5 Gestión de Bajas")
story.append(std_table(
    ["Tipo de baja", "Estado", "Observación"],
    [
        ["Ventas → descuento automático al cerrar orden", status_cell("ok"), Paragraph("Deducción según recetas configuradas", S_TC)],
        ["Mermas (campo % en recetas)", status_cell("no"), Paragraph("Ver punto 2.2", S_TC)],
        ["Desperdicios (registro puntual con motivo)", status_cell("no"), Paragraph("Sin formulario de desperdicio", S_TC)],
        ["Desayunos (consumo diario)", status_cell("no"), Paragraph("Sin módulo específico", S_TC)],
        ["Eventos → descarga automática de insumos", status_cell("no"), Paragraph("El módulo Eventos existe pero sin deducción de stock", S_TC)],
    ],
    col_widths=[W*0.42, W*0.18, W*0.40]
))

# ── SECTION 2.6 ────────────────────────────────────────────────────────────────
story += h1("2.6 Estadísticas de Ventas")
story.append(std_table(
    ["Estadística", "Estado", "Observación"],
    [
        ["Platos más vendidos / reporte de consumos", status_cell("ok"), Paragraph("Con filtro de fecha", S_TC)],
        ["Venta por día / período", status_cell("partial"), Paragraph("Reportes con filtro de fecha disponibles", S_TC)],
        ["Ticket promedio como KPI", status_cell("partial"), Paragraph("Dato disponible, sin dashboard consolidado", S_TC)],
        ["Cantidad de cubiertos", status_cell("partial"), Paragraph("Registrado en órdenes, sin reporte dedicado", S_TC)],
        ["Venta por mesa", status_cell("no"), Paragraph("", S_TC)],
        ["Venta por mozo", status_cell("no"), Paragraph("Sin asignación de mozo por orden", S_TC)],
        ["Venta por horario", status_cell("no"), Paragraph("", S_TC)],
        ["Costo por ticket → Margen Bruto por orden", status_cell("no"), Paragraph("", S_TC)],
    ],
    col_widths=[W*0.42, W*0.18, W*0.40]
))

# ── SECTION 2.7 ────────────────────────────────────────────────────────────────
story += h1("2.7 Food Cost y Beverage Cost")
story.append(std_table(
    ["Requerimiento", "Estado", "Observación"],
    [
        ["Food Cost % por plato (en la ficha de receta)", status_cell("ok"), Paragraph("", S_TC)],
        ["Food Cost % del período (mensual/semanal)", status_cell("no"), Paragraph("Sin KPI global de Food Cost", S_TC)],
        ["Beverage Cost diferenciado", status_cell("no"), Paragraph("Sin distinción bebida/comida en reportes", S_TC)],
        ["Por familia / categoría", status_cell("no"), Paragraph("", S_TC)],
        ["Por sector (Restaurante, Bar, Eventos)", status_cell("no"), Paragraph("", S_TC)],
        ["Por menú / evento", status_cell("no"), Paragraph("", S_TC)],
    ],
    col_widths=[W*0.42, W*0.18, W*0.40]
))

# ── SECTION 3 — KPIs ──────────────────────────────────────────────────────────
story += h1("3. Indicadores de Gestión (KPIs / Dashboard)")
story.append(body("Ninguno de los dashboards de KPIs está implementado actualmente. Los datos base existen pero no hay una pantalla que los consolide como indicadores de gestión."))
story.append(std_table(
    ["Bloque", "Indicadores", "Estado"],
    [
        [Paragraph("<b>Costos</b>", S_TC), "Food Cost %, Beverage Cost %, Costo de Ventas", status_cell("no")],
        [Paragraph("<b>Comerciales</b>", S_TC), "Ticket Promedio, Cubiertos, Ocupación, Venta por Mozo/Mesa/Hora, Rotación de Mesas", status_cell("no")],
        [Paragraph("<b>Inventario</b>", S_TC), "Rotación de Stock, Días de Inventario, Diferencias, Desvíos, Mermas", status_cell("no")],
        [Paragraph("<b>Económicos</b>", S_TC), "Utilidad Bruta, Utilidad Operativa", status_cell("no")],
    ],
    col_widths=[W*0.20, W*0.55, W*0.25]
))

# ── CAMBIOS REALIZADOS ────────────────────────────────────────────────────────
story += h1("Cambios Concretos Realizados en el Sistema")

story += h2("Fases implementadas")
story.append(std_table(
    ["Fase", "Descripción", "Estado"],
    [
        ["1", "Maestro de artículos: SKU, categorías, proveedores, depósitos, alertas de stock", status_cell("ok")],
        ["2", "Recetas estandarizadas: ingredientes, costo calculado, Food Cost %", status_cell("ok")],
        ["3", "Ventas → stock: al cerrar orden del restaurante se deduce stock según recetas", status_cell("ok")],
        ["4", "Facturas de compra → stock automático (Paso 5 del comprobante)", status_cell("ok")],
        ["5", "Reporte de consumos por período con filtro de fechas", status_cell("ok")],
        ["6", "Elaboraciones Base / sub-recetas con deducción recursiva de stock", status_cell("ok")],
        ["7", "Eliminación de movimientos manuales de entrada/salida", status_cell("ok")],
    ],
    col_widths=[W*0.08, W*0.67, W*0.25]
))
story.append(sp(6))

story += h2("Cambios de esta sesión")
changes = [
    ["Entrada/salida manual eliminada",
     "Los botones 'Registrar Entrada' y 'Registrar Salida' fueron removidos del módulo "
     "Inventario. El stock solo puede moverse por: facturas de compra, cierre de órdenes "
     "del restaurante, y transferencias entre depósitos. Todos los movimientos tienen respaldo contable."],
    ["'Nuevo Artículo' simplificado",
     "El formulario ya no tiene 'Stock Inicial' ni 'Depósito destino'. Se crea la ficha del "
     "artículo sin stock; el stock entra exclusivamente por comprobantes de compra."],
    ["Paso 5 — Factura de Compra — 'Artículo nuevo' ampliado",
     "Se agregaron los campos Tipo de artículo (Materia Prima / Venta Directa) y Stock mínimo "
     "al modo de creación de artículos nuevos dentro del comprobante, igualando las opciones "
     "del formulario completo de Nuevo Artículo."],
]
for title, desc in changes:
    row_data = [
        [Paragraph(f"<b>{title}</b>", S_TC), Paragraph(desc, S_TC)]
    ]
    t = Table(row_data, colWidths=[W*0.30, W*0.70])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), LIGHT),
        ("BACKGROUND", (1,0), (1,0), colors.white),
        ("GRID",       (0,0), (-1,-1), 0.4, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LEFTPADDING", (0,0),(-1,-1), 8),
        ("RIGHTPADDING",(0,0),(-1,-1), 8),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
    ]))
    story.append(t)
    story.append(sp(3))

# ── PENDIENTES ────────────────────────────────────────────────────────────────
story += h1("Pendientes — Hoja de Ruta Sugerida")

priority_rows = [
    ["P1", "Toma de Inventario",
     "Módulo para ingresar stock real contado y calcular automáticamente la fórmula: "
     "Stock Inicial + Compras − Stock Final = Consumo Real",
     "Muy alto", "Media"],
    ["P2", "Reporte de Desvíos",
     "Comparativo Consumo Teórico vs Consumo Real: diferencia en unidades, porcentaje e impacto económico en $. Ranking de mayores desvíos.",
     "Muy alto", "Media"],
    ["P3", "Mermas en recetas",
     "Campo de porcentaje de merma por ingrediente en las recetas estandarizadas.",
     "Alto", "Baja"],
    ["P4", "Registro de Desperdicios",
     "Formulario para registrar bajas puntuales con artículo, cantidad, motivo y fecha.",
     "Alto", "Baja"],
    ["P5", "Dashboard de KPIs",
     "Pantalla con Food Cost % del período, Ticket Promedio, Cubiertos y Costo de Ventas.",
     "Alto", "Media"],
    ["P6", "Venta por mozo",
     "Asignación de usuario/mozo a cada orden del restaurante para estadísticas por persona.",
     "Medio", "Media"],
    ["P7", "Factor de conversión",
     "Comprar por caja (12 unidades), usar por unidad. Conversión automática al cargar facturas.",
     "Medio", "Media-Alta"],
    ["P8", "Descarga de stock en Eventos",
     "Al cerrar un evento, descontar automáticamente los insumos consumidos según la parametrización.",
     "Medio", "Media"],
    ["P9", "Food Cost por período / categoría",
     "Food Cost % del mes/semana/día, desglosado por categoría y sector.",
     "Medio", "Baja"],
    ["P10", "Consumo de Desayunos",
     "Registro diario del consumo correspondiente al área de desayunos.",
     "Bajo", "Baja"],
]

p_data = [[
    Paragraph("Prio", S_TC_BOLD),
    Paragraph("Funcionalidad", S_TC_BOLD),
    Paragraph("Descripción", S_TC_BOLD),
    Paragraph("Impacto", S_TC_BOLD),
    Paragraph("Complejidad", S_TC_BOLD),
]]
impact_colors = {"Muy alto": "#fef2f2", "Alto": "#fefce8", "Medio": "#f0fdf4", "Bajo": "#f8fafc"}
for row in priority_rows:
    prio_n = row[0]
    imp = row[3]
    bg = impact_colors.get(imp, colors.white)
    p_data.append([
        Paragraph(f"<b>{prio_n}</b>", ParagraphStyle(f"pn{prio_n}",
            fontSize=8.5, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1e3a5f"), leading=11, alignment=TA_CENTER)),
        Paragraph(f"<b>{row[1]}</b>", S_TC_BOLD),
        Paragraph(row[2], S_TC),
        Paragraph(row[3], S_TC),
        Paragraph(row[4], S_TC),
    ])

pt = Table(p_data, colWidths=[W*0.07, W*0.23, W*0.46, W*0.12, W*0.12], repeatRows=1)
pt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,0), NAVY),
    ("TEXTCOLOR",     (0,0), (-1,0), colors.white),
    ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE",      (0,0), (-1,-1), 8.5),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, GREY_BG]),
    ("GRID",          (0,0), (-1,-1), 0.4, BORDER),
    ("TOPPADDING",    (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ("LEFTPADDING",   (0,0), (-1,-1), 6),
    ("RIGHTPADDING",  (0,0), (-1,-1), 6),
    ("VALIGN",        (0,0), (-1,-1), "TOP"),
    # Highlight P1 and P2
    ("BACKGROUND",    (0,1), (-1,1), colors.HexColor("#fef2f2")),
    ("BACKGROUND",    (0,2), (-1,2), colors.HexColor("#fef2f2")),
]))
story.append(pt)

# ── NOTA EXCEL ────────────────────────────────────────────────────────────────
story.append(sp(10))
nota_data = [[
    Paragraph("📋  Nota transversal — Exportación a Excel", style("nt",
        fontSize=9, fontName="Helvetica-Bold", textColor=AMBER, leading=12)),
    ""
],[
    Paragraph(
        "El informe solicita que toda la información sea transportable a Excel. "
        "El sistema actualmente genera PDFs en varios módulos, pero no hay exportación "
        "a CSV/Excel en Inventario ni en Reportes. Es una mejora transversal aplicable "
        "a múltiples módulos.", style("nb", fontSize=8.5, fontName="Helvetica",
        textColor=colors.HexColor("#374151"), leading=12)),
    ""
]]
nt = Table(nota_data, colWidths=[W*0.85, W*0.15])
nt.setStyle(TableStyle([
    ("BACKGROUND",  (0,0), (-1,-1), AMBER_BG),
    ("SPAN",        (0,0), (-1,0)),
    ("SPAN",        (0,1), (-1,1)),
    ("TOPPADDING",  (0,0), (-1,-1), 7),
    ("BOTTOMPADDING",(0,0),(-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 10),
    ("RIGHTPADDING",(0,0), (-1,-1), 10),
    ("BOX",         (0,0), (-1,-1), 0.6, colors.HexColor("#d97706")),
]))
story.append(nt)

# ── FOOTER ────────────────────────────────────────────────────────────────────
story.append(sp(12))
story.append(hr(BORDER))
story.append(Paragraph(
    "Maran Suites &amp; Torres · Documento generado por Maran PMS · Julio 2026",
    style("footer", fontSize=7.5, textColor=GREY, fontName="Helvetica",
          alignment=TA_CENTER, leading=10)
))

# ── BUILD ──────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"PDF generado: {OUTPUT}")
