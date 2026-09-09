  groupPaymentId: varchar("group_payment_id").references(() => groupPayments.id),
  retentions: jsonb("retentions").$type<AccountRetention[]>(),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountMovementSchema = createInsertSchema(accountMovements).omit({ id: true, createdAt: true });
export type InsertAccountMovement = z.infer<typeof insertAccountMovementSchema>;
export type AccountMovement = typeof accountMovements.$inferSelect;

export const accountMovementAllocations = pgTable("account_movement_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pagoId: varchar("pago_id").notNull().references(() => accountMovements.id),
  cargoId: varchar("cargo_id").notNull().references(() => accountMovements.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountMovementAllocationSchema = createInsertSchema(accountMovementAllocations).omit({ id: true, createdAt: true });
export type InsertAccountMovementAllocation = z.infer<typeof insertAccountMovementAllocationSchema>;
export type AccountMovementAllocation = typeof accountMovementAllocations.$inferSelect;

// ============================================================
// MÓDULO CONTABLE / ADMINISTRATIVO
// ============================================================

// Proveedores contables (separado de suppliers del inventario)
export const accountingSuppliers = pgTable("accounting_suppliers", {
  id: serial("id").primaryKey(),
  razonSocial: text("razon_social").notNull(),
  cuit: text("cuit").notNull().unique(),
  domicilio: text("domicilio"),
  localidad: text("localidad"),
  provincia: text("provincia").default("Entre Rios"),
  cp: text("cp"),
  condicionIva: text("condicion_iva").notNull(),
  alicuotaIibb: numeric("alicuota_iibb", { precision: 6, scale: 4 }).default("0"),
  alicuotaGanancias: numeric("alicuota_ganancias", { precision: 6, scale: 4 }).default("0"),
  alicuotaIva: numeric("alicuota_iva", { precision: 6, scale: 4 }).default("0"),
  cbu: text("cbu"),
  banco: text("banco"),
  activo: boolean("activo").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAccountingSupplierSchema = createInsertSchema(accountingSuppliers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccountingSupplier = z.infer<typeof insertAccountingSupplierSchema>;
export type AccountingSupplier = typeof accountingSuppliers.$inferSelect;

// Plan de Cuentas Contables
export const accountingAccounts = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  nivel: integer("nivel").default(1),
  activo: boolean("activo").default(true),
});

export const insertAccountingAccountSchema = createInsertSchema(accountingAccounts).omit({ id: true });
export type InsertAccountingAccount = z.infer<typeof insertAccountingAccountSchema>;
export type AccountingAccount = typeof accountingAccounts.$inferSelect;

// Comprobantes de Compra (Facturas, NC, Resúmenes, Liquidaciones)
export const purchaseInvoices = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  tipoComprobante: text("tipo_comprobante").notNull(),
  supplierId: integer("supplier_id").references(() => accountingSuppliers.id),
  proveedorNombre: text("proveedor_nombre"),
  proveedorCuit: text("proveedor_cuit"),
  puntoVenta: text("punto_venta"),
  numeroComprobante: text("numero_comprobante").notNull(),
  numeroComprobanteExt: text("numero_comprobante_ext"),
  fechaEmision: date("fecha_emision").notNull(),
  periodo: text("periodo"),
  condicionPago: text("condicion_pago").notNull().default("contado"),
  montoNeto: numeric("monto_neto", { precision: 14, scale: 2 }).notNull().default("0"),
  alicuotaIva: text("alicuota_iva").default("21"),
  montoIva27: numeric("monto_iva27", { precision: 14, scale: 2 }).default("0"),
  montoIva21: numeric("monto_iva21", { precision: 14, scale: 2 }).default("0"),
  montoIva105: numeric("monto_iva105", { precision: 14, scale: 2 }).default("0"),
  montoIva5: numeric("monto_iva5", { precision: 14, scale: 2 }).default("0"),
  montoIva25: numeric("monto_iva25", { precision: 14, scale: 2 }).default("0"),
  montoExento: numeric("monto_exento", { precision: 14, scale: 2 }).default("0"),
  montoNoGravado: numeric("monto_no_gravado", { precision: 14, scale: 2 }).default("0"),
  impuestosInternos: numeric("impuestos_internos", { precision: 14, scale: 2 }).default("0"),
  ley25413: numeric("ley_25413", { precision: 14, scale: 2 }).default("0"),
  percepcionIibb: numeric("percepcion_iibb", { precision: 14, scale: 2 }).default("0"),
  percepcionIva: numeric("percepcion_iva", { precision: 14, scale: 2 }).default("0"),
  percepcionGanancias: numeric("percepcion_ganancias", { precision: 14, scale: 2 }).default("0"),
  retencionIibb: numeric("retencion_iibb", { precision: 14, scale: 2 }).default("0"),
  retencionGanancias: numeric("retencion_ganancias", { precision: 14, scale: 2 }).default("0"),
  retencionIva: numeric("retencion_iva", { precision: 14, scale: 2 }).default("0"),
  retencionSuss: numeric("retencion_suss", { precision: 14, scale: 2 }).default("0"),
  retencionMunicipal: numeric("retencion_municipal", { precision: 14, scale: 2 }).default("0"),
  monotributoCompBC: numeric("monotributo_comp_bc", { precision: 14, scale: 2 }).default("0"),
  montoTotal: numeric("monto_total", { precision: 14, scale: 2 }).notNull().default("0"),
  cuentaContableId: integer("cuenta_contable_id").references(() => accountingAccounts.id),
  centroCosto: text("centro_costo"),
  estado: text("estado").notNull().default("pendiente"),
  asientoId: integer("asiento_id"),
  observaciones: text("observaciones"),
  subtipoRetencion: text("subtipo_retencion"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseInvoiceSchema = createInsertSchema(purchaseInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseInvoice = z.infer<typeof insertPurchaseInvoiceSchema>;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;

// Órdenes de Pago
export const paymentOrders = pgTable("payment_orders", {
  id: serial("id").primaryKey(),
  numero: text("numero").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => accountingSuppliers.id),
  fecha: date("fecha").notNull(),
  formaPago: text("forma_pago").notNull().default("transferencia"),
  depBancario: numeric("dep_bancario", { precision: 14, scale: 2 }).default("0"),
  efectivo: numeric("efectivo", { precision: 14, scale: 2 }).default("0"),
  cheques: numeric("cheques", { precision: 14, scale: 2 }).default("0"),
  totalFacturas: numeric("total_facturas", { precision: 14, scale: 2 }).notNull(),
  retencionIibb: numeric("retencion_iibb", { precision: 14, scale: 2 }).default("0"),
  retencionGanancias: numeric("retencion_ganancias", { precision: 14, scale: 2 }).default("0"),
  retencionIva: numeric("retencion_iva", { precision: 14, scale: 2 }).default("0"),
  retencionProfLibs: numeric("retencion_prof_libs", { precision: 14, scale: 2 }).default("0"),
  compensacion: numeric("compensacion", { precision: 14, scale: 2 }).default("0"),
  totalAbonado: numeric("total_abonado", { precision: 14, scale: 2 }).notNull(),
  asientoId: integer("asiento_id"),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentOrderSchema = createInsertSchema(paymentOrders).omit({ id: true, createdAt: true });
export type InsertPaymentOrder = z.infer<typeof insertPaymentOrderSchema>;
export type PaymentOrder = typeof paymentOrders.$inferSelect;

// Ítems de Orden de Pago (facturas que cancela cada OP)
export const paymentOrderItems = pgTable("payment_order_items", {
  id: serial("id").primaryKey(),
  paymentOrderId: integer("payment_order_id").notNull().references(() => paymentOrders.id),
  invoiceId: integer("invoice_id").notNull().references(() => purchaseInvoices.id),
  importeCancelado: numeric("importe_cancelado", { precision: 14, scale: 2 }).notNull(),
});

export const insertPaymentOrderItemSchema = createInsertSchema(paymentOrderItems).omit({ id: true });
export type InsertPaymentOrderItem = z.infer<typeof insertPaymentOrderItemSchema>;
export type PaymentOrderItem = typeof paymentOrderItems.$inferSelect;

// Asientos Contables (Mayor de Cuentas)
export const accountingEntries = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  numeroMinuta: integer("numero_minuta").notNull(),
  fecha: date("fecha").notNull(),
  periodo: text("periodo").notNull(),
  concepto: text("concepto").notNull(),
  tipoOrigen: text("tipo_origen").notNull(),
  origenId: integer("origen_id"),
  origenTipo: text("origen_tipo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAccountingEntrySchema = createInsertSchema(accountingEntries).omit({ id: true, createdAt: true });
export type InsertAccountingEntry = z.infer<typeof insertAccountingEntrySchema>;
export type AccountingEntry = typeof accountingEntries.$inferSelect;

// Líneas de Asiento
export const accountingEntryLines = pgTable("accounting_entry_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => accountingEntries.id),
  accountId: integer("account_id").notNull().references(() => accountingAccounts.id),
  comprobanteTipo: text("comprobante_tipo"),
  comprobanteNumero: text("comprobante_numero"),
  proveedorNombre: text("proveedor_nombre"),
  debe: numeric("debe", { precision: 14, scale: 2 }).default("0"),
  haber: numeric("haber", { precision: 14, scale: 2 }).default("0"),
});

export const insertAccountingEntryLineSchema = createInsertSchema(accountingEntryLines).omit({ id: true });
export type InsertAccountingEntryLine = z.infer<typeof insertAccountingEntryLineSchema>;
export type AccountingEntryLine = typeof accountingEntryLines.$inferSelect;

// Constancias de Retención IIBB (SIRCAR)
export const iibbRetentions = pgTable("iibb_retentions", {
  id: serial("id").primaryKey(),
  nroConstancia: integer("nro_constancia").notNull(),
  supplierId: integer("supplier_id").references(() => accountingSuppliers.id),
  cuitProveedor: text("cuit_proveedor").notNull(),
  fechaRetencion: date("fecha_retencion").notNull(),
  fechaComprobante: date("fecha_comprobante").notNull(),
  nroComprobante: integer("nro_comprobante").notNull(),
  letraFactura: text("letra_factura"),
  importeBase: numeric("importe_base", { precision: 14, scale: 2 }).notNull(),
  alicuota: numeric("alicuota", { precision: 6, scale: 4 }).notNull(),
  importeRetenido: numeric("importe_retenido", { precision: 14, scale: 2 }).notNull(),
  anulacion: boolean("anulacion").default(false),
  convMultilateral: boolean("conv_multilateral").default(false),
  invoiceId: integer("invoice_id").references(() => purchaseInvoices.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIibbRetentionSchema = createInsertSchema(iibbRetentions).omit({ id: true, createdAt: true });
export type InsertIibbRetention = z.infer<typeof insertIibbRetentionSchema>;
export type IibbRetention = typeof iibbRetentions.$inferSelect;

// ─── Caja de Administración ──────────────────────────────────────────────────

export const adminCashMovements = pgTable("admin_cash_movements", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull(),
  hora: text("hora"),
  tipo: text("tipo").notNull(),
  concepto: text("concepto").notNull(),
  importe: numeric("importe", { precision: 14, scale: 2 }).notNull(),
  signo: text("signo").notNull(),
  cuentaContableId: integer("cuenta_contable_id").references(() => accountingAccounts.id),
  centroCosto: text("centro_costo"),
  paymentOrderId: integer("payment_order_id").references(() => paymentOrders.id),
  areaOrigen: text("area_origen"),
  cierreOrigenId: integer("cierre_origen_id"),
  anulado: boolean("anulado").default(false),
  motivoAnulacion: text("motivo_anulacion"),
  operador: text("operador"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminCashMovementSchema = createInsertSchema(adminCashMovements).omit({ id: true, createdAt: true });
export type InsertAdminCashMovement = z.infer<typeof insertAdminCashMovementSchema>;
export type AdminCashMovement = typeof adminCashMovements.$inferSelect;

export const adminCashArqueos = pgTable("admin_cash_arqueos", {
  id: serial("id").primaryKey(),
  fecha: date("fecha").notNull().unique(),
  saldoSistema: numeric("saldo_sistema", { precision: 14, scale: 2 }).notNull(),
  saldoFisico: numeric("saldo_fisico", { precision: 14, scale: 2 }).notNull(),
  diferencia: numeric("diferencia", { precision: 14, scale: 2 }).notNull(),
  observaciones: text("observaciones"),
  operador: text("operador"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminCashArqueoSchema = createInsertSchema(adminCashArqueos).omit({ id: true, createdAt: true });
export type InsertAdminCashArqueo = z.infer<typeof insertAdminCashArqueoSchema>;
export type AdminCashArqueo = typeof adminCashArqueos.$inferSelect;

export const adminCashConfig = pgTable("admin_cash_config", {
  id: serial("id").primaryKey(),
  fondoFijo: numeric("fondo_fijo", { precision: 14, scale: 2 }).default("0"),
  alertaBajo: numeric("alerta_bajo", { precision: 14, scale: 2 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Facturación Electrónica ──────────────────────────────────────────────────

export const billingConfig = pgTable("billing_config", {
  id: serial("id").primaryKey(),
  modoArca: boolean("modo_arca").default(false),
  arcaAmbiente: text("arca_ambiente").default("ficticio"),
  cuit: text("cuit").default("33-68110008-9"),
  razonSocial: text("razon_social").default("MARAN S.A."),
  domicilioComercial: text("domicilio_comercial").default("Alameda de la Federación 698"),
  localidad: text("localidad").default("Paraná"),
  provincia: text("provincia").default("Entre Ríos"),
  cp: text("cp").default("3100"),
  condicionIva: text("condicion_iva").default("Responsable Inscripto"),
  inicioActividades: text("inicio_actividades").default("01/01/2000"),
  iibb: text("iibb"),
  telefono: text("telefono"),
  puntoVenta: integer("punto_venta").default(1),
  puntoVentaHomolog: integer("punto_venta_homolog").default(99),
  tipoPuntoVenta: text("tipo_punto_venta").default("online"),
  arcaCert: text("arca_cert"),
  arcaKey: text("arca_key"),
  arcaCuit: text("arca_cuit"),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Token WSAA persistente (sobrevive restarts)
  arcaTaToken: text("arca_ta_token"),
  arcaTaSign: text("arca_ta_sign"),
  arcaTaExpiry: timestamp("arca_ta_expiry"),
  arcaTaAmbiente: text("arca_ta_ambiente"),
});

export const salesInvoices = pgTable("sales_invoices", {
  id: serial("id").primaryKey(),
  tipoComprobante: text("tipo_comprobante").notNull(),
  puntoVenta: integer("punto_venta").notNull(),
  numero: integer("numero").notNull(),
  fechaEmision: date("fecha_emision").notNull(),
  fechaVtoPago: date("fecha_vto_pago"),
  clienteRazonSocial: text("cliente_razon_social").notNull(),
  clienteCuit: text("cliente_cuit"),
  clienteDni: text("cliente_dni"),
  clienteCondicionIva: text("cliente_condicion_iva").notNull(),
  clienteDomicilio: text("cliente_domicilio"),
  montoNeto: numeric("monto_neto", { precision: 14, scale: 2 }).notNull(),
  montoIva21: numeric("monto_iva21", { precision: 14, scale: 2 }).default("0"),
  montoIva105: numeric("monto_iva105", { precision: 14, scale: 2 }).default("0"),
  montoExento: numeric("monto_exento", { precision: 14, scale: 2 }).default("0"),
  montoNoGravado: numeric("monto_no_gravado", { precision: 14, scale: 2 }).default("0"),
  montoTotal: numeric("monto_total", { precision: 14, scale: 2 }).notNull(),
  cae: text("cae"),
  caeFechaVto: date("cae_fecha_vto"),
  modoFicticio: boolean("modo_ficticio").default(true),
  estado: text("estado").default("emitida"),
  reservaId: varchar("reserva_id"),
  // Reservation payment claimed before ARCA.  Unlike invoice_ref (which is a
  // post-issuance display link), this is the durable ownership claim used to
  // resume an interrupted payment invoice without issuing another document.
  paymentId: varchar("payment_id"),
  // Group invoices persist their owner at issuance time. Linking the display
  // row afterwards is not enough to protect concurrent emissions.
  groupId: varchar("group_id"),
  // A group payment can fund at most one fiscal document. Kept separately
  // from group_payments.invoice_id so the claim exists before the UI link.
  groupPaymentId: varchar("group_payment_id"),
  // Durable collection intent captured before ARCA. It allows a confirmed
  // group invoice to finish linking even if the browser reloads after CAE.
  groupPaymentIntent: jsonb("group_payment_intent"),
  // Reservation credit consumption intent captured before ARCA. This is
  // deliberately separate from group semantics and remains immutable across
  // recovery retries.
  creditReapplicationIntent: jsonb("credit_reapplication_intent"),
  // SPA account that owns this invoice. Persisted at issuance so the later
  // account link cannot attach an unrelated same-value invoice.
  spaAccountId: varchar("spa_account_id"),
  folioId: integer("folio_id"),
  notaCreditoId: integer("nota_credito_id"),
  restaurantOrderId: varchar("restaurant_order_id"),
  montoAcreditado: numeric("monto_acreditado", { precision: 14, scale: 2 }).default("0"),
  concepto: text("concepto").default("2"),
  items: jsonb("items"),
  operador: text("operador"),
  cashFormaPago: text("cash_forma_pago"),
  sourceChargeIds: jsonb("source_charge_ids"), // IDs de cargos del folio incluidos en esta factura
  sourceChargeAmounts: jsonb("source_charge_amounts"), // importe facturado por cada cargo del folio
  observaciones: text("observaciones"),
  // Las NC de reserva se crean antes de pedir el CAE. Estos campos conservan
  // el estado de la compensación posterior contra la factura y el Folio para
  // que un reinicio no permita emitir una segunda NC.
  reconciliationStatus: text("reconciliation_status"),
  reconciliationError: text("reconciliation_error"),
  reconciliationUpdatedAt: timestamp("reconciliation_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSalesInvoiceSchema = createInsertSchema(salesInvoices).omit({ id: true, createdAt: true });
export type InsertSalesInvoice = z.infer<typeof insertSalesInvoiceSchema>;
export type SalesInvoice = typeof salesInvoices.$inferSelect;

export const invoiceCounters = pgTable("invoice_counters", {
  id: serial("id").primaryKey(),
  tipoComprobante: text("tipo_comprobante").notNull(),
  puntoVenta: integer("punto_venta").notNull(),
  ultimoNumero: integer("ultimo_numero").default(0),
});

// ─── Puntos de Venta ──────────────────────────────────────────────────────────
export const posConfigs = pgTable("pos_configs", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  numero: integer("numero").notNull(),
  area: text("area").notNull().default("general"),
  tipo: text("tipo").notNull().default("manual"),
  descripcion: text("descripcion"),
  activo: boolean("activo").default(true),
});
export const insertPosConfigSchema = createInsertSchema(posConfigs).omit({ id: true });
export type InsertPosConfig = z.infer<typeof insertPosConfigSchema>;
export type PosConfig = typeof posConfigs.$inferSelect;

// ─── Centros de Costo ──────────────────────────────────────────────────────────
// Lista gestionada de centros de costo (informativos, usados en Facturas de Compra).
// La agrupación del reporte "Costos por Departamento" NO usa esta tabla: se basa en el
// prefijo del código de la cuenta contable vinculada (ver accountingAccounts / server/reports/routes.ts).
export const costCenters = pgTable("cost_centers", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  activo: boolean("activo").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertCostCenterSchema = createInsertSchema(costCenters).omit({ id: true, createdAt: true });
export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;
export type CostCenter = typeof costCenters.$inferSelect;

export const reservationChangelog = pgTable("reservation_changelog", {
  id: serial("id").primaryKey(),
  reservationId: varchar("reservation_id").notNull().references(() => reservations.id),
  fecha: timestamp("fecha").defaultNow().notNull(),
  operador: text("operador"),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion").notNull(),
});

export const insertReservationChangelogSchema = createInsertSchema(reservationChangelog).omit({ id: true, fecha: true });
export type InsertReservationChangelog = z.infer<typeof insertReservationChangelogSchema>;
export type ReservationChangelog = typeof reservationChangelog.$inferSelect;

export type LostFoundStatus = "en_custodia" | "contactado" | "entregado" | "descartado";
export type LostFoundCategory = "ropa" | "electronica" | "documento" | "accesorio" | "otro";

export const lostFoundItems = pgTable("lost_found_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codigo: text("codigo").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").$type<LostFoundCategory>().notNull().default("otro"),
  location: text("location").notNull(),
  foundDate: date("found_date").notNull(),
  foundBy: text("found_by").notNull(),
  storageLocation: text("storage_location"),
  status: text("status").$type<LostFoundStatus>().notNull().default("en_custodia"),
  guestId: varchar("guest_id"),
  reservationId: varchar("reservation_id"),
  notes: text("notes"),
  claimedBy: text("claimed_by"),
  claimedDate: date("claimed_date"),
  deliveryType: text("delivery_type"),
  deliveredBy: text("delivered_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLostFoundSchema = createInsertSchema(lostFoundItems).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertLostFound = z.infer<typeof insertLostFoundSchema>;
export type LostFoundItem = typeof lostFoundItems.$inferSelect;

// ==================== SYSTEM INCIDENTS ====================
export type IncidentSeverity = "baja" | "media" | "alta" | "critica";
export type IncidentStatus = "pendiente" | "en_revision" | "resuelto" | "descartado";
export type IncidentModule =
  | "planning" | "reservas" | "check-in" | "check-out"
  | "grupos" | "restaurant" | "spa" | "eventos"
  | "housekeeping" | "hospitalidad" | "inventario"
  | "cajas" | "reportes" | "administracion" | "otro";

export const systemIncidents = pgTable("system_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  module: text("module").$type<IncidentModule>().notNull().default("otro"),
  severity: text("severity").$type<IncidentSeverity>().notNull().default("media"),
  status: text("status").$type<IncidentStatus>().notNull().default("pendiente"),
  reportedBy: text("reported_by").notNull(),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  assignedTo: text("assigned_to"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemIncidentSchema = createInsertSchema(systemIncidents).omit({
  id: true, createdAt: true, updatedAt: true, resolvedAt: true,
});
export type InsertSystemIncident = z.infer<typeof insertSystemIncidentSchema>;
export type SystemIncident = typeof systemIncidents.$inferSelect;

// ==================== MANTENIMIENTO PREVENTIVO ====================
export type PreventiveFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "biannual" | "annual" | "custom";

export const preventiveTasks = pgTable("preventive_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  frequency: text("frequency").$type<PreventiveFrequency>().notNull().default("monthly"),
  frequencyDays: integer("frequency_days").notNull().default(30),
  lastDoneAt: date("last_done_at"),
  nextDueAt: date("next_due_at").notNull(),
  assignedTo: varchar("assigned_to", { length: 255 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPreventiveTaskSchema = createInsertSchema(preventiveTasks).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertPreventiveTask = z.infer<typeof insertPreventiveTaskSchema>;
export type PreventiveTask = typeof preventiveTasks.$inferSelect;

// ==================== MOTOR FINANCIERO — FOLIOS ====================
export type FolioEntityType =
  | "reservation" | "restaurant_order" | "spa_account"
  | "group" | "event" | "company" | "agency";

export type FolioStatus = "open" | "closed" | "invoiced";

export type FolioMovementType =
  | "charge" | "payment" | "advance" | "discount"
  | "adjustment" | "transfer_in" | "transfer_out" | "void";

export const folios = pgTable("folios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codigo: text("codigo").notNull().unique(),
  entityType: text("entity_type").$type<FolioEntityType>().notNull(),
  entityId: varchar("entity_id").notNull(),
  status: text("status").$type<FolioStatus>().notNull().default("open"),
  totalCharges: decimal("total_charges", { precision: 12, scale: 2 }).default("0"),
  totalPayments: decimal("total_payments", { precision: 12, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0"),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolioSchema = createInsertSchema(folios).omit({ id: true, createdAt: true });
export type InsertFolio = z.infer<typeof insertFolioSchema>;
export type Folio = typeof folios.$inferSelect;

export const folioMovements = pgTable("folio_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folioId: varchar("folio_id").notNull().references(() => folios.id),
  type: text("type").$type<FolioMovementType>().notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  sourceType: text("source_type"),
  sourceId: varchar("source_id"),
  paymentMethod: text("payment_method"),
  cashMovementId: varchar("cash_movement_id"),
  relatedFolioId: varchar("related_folio_id"),
  voidedMovementId: varchar("voided_movement_id"),
  voidReason: text("void_reason"),
  registeredBy: text("registered_by"),
  receiptType: text("receipt_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolioMovementSchema = createInsertSchema(folioMovements).omit({ id: true, createdAt: true });
export type InsertFolioMovement = z.infer<typeof insertFolioMovementSchema>;
export type FolioMovement = typeof folioMovements.$inferSelect;

export type FolioWithMovements = Folio & { movements: FolioMovement[] };

// ==================== NIGHT AUDIT ====================
export type NightAuditStatus = "success" | "partial" | "failed";

export const planningDayNotes = pgTable("planning_day_notes", {
  date: text("date").primaryKey(),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type PlanningDayNote = typeof planningDayNotes.$inferSelect;

export const nightAuditLogs = pgTable("night_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditDate: date("audit_date").notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  executedBy: text("executed_by").notNull().default("sistema"),
  isManual: boolean("is_manual").notNull().default(false),
  reservationsProcessed: integer("reservations_processed").notNull().default(0),
  reservationsSkipped: integer("reservations_skipped").notNull().default(0),
  totalPosted: decimal("total_posted", { precision: 12, scale: 2 }).notNull().default("0"),
  arrivalsNextDay: integer("arrivals_next_day").notNull().default(0),
  arrivalsWithPrepago: integer("arrivals_with_prepago").notNull().default(0),
  arrivalsWithoutPrepago: integer("arrivals_without_prepago").notNull().default(0),
  status: text("status").$type<NightAuditStatus>().notNull().default("success"),
  notes: text("notes"),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNightAuditLogSchema = createInsertSchema(nightAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertNightAuditLog = z.infer<typeof insertNightAuditLogSchema>;
export type NightAuditLog = typeof nightAuditLogs.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Email / Respuestas Automáticas
// ─────────────────────────────────────────────────────────────────────────────

// Single-row config table (id = 1 always)
export const emailConfig = pgTable("email_config", {
  id: serial("id").primaryKey(),
  globalEnabled: boolean("global_enabled").notNull().default(false),
  provider: text("provider").notNull().default("resend"), // "resend" | "smtp"
  apiKey: text("api_key"),
  fromEmail: text("from_email").notNull().default("reservas@maransuites.com"),
  fromName: text("from_name").notNull().default("Maran Suites & Towers"),
  googleMapsUrl: text("google_maps_url"),
  // SMTP / Gmail settings
  smtpHost: text("smtp_host").default("smtp.gmail.com"),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpSecure: boolean("smtp_secure").default(false),
  // Confirmation email
  confirmationEnabled: boolean("confirmation_enabled").notNull().default(true),
  confirmationSubject: text("confirmation_subject").notNull().default("Confirmación de tu reserva — Maran Suites & Towers"),
  confirmationBody: text("confirmation_body").notNull().default("Hola {nombre_huesped},\n\nTu reserva ha sido confirmada. Te esperamos el {fecha_checkin} en la habitación {numero_habitacion}.\n\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\nHabitaciones: {numero_habitacion}\n\n¡Nos vemos pronto!\nMaran Suites & Towers"),
  // 2-day reminder email
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  reminderSubject: text("reminder_subject").notNull().default("Tu estadía se acerca — Maran Suites & Towers"),
  reminderBody: text("reminder_body").notNull().default("Hola {nombre_huesped},\n\nTe recordamos que en 2 días comenzás tu estadía en Maran Suites & Towers.\n\nCheck-in: {fecha_checkin}\nCheck-out: {fecha_checkout}\nHabitación: {numero_habitacion}\n\n¡Te esperamos!\nMaran Suites & Towers"),
  // Post-checkout + survey email
  checkoutEnabled: boolean("checkout_enabled").notNull().default(true),
  checkoutSubject: text("checkout_subject").notNull().default("Gracias por tu estadía — Contanos tu experiencia"),
  checkoutBody: text("checkout_body").notNull().default("Hola {nombre_huesped},\n\nGracias por elegir Maran Suites & Towers. Esperamos que hayas disfrutado tu estadía.\n\nNos encantaría conocer tu experiencia. Completá nuestra encuesta rápida (menos de 2 minutos):\n\n{link_encuesta}\n\nSi tu estadía fue excelente, también podés dejarnos una reseña en Google Maps:\n{link_google_maps}\n\n¡Hasta la próxima!\nMaran Suites & Towers"),
  // Email design images (stored as base64 data URLs, served via /api/public/email-images/:type)
  emailBannerBase64: text("email_banner_base64"),
  emailFooterBase64: text("email_footer_base64"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmailConfig = typeof emailConfig.$inferSelect;

// Email send log
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id"),
  type: text("type").notNull(), // "confirmation" | "reminder" | "checkout"
  status: text("status").notNull(), // "sent" | "failed" | "skipped"
  recipientEmail: text("recipient_email"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export type EmailLog = typeof emailLogs.$inferSelect;

// Survey tokens (one per checkout)
export const surveyTokens = pgTable("survey_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull(),
  token: varchar("token").notNull().unique(),
  completed: boolean("completed").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SurveyToken = typeof surveyTokens.$inferSelect;

// Survey responses
export const surveyResponses = pgTable("survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyTokenId: varchar("survey_token_id").notNull().references(() => surveyTokens.id),
  ratingOverall: integer("rating_overall").notNull(),    // 1-5
  ratingRoom: integer("rating_room").notNull(),
  ratingCleanliness: integer("rating_cleanliness").notNull(),
  ratingService: integer("rating_service").notNull(),
  ratingFood: integer("rating_food"),                    // optional
  comment: text("comment"),
  guestName: text("guest_name"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;

// ==================== PRESUPUESTOS ====================
export type PresupuestoEstado = "borrador" | "enviado" | "aceptado" | "vencido" | "cancelado";
export type PresupuestoSector = "alojamiento" | "restaurant" | "spa" | "evento" | "otro";

export const presupuestos = pgTable("presupuestos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  numero: varchar("numero").notNull(),
  para: text("para").notNull(),
  cuit: text("cuit"),
  direccion: text("direccion"),
  contacto: text("contacto"),
  clienteType: varchar("cliente_type").default("libre"),
  clienteId: varchar("cliente_id"),
  fechaEmision: varchar("fecha_emision").notNull(),
  fechaVencimiento: varchar("fecha_vencimiento"),
  fechaEvento: varchar("fecha_evento"),
  fechaFin: varchar("fecha_fin"),
  estado: varchar("estado").$type<PresupuestoEstado>().notNull().default("borrador"),
  notas: text("notas"),
  condiciones: text("condiciones"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  descuentoGlobal: numeric("descuento_global", { precision: 5, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  areaOrigen: varchar("area_origen").default("grupos"),
  participantes: integer("participantes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPresupuestoSchema = createInsertSchema(presupuestos).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertPresupuesto = z.infer<typeof insertPresupuestoSchema>;
export type Presupuesto = typeof presupuestos.$inferSelect;

export const presupuestoItems = pgTable("presupuesto_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  presupuestoId: varchar("presupuesto_id").notNull().references(() => presupuestos.id, { onDelete: "cascade" }),
  sector: varchar("sector").$type<PresupuestoSector>().notNull().default("otro"),
  category: varchar("category"),
  descripcion: text("descripcion").notNull(),
  detalle: text("detalle"),
  cantidad: numeric("cantidad", { precision: 8, scale: 2 }).notNull().default("1"),
  // Cantidad de habitaciones (solo relevante para ítems de sector "alojamiento"): el subtotal
  // multiplica cantidadHabitaciones × cantidad(noches) × precioUnitario. Default "1" preserva
  // el cálculo anterior para ítems ya existentes y para otros sectores.
  cantidadHabitaciones: numeric("cantidad_habitaciones", { precision: 8, scale: 2 }).notNull().default("1"),
  precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }).notNull().default("0"),
  descuento: numeric("descuento", { precision: 5, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  orden: integer("orden").notNull().default(0),
});

export const insertPresupuestoItemSchema = createInsertSchema(presupuestoItems).omit({ id: true });
export type InsertPresupuestoItem = z.infer<typeof insertPresupuestoItemSchema>;
export type PresupuestoItem = typeof presupuestoItems.$inferSelect;

export type PresupuestoWithItems = Presupuesto & { items: PresupuestoItem[] };

// ==================== QUOTE CATALOG ITEMS ====================
export const quoteCatalogItems = pgTable("quote_catalog_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  area: varchar("area").notNull(),
  category: varchar("category").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  priceSpecial: numeric("price_special", { precision: 12, scale: 2 }),
  unit: varchar("unit", { length: 100 }).notNull().default("por persona"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});
export const insertQuoteCatalogItemSchema = createInsertSchema(quoteCatalogItems).omit({ id: true });
export type InsertQuoteCatalogItem = z.infer<typeof insertQuoteCatalogItemSchema>;
export type QuoteCatalogItem = typeof quoteCatalogItems.$inferSelect;

// ==================== QUOTE CONDITIONS ====================
export const quoteConditions = pgTable("quote_conditions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  area: varchar("area").notNull().unique(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type QuoteConditions = typeof quoteConditions.$inferSelect;

// Reservation Companions
export const reservationCompanions = pgTable("reservation_companions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  documentType: varchar("document_type", { length: 20 }).notNull().default("DNI"),
  documentNumber: varchar("document_number", { length: 50 }),
  dateOfBirth: date("date_of_birth"),
  nationality: varchar("nationality", { length: 100 }),
  guestId: varchar("guest_id").references(() => guests.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReservationCompanionSchema = createInsertSchema(reservationCompanions).omit({ id: true, createdAt: true });
export type InsertReservationCompanion = z.infer<typeof insertReservationCompanionSchema>;
export type ReservationCompanion = typeof reservationCompanions.$inferSelect;

// ==================== ELEMENTOS PRESTADOS ====================
export const loanItems = pgTable("loan_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  totalQuantity: integer("total_quantity").notNull().default(1),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});
export const insertLoanItemSchema = createInsertSchema(loanItems).omit({ id: true });
export type InsertLoanItem = z.infer<typeof insertLoanItemSchema>;
export type LoanItem = typeof loanItems.$inferSelect;

// ==================== BACKUP LOGS ====================
export const backupLogs = pgTable("backup_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "scheduled" | "manual_email" | "manual_download" | "restore_test"
  status: text("status").notNull(), // "success" | "error" | "skipped"
  destination: text("destination"), // email address or null
  fileSizeBytes: integer("file_size_bytes"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type BackupLog = typeof backupLogs.$inferSelect;

export const itemLoans = pgTable("item_loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loanItemId: varchar("loan_item_id").notNull().references(() => loanItems.id),
  roomNumber: text("room_number").notNull(),
  quantity: integer("quantity").notNull().default(1),
  lentAt: timestamp("lent_at").defaultNow(),
  returnedAt: timestamp("returned_at"),
  notes: text("notes"),
  registeredBy: text("registered_by"),
});
export const insertItemLoanSchema = createInsertSchema(itemLoans).omit({ id: true, lentAt: true, returnedAt: true });
export type InsertItemLoan = z.infer<typeof insertItemLoanSchema>;
export type ItemLoan = typeof itemLoans.$inferSelect;
export type ItemLoanWithItem = ItemLoan & { loanItem: LoanItem };

// ── Gift Vouchers ──────────────────────────────────────────────────────────────
export type GiftVoucherArea = "alojamiento" | "restaurant" | "spa" | "otro";
export type GiftVoucherStatus = "activo" | "usado" | "vencido" | "cancelado";
export type GiftVoucherValueType = "monetario" | "descriptivo";

export const giftVouchers = pgTable("gift_vouchers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  voucherCode: text("voucher_code").notNull().unique(),
  area: text("area").$type<GiftVoucherArea>().notNull(),
  description: text("description").notNull(),
  valueType: text("value_type").$type<GiftVoucherValueType>().notNull().default("monetario"),
  valueAmount: decimal("value_amount", { precision: 10, scale: 2 }),
  buyerName: text("buyer_name").notNull(),
  buyerPhone: text("buyer_phone"),
  buyerEmail: text("buyer_email"),
  beneficiaryName: text("beneficiary_name"),
  status: text("status").$type<GiftVoucherStatus>().notNull().default("activo"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: date("expires_at"),
  usedAt: timestamp("used_at"),
  usedBy: text("used_by"),
  usedNotes: text("used_notes"),
  pricePaid: decimal("price_paid", { precision: 10, scale: 2 }),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  createdBy: text("created_by"),
});

export const insertGiftVoucherSchema = createInsertSchema(giftVouchers).omit({ id: true, issuedAt: true, usedAt: true });
export type InsertGiftVoucher = z.infer<typeof insertGiftVoucherSchema>;
export type GiftVoucher = typeof giftVouchers.$inferSelect;

// ==================== TOMA DE INVENTARIO ====================
export const inventoryCounts = pgTable("inventory_counts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  area: text("area"),                          // null = todos los artículos
  status: text("status").notNull().default("borrador"), // "borrador" | "cerrado"
  notes: text("notes"),
  createdBy: text("created_by"),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type InventoryCount = typeof inventoryCounts.$inferSelect;
export type InsertInventoryCount = typeof inventoryCounts.$inferInsert;

export const inventoryCountItems = pgTable("inventory_count_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countId: varchar("count_id").notNull(),
  itemId: varchar("item_id").notNull(),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull().default("unidad"),
  expectedStock: decimal("expected_stock", { precision: 10, scale: 3 }).notNull().default("0"),
  actualStock: decimal("actual_stock", { precision: 10, scale: 3 }),
  notes: text("notes"),
});
export type InventoryCountItem = typeof inventoryCountItems.$inferSelect;
export type InsertInventoryCountItem = typeof inventoryCountItems.$inferInsert;

// ==================== INTERNAL MOVEMENTS (Movimientos Internos / Vouchers de descarga) ====================

export const internalMovements = pgTable("internal_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  motivo: text("motivo").notNull(), // desayuno | evento | desperdicio | otro
  descripcion: text("descripcion"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type InternalMovement = typeof internalMovements.$inferSelect;

export const internalMovementItems = pgTable("internal_movement_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  movementId: varchar("movement_id").notNull(),
  itemId: varchar("item_id").notNull(),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull().default("unidad"),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
});
export type InternalMovementItem = typeof internalMovementItems.$inferSelect;
