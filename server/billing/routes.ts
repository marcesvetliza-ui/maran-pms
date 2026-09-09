      let sourceItemById = new Map<string, any>();
      let ncItems: any[] = [];
      let montoNC = 0;
      let esParcial = false;

      // Every current group invoice carries exact service-source amounts,
      // regardless of whether it is direct or linked to a group payment.
      // Historical payment-linked rows without a source map retain the generic
      // monetary NC path because their source allocation cannot be reconstructed.
      const isMappedGroupInvoice = Boolean(original.group_id && original.source_charge_amounts);
      if (!original.reserva_id && !isMappedGroupInvoice) {
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
      if ((!original.reserva_id && !isMappedGroupInvoice) || Object.keys(sourceAmounts).length === 0 || !Array.isArray(originalItems)) {
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
      if (originalItems.length === 1 && originalItems[0]) {
        // "Sin desglose" intentionally keeps one visible fiscal line while
        // source_charge_amounts retains every exact folio source. Reuse that
        // line's tax treatment for each source selected in a later NC.
        for (const sourceId of normalizedSourceIds) sourceItemById.set(sourceId, originalItems[0]);
      } else {
        for (const [index, sourceId] of normalizedSourceIds.entries()) {
          if (!sourceItemById.has(sourceId) && originalItems[index]) sourceItemById.set(sourceId, originalItems[index]);
        }
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

      const originalCompositionSources = getPersistedGroupInvoiceCompositionSources(original.items);
      const selectedCompositionIds = new Set(Object.keys(sourceChargeAmounts));
      const persistedNcItems = isMappedGroupInvoice
        ? attachGroupInvoiceCompositionSources(
            ncItems,
            originalCompositionSources.filter((source) => selectedCompositionIds.has(source.id)),
          )
        : ncItems;
      const nc = await emitirFactura({
        tipoComprobante: tipoNC as any,
        cliente: {
          razonSocial: original.cliente_razon_social,
          cuit: original.cliente_cuit,
          dni: original.cliente_dni,
          condicionIva: original.cliente_condicion_iva,
          domicilio: original.cliente_domicilio,
        },
        items: persistedNcItems,
        facturaOriginalId: original.id,
        operador: user?.fullName || user?.username,
        puntoVentaOverride: original.punto_venta,
        reservaId: original.reserva_id || undefined,
        groupId: original.group_id || undefined,
        folioId: original.folio_id || undefined,
        cashFormaPago: original.cash_forma_pago,
        sourceChargeIds: original.reserva_id || isMappedGroupInvoice ? Object.keys(sourceChargeAmounts) : undefined,
        sourceChargeAmounts: original.reserva_id || isMappedGroupInvoice ? sourceChargeAmounts : undefined,
        recoverableCreditNote: Boolean(original.reserva_id),
      } as NewInvoiceData);

      // El cargo original nunca se modifica: se registra una corrección negativa
      // trazable por cada concepto de la NC. Esto permite ver el importe original,
      // el ajuste fiscal y el importe vigente en el Folio.
      // A reservation NC is stored before ARCA authorization, then these local
      // writes succeed or fail as one recoverable reconciliation.
      if (original.reserva_id) {
        try {
          const reconciled = await reconcileReservationCreditNote(original, nc, user);
          return res.status(201).json(reconciled);
        } catch (error: any) {
          const message = String(error?.message || "No se pudo conciliar la NC con el Folio");
          await db.execute(sql`
            UPDATE sales_invoices
            SET reconciliation_error = ${message},
                reconciliation_updated_at = now()
            WHERE id = ${Number((nc as any).id)}
          `).catch(() => undefined);
          return res.status(409).json({
            error: message,
            reconciliation_error: message,
            reconciliationError: message,
            pendingCreditNoteId: Number((nc as any).id),
            reconciliationStatus: "pendiente",
          });
        }
      }

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
      });

      // A reservation NC changes the fiscal amount and Folio balance only. It
      // must not create a cash outflow while its payments remain active.
      if (!original.reserva_id && !original.group_id) {
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

      // Reservation debit notes reverse an active credit note. They restore the
      // original invoice's fiscal allocation; they are not a new operational
      // charge and do not collect cash by themselves.
      if (["NCA", "NCB", "NCC", "NCT", "NCM"].includes(original.tipo_comprobante) && original.reserva_id) {
        const { motivo, monto } = req.body;
        const requestedAmount = parseFloat(String(monto || "0"));
        if (!String(motivo || "").trim()) {
          return res.status(400).json({ error: "El motivo de la Nota de Débito es obligatorio" });
        }

        try {
          const result = await withReservationInvoiceLock(String(original.reserva_id), async () => {
          const lockedNcResult = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${id} LIMIT 1`);
          const nc = lockedNcResult.rows[0] as any;
          if (!nc || !["NCA", "NCB", "NCC", "NCT", "NCM"].includes(nc.tipo_comprobante)) {
            throw new Error("La Nota de Crédito seleccionada ya no está disponible");
          }
          if (nc.reconciliation_status && nc.reconciliation_status !== "conciliada") {
            throw new Error("La Nota de Crédito todavía no está conciliada con el Folio");
          }

          const sourceInvoiceResult = await db.execute(sql`
            SELECT * FROM sales_invoices WHERE id = ${Number(nc.nota_credito_id)} LIMIT 1
          `);
          const sourceInvoice = sourceInvoiceResult.rows[0] as any;
          if (!sourceInvoice || String(sourceInvoice.reserva_id) !== String(nc.reserva_id)) {
            throw new Error("No se encontró la factura original vinculada a la Nota de Crédito");
          }

          const parseJson = (value: unknown): any => {
            if (typeof value !== "string") return value;
            try { return JSON.parse(value); } catch { return null; }
          };
          const reconcileDebitNote = async (nd: any) => {
            if (nd.reconciliation_status === "conciliada") {
              return { ...nd, reversedCreditNoteId: nc.id, originalInvoiceId: sourceInvoice.id };
            }
            const debitAmount = parseFloat(String(nd.monto_total ?? nd.montoTotal ?? 0));
            const ncTotal = parseFloat(String(nc.monto_total || 0));
            const ncAlreadyReversed = parseFloat(String(nc.monto_acreditado || 0));
            const newNcReversed = Math.min(ncTotal, ncAlreadyReversed + debitAmount);
            const originalTotal = parseFloat(String(sourceInvoice.monto_total || 0));
            const originalCredited = parseFloat(String(sourceInvoice.monto_acreditado || 0));
            const newOriginalCredited = Math.max(0, originalCredited - debitAmount);
            await db.transaction(async tx => {
              await tx.execute(sql`
                UPDATE sales_invoices
                SET monto_acreditado = ${newNcReversed.toFixed(2)},
                    estado = ${newNcReversed >= ncTotal - 0.009 ? "anulada" : "parcial"}
                WHERE id = ${nc.id}
              `);
              await tx.execute(sql`
                UPDATE sales_invoices
                SET monto_acreditado = ${newOriginalCredited.toFixed(2)},
                    estado = ${newOriginalCredited <= 0.009 ? "emitida" : newOriginalCredited >= originalTotal - 0.009 ? "anulada" : "parcial"}
                WHERE id = ${sourceInvoice.id}
              `);
              await tx.execute(sql`
                UPDATE sales_invoices
                SET reconciliation_status = 'conciliada',
                    reconciliation_error = NULL,
                    reconciliation_updated_at = now()
                WHERE id = ${Number(nd.id)}
              `);
            });
            return {
              ...nd,
              reconciliation_status: "conciliada",
              reversedCreditNoteId: nc.id,
              originalInvoiceId: sourceInvoice.id,
            };
          };

          const pendingDebitResult = await db.execute(sql`
            SELECT *
            FROM sales_invoices
            WHERE nota_credito_id = ${id}
              AND tipo_comprobante IN ('NDA', 'NDB', 'NDC', 'NDT', 'NDM')
              AND reconciliation_status = 'pendiente'
            ORDER BY id DESC
            LIMIT 1
          `);
          const pendingDebit = pendingDebitResult.rows[0] as any;
          if (pendingDebit) {
            let authorizedDebit = pendingDebit;
            if (pendingDebit.estado === "autorizacion_pendiente") {
              authorizedDebit = await emitirFactura({
                tipoComprobante: pendingDebit.tipo_comprobante,
                cliente: {
                  razonSocial: pendingDebit.cliente_razon_social,
                  cuit: pendingDebit.cliente_cuit,
                  dni: pendingDebit.cliente_dni,
                  condicionIva: pendingDebit.cliente_condicion_iva,
                  domicilio: pendingDebit.cliente_domicilio,
                },
                items: parseJson(pendingDebit.items),
                reservaId: pendingDebit.reserva_id,
                facturaOriginalId: nc.id,
                operador: pendingDebit.operador,
                puntoVentaOverride: pendingDebit.punto_venta,
                cashFormaPago: pendingDebit.cash_forma_pago,
                sourceChargeIds: parseJson(pendingDebit.source_charge_ids),
                sourceChargeAmounts: parseJson(pendingDebit.source_charge_amounts),
                observaciones: pendingDebit.observaciones,
                recoverableDebitNote: true,
                recoveryInvoiceId: Number(pendingDebit.id),
              } as NewInvoiceData);
            }
            return reconcileDebitNote(authorizedDebit);
          }

          const priorDebitResult = await db.execute(sql`
            SELECT source_charge_amounts, monto_total
            FROM sales_invoices
            WHERE nota_credito_id = ${id}
              AND tipo_comprobante IN ('NDA', 'NDB', 'NDC', 'NDT', 'NDM')
              AND estado <> 'anulada'
          `);
          const creditedBySource = parseJson(nc.source_charge_amounts);
          if (!creditedBySource || typeof creditedBySource !== "object" || Array.isArray(creditedBySource)) {
            throw new Error("La Nota de Crédito no tiene un detalle seguro por cargo y no puede revertirse automáticamente");
          }
          const reversedBySource: Record<string, number> = {};
          for (const debit of priorDebitResult.rows as any[]) {
            const debitMap = parseJson(debit.source_charge_amounts);
            if (!debitMap || typeof debitMap !== "object" || Array.isArray(debitMap)) {
              throw new Error("Una Nota de Débito anterior no tiene detalle por cargo. Revisá el historial antes de continuar");
            }
            for (const [sourceId, value] of Object.entries(debitMap)) {
              reversedBySource[sourceId] = (reversedBySource[sourceId] || 0) + (parseFloat(String(value)) || 0);
            }
          }

          const sourceChargeAmounts = allocateDebitReversalBySource(
            creditedBySource as Record<string, number>,
            reversedBySource,
            requestedAmount,
          );
          const sourceIds = Object.keys(sourceChargeAmounts);
          const ncSourceIds = parseJson(nc.source_charge_ids);
          const ncItems = parseJson(nc.items);
          if (!Array.isArray(ncSourceIds) || !Array.isArray(ncItems)) {
            throw new Error("La Nota de Crédito no conserva sus conceptos fiscales originales");
          }
          const normalizedNcSourceIds = ncSourceIds.map(String);
          const ndItems = sourceIds.map(sourceId => {
            const index = normalizedNcSourceIds.indexOf(sourceId);
            const sourceItem = ncItems[index] || (ncItems.length === 1 ? ncItems[0] : null);
            if (!sourceItem) throw new Error("No se pudo reconstruir un concepto fiscal de la Nota de Crédito");
            const amount = sourceChargeAmounts[sourceId];
            const alicuotaIva = ["21", "10.5", "exento", "no_gravado"].includes(String(sourceItem.alicuotaIva))
              ? sourceItem.alicuotaIva
              : "no_gravado";
            const divisor = alicuotaIva === "21" ? 1.21 : alicuotaIva === "10.5" ? 1.105 : 1;
            return {
              descripcion: `${sourceItem.descripcion || `Reversión ${sourceId}`} — ${String(motivo).trim()}`,
              cantidad: 1,
              precioUnitario: amount,
              alicuotaIva,
              subtotalNeto: Number((amount / divisor).toFixed(2)),
              subtotal: amount,
            };
          });
          const sourceType = String(sourceInvoice.tipo_comprobante);
          const tipoND =
            sourceType === "FA" ? "NDA" :
            sourceType === "FT" ? "NDT" :
            sourceType === "FM" ? "NDM" :
            sourceType === "FC" ? "NDC" : "NDB";
          const user = (req as any).user;
          const nd = await emitirFactura({
            tipoComprobante: tipoND as any,
            cliente: {
              razonSocial: sourceInvoice.cliente_razon_social,
              cuit: sourceInvoice.cliente_cuit,
              dni: sourceInvoice.cliente_dni,
              condicionIva: sourceInvoice.cliente_condicion_iva,
              domicilio: sourceInvoice.cliente_domicilio,
            },
            items: ndItems,
            reservaId: sourceInvoice.reserva_id,
            facturaOriginalId: nc.id,
            operador: user?.fullName || user?.username,
            puntoVentaOverride: sourceInvoice.punto_venta,
            cashFormaPago: sourceInvoice.cash_forma_pago,
            sourceChargeIds: sourceIds,
            sourceChargeAmounts,
            observaciones: `Reversión de ${nc.tipo_comprobante} ${String(nc.punto_venta).padStart(4, "0")}-${String(nc.numero).padStart(8, "0")}`,
            recoverableDebitNote: true,
          });

          return reconcileDebitNote(nd);
          });
          return res.status(201).json(result);
        } catch (error: any) {
          return res.status(409).json({ error: error?.message || "No se pudo revertir la Nota de Crédito" });
        }
      }

      let groupId = original.group_id ? String(original.group_id) : null;
      if (!groupId) {
        groupId = await findLegacyInvoiceGroupId(id);
      }

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

      const groupDebitSourceId = groupId ? `group-debit:${original.id}` : null;
      const ndItems = attachGroupInvoiceCompositionSources([{
        descripcion: `${String(motivo).trim()} — s/${nroOriginal}`,
        cantidad: 1,
        precioUnitario: montoParsed,
        alicuotaIva: "no_gravado" as const,
        subtotalNeto: 0,
        subtotal: montoParsed,
      }], groupDebitSourceId ? [{
        id: groupDebitSourceId,
        kind: "group_charge",
        concept: String(motivo).trim(),
        destination: "Grupo",
      }] : []);

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
        groupId: groupId || undefined,
        folioId: original.folio_id || undefined,
        facturaOriginalId: original.id,
        operador: user?.fullName || user?.username,
        puntoVentaOverride: original.punto_venta,
        sourceChargeIds: groupDebitSourceId ? [groupDebitSourceId] : undefined,
        sourceChargeAmounts: groupDebitSourceId ? { [groupDebitSourceId]: montoParsed } : undefined,
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
