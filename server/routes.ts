        montoNoGravado: rawInvoice.monto_no_gravado,
        impuestosInternos: rawInvoice.impuestos_internos,
        ley25413: rawInvoice.ley_25413,
        percepcionIibb: rawInvoice.percepcion_iibb,
        percepcionIva: rawInvoice.percepcion_iva,
        percepcionGanancias: rawInvoice.percepcion_ganancias,
        retencionIibb: rawInvoice.retencion_iibb,
        retencionGanancias: rawInvoice.retencion_ganancias,
        retencionIva: rawInvoice.retencion_iva,
        retencionSuss: rawInvoice.retencion_suss,
        retencionMunicipal: rawInvoice.retencion_municipal,
        monotributoCompBC: rawInvoice.monotributo_comp_bc,
        montoTotal: rawInvoice.monto_total,
        cuentaContableId: rawInvoice.cuenta_contable_id,
        centroCosto: rawInvoice.centro_costo,
        estado: rawInvoice.estado,
        asientoId: rawInvoice.asiento_id,
        observaciones: rawInvoice.observaciones,
        subtipoRetencion: rawInvoice.subtipo_retencion,
        createdAt: rawInvoice.created_at,
        updatedAt: rawInvoice.updated_at,
      };

      // Generar asiento automático
      try {
        const entryId = await generarAsiento(invoice);
        await db.execute(sql`UPDATE purchase_invoices SET asiento_id = ${entryId} WHERE id = ${invoice.id}`);
        invoice.asientoId = entryId;
      } catch (ae) {
        console.error("Error generando asiento:", ae);
      }

      // Si tiene retención IIBB → insertar en iibb_retentions
      if (
        n("retencionIibb") > 0 &&
        body.supplierId &&
        shouldRegisterPracticedIibbRetention(body.tipoComprobante)
      ) {
        try {
          const nroRes = await db.execute(sql`SELECT COALESCE(MAX(nro_constancia), 0) + 1 AS next FROM iibb_retentions`);
          const nroConstancia = (nroRes.rows[0] as any).next;
          await db.execute(sql`
            INSERT INTO iibb_retentions (nro_constancia, supplier_id, cuit_proveedor, fecha_retencion, fecha_comprobante, nro_comprobante, letra_factura, importe_base, alicuota, importe_retenido, invoice_id)
            VALUES (${nroConstancia}, ${body.supplierId}, ${body.proveedorCuit||""}, ${body.fechaEmision}, ${body.fechaEmision}, ${parseInt(body.numeroComprobante)||0}, ${body.tipoComprobante?.slice(-1)||null}, ${n("montoNeto")}, ${body.alicuotaIibbProveedor||0}, ${n("retencionIibb")}, ${invoice.id})
          `);
        } catch (re) {
          console.error("Error inserting iibb_retention:", re);
        }
      }

      res.status(201).json(rawInvoice);
    } catch (e: any) {
      res.status(e?.statusCode || 500).json({ error: e.message });
    }
  });

  app.patch("/api/purchase-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await db.execute(sql`SELECT estado, tipo_comprobante FROM purchase_invoices WHERE id = ${id}`);
      if (!existing.rows.length) return res.status(404).json({ error: "Comprobante no encontrado" });
      if ((existing.rows[0] as any).estado !== "pendiente") {
        return res.status(403).json({ error: "Solo se pueden editar comprobantes pendientes" });
      }
      const tipoComprobante = (existing.rows[0] as any).tipo_comprobante;
      const body = normalizeReceivedRetentionAmounts(req.body, tipoComprobante);
      if (isReceivedRetention(tipoComprobante)) {
        body.cuentaContableId = await resolveReceivedRetentionAccountId(body);
      }

      // ── Validar centro de costo contra la lista gestionada ─────────────────
      const centroCosto = body.centroCosto ? String(body.centroCosto).trim() || null : null;
      if (centroCosto && !(await isValidCentroCosto(centroCosto))) {
        return res.status(400).json({
          error: `El centro de costo "${centroCosto}" no existe o está inactivo. Elegí uno de la lista de centros de costo.`,
        });
      }

      const n = (k: string) => parseFloat(body[k] || "0") || 0;
      const montoTotal = calculatePurchaseInvoiceTotal({ ...body, tipoComprobante });
      const updatedInvoice = await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          UPDATE purchase_invoices SET
            monto_neto = ${n("montoNeto")}, monto_iva21 = ${n("montoIva21")},
            monto_iva105 = ${n("montoIva105")}, monto_iva27 = ${n("montoIva27")},
            monto_iva5 = ${n("montoIva5")}, monto_iva25 = ${n("montoIva25")},
            monto_exento = ${n("montoExento")}, monto_no_gravado = ${n("montoNoGravado")},
            impuestos_internos = ${n("impuestosInternos")}, ley_25413 = ${n("ley25413")},
            percepcion_iibb = ${n("percepcionIibb")}, percepcion_iva = ${n("percepcionIva")},
            percepcion_ganancias = ${n("percepcionGanancias")},
            retencion_iibb = ${n("retencionIibb")}, retencion_ganancias = ${n("retencionGanancias")},
            retencion_iva = ${n("retencionIva")}, retencion_suss = ${n("retencionSuss")},
            monto_total = ${montoTotal}, cuenta_contable_id = ${body.cuentaContableId||null},
            centro_costo = ${centroCosto}, observaciones = ${body.observaciones||null},
            subtipo_retencion = ${body.subtipoRetencion||null},
            updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `);
        const raw = result.rows[0] as any;
        const previousEntryId = raw.asiento_id;
        const invoiceForEntry: any = {
          id: raw.id,
          tipoComprobante: raw.tipo_comprobante,
          supplierId: raw.supplier_id,
          proveedorNombre: raw.proveedor_nombre,
          proveedorCuit: raw.proveedor_cuit,
          puntoVenta: raw.punto_venta,
          numeroComprobante: raw.numero_comprobante,
          numeroComprobanteExt: raw.numero_comprobante_ext,
          fechaEmision: raw.fecha_emision,
          periodo: raw.periodo,
          condicionPago: raw.condicion_pago,
          montoNeto: raw.monto_neto,
          montoIva27: raw.monto_iva27,
          montoIva21: raw.monto_iva21,
          montoIva105: raw.monto_iva105,
          montoIva5: raw.monto_iva5,
          montoIva25: raw.monto_iva25,
          montoExento: raw.monto_exento,
          montoNoGravado: raw.monto_no_gravado,
          impuestosInternos: raw.impuestos_internos,
          ley25413: raw.ley_25413,
          percepcionIibb: raw.percepcion_iibb,
          percepcionIva: raw.percepcion_iva,
          percepcionGanancias: raw.percepcion_ganancias,
          retencionIibb: raw.retencion_iibb,
          retencionGanancias: raw.retencion_ganancias,
          retencionIva: raw.retencion_iva,
          retencionSuss: raw.retencion_suss,
          montoTotal: raw.monto_total,
          cuentaContableId: raw.cuenta_contable_id,
          centroCosto: raw.centro_costo,
          estado: raw.estado,
          observaciones: raw.observaciones,
          subtipoRetencion: raw.subtipo_retencion,
        };

        const entryId = await generarAsiento(invoiceForEntry, tx);
        await tx.execute(sql`UPDATE purchase_invoices SET asiento_id = ${entryId} WHERE id = ${id}`);
        if (previousEntryId && previousEntryId !== entryId) {
          await tx.execute(sql`DELETE FROM accounting_entry_lines WHERE entry_id = ${previousEntryId}`);
          await tx.execute(sql`DELETE FROM accounting_entries WHERE id = ${previousEntryId}`);
        }

        if (!shouldRegisterPracticedIibbRetention(tipoComprobante)) {
          await tx.execute(sql`DELETE FROM iibb_retentions WHERE invoice_id = ${id}`);
        } else if (n("retencionIibb") <= 0) {
          await tx.execute(sql`DELETE FROM iibb_retentions WHERE invoice_id = ${id}`);
        } else {
          const retained = await tx.execute(sql`SELECT id FROM iibb_retentions WHERE invoice_id = ${id} LIMIT 1`);
          if (retained.rows.length) {
            await tx.execute(sql`
              UPDATE iibb_retentions SET
                cuit_proveedor = ${raw.proveedor_cuit || ""},
                fecha_retencion = ${raw.fecha_emision},
                fecha_comprobante = ${raw.fecha_emision},
                nro_comprobante = ${parseInt(raw.numero_comprobante) || 0},
                letra_factura = ${tipoComprobante.slice(-1) || null},
                importe_base = ${n("montoNeto")},
                importe_retenido = ${n("retencionIibb")}
              WHERE invoice_id = ${id}
            `);
          } else if (raw.supplier_id) {
            const nroRes = await tx.execute(sql`SELECT COALESCE(MAX(nro_constancia), 0) + 1 AS next FROM iibb_retentions`);
            const nroConstancia = (nroRes.rows[0] as any).next;
            await tx.execute(sql`
              INSERT INTO iibb_retentions (
                nro_constancia, supplier_id, cuit_proveedor, fecha_retencion, fecha_comprobante,
                nro_comprobante, letra_factura, importe_base, alicuota, importe_retenido, invoice_id
              ) VALUES (
                ${nroConstancia}, ${raw.supplier_id}, ${raw.proveedor_cuit || ""}, ${raw.fecha_emision},
                ${raw.fecha_emision}, ${parseInt(raw.numero_comprobante) || 0},
                ${tipoComprobante.slice(-1) || null}, ${n("montoNeto")},
                ${body.alicuotaIibbProveedor || 0}, ${n("retencionIibb")}, ${id}
              )
            `);
          }
        }

        return { ...raw, asiento_id: entryId };
      });
      res.json(updatedInvoice);
    } catch (e: any) {
      res.status(e?.statusCode || 500).json({ error: e.message });
    }
  });

  app.delete("/api/purchase-invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.execute(sql`UPDATE purchase_invoices SET estado = 'anulado' WHERE id = ${id}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Endpoint temporal de limpieza — solo admin
  app.delete("/api/admin/purchase-invoices/truncate-all", requireAuth, async (req, res) => {
    try {
      if ((req.user as any)?.role !== "admin") {
        return res.status(403).json({ error: "Solo administradores" });
      }
      // Borrar en orden para respetar foreign keys
      await db.execute(sql`DELETE FROM iibb_retentions`);
      await db.execute(sql`UPDATE admin_cash_movements SET payment_order_id = NULL WHERE payment_order_id IS NOT NULL`);
      await db.execute(sql`DELETE FROM payment_order_items`);
      await db.execute(sql`DELETE FROM payment_orders`);
      await db.execute(sql`DELETE FROM purchase_invoices`);
      res.json({ ok: true, mensaje: "Comprobantes y órdenes de pago eliminados." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MÓDULO CONTABLE — Órdenes de Pago
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/payment-orders", requireAuth, async (req, res) => {
    try {
      const { supplierId } = req.query;
      let q = sql`
        SELECT po.*, s.razon_social AS supplier_nombre
        FROM payment_orders po
        JOIN accounting_suppliers s ON s.id = po.supplier_id
        WHERE 1=1
      `;
      if (supplierId) {
        const result = await db.execute(sql`
          SELECT po.*, s.razon_social AS supplier_nombre
          FROM payment_orders po JOIN accounting_suppliers s ON s.id = po.supplier_id
          WHERE po.supplier_id = ${parseInt(supplierId as string)}
          ORDER BY po.fecha DESC
        `);
        return res.json(result.rows);
      }
      const result = await db.execute(sql`
        SELECT po.*, s.razon_social AS supplier_nombre
        FROM payment_orders po JOIN accounting_suppliers s ON s.id = po.supplier_id
        ORDER BY po.fecha DESC
      `);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/payment-orders", requireAuth, async (req, res) => {
    try {
      const { supplierId, fecha, facturaIds, retencionIibb, retencionGanancias,
        retencionIva, retencionProfLibs, compensacion, formaPago, depBancario,
        efectivo, cheques, observaciones, alicuotaIibb } = req.body;

      if (!supplierId || !facturaIds?.length) {
        return res.status(400).json({ error: "Proveedor y facturas son requeridos" });
      }

      // Verificar facturas — usar IN con valores sanitizados para evitar "malformed array literal"
      const idsInt = facturaIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
      if (idsInt.length === 0) {
        return res.status(400).json({ error: "IDs de facturas inválidos" });
      }
      const idsSQL = sql.raw(idsInt.join(","));
      const facturasRes = await db.execute(sql`
        SELECT id, monto_total, monto_neto, tipo_comprobante, estado, supplier_id FROM purchase_invoices
        WHERE id IN (${idsSQL}) AND supplier_id = ${supplierId} AND estado = 'pendiente'
      `);
      if (facturasRes.rows.length !== idsInt.length) {
        const idsEncontrados = facturasRes.rows.map((r: any) => Number(r.id));
        const todosRes = await db.execute(sql`SELECT id, estado FROM purchase_invoices WHERE id IN (${idsSQL})`);
        const noEncontradas = idsInt.filter((id: number) => !todosRes.rows.find((r: any) => Number(r.id) === id));
        const noPendientes = todosRes.rows
          .filter((r: any) => r.estado !== "pendiente" && !idsEncontrados.includes(Number(r.id)))
          .map((r: any) => `#${r.id} (${r.estado})`);
        let errorMsg = "No se pudo generar la OP: ";
        if (noEncontradas.length > 0) errorMsg += `Facturas no encontradas: ${noEncontradas.join(", ")}. `;
        if (noPendientes.length > 0) errorMsg += `Facturas no pendientes: ${noPendientes.join(", ")}. `;
        if (noEncontradas.length === 0 && noPendientes.length === 0) errorMsg += `Proveedor no coincide con las facturas seleccionadas (supplierId: ${supplierId}).`;
        return res.status(400).json({ error: errorMsg });
      }

      // Calcular totales — las NC (Notas de Crédito) restan del total a abonar
      const isNC = (r: any) => (r.tipo_comprobante || "").startsWith("NC");
      const totalFacturas = facturasRes.rows.reduce((s: number, r: any) =>
        isNC(r) ? s - parseFloat(r.monto_total) : s + parseFloat(r.monto_total), 0);
      const baseNetosIibb = facturasRes.rows.reduce((s: number, r: any) =>
        isNC(r) ? s : s + parseFloat(r.monto_neto || "0"), 0);
      const retIibb = parseFloat(retencionIibb || "0");
      const retGan = parseFloat(retencionGanancias || "0");
      const retIva = parseFloat(retencionIva || "0");
      const retProf = parseFloat(retencionProfLibs || "0");
      const comp = parseFloat(compensacion || "0");
      const totalAbonado = totalFacturas - retIibb - retGan - retIva - retProf - comp;

      // Número de OP autoincremental
      const numRes = await db.execute(sql`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 2) AS INTEGER)), 0) + 1 AS next FROM payment_orders
      `);
      const nextNum = (numRes.rows[0] as any).next as number;
      const numero = `000-${String(nextNum).padStart(8, "0")}`;

      // Insertar OP
      const dep = parseFloat(depBancario || "0");
      const ef = parseFloat(efectivo || "0");
      const ch = parseFloat(cheques || "0");
      const opRes = await db.execute(sql`
        INSERT INTO payment_orders (numero, supplier_id, fecha, forma_pago, dep_bancario, efectivo, cheques, total_facturas, retencion_iibb, retencion_ganancias, retencion_iva, retencion_prof_libs, compensacion, total_abonado, observaciones, alicuota_iibb_op)
        VALUES (${numero}, ${supplierId}, ${fecha || getArgentinaToday()}, ${formaPago||"transferencia"}, ${dep}, ${ef}, ${ch}, ${totalFacturas}, ${retIibb}, ${retGan}, ${retIva}, ${retProf}, ${comp}, ${totalAbonado}, ${observaciones||null}, ${parseFloat(alicuotaIibb||"0")||null})
        RETURNING *
      `);
      const op = opRes.rows[0] as any;

      // Marcar facturas como pagadas e insertar ítems
      // Las NC se insertan con importe_cancelado negativo (reducen el total de la OP)
      for (const fid of idsInt) {
        const factura = facturasRes.rows.find((r: any) => Number(r.id) === fid) as any;
        const importeCancelado = isNC(factura)
          ? -Math.abs(parseFloat(factura.monto_total))
          : parseFloat(factura.monto_total);
        await db.execute(sql`UPDATE purchase_invoices SET estado = 'pagado' WHERE id = ${fid}`);
        await db.execute(sql`
          INSERT INTO payment_order_items (payment_order_id, invoice_id, importe_cancelado)
          VALUES (${op.id}, ${fid}, ${importeCancelado})
        `);
      }

      // Generar asiento contable
      try {
        const supplier = await db.execute(sql`SELECT razon_social FROM accounting_suppliers WHERE id = ${supplierId}`);
        const entryId = await generarAsientoOP({ ...op, supplier: supplier.rows[0] as any });
        await db.execute(sql`UPDATE payment_orders SET asiento_id = ${entryId} WHERE id = ${op.id}`);
      } catch (ae) { console.error("Error generando asiento OP:", ae); }

      // Insertar retención IIBB si corresponde
      if (retIibb > 0) {
        try {
          const nroRes = await db.execute(sql`SELECT COALESCE(MAX(nro_constancia), 0) + 1 AS next FROM iibb_retentions`);
          const nroConstancia = (nroRes.rows[0] as any).next;
          const sup = await db.execute(sql`SELECT cuit FROM accounting_suppliers WHERE id = ${supplierId}`);
          const cuit = (sup.rows[0] as any)?.cuit || "";
          await db.execute(sql`
            INSERT INTO iibb_retentions (nro_constancia, supplier_id, cuit_proveedor, fecha_retencion, fecha_comprobante, nro_comprobante, importe_base, alicuota, importe_retenido)
            VALUES (${nroConstancia}, ${supplierId}, ${cuit}, ${fecha||getArgentinaToday()}, ${fecha||getArgentinaToday()}, ${nextNum}, ${baseNetosIibb > 0 ? baseNetosIibb : totalFacturas}, ${parseFloat(alicuotaIibb||"0") || 0}, ${retIibb})
          `);
        } catch (re) { console.error("Error inserting iibb_retention for OP:", re); }
      }

      // Retornar OP completa con facturas
      res.status(201).json({ ...op, facturas: facturasRes.rows, numero });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Accounting accounts (plan de cuentas)
  // Roles habilitados para administrar el plan de cuentas y los centros de costo
  // (mismo criterio que el ítem "Plan de Cuentas"/"Centros de Costo" del sidebar).
  const ACCOUNTING_ADMIN_ROLES = ["admin", "resp_administracion"];
  // Por defecto solo devuelve las cuentas activas (para selects en formularios).
  // ?all=1 devuelve también las inactivas (para la pantalla de administración del plan de cuentas).
  app.get("/api/accounting-accounts", requireAuth, async (req, res) => {
    try {
      const includeInactive = req.query.all === "1" || req.query.all === "true";
      if (includeInactive && !ACCOUNTING_ADMIN_ROLES.includes((req.user as Express.User).role)) {
        return res.status(403).json({ error: "No autorizado para esta acción" });
      }
      const result = includeInactive
        ? await db.execute(sql`SELECT * FROM accounting_accounts ORDER BY codigo`)
        : await db.execute(sql`SELECT * FROM accounting_accounts WHERE activo = true ORDER BY codigo`);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/accounting-accounts", requireRole(ACCOUNTING_ADMIN_ROLES), async (req, res) => {
    try {
      const { codigo, nombre, tipo, nivel } = req.body;
      if (!codigo || !nombre || !tipo) {
        return res.status(400).json({ error: "codigo, nombre y tipo son requeridos" });
      }
      if (!["activo", "pasivo", "patrimonio_neto", "ingreso", "egreso"].includes(tipo)) {
        return res.status(400).json({ error: "tipo inválido" });
      }
      const result = await db.execute(sql`
        INSERT INTO accounting_accounts (codigo, nombre, tipo, nivel, activo)
        VALUES (${String(codigo).trim()}, ${String(nombre).trim()}, ${tipo}, ${nivel ? parseInt(nivel) : 1}, true)
        RETURNING *
      `);
      res.status(201).json(result.rows[0]);
    } catch (e: any) {
      if (String(e.message).includes("duplicate key")) {
        return res.status(409).json({ error: "Ya existe una cuenta con ese código" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/accounting-accounts/:id", requireRole(ACCOUNTING_ADMIN_ROLES), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { codigo, nombre, tipo, nivel, activo } = req.body;
      const result = await db.execute(sql`
        UPDATE accounting_accounts SET
          codigo = ${codigo !== undefined ? String(codigo).trim() : sql`codigo`},
          nombre = ${nombre !== undefined ? String(nombre).trim() : sql`nombre`},
          tipo = ${tipo !== undefined ? tipo : sql`tipo`},
          nivel = ${nivel !== undefined ? parseInt(nivel) : sql`nivel`},
          activo = ${activo !== undefined ? !!activo : sql`activo`}
        WHERE id = ${id}
        RETURNING *
      `);
      if (!result.rows[0]) return res.status(404).json({ error: "Cuenta no encontrada" });
      res.json(result.rows[0]);
    } catch (e: any) {
      if (String(e.message).includes("duplicate key")) {
        return res.status(409).json({ error: "Ya existe una cuenta con ese código" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // ── Event PDF endpoints ────────────────────────────────────────────────────
  app.get("/api/events/:id/pdf/hoja-funcion", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento no encontrado" });
      const pdfBuffer = await generateHojaFuncionPdf(event);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="HojaFuncion_${event.eventCode}.pdf"`);
      res.end(pdfBuffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/events/:id/pdf/confirmacion", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento no encontrado" });
      const pdfBuffer = await generateConfirmacionEventoPdf(event);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Confirmacion_${event.eventCode}.pdf"`);
      res.end(pdfBuffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ==================== TABLERO OPERATIVO ====================
  app.get("/api/operaciones/resumen", requireAuth, async (req, res) => {
    try {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      // 1. Check-ins del día
      const checkInsHoy = await db
        .select({
          id: reservations.id,
          reservationCode: reservations.reservationCode,
          checkInDate: reservations.checkInDate,
          checkOutDate: reservations.checkOutDate,
          status: reservations.status,
          roomId: reservations.roomId,
          guestId: reservations.guestId,
        })
        .from(reservations)
        .where(and(
          eq(reservations.checkInDate, today),
          inArray(reservations.status, ["confirmed", "pending", "tentative"] as any)
        ));

      // 2. Check-outs del día
      const checkOutsHoy = await db
        .select({
          id: reservations.id,
          reservationCode: reservations.reservationCode,
          checkInDate: reservations.checkInDate,
          checkOutDate: reservations.checkOutDate,
          status: reservations.status,
          roomId: reservations.roomId,
          guestId: reservations.guestId,
        })
        .from(reservations)
        .where(and(
          eq(reservations.checkOutDate, today),
          eq(reservations.status, "checked_in")
        ));

      // 3. Folios con saldo — query única optimizada con JOIN
      const foliosRaw = await db.execute(sql`
        SELECT
          r.id AS "reservationId",
          r.reservation_code AS "reservationCode",
          r.room_id AS "roomId",
          r.guest_id AS "guestId",
          COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.amount::numeric ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN p.status = 'active' THEN p.amount::numeric ELSE 0 END), 0) AS balance
        FROM reservations r
        LEFT JOIN charges c ON c.reservation_id = r.id
        LEFT JOIN payments p ON p.reservation_id = r.id
        WHERE r.status = 'checked_in'
        GROUP BY r.id, r.reservation_code, r.room_id, r.guest_id
        HAVING (
          COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.amount::numeric ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN p.status = 'active' THEN p.amount::numeric ELSE 0 END), 0)
        ) > 0.01
        ORDER BY balance DESC
      `);
      const foliosConSaldo = (foliosRaw.rows as any[]).map(r => ({
        ...r,
        balance: Math.round(Number(r.balance) * 100) / 100,
      }));

      // 4. Cajas abiertas
      const cajasAbiertas = await db
        .select({
          id: cashShifts.id,
          area: cashShifts.area,
          shiftNumber: cashShifts.shiftNumber,
          openedBy: cashShifts.openedBy,
          openedAt: cashShifts.openedAt,
          autoCreado: cashShifts.autoCreado,
        })
        .from(cashShifts)
        .where(eq(cashShifts.status, "open"));

      // 5. Habitaciones sucias
      const habitacionesSucias = await db
        .select({ id: rooms.id, roomNumber: rooms.roomNumber, floor: rooms.floor })
        .from(rooms)
        .where(eq(rooms.status, "dirty"));

      // 6. Tareas de housekeeping de hoy
      const tareasHoy = await db
        .select({ id: housekeepingTasks.id, status: housekeepingTasks.status })
        .from(housekeepingTasks)
        .where(eq(housekeepingTasks.scheduledDate, today));

      const tareasPendientes = tareasHoy.filter(t => t.status === "pending").length;
      const tareasEnProceso = tareasHoy.filter(t => t.status === "in_progress").length;
      const tareasCompletadas = tareasHoy.filter(t => t.status === "completed" || t.status === "inspected").length;

      // 7. Incidencias abiertas
      let incidenciasAbiertas = 0;
      let incidenciasCriticas = 0;
      try {
        const incidents = await db
          .select({ severity: systemIncidents.severity, status: systemIncidents.status })
          .from(systemIncidents)
          .where(inArray(systemIncidents.status, ["pendiente", "en_revision"] as any));
        incidenciasAbiertas = incidents.length;
        incidenciasCriticas = incidents.filter(i => i.severity === "critica").length;
      } catch { /* tabla puede no existir */ }

      // 7b. Mantenimiento preventivo — vencidas + por vencer esta semana
      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      const weekEnd = sevenDaysLater.toISOString().split("T")[0];
      let mantenimientoVencidas: any[] = [];
      let mantenimientoEstaSemana: any[] = [];
      try {
        const preventiveTasks = await db.execute(sql`
          SELECT id, name, next_due_at, assigned_to, frequency_days, last_overdue_days
          FROM preventive_tasks
          WHERE active = true AND next_due_at <= ${weekEnd}
          ORDER BY next_due_at ASC
        `);
        const allTasks = preventiveTasks.rows as any[];
        mantenimientoVencidas      = allTasks.filter(t => t.next_due_at <  today);
        mantenimientoEstaSemana    = allTasks.filter(t => t.next_due_at >= today);
      } catch { /* tabla puede no existir */ }

      // 8. Recaudación del día por área — única query con filtro de fecha
      const movimientosHoy = await db.execute(sql`
        SELECT area, amount, movement_type
        FROM cash_movements
        WHERE
          DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = ${today}::date
          AND anulado = false
      `);
      const recaudacionPorArea: Record<string, number> = {};
      for (const mov of movimientosHoy.rows as any[]) {
        if (!recaudacionPorArea[mov.area]) recaudacionPorArea[mov.area] = 0;
        const amt = parseFloat(mov.amount);
        recaudacionPorArea[mov.area] += mov.movement_type === "income" ? amt : -amt;
      }
      const totalRecaudado = Object.values(recaudacionPorArea).reduce((s, v) => s + v, 0);

      // 9. Eventos del día (startDate <= hoy <= endDate, no cancelados)
      const eventosHoy = await db
        .select({
          id: eventsTable.id,
          eventCode: eventsTable.eventCode,
          name: eventsTable.name,
          eventType: eventsTable.eventType,
          contactName: eventsTable.contactName,
          attendees: eventsTable.attendees,
          startDate: eventsTable.startDate,
          endDate: eventsTable.endDate,
          startTime: eventsTable.startTime,
          endTime: eventsTable.endTime,
          status: eventsTable.status,
          eventRoomId: eventsTable.eventRoomId,
        })
        .from(eventsTable)
        .where(
          and(
            lte(eventsTable.startDate, today),
            gte(eventsTable.endDate, today),
            ne(eventsTable.status, "cancelled" as any)
          )
        )
        .orderBy(asc(eventsTable.startTime));

      res.json({
        fecha: today,
        checkIns: { total: checkInsHoy.length, reservas: checkInsHoy },
        checkOuts: { total: checkOutsHoy.length, reservas: checkOutsHoy },
        foliosConSaldo: { total: foliosConSaldo.length, items: foliosConSaldo },
        cajas: {
          abiertas: cajasAbiertas.length,
          detalle: cajasAbiertas,
          recaudacionPorArea,
          totalRecaudado: Math.round(totalRecaudado * 100) / 100,
        },
        housekeeping: {
          habitacionesSucias: habitacionesSucias.length,
          tareasPendientes,
          tareasEnProceso,
          tareasCompletadas,
          totalTareas: tareasHoy.length,
        },
        incidencias: { abiertas: incidenciasAbiertas, criticas: incidenciasCriticas },
        mantenimiento: {
          vencidas:    mantenimientoVencidas.length,
          estaSemana:  mantenimientoEstaSemana.length,
          tareas:      [...mantenimientoVencidas, ...mantenimientoEstaSemana].slice(0, 5),
        },
        eventos: { total: eventosHoy.length, items: eventosHoy },
      });
    } catch (error) {
      console.error("Error en tablero operativo:", error);
      res.status(500).json({ error: "Error generando resumen operativo" });
    }
  });

  // ==================== SYSTEM INCIDENTS ====================
  // IMPORTANT: /stats must be registered BEFORE /:id to avoid Express matching "stats" as an ID
  app.get("/api/incidents/stats", requireAuth, async (req, res) => {
    try {
      const all = await db.select().from(systemIncidents);
      res.json({
        total: all.length,
        pendiente: all.filter(i => i.status === "pendiente").length,
        en_revision: all.filter(i => i.status === "en_revision").length,
        resuelto: all.filter(i => i.status === "resuelto").length,
        criticos: all.filter(i => i.severity === "critica" && i.status !== "resuelto" && i.status !== "descartado").length,
        altos: all.filter(i => i.severity === "alta" && i.status !== "resuelto" && i.status !== "descartado").length,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching incident stats" });
    }
  });

  app.get("/api/incidents", requireAuth, async (req, res) => {
    try {
      const { status, severity, module } = req.query;
      const conditions: SQL[] = [];
      if (status && status !== "all") conditions.push(eq(systemIncidents.status, status as typeof systemIncidents.status["_"]["data"]));
      if (severity && severity !== "all") conditions.push(eq(systemIncidents.severity, severity as typeof systemIncidents.severity["_"]["data"]));
      if (module && module !== "all") conditions.push(eq(systemIncidents.module, module as typeof systemIncidents.module["_"]["data"]));
      const incidents = await db
        .select()
        .from(systemIncidents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(systemIncidents.reportedAt));
      res.json(incidents);
    } catch (error) {
      res.status(500).json({ error: "Error fetching incidents" });
    }
  });

  app.post("/api/incidents", requireAuth, async (req, res) => {
    try {
      const { title, description, module, severity, reportedBy, screenshotUrl } = req.body;
      if (!title || !description || !reportedBy) {
        return res.status(400).json({ error: "Título, descripción y quien reporta son requeridos" });
      }
      const [incident] = await db.insert(systemIncidents).values({
        title, description,
        module: module || "otro",
        severity: severity || "media",
        status: "pendiente",
        reportedBy,
        reportedAt: new Date(),
        screenshotUrl: screenshotUrl || null,
      }).returning();
      res.status(201).json(incident);
    } catch (error) {
      res.status(500).json({ error: "Error creating incident" });
    }
  });

  app.patch("/api/incidents/:id", requireAuth, async (req, res) => {
    try {
      const { status, assignedTo, resolvedBy, resolutionNotes } = req.body;
      const updateData: any = { updatedAt: new Date() };
      if (status) updateData.status = status;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      if (resolvedBy) updateData.resolvedBy = resolvedBy;
      if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;
      if (status === "resuelto" || status === "descartado") updateData.resolvedAt = new Date();
      const [updated] = await db.update(systemIncidents).set(updateData)
        .where(eq(systemIncidents.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Incidente no encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating incident" });
    }
  });

  app.delete("/api/incidents/:id", requireRole(["admin"]), async (req, res) => {
    try {
      await db.delete(systemIncidents).where(eq(systemIncidents.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting incident" });
    }
  });

  registerMaintenanceRoutes(app);
  registerFolioRoutes(app);
  registerPublicBookingRoutes(app);
  registerEmailRoutes(app);
  registerCountriesRoutes(app);
  registerPosConfigsRoutes(app);
  registerCostCentersRoutes(app);
  registerGiftVouchersRoutes(app);
  registerGuestsRoutes(app);
  registerReservationsRoutes(app);
  registerReservationWaitlistRoutes(app);
  registerGroupsRoutes(app);
  registerHousekeepingRoutes(app);
  registerRestaurantRoutes(app);
  registerInventoryRoutes(app);
  registerSpaRoutes(app);
  registerEventsRoutes(app);
  registerPresupuestosRoutes(app);
  registerRoomsRoutes(app);
  registerHospitalityRoutes(app);
  registerOtaRoutes(app);
  registerPlanningRoutes(app);
  registerPackagesRoutes(app);
  registerExportRoutes(app);
  registerAdminCashRoutes(app);
  registerBillingRoutes(app);
  registerReportsRoutes(app);

  // ==================== NIGHT AUDIT ====================
  app.post("/api/night-audit/run", requireAuth, async (req, res) => {
    try {
      const { runNightAudit, nightAuditAlreadyRan } = await import("./night-audit");
      const { forceDate, force } = req.body;
      const userName = (req.user as any)?.fullName || (req.user as any)?.username || "manual";
      const targetDate = forceDate ||
        new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const alreadyRan = await nightAuditAlreadyRan(targetDate);
      if (alreadyRan && !force) {
        return res.status(409).json({
          error: "El night audit ya se ejecutó para esta fecha",
          alreadyRan: true,
        });
      }
      const result = await runNightAudit({ executedBy: userName, isManual: true, forceDate });
      if (result.success) {
        res.json(result.data);
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error: any) {
      res.status(500).json({ error: "Error ejecutando night audit: " + error.message });
    }
  });

  app.get("/api/night-audit/history", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string || "30");
      const history = await db
        .select()
        .from(nightAuditLogs)
        .orderBy(desc(nightAuditLogs.executedAt))
        .limit(limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Error fetching night audit history" });
    }
  });

  app.get("/api/night-audit/status", requireAuth, async (req, res) => {
    try {
      const { nightAuditAlreadyRan } = await import("./night-audit");
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const [lastAudit] = await db
        .select()
        .from(nightAuditLogs)
        .orderBy(desc(nightAuditLogs.executedAt))
        .limit(1);
      const todayRan = await nightAuditAlreadyRan(today);
      const yesterdayRan = await nightAuditAlreadyRan(yesterday);
      res.json({
        today,
        yesterday,
        lastAudit: lastAudit || null,
        todayRan,
        yesterdayRan,
        nextScheduled: "00:05 hora Argentina",
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching night audit status" });
    }
  });

  // ── Elementos Prestados ──────────────────────────────────────────────────
  app.get("/api/loan-items", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getLoanItems());
    } catch { res.status(500).json({ error: "Error al obtener elementos" }); }
  });

  app.post("/api/loan-items", requireAuth, async (req, res) => {
    try {
      const { name, description, totalQuantity, sortOrder } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Nombre requerido" });
      res.json(await storage.createLoanItem({ name: name.trim(), description: description || null, totalQuantity: totalQuantity ?? 1, active: true, sortOrder: sortOrder ?? 0 }));
    } catch { res.status(500).json({ error: "Error al crear elemento" }); }
  });

  app.patch("/api/loan-items/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.updateLoanItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "No encontrado" });
      res.json(item);
    } catch { res.status(500).json({ error: "Error al actualizar elemento" }); }
  });

  app.delete("/api/loan-items/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteLoanItem(req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Error al eliminar elemento" }); }
  });

  app.get("/api/item-loans", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getActiveItemLoans());
    } catch { res.status(500).json({ error: "Error al obtener préstamos" }); }
  });

  app.post("/api/item-loans", requireAuth, async (req, res) => {
    try {
      const { loanItemId, roomNumber, quantity, notes, registeredBy } = req.body;
      if (!loanItemId || !roomNumber?.trim()) return res.status(400).json({ error: "Elemento y habitación requeridos" });
      res.json(await storage.createItemLoan({ loanItemId, roomNumber: roomNumber.trim(), quantity: quantity ?? 1, notes: notes || null, registeredBy: registeredBy || null }));
    } catch { res.status(500).json({ error: "Error al registrar préstamo" }); }
  });

  app.patch("/api/item-loans/:id/return", requireAuth, async (req, res) => {
    try {
      const loan = await storage.returnItemLoan(req.params.id);
      if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });
      res.json(loan);
    } catch { res.status(500).json({ error: "Error al registrar devolución" }); }
  });

  return httpServer;
}
