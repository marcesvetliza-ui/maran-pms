ype, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date() },
        ] });
      p7.sign({ detached: false });
      const cms = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary").toString("base64");

      const envelope = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;

      const resp = await fetch("https://wsaa.afip.gov.ar/ws/services/LoginCms", {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
        body: envelope,
      });

      const text = await resp.text();
      res.json({ httpStatus: resp.status, rawResponse: text.slice(0, 2000) });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  // GET /api/billing/test-arca — diagnóstico de conexión ARCA (solo admin)
  app.get("/api/billing/test-arca", requireAuth, async (req, res) => {
    try {
      const config = await getBillingConfig();
      const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;
      const result: Record<string, any> = { ambiente };

      if (ambiente === "ficticio") {
        return res.json({ ok: false, ambiente, error: "Modo ficticio activo — no hay conexión real con ARCA" });
      }
      if (!config.arcaCert || !config.arcaKey) {
        return res.json({ ok: false, ambiente, error: "Faltan certificado o clave privada" });
      }

      const { getTokenAuth } = await import("./wsaaClient");
      const { token, sign } = await getTokenAuth(
        config.arcaCert, config.arcaKey,
        ambiente as "homologacion" | "produccion"
      );
      result.wsaa = "ok";
      result.tokenPreview = token.slice(0, 30) + "...";

      // FEParamGetTiposCbte — consulta de solo lectura al WSFE
      const wsfeUrl = ambiente === "produccion"
        ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
        : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
      const cuit = (config.arcaCuit || config.cuit || "").replace(/-/g, "");
      const auth = `<ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
      const envelope =
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
        `<soapenv:Body><ar:FEParamGetTiposCbte>${auth}</ar:FEParamGetTiposCbte></soapenv:Body></soapenv:Envelope>`;

      const wsfeResp = await fetch(wsfeUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposCbte"' },
        body: envelope,
        signal: AbortSignal.timeout(10000),
      });
      const wsfeText = await wsfeResp.text();
      const tipos = [...wsfeText.matchAll(/<Desc>([^<]+)<\/Desc>/g)].map(m => m[1]);
      const fault = wsfeText.match(/<faultstring>([^<]+)<\/faultstring>/);

      if (tipos.length > 0) {
        result.wsfe = "ok";
        result.tiposComprobante = tipos;
      } else if (fault) {
        result.wsfe = "error";
        result.wsfeError = fault[1];
      } else {
        result.wsfe = "error";
        result.wsfeError = "Respuesta inválida de WSFE";
      }

      // FECompUltimoAutorizado para FB
      const pv = config.puntoVenta ?? 1;
      const ultEnv =
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
        `<soapenv:Body><ar:FECompUltimoAutorizado>${auth}<ar:PtoVta>${pv}</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo></ar:FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>`;
      const ultResp = await fetch(wsfeUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"' },
        body: ultEnv,
        signal: AbortSignal.timeout(10000),
      });
      const ultText = await ultResp.text();
      const nroM = ultText.match(/<CbteNro>([^<]+)<\/CbteNro>/);
      if (nroM) {
        result.ultimoFB = Number(nroM[1]);
        result.proximoFB = Number(nroM[1]) + 1;
      }

      result.ok = result.wsfe === "ok";
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/billing/next-number?tipo=FA
  app.get("/api/billing/next-number", requireAuth, async (req, res) => {
    try {
      const { tipo } = req.query as Record<string, string>;
      const config = await getBillingConfig();
      const pv = config.puntoVenta ?? 1;
      const row = await db.execute(sql`
        SELECT ultimo_numero FROM invoice_counters
        WHERE tipo_comprobante = ${tipo} AND punto_venta = ${pv}
      `);
      const last = (row.rows[0] as any)?.ultimo_numero ?? 0;
      res.json({ tipo, puntoVenta: pv, proximoNumero: last + 1 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/invoices
  app.get("/api/billing/invoices", requireAuth, async (req, res) => {
    try {
      const { desde, hasta, tipo, clienteCuit, area, cliente, reservaId } = req.query as Record<string, string>;
      let whereClause = sql`1=1`;
      if (desde) whereClause = sql`${whereClause} AND si.fecha_emision >= ${desde}`;
      if (hasta) whereClause = sql`${whereClause} AND si.fecha_emision <= ${hasta}`;
      if (tipo) whereClause = sql`${whereClause} AND si.tipo_comprobante = ${tipo}`;
      if (clienteCuit) whereClause = sql`${whereClause} AND si.cliente_cuit = ${clienteCuit}`;
      if (area) whereClause = sql`${whereClause} AND si.punto_venta IN (SELECT numero FROM pos_configs WHERE area = ${area} AND activo = true)`;
      if (cliente) whereClause = sql`${whereClause} AND LOWER(si.cliente_razon_social) LIKE ${'%' + cliente.toLowerCase() + '%'}`;
      if (reservaId) whereClause = sql`${whereClause} AND si.reserva_id::text = ${reservaId}`;

      const rows = await db.execute(sql`
        SELECT si.*, pc.area AS area_name,
               orig.tipo_comprobante AS original_tipo,
               orig.numero           AS original_numero,
               orig.punto_venta      AS original_punto_venta,
               orig.fecha_emision    AS original_fecha_emision,
               orig.monto_total      AS original_monto_total,
               orig.cliente_razon_social AS original_cliente_razon_social,
               orig.cae              AS original_cae,
               orig.modo_ficticio    AS original_modo_ficticio,
               orig.estado           AS original_estado
        FROM sales_invoices si
        LEFT JOIN pos_configs pc ON pc.numero = si.punto_venta
        LEFT JOIN sales_invoices orig
               ON orig.id = si.nota_credito_id
              AND si.tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM')
        WHERE ${whereClause}
        ORDER BY si.created_at DESC
        LIMIT 200
      `);
      res.json(rows.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Purga de comprobantes no fiscales ────────────────────────────────────────
  const NON_FISCAL_TIPOS = [
    "ticket", "voucher_justo", "voucher_pedidos_ya", "cierre_habitacion", "cierre_spa",
  ];

  // GET /api/billing/invoices/non-fiscal/count?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  app.get("/api/billing/invoices/non-fiscal/count", requireRole(["admin", "administracion"]), async (req, res) => {
    try {
      const { startDate, endDate } = req.query as Record<string, string>;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate y endDate son requeridos" });
      }
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM sales_invoices
        WHERE tipo_comprobante = ANY(${NON_FISCAL_TIPOS}::text[])
          AND fecha_emision >= ${startDate}
          AND fecha_emision <= ${endDate}
      `);
      res.json({ count: (result.rows[0] as any)?.total ?? 0 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/billing/invoices/non-fiscal?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  app.delete("/api/billing/invoices/non-fiscal", requireRole(["admin", "administracion"]), async (req, res) => {
    try {
      const { startDate, endDate } = req.query as Record<string, string>;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate y endDate son requeridos" });
      }
      const result = await db.execute(sql`
        DELETE FROM sales_invoices
        WHERE tipo_comprobante = ANY(${NON_FISCAL_TIPOS}::text[])
          AND fecha_emision >= ${startDate}
          AND fecha_emision <= ${endDate}
        RETURNING id
      `);
      res.json({ deleted: result.rows.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/invoices/:id
  app.get("/api/billing/invoices/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`
        SELECT si.*,
               orig.tipo_comprobante AS original_tipo,
               orig.numero           AS original_numero,
               orig.punto_venta      AS original_punto_venta,
               orig.fecha_emision    AS original_fecha_emision,
               orig.monto_total      AS original_monto_total,
               orig.cliente_razon_social AS original_cliente_razon_social,
               orig.cae              AS original_cae,
               orig.modo_ficticio    AS original_modo_ficticio,
               orig.estado           AS original_estado
        FROM sales_invoices si
        LEFT JOIN sales_invoices orig
               ON orig.id = si.nota_credito_id
              AND si.tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM')
        WHERE si.id = ${id}
      `);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      res.json(row.rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/billing/invoices
  app.post("/api/billing/invoices", requireAuth, async (req, res) => {
    try {
      const { tipoComprobante, cliente, items, reservaId, folioId, puntoVenta: pvBody, puntoVentaOverride, cashArea, cashFormaPago, cashLabel: cashLabelBody, ccEntityType, ccEntityId, sourceChargeIds, sourceChargeAmounts, observaciones } = req.body;
      if (!tipoComprobante || !cliente || !items?.length) {
        return res.status(400).json({ error: "tipoComprobante, cliente e items son requeridos" });
      }
      if (cashFormaPago === "cuenta_corriente" && (!ccEntityType || !ccEntityId)) {
        return res.status(400).json({ error: "Seleccione una empresa o agencia para cargar a Cuenta Corriente" });
      }
      const reservationId = reservaId === undefined || reservaId === null
        ? ""
        : String(reservaId).trim();
      const normalizedSourceChargeIds = Array.isArray(sourceChargeIds)
        ? [...new Set(sourceChargeIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
        : [];
      const sanitizedSourceChargeAmounts = sourceChargeAmounts && typeof sourceChargeAmounts === "object"
        ? Object.fromEntries(
          Object.entries(sourceChargeAmounts)
            .filter(([id, amount]) => typeof id === "string" && Number.isFinite(Number(amount)) && Number(amount) > 0)
            .map(([id, amount]) => [id, Number(amount)])
        )
        : {};

      const emitInvoice = async () => {
        // Every reservation invoice must declare the exact folio sources it
        // consumes. Without this, an older tab could bypass the residual guard.
        if (reservationId) {
          const amountIds = Object.keys(sanitizedSourceChargeAmounts);
          const hasSameSources = amountIds.length === normalizedSourceChargeIds.length &&
            amountIds.every((id) => normalizedSourceChargeIds.includes(id));
          if (!hasSameSources) {
            throw new FolioInvoiceValidationError(
              "Las facturas de folio deben incluir el importe de cada cargo seleccionado"
            );
          }

        const requestedTotal = Object.values(sanitizedSourceChargeAmounts)
          .reduce((sum, amount) => sum + Number(amount), 0);
        const itemsTotal = items.reduce((sum: number, item: any) => sum + (Number(item.subtotal) || 0), 0);
        if (Math.abs(requestedTotal - itemsTotal) > 0.02) {
            throw new FolioInvoiceValidationError("Los importes de los cargos no coinciden con el total del comprobante");
        }

          const reservation = await storage.getReservation(reservationId);
          if (!reservation) throw new FolioInvoiceValidationError("Reserva no encontrada", 404);
          const charges = await storage.getCharges(reservationId);
        const savedRoomTotal = parseFloat((reservation as any).totalRoomAmount || "0");
        const accommodationTotal = savedRoomTotal > 0
          ? savedRoomTotal
          : (parseFloat((reservation as any).finalRatePerNight || "0") * ((reservation as any).nights || 0));
        const originalAmounts: Record<string, number> = { accommodation: accommodationTotal };
        for (const charge of charges) {
          if (charge.category === "adjustment") {
            const sourceId = getNotaCreditoAdjustmentSourceId(charge.description);
            if (sourceId) {
              originalAmounts[sourceId] = (originalAmounts[sourceId] || 0) + (parseFloat(charge.amount) || 0);
            }
          } else if (charge.category !== "transfer_in" && charge.category !== "transfer_out") {
            originalAmounts[String(charge.id)] = parseFloat(charge.amount) || 0;
          }
        }

        const priorInvoices = await db.execute(sql`
          SELECT source_charge_ids, source_charge_amounts, items, monto_total, monto_acreditado,
                 COALESCE((
                   SELECT jsonb_agg(nc.source_charge_amounts)
                   FROM sales_invoices nc
                   WHERE nc.nota_credito_id = si.id
                     AND nc.tipo_comprobante IN ('NCA', 'NCB', 'NCC', 'NCT', 'NCM')
                 ), '[]'::jsonb) AS credit_source_charge_amounts
            FROM sales_invoices si
            WHERE si.reserva_id = ${reservationId}
            AND si.tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
            AND si.estado IN ('emitida', 'parcial')
        `);
        const alreadyInvoiced: Record<string, number> = {};
        for (const invoice of priorInvoices.rows) {
          for (const [id, amount] of Object.entries(parseInvoiceSourceAmounts(invoice))) {
            alreadyInvoiced[id] = (alreadyInvoiced[id] || 0) + amount;
          }
        }

        for (const [id, amount] of Object.entries(sanitizedSourceChargeAmounts)) {
          const original = originalAmounts[id];
          const pending = original - (alreadyInvoiced[id] || 0);
          if (!Number.isFinite(original) || original <= 0) {
              throw new FolioInvoiceValidationError(`El cargo seleccionado (${id}) no existe o no es facturable`);
          }
          if (Number(amount) > pending + 0.02) {
              throw new FolioInvoiceValidationError(
                `El cargo seleccionado ya no tiene saldo suficiente para facturar ($${Math.max(0, pending).toFixed(2)} disponible)`,
                409
              );
          }
        }
        }

        const user = (req as any).user;
        return emitirFactura({
          tipoComprobante,
          cliente,
          items,
          reservaId: reservationId || undefined,
          folioId,
          operador: user?.fullName || user?.username,
          puntoVentaOverride: (puntoVentaOverride ?? pvBody) ? parseInt(puntoVentaOverride ?? pvBody) : undefined,
          cashFormaPago: cashFormaPago || undefined,
          sourceChargeIds: normalizedSourceChargeIds.length > 0 ? normalizedSourceChargeIds : undefined,
          sourceChargeAmounts: Object.keys(sanitizedSourceChargeAmounts).length > 0 ? sanitizedSourceChargeAmounts : undefined,
          observaciones: typeof observaciones === "string" ? observaciones.trim() || undefined : undefined,
        } as NewInvoiceData);
      };

      const factura = reservationId
        ? await withReservationInvoiceLock(reservationId, emitInvoice)
        : await emitInvoice();
      const user = (req as any).user;

      // Cuenta Corriente: cargar el total a la cuenta corriente de la empresa/agencia (no es un movimiento de caja)
      if (cashFormaPago === "cuenta_corriente" && ccEntityType && ccEntityId) {
        try {
          const total = parseFloat(String((factura as any).montoTotal || "0"));
          if (total > 0) {
            const nroFac = `${factura.tipoComprobante}-${String(factura.numero).padStart(8, "0")}`;
            await storage.createAccountMovement({
              entityType: ccEntityType,
              entityId: ccEntityId,
              date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
              type: "cargo",
              description: cashLabelBody || nroFac,
              amount: String(total.toFixed(2)),
              reference: nroFac,
              createdBy: user?.id || null,
            } as any);
          }
        } catch (ccErr) {
          console.error("[Billing] Error registrando movimiento de Cuenta Corriente:", ccErr);
        }
      } else if (cashArea && cashFormaPago) {
        // Registrar movimiento de caja si se especificó un área
        try {
          const total = parseFloat(String((factura as any).montoTotal || "0"));
          if (total > 0) {
            const nroFac = `${factura.tipoComprobante}-${String(factura.numero).padStart(8, "0")}`;
            await storage.registerCashMovement(
              cashArea,
              "comprobante",
              String(factura.id),
              cashLabelBody || nroFac,
              cashFormaPago,
              String(total.toFixed(2)),
              "income",
              user?.fullName || user?.username,
              factura.tipoComprobante
            );
          }
        } catch (cashErr) {
          console.error("[Billing] Error registrando movimiento de caja:", cashErr);
        }
      }

      res.status(201).json(factura);
    } catch (e: any) {
      if (e instanceof FolioInvoiceValidationError) {
        return res.status(e.status).json({ error: e.message });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/billing/invoices/:id/pdf
  app.get("/api/billing/invoices/:id/pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      const factura = row.rows[0] as any;
      const config = await getBillingConfig();
      const tipo = factura.tipo_comprobante ?? "F";

      // Voucher de alojamiento: PDF mejorado con detalle de folio
      if (tipo === "cierre_habitacion" && factura.reserva_id) {
        const reservaId = factura.reserva_id;
        const [reservation, chargesList, paymentsList] = await Promise.all([
          storage.getReservation(reservaId),
          storage.getCharges(reservaId),
          storage.getPayments(reservaId),
        ]);
        if (reservation) {
          // Fetch void adjustments and ND charges from folio_movements
          let voidAdjustments: Array<{ description: string; date: string; amount: string }> = [];
          let ndCharges: Array<{ description: string; date: string; amount: string; category?: string }> = [];
          try {
            const folioRow = await db.execute(
              sql`SELECT id FROM folios WHERE entity_type = 'reservation' AND entity_id = ${reservaId} LIMIT 1`
            );
            const folioRec = (folioRow.rows as any[])?.[0];
            if (folioRec) {
              const [voidRows, ndRows] = await Promise.all([
                db.execute(
                  sql`SELECT description, amount, created_at FROM folio_movements WHERE folio_id = ${folioRec.id} AND type = 'void' ORDER BY created_at ASC`
                ),
                db.execute(
                  sql`SELECT description, amount, created_at FROM folio_movements WHERE folio_id = ${folioRec.id} AND type = 'charge' AND source_type = 'nota_debito' ORDER BY created_at ASC`
                ),
              ]);
              voidAdjustments = (voidRows.rows as any[]).map((r) => ({
                description: r.description as string,
                date: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString().split("T")[0],
                amount: String(r.amount),
              }));
              ndCharges = (ndRows.rows as any[]).map((r) => ({
                description: r.description as string,
                date: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString().split("T")[0],
                amount: String(r.amount),
                category: "nota_debito",
              }));
            }
          } catch (adjErr: any) {
            console.warn("[voucher-pdf] could not load folio movements (non-fatal):", adjErr?.message);
          }

          const allCharges = [...chargesList.map(c => ({ description: c.description, date: c.date, amount: c.amount, category: c.category ?? undefined })), ...ndCharges];
          const roomTotal = parseFloat(reservation.totalRoomAmount || "0");
          const grandTotal = roomTotal + allCharges.reduce((s, c) => s + parseFloat(c.amount), 0);
          const totalPayments = paymentsList.filter(p => p.status === "active").reduce((s, p) => s + parseFloat(p.amount), 0);
          const voucherData: VoucherHabitacionData = {
            numero: Number(factura.numero),
            puntoVenta: Number(factura.punto_venta),
            fechaEmision: factura.fecha_emision,
            reservationCode: reservation.reservationCode,
            guestName: `${reservation.guest?.firstName ?? ""} ${reservation.guest?.lastName ?? ""}`.trim(),
            roomNumber: reservation.room?.roomNumber ?? "",
            checkInDate: reservation.checkInDate,
            checkOutDate: reservation.checkOutDate,
            nights: reservation.nights ?? 1,
            roomRate: parseFloat(reservation.finalRatePerNight || "0"),
            roomTotal,
            charges: allCharges,
            payments: paymentsList.filter(p => p.status === "active").map(p => ({ date: p.date, method: p.method, amount: p.amount, reference: p.reference, notes: p.notes })),
            adjustments: voidAdjustments.length > 0 ? voidAdjustments : undefined,
            grandTotal,
            totalPayments,
            balance: grandTotal - totalPayments,
          };
          const pdfBuf = await generarVoucherHabitacionPDF(voucherData, config);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="Voucher_${factura.punto_venta}_${factura.numero}.pdf"`);
          return res.send(pdfBuf);
        }
      }

      // Fetch linked NC if present — only for original Factura types, never for NC/ND documents
      const FACTURA_TIPOS = ["FA", "FB", "FC", "FT", "FM"];
      let notaCreditoInfo: NotaCreditoInfo | undefined;
      if (factura.nota_credito_id && FACTURA_TIPOS.includes(tipo)) {
        try {
          const ncRow = await db.execute(sql`SELECT tipo_comprobante, punto_venta, numero, fecha_emision, monto_total FROM sales_invoices WHERE id = ${factura.nota_credito_id}`);
          const nc = ncRow.rows[0] as any;
          if (nc) {
            notaCreditoInfo = {
              tipoComprobante: nc.tipo_comprobante ?? "",
              puntoVenta: Number(nc.punto_venta ?? 1),
              numero: Number(nc.numero ?? 0),
              fechaEmision: nc.fecha_emision,
              montoTotal: parseFloat(nc.monto_total ?? "0"),
            };
          }
        } catch (ncErr: any) {
          console.warn("[invoice-pdf] could not fetch linked NC (non-fatal):", ncErr?.message);
        }
      }

      // Enrich with guest/room data from linked reservation when available
      let guestData: InvoiceGuestData | undefined;
      let retenciones: FacturaRetenciones | undefined;

      if (factura.reserva_id) {
        try {
          const [rsv, pmts] = await Promise.all([
            storage.getReservation(factura.reserva_id),
            storage.getPayments(factura.reserva_id),
          ]);
          if (rsv) {
            guestData = {
              guestName: `${rsv.guest?.lastName ?? ""} ${rsv.guest?.firstName ?? ""}`.trim() || (rsv.guest as any)?.razonSocial || "",
              guestDni: (rsv.guest as any)?.documentNumber ?? null,
              roomNumber: rsv.room?.roomNumber ?? null,
              checkInDate: rsv.checkInDate ?? null,
              checkOutDate: rsv.checkOutDate ?? null,
              numberOfGuests: rsv.numberOfGuests ?? null,
            };
          }
          // Extract retention amounts from payment notes JSON
          // Format: { retencion: { tipo: "iibb"|"ganancias", monto: number, neto: number } }
          let retIibb = 0, retGanancias = 0, retIva = 0;
          for (const p of (pmts ?? [])) {
            if (!p.notes) continue;
            try {
              const parsed = typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes;
              const ret = parsed?.retencion;
              if (!ret || !ret.monto) continue;
              if (ret.tipo === "iibb")      retIibb      += Number(ret.monto) || 0;
              else if (ret.tipo === "ganancias") retGanancias += Number(ret.monto) || 0;
              else if (ret.tipo === "iva")  retIva       += Number(ret.monto) || 0;
            } catch { /* unparseable notes — skip */ }
          }
          if (retIibb + retGanancias + retIva > 0) {
            retenciones = { iibb: retIibb, ganancias: retGanancias, iva: retIva };
          }
        } catch { /* non-fatal — guest data is optional */ }
      }

      const logoBuffer = await loadLogoBuffer((config as any).logoUrl);
      const pdfBuf = await generarFacturaPDF(factura, config, notaCreditoInfo, guestData, logoBuffer, retenciones);
      const pv = String(factura.punto_venta ?? 1).padStart(4, "0");
      const nro = String(factura.numero ?? 0).padStart(8, "0");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${tipo}_${pv}_${nro}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/billing/test-connection — prueba la conexión con ARCA (solo WSAA)
  app.post("/api/billing/test-connection", requireAuth, async (req, res) => {
    try {
      const config = await getBillingConfig();
      const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;

      if (ambiente === "ficticio") {
        return res.status(400).json({ error: "Modo ficticio activo. Seleccionar homologación o producción." });
      }
      if (!config.arcaCert || !config.arcaKey) {
        return res.status(400).json({ error: "Faltan certificado y/o clave privada." });
      }

      const { getTokenAuth } = await import("./wsaaClient");
      const ta = await getTokenAuth(
        config.arcaCert,
        config.arcaKey,
        ambiente as "homologacion" | "produccion"
      );

      res.json({
        ok: true,
        ambiente,
        mensaje: `Conexión exitosa con ARCA (${ambiente}). Token obtenido correctamente.`,
        tokenPreview: ta.token.slice(0, 30) + "...",
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /api/billing/invoices/:id/nota-credito
  app.post("/api/billing/invoices/:id/nota-credito", requireAuth, async (req, res) => {
    let creditLockClient: any = null;
    let creditLockKey: string | null = null;
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      let original = row.rows[0] as any;

      // Serialize every invoice/NC operation for a reservation across app
      // instances. Re-read after acquiring the lock so a second request sees
      // any NC emitted by the first one before validating its available amount.
      if (original.reserva_id) {
        creditLockClient = await pool.connect();
        creditLockKey = `folio-invoice:${original.reserva_id}`;
        await creditLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [creditLockKey]);
        const lockedRow = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
        if (!lockedRow.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
        original = lockedRow.rows[0] as any;
      }

      if (original.estado === "anulada") {
        return res.status(400).json({ error: "La factura ya fue anulada completamente" });
      }

      // Note: we intentionally allow multiple NCs on the same invoice as long as the
      // remaining balance (monto_total - monto_acreditado) allows it. The old guard that
      // blocked any NC when nota_credito_id was set prevented legitimate partial-NC workflows
      // (e.g., two separate partial credits weeks apart for the same invoice).

      const { motivo, items, monto, paymentIdsToVoid, folioMovementIdsToVoid } = req.body;
      const tipoNC =
        original.tipo_comprobante === "FA" ? "NCA" :
        original.tipo_comprobante === "FT" ? "NCT" :
        original.tipo_comprobante === "FM" ? "NCM" :
        original.tipo_comprobante === "FC" ? "NCC" : "NCB";
      const user = (req as any).user;

      const montoTotal = parseFloat(original.monto_total);
      const montoYaAcreditado = parseFloat(original.monto_acreditado || "0");
      const saldoPendiente = montoTotal - montoYaAcreditado;

      // Guard: invoice already fully credited
      if (montoYaAcreditado >= montoTotal - 0.009) {
        return res.status(400).json({ error: "La factura ya fue acreditada en su totalidad" });
      }
      if (!String(motivo || "").trim()) {
        return res.status(400).json({ error: "El motivo de la Nota de Crédito es obligatorio" });
      }
      // Una NC fiscal corrige el cargo, no el pago. Rechazamos explícitamente el
      // contrato anterior para que ninguna llamada residual anule un cobro.
      if (original.reserva_id && Array.isArray(paymentIdsToVoid) && paymentIdsToVoid.length > 0) {
        return res.status(400).json({ error: "La Nota de Crédito no anula pagos. Registrá la devolución o anulación en una operación separada." });
      }

      let sourceChargeAmounts: Record<string, number> = {};
      let sourceItemById = new Map<string, any>();
      let ncItems: any[] = [];
      let montoNC = 0;
      let esParcial = false;

      if (!original.reserva_id) {
        // Keep the existing generic NC behavior for Restaurant, SPA and Events.
        // Reservation invoices use the stricter per-charge contract below.
        const montoParcial = monto !== undefined && monto !== null ? parseFloat(monto) : undefined;
        if (montoParcial !== undefined && (!Number.isFinite(montoParcial) || montoParcial <= 0 || montoParcial > saldoPendiente + 0.009)) {
          return res.status(400).json({ error: "El importe de la Nota de Crédito no es válido" });
        }
        montoNC = montoParcial ?? saldoPendiente;
        esParcial = montoNC < saldoPendiente - 0.009;
        const originalItems = Array.isArray(original.items) ? original.items : [];
        ncItems = esParcial
          ? [{
              descripcion: `Anulación parcial de comprobante ${original.tipo_comprobante} ${String(original.punto_venta).padStart(4, "0")}-${String(original.numero).padStart(8, "0")}${motivo ? ` — ${motivo}` : ""}`,
              cantidad: 1, precioUnitario: montoNC, alicuotaIva: "no_gravado",
              subtotalNeto: 0, subtotal: montoNC,
            }]
          : originalItems;
      } else {
      const parseJson = (value: unknown): any => {
        if (typeof value !== "string") return value;
        try { return JSON.parse(value); } catch { return null; }
      };
      const explicitSourceAmounts = parseJson(original.source_charge_amounts);
      if (!explicitSourceAmounts || typeof explicitSourceAmounts !== "object" || Array.isArray(explicitSourceAmounts)) {
        return res.status(409).json({
          error: "Esta factura histórica no tiene un detalle explícito por cargo. No se puede emitir una NC automática desde el Folio.",
        });
      }
      const sourceAmounts = parseInvoiceSourceAmounts({ ...original, monto_acreditado: "0" });
      const sourceIds = parseJson(original.source_charge_ids);
      const normalizedSourceIds = Array.isArray(sourceIds) ? sourceIds.map(String) : [];
      const originalItems = parseJson(original.items);
      if (!original.reserva_id || Object.keys(sourceAmounts).length === 0 || !Array.isArray(originalItems)) {
        return res.status(409).json({
          error: "Esta factura histórica no tiene una relación segura con sus cargos. No se puede emitir una NC desde el Folio sin revisar el vínculo original.",
        });
      }

      const priorCreditsResult = await db.execute(sql`
        SELECT source_charge_amounts, monto_total
        FROM sales_invoices
        WHERE nota_credito_id = ${original.id}
          AND tipo_comprobante IN ('NCA', 'NCB', 'NCC', 'NCT', 'NCM')
      `);
      const creditedBySource: Record<string, number> = {};
      let creditedWithNoSourceMap = 0;
      for (const priorCredit of priorCreditsResult.rows as any[]) {
        const priorMap = parseJson(priorCredit.source_charge_amounts);
        if (!priorMap || typeof priorMap !== "object" || Array.isArray(priorMap)) {
          creditedWithNoSourceMap += parseFloat(String(priorCredit.monto_total || 0)) || 0;
          continue;
        }
        for (const [sourceId, value] of Object.entries(priorMap)) {
          creditedBySource[sourceId] = (creditedBySource[sourceId] || 0) + (parseFloat(String(value)) || 0);
        }
      }
      if (creditedWithNoSourceMap > 0.009) {
        return res.status(409).json({
          error: "La factura tiene Notas de Crédito anteriores sin detalle por cargo. No se puede calcular un nuevo ajuste de Folio con seguridad.",
        });
      }
      const totalMappedCredits = Object.values(creditedBySource).reduce((total, amount) => total + amount, 0);
      if (Math.abs(totalMappedCredits - montoYaAcreditado) > 0.01) {
        return res.status(409).json({
          error: "El detalle por cargo de las Notas de Crédito no coincide con el total acreditado. Revisá el historial antes de continuar.",
        });
      }

      // Legacy billing screens can still request a *total* NC without sending
      // per-charge rows. It is safe only when crediting every remaining source;
      // a partial NC must be created from the Folio, where the user selects the
      // exact concept being corrected.
      const rawRequestedItems = Array.isArray(items)
        ? items
        : monto === undefined || monto === null
          ? Object.entries(sourceAmounts)
              .filter(([, amount]) => (parseFloat(String(amount)) || 0) > 0)
              .map(([sourceId, amount]) => ({
                sourceId,
                amount: Math.max(0, (parseFloat(String(amount)) || 0) - (creditedBySource[sourceId] || 0)),
              }))
          : [];
      const requestedBySource = new Map<string, number>();
      for (const item of rawRequestedItems) {
        const sourceId = typeof item?.sourceId === "string" ? item.sourceId.trim() : "";
        const amount = parseFloat(String(item?.amount ?? item?.subtotal ?? 0));
        if (!sourceId || !Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ error: "Seleccioná conceptos válidos y un importe mayor a cero para la NC" });
        }
        if (requestedBySource.has(sourceId)) {
          return res.status(400).json({ error: "Cada cargo sólo puede incluirse una vez en la misma Nota de Crédito" });
        }
        requestedBySource.set(sourceId, amount);
      }
      if (requestedBySource.size === 0) {
        return res.status(400).json({ error: "Seleccioná al menos un concepto de la factura original" });
      }

      sourceItemById = new Map<string, any>();
      for (const [index, sourceId] of normalizedSourceIds.entries()) {
        if (!sourceItemById.has(sourceId) && originalItems[index]) sourceItemById.set(sourceId, originalItems[index]);
      }
      if (normalizedSourceIds.length === 1 && originalItems[0]) {
        sourceItemById.set(normalizedSourceIds[0], originalItems[0]);
      }

      sourceChargeAmounts = {};
      ncItems = [];
      montoNC = 0;
      for (const [sourceId, requestedAmount] of requestedBySource.entries()) {
        const originalAmount = sourceAmounts[sourceId];
        const available = (originalAmount ?? 0) - (creditedBySource[sourceId] || 0);
        const originalItem = sourceItemById.get(sourceId);
        if (!Number.isFinite(originalAmount) || available <= 0.009 || requestedAmount > available + 0.009) {
          return res.status(400).json({ error: `El importe solicitado para el cargo seleccionado supera el saldo acreditable (${sourceId}).` });
        }
        if (!originalItem) {
          return res.status(409).json({ error: "No se pudo conservar el concepto fiscal original para uno de los cargos seleccionados." });
        }
        const alicuotaIva = ["21", "10.5", "exento", "no_gravado"].includes(String(originalItem.alicuotaIva))
          ? originalItem.alicuotaIva
          : "no_gravado";
        const divisor = alicuotaIva === "21" ? 1.21 : alicuotaIva === "10.5" ? 1.105 : 1;
        const amount = Number(requestedAmount.toFixed(2));
        sourceChargeAmounts[sourceId] = amount;
        montoNC += amount;
        ncItems.push({
          descripcion: originalItem.descripcion || `Ajuste de ${sourceId}`,
          cantidad: 1,
          precioUnitario: amount,
          alicuotaIva,
          subtotalNeto: Number((amount / divisor).toFixed(2)),
          subtotal: amount,
        });
      }
      if (monto !== undefined && Math.abs((parseFloat(String(monto)) || 0) - montoNC) > 0.01) {
        return res.status(400).json({ error: "El total de la NC no coincide con los conceptos seleccionados" });
      }
      if (montoNC > saldoPendiente + 0.009) {
        return res.status(400).json({ error: `El monto a acreditar ($${montoNC.toFixed(2)}) supera el saldo pendiente de la factura ($${saldoPendiente.toFixed(2)})` });
      }
      esParcial = montoNC < saldoPendiente - 0.009;
      }

      const nc = await emitirFactura({
        tipoComprobante: tipoNC as any,
        cliente: {
          razonSocial: original.cliente_razon_social,
          cuit: original.cliente_cuit,
          dni: original.cliente_dni,
          condicionIva: original.cliente_condicion_iva,
          domicilio: original.cliente_domicilio,
        },
        items: ncItems,
        facturaOriginalId: original.id,
        operador: user?.fullName || user?.username,
        puntoVentaOverride: original.punto_venta,
        reservaId: original.reserva_id || undefined,
        folioId: original.folio_id || undefined,
        cashFormaPago: original.cash_forma_pago,
        sourceChargeIds: original.reserva_id ? Object.keys(sourceChargeAmounts) : undefined,
        sourceChargeAmounts: original.reserva_id ? sourceChargeAmounts : undefined,
      } as NewInvoiceData);

      // El cargo original nunca se modifica: se registra una corrección negativa
      // trazable por cada concepto de la NC. Esto permite ver el importe original,
      // el ajuste fiscal y el importe vigente en el Folio.
      // Once ARCA has authorized the NC, these local writes must succeed or
      // fail together: a partially corrected Folio is worse than a visible
      // pending reconciliation.
      const nuevoAcreditado = Math.min(montoTotal, montoYaAcreditado + montoNC);
      const nuevoEstado = nuevoAcreditado >= montoTotal - 0.009 ? "anulada" : "parcial";
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          UPDATE sales_invoices
            SET nota_credito_id = ${nc.id},
                monto_acreditado = ${nuevoAcreditado.toFixed(2)},
                estado = ${nuevoEstado}
          WHERE id = ${id}
        `);
        if (original.reserva_id) {
          const today = getArgentinaToday();
          const adjustments = Object.entries(sourceChargeAmounts).map(([sourceId, amount]) => {
            const originalItem = sourceItemById.get(sourceId);
            return {
              reservationId: String(original.reserva_id),
              description: `Ajuste por NC ${nc.tipoComprobante} ${String(nc.puntoVenta).padStart(4, "0")}-${String(nc.numero).padStart(8, "0")} — ${originalItem?.descripcion || sourceId} [nc:${nc.id}:${sourceId}]`,
              amount: String(-amount),
              date: today,
              category: "adjustment" as const,
              createdBy: user?.fullName || user?.username || "Sistema",
              status: "active",
            };
          });
          if (adjustments.length) await tx.insert(charges).values(adjustments);
        }
      });

      // A reservation NC changes the fiscal amount and Folio balance only. It
      // must not create a cash outflow while its payments remain active.
      if (!original.reserva_id) {
        try {
          const pvRow = await db.execute(sql`SELECT area FROM pos_configs WHERE numero = ${nc.puntoVenta} AND activo = true LIMIT 1`);
          const pvArea = (pvRow.rows[0] as any)?.area || "restaurant";
          const totalNC = parseFloat(String((nc as any).montoTotal || "0"));
          if (totalNC > 0) {
            const nroOriginal = `${original.tipo_comprobante}-${String(original.numero).padStart(8, "0")}`;
            const nroNC = `${nc.tipoComprobante}-${String(nc.numero).padStart(8, "0")}`;
            await storage.registerCashMovement(
              pvArea, "nota_credito", String(nc.id),
              `${nroNC} s/${nroOriginal}${motivo ? ` — ${motivo}` : ""}`,
              "nc", String(totalNC.toFixed(2)), "outcome",
              user?.fullName || user?.username, nc.tipoComprobante
            );
          }
        } catch (cashErr) {
          console.error("[NC] Error registrando movimiento de caja:", cashErr);
        }
      }

      // A credit note deliberately leaves all payments untouched. Any return of
      // funds or cancellation of a payment is a separate, explicit operation.
      const voidedPaymentIds: number[] = [];

      // Write void movement to restaurant_order folio when the NC reverses a restaurant invoice
      if (original.restaurant_order_id) {
        try {
          const operador = user?.fullName || user?.username || "sistema";
          const nroNC = `${nc.tipoComprobante}-${String(nc.numero).padStart(8, "0")}`;
          const voidDesc = `Anulación — ${nroNC}${motivo ? ` — ${motivo}` : ""}`;
          const folioRow = await db.execute(sql`
            SELECT id FROM folios
            WHERE entity_type = 'restaurant_order' AND entity_id = ${String(original.restaurant_order_id)}
            LIMIT 1
          `);
          const folioRec = (folioRow.rows?.[0] as any);
          if (folioRec) {
            await storage.addFolioAdjustment(
              folioRec.id, "void", parseFloat(String((nc as any).montoTotal || montoNC)),
              voidDesc, operador, undefined, voidDesc
            );
          }
        } catch (e) {
          console.error("[nc-void-restaurant] folio void adjustment:", e);
        }
      }

      // Write void movement to spa_account folio when the NC reverses a SPA invoice
      if (!original.restaurant_order_id && !original.reserva_id) {
        try {
          const operador = user?.fullName || user?.username || "sistema";
          const nroNC = `${nc.tipoComprobante}-${String(nc.numero).padStart(8, "0")}`;
          const voidDesc = `Anulación — ${nroNC}${motivo ? ` — ${motivo}` : ""}`;
          const spaRow = await db.execute(sql`
            SELECT id FROM spa_accounts WHERE invoice_id = ${original.id} LIMIT 1
          `);
          const spaAccountId = (spaRow.rows?.[0] as any)?.id;
          if (spaAccountId) {
            const folioRow = await db.execute(sql`
              SELECT id FROM folios
              WHERE entity_type = 'spa_account' AND entity_id = ${String(spaAccountId)}
              LIMIT 1
            `);
            const folioRec = (folioRow.rows?.[0] as any);
            if (folioRec) {
              await storage.addFolioAdjustment(
                folioRec.id, "void", parseFloat(String((nc as any).montoTotal || montoNC)),
                voidDesc, operador, undefined, voidDesc
              );
            }
          }
        } catch (e) {
          console.error("[nc-void-spa] folio void adjustment:", e);
        }
      }

      // Write void movement to event folio when the NC reverses an Event invoice
      if (!original.restaurant_order_id && !original.reserva_id) {
        try {
          const operador = user?.fullName || user?.username || "sistema";
          const nroNC = `${nc.tipoComprobante}-${String(nc.numero).padStart(8, "0")}`;
          const voidDesc = `Anulación — ${nroNC}${motivo ? ` — ${motivo}` : ""}`;
          const eventRow = await db.execute(sql`
            SELECT id FROM events WHERE invoice_id = ${original.id} LIMIT 1
          `);
          const eventId = (eventRow.rows?.[0] as any)?.id;
          if (eventId) {
            const folioRow = await db.execute(sql`
              SELECT id FROM folios
              WHERE entity_type = 'event' AND entity_id = ${String(eventId)}
              LIMIT 1
            `);
            const folioRec = (folioRow.rows?.[0] as any);
            if (folioRec) {
              await storage.addFolioAdjustment(
                folioRec.id, "void", parseFloat(String((nc as any).montoTotal || montoNC)),
                voidDesc, operador, undefined, voidDesc
              );
            }
          }
        } catch (e) {
          console.error("[nc-void-event] folio void adjustment:", e);
        }
      }

      // Void selected folio payment movements (restaurant, SPA, or event) to restore the folio balance
      const voidedFolioMovementIds: string[] = [];
      if (Array.isArray(folioMovementIdsToVoid) && folioMovementIdsToVoid.length > 0) {
        try {
          const operador = user?.fullName || user?.username || "sistema";
          const nroNC = `${nc.tipoComprobante}-${String(nc.numero).padStart(8, "0")}`;
          const voidMotivo = `Nota de Crédito ${nroNC}${motivo ? ` — ${motivo}` : ""}`;

          // Resolve the folio for the entity type linked to this invoice
          let targetFolio: any = null;
          let cashArea: string = "restaurant";

          if (original.restaurant_order_id) {
            // Restaurant order folio
            const row = await db.execute(sql`
              SELECT id FROM folios
              WHERE entity_type = 'restaurant_order' AND entity_id = ${String(original.restaurant_order_id)}
              LIMIT 1
            `);
            targetFolio = row.rows?.[0] ?? null;
            cashArea = "restaurant";
          } else {
            // Try SPA account folio
            const spaRow = await db.execute(sql`
              SELECT id FROM spa_accounts WHERE invoice_id = ${original.id} LIMIT 1
            `);
            const spaAccountId = (spaRow.rows?.[0] as any)?.id;
            if (spaAccountId) {
              const folioRow = await db.execute(sql`
                SELECT id FROM folios
                WHERE entity_type = 'spa_account' AND entity_id = ${String(spaAccountId)}
                LIMIT 1
              `);
              targetFolio = folioRow.rows?.[0] ?? null;
              cashArea = "spa";
            }

            // Try event folio if SPA not found
            if (!targetFolio) {
              const eventRow = await db.execute(sql`
                SELECT id FROM events WHERE invoice_id = ${original.id} LIMIT 1
              `);
              const eventId = (eventRow.rows?.[0] as any)?.id;
              if (eventId) {
                const folioRow = await db.execute(sql`
                  SELECT id FROM folios
                  WHERE entity_type = 'event' AND entity_id = ${String(eventId)}
                  LIMIT 1
                `);
                targetFolio = folioRow.rows?.[0] ?? null;
                cashArea = "event";
              }
            }
          }

          if (targetFolio) {
            const validMovementIds = (folioMovementIdsToVoid as any[]).filter((id: any) =>
              typeof id === "string" && id.trim()
            );

            for (const movId of validMovementIds) {
              try {
                // Fetch the movement and verify ownership + type
                const movRow = await db.execute(sql`
                  SELECT * FROM folio_movements
                  WHERE id = ${movId} AND folio_id = ${targetFolio.id} AND type = 'payment'
                  LIMIT 1
                `);
                const mov = (movRow.rows?.[0] as any);
                if (!mov) {
                  console.warn(`[nc-void-folio-payment] movement ${movId} not found in ${cashArea} folio — skipped`);
                  continue;
                }

                // Skip if already voided
                const alreadyVoided = await db.execute(sql`
                  SELECT 1 FROM folio_movements
                  WHERE voided_movement_id = ${movId} AND type = 'void'
                  LIMIT 1
                `);
                if (alreadyVoided.rows.length > 0) {
                  console.warn(`[nc-void-folio-payment] movement ${movId} already voided — skipped`);
                  continue;
                }

                const methodLabel: Record<string, string> = {
                  efectivo: "Efectivo", tarjeta_debito: "Tarj. Débito", tarjeta_credito: "Tarj. Crédito",
                  transferencia: "Transferencia", mercadopago: "MercadoPago", cuenta_corriente: "Cta. Corriente",
                  gift_voucher: "Voucher Regalo", consumo_interno: "Consumo Interno",
                };
                const payLabel = methodLabel[mov.payment_method] || mov.payment_method || "Pago";

                // Insert void folio movement
                await db.insert(folioMovements).values({
                  folioId: targetFolio.id,
                  type: "void",
                  amount: String(mov.amount),
                  description: `Anulación ${payLabel} — ${voidMotivo}`,
                  sourceType: "nc_void",
                  sourceId: String(nc.id),
                  paymentMethod: mov.payment_method,
                  voidedMovementId: movId,
                  voidReason: voidMotivo,
                  registeredBy: operador,
                });
                voidedFolioMovementIds.push(movId);

                // Cash reversal for the voided payment
                try {
                  await storage.registerCashMovement(
                    cashArea, "payment_void", movId,
                    `Anulación pago ${cashArea} ${payLabel} — ${nroNC}`,
                    mov.payment_method, String(mov.amount), "expense", operador
                  );
                } catch (cashErr) {
                  console.error(`[nc-void-folio-payment] cash reversal (${cashArea}):`, cashErr);
                }
              } catch (e) {
                console.error(`[nc-void-folio-payment] failed for movement ${movId}:`, e);
              }
            }
          }
        } catch (e) {
          console.error("[nc-void-folio-payment] outer:", e);
        }
      }

      // Propagate NC reference to any group_payments linked to this original invoice.
      // The invoice_ref column stores JSON with an "id" field equal to the sales_invoice id.
      // This is server-side and non-fatal: if it fails the NC itself is already emitted.
      try {
        await db.execute(sql`
          UPDATE group_payments
          SET invoice_nc_ref = ${JSON.stringify(nc)}
          WHERE invoice_ref IS NOT NULL
            AND invoice_ref::jsonb->>'id' = ${String(id)}
            AND invoice_nc_ref IS NULL
        `);
      } catch (propagateErr) {
        console.error("[NC] Failed to propagate invoice_nc_ref to group_payments:", propagateErr);
      }

      res.status(201).json({ ...nc, voidedPaymentIds, voidedFolioMovementIds });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      if (creditLockClient && creditLockKey) {
        await creditLockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [creditLockKey]).catch(() => undefined);
        creditLockClient.release();
      }
    }
  });

  // POST /api/billing/invoices/:id/nota-debito
  app.post("/api/billing/invoices/:id/nota-debito", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const row = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
      if (!row.rows.length) return res.status(404).json({ error: "Factura no encontrada" });
      const original = row.rows[0] as any;

      if (original.estado === "anulada") {
        return res.status(400).json({ error: "No se puede emitir una ND sobre una factura anulada" });
      }

      const montoTotalND = parseFloat(original.monto_total || "0");
      const montoAcreditadoND = parseFloat(original.monto_acreditado || "0");
      if (montoAcreditadoND >= montoTotalND - 0.009) {
        return res.status(400).json({ error: "La factura ya fue acreditada en su totalidad mediante una Nota de Crédito" });
      }

      // AFIP rule: NDs may only reference original invoices (FA/FB/FT/FM/FC), not NCs or other NDs
      const NC_TYPES = new Set(["NCA", "NCB", "NCT", "NCM", "NCC"]);
      const ND_TYPES = new Set(["NDA", "NDB", "NDT", "NDM", "NDC"]);
      if (NC_TYPES.has(original.tipo_comprobante)) {
        return res.status(400).json({ error: "No se puede emitir una Nota de Débito sobre una Nota de Crédito" });
      }
      if (ND_TYPES.has(original.tipo_comprobante)) {
        return res.status(400).json({ error: "No se puede emitir una Nota de Débito sobre otra Nota de Débito" });
      }

      const { motivo, monto } = req.body;
      if (!monto || parseFloat(monto) <= 0) {
        return res.status(400).json({ error: "El monto de la Nota de Débito debe ser mayor a $0" });
      }
      if (!motivo || !String(motivo).trim()) {
        return res.status(400).json({ error: "El motivo es requerido" });
      }

      // Derive ND type from original invoice: FA → NDA, FT → NDT, FM → NDM, FB → NDB, FC → NDC
      const tipoND =
        original.tipo_comprobante === "FA" ? "NDA" :
        original.tipo_comprobante === "FT" ? "NDT" :
        original.tipo_comprobante === "FM" ? "NDM" :
        original.tipo_comprobante === "FC" ? "NDC" : "NDB";
      const user = (req as any).user;

      const montoParsed = parseFloat(monto);
      const nroOriginal = `${original.tipo_comprobante} ${String(original.punto_venta).padStart(4, "0")}-${String(original.numero).padStart(8, "0")}`;

      const ndItems = [{
        descripcion: `${String(motivo).trim()} — s/${nroOriginal}`,
        cantidad: 1,
        precioUnitario: montoParsed,
        alicuotaIva: "no_gravado" as const,
        subtotalNeto: 0,
        subtotal: montoParsed,
      }];

      const nd = await emitirFactura({
        tipoComprobante: tipoND as "NDA" | "NDB" | "NDT" | "NDM" | "NDC",
        cliente: {
          razonSocial: original.cliente_razon_social,
          cuit: original.cliente_cuit,
          dni: original.cliente_dni,
          condicionIva: original.cliente_condicion_iva,
          domicilio: original.cliente_domicilio,
        },
        items: ndItems,
        reservaId: original.reserva_id || undefined,
        folioId: original.folio_id || undefined,
        facturaOriginalId: original.id,
        operador: user?.fullName || user?.username,
        puntoVentaOverride: original.punto_venta,
      } as any);

      // Register cash movement (income) in the corresponding area
      try {
        const pvRow = await db.execute(sql`SELECT area FROM pos_configs WHERE numero = ${nd.puntoVenta} AND activo = true LIMIT 1`);
        const pvArea = (pvRow.rows[0] as any)?.area || "recepcion";
        const totalND = parseFloat(String((nd as any).montoTotal || "0"));
        if (totalND > 0) {
          const nroND = `${nd.tipoComprobante}-${String(nd.numero).padStart(8, "0")}`;
          await storage.registerCashMovement(
            pvArea,
            "nota_debito",
            String(nd.id),
            `${nroND} s/${nroOriginal}${motivo ? ` — ${motivo}` : ""}`,
            "nd",
            String(totalND.toFixed(2)),
            "income",
            user?.fullName || user?.username,
            nd.tipoComprobante
          );
        }
      } catch (cashErr) {
        console.error("[ND] Error registrando movimiento de caja:", cashErr);
      }

      // Add folio charge movement so the ND amount appears in the folio PDF.
      // sales_invoices.folio_id is an integer (not the folio UUID), so we resolve
      // the actual folio UUID via the reservation entity when reserva_id is present.
      // For SPA accounts and Events the invoice is linked in the other direction
      // (spa_accounts.invoice_id / events.invoice_id), so we do a reverse lookup.
      let actualFolioId: string | null = null;
      if (original.reserva_id) {
        try {
          const folioRow = await db.execute(sql`
            SELECT id FROM folios
            WHERE entity_type = 'reservation' AND entity_id = ${String(original.reserva_id)}
            LIMIT 1
          `);
          actualFolioId = (folioRow.rows?.[0] as any)?.id ?? null;
        } catch (e) {
          console.error("[ND] Error resolving folio by reserva_id:", e);
        }
      }
      // SPA account folio (reverse lookup via spa_accounts.invoice_id)
      if (!actualFolioId) {
        try {
          const spaRow = await db.execute(sql`
            SELECT id FROM spa_accounts WHERE invoice_id = ${original.id} LIMIT 1
          `);
          const spaAccountId = (spaRow.rows?.[0] as any)?.id;
          if (spaAccountId) {
            const folioRow = await db.execute(sql`
              SELECT id FROM folios
              WHERE entity_type = 'spa_account' AND entity_id = ${String(spaAccountId)}
              LIMIT 1
            `);
            actualFolioId = (folioRow.rows?.[0] as any)?.id ?? null;
          }
        } catch (e) {
          console.error("[ND] Error resolving folio by spa_account invoice_id:", e);
        }
      }
      // Event folio (reverse lookup via events.invoice_id)
      if (!actualFolioId) {
        try {
          const eventRow = await db.execute(sql`
            SELECT id FROM events WHERE invoice_id = ${original.id} LIMIT 1
          `);
          const eventId = (eventRow.rows?.[0] as any)?.id;
          if (eventId) {
            const folioRow = await db.execute(sql`
              SELECT id FROM folios
              WHERE entity_type = 'event' AND entity_id = ${String(eventId)}
              LIMIT 1
            `);
            actualFolioId = (folioRow.rows?.[0] as any)?.id ?? null;
          }
        } catch (e) {
          console.error("[ND] Error resolving folio by event invoice_id:", e);
        }
      }
      if (actualFolioId) {
        try {
          const nroND = `${nd.tipoComprobante} ${String(nd.puntoVenta).padStart(4, "0")}-${String(nd.numero).padStart(8, "0")}`;
          const totalND = parseFloat(String((nd as any).montoTotal || "0"));
          await db.insert(folioMovements).values({
            folioId: actualFolioId,
            type: "charge",
            amount: totalND.toFixed(2),
            description: `Nota de Débito ${nroND}${motivo ? ` — ${motivo}` : ""}`,
            sourceType: "nota_debito",
            sourceId: String(nd.id),
            receiptType: nd.tipoComprobante,
            registeredBy: user?.fullName || user?.username || null,
          });
          await (storage as any).recalcFolioBalance(actualFolioId);
        } catch (folioErr) {
          console.error("[ND] Error adding folio movement:", folioErr);
        }
      }

      res.status(201).json(nd);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
