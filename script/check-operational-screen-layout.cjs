const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const outputDir =
  process.env.SCREENSHOT_DIR || "/tmp/maran-operational-screens";
fs.mkdirSync(outputDir, { recursive: true });
const origin = process.env.SCREEN_TEST_ORIGIN || "http://127.0.0.1:5194";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error(
    "Use a local Vite server; this check never targets the operational system.",
  );
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  const errors = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("maranTabActive", "1");
    localStorage.setItem("maranPosId", "test");
  });
  const guest = {
    id: "g",
    firstName: "Ana",
    lastName: "Prueba",
    documentNumber: "30111222",
    vatCondition: "consumidor_final",
    isActive: true,
  };
  const room = {
    id: "r",
    roomNumber: "303",
    roomTypeId: "t",
    floor: 3,
    status: "available",
    isActive: true,
    bedConfig: "MAT",
    allowedBedConfigs: ["MAT", "TWIN"],
    maxOccupancy: 2,
  };
  const account = {
    id: "spa-account",
    guestName: "Ana Prueba",
    chargeVersion: "a".repeat(64),
    preferences: null,
    status: "open",
    totalCents: 6000000,
    paidCents: 0,
    balanceCents: 6000000,
    readOnly: false,
    canInvoice: true,
    transferred: null,
    items: [
      {
        id: "line",
        description: "Tratamiento de prueba",
        quantity: 1,
        unitPrice: 60000,
        subtotal: 60000,
        itemType: "treatment",
        inventoryItemId: null,
      },
    ],
    payments: [],
    movements: [],
    events: [],
    operations: [],
    invoices: [],
  };
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const lodging = {
    id: "res",
    reservationCode: "RES-SYNTHETIC",
    guestId: "g",
    guest,
    roomId: "r",
    room: { ...room, roomType: { id: "t", name: "Estándar", code: "STD" } },
    roomTypeId: "t",
    status: "confirmed",
    source: "directo",
    checkInDate: today,
    checkOutDate: tomorrow,
    nights: 1,
    numberOfGuests: 2,
    baseRatePerNight: "90000",
    finalRatePerNight: "90000",
    totalRoomAmount: "90000",
    pricingScheme: "nightly_v1",
    pricingRevision: 0,
    nightlyPricing: [{ date: today, rateCents: 9000000, discountCents: 0 }],
    charges: [],
    payments: [],
  };
  const order = {
    id: "order",
    orderNumber: "ORD-PRUEBA",
    tableId: "table",
    areaId: "area",
    status: "open",
    openedAt: new Date().toISOString(),
    covers: 2,
    waiterName: "Mozo de prueba",
    subtotal: "23057.85",
    tax: "4842.15",
    total: "27900",
    items: [
      {
        id: "food",
        orderId: "order",
        menuItemId: "meal",
        quantity: 2,
        unitPrice: "13950",
        subtotal: "27900",
        status: "served",
        course: 1,
        menuItem: { id: "meal", name: "Plato de prueba" },
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()).pathname;
    let body = [];
    if (req.method() !== "GET") {
      writes.push(u);
      return route.fulfill({
        status: 409,
        json: { error: "Browser read-only test" },
      });
    }
    if (u === "/api/auth/me")
      body = {
        id: "test",
        username: "tester",
        fullName: "Operador de prueba",
        role: "admin",
      };
    if (u === "/api/permissions/mine")
      body = {
        role: "admin",
        resourceKeys: [
          "sidebar:/planning",
          "sidebar:/reservations",
          "sidebar:/companies",
          "sidebar:/rooms",
          "api:rooms:write",
          "sidebar:/spa-clients",
          "sidebar:/spa",
          "sidebar:/restaurant",
          "sidebar:/operaciones/emitir-comprobante",
          "sidebar:/cash-register",
          "api:emitir-comprobante:spa",
          "funding:read",
          "funding:write",
        ],
      };
    if (u === "/api/guests" || u === "/api/spa/clients") body = [guest];
    if (u === "/api/rooms") body = [room];
    if (u === "/api/room-types")
      body = [
        {
          id: "t",
          code: "STD",
          name: "Estándar",
          baseRate: "90000",
          maxOccupancy: 2,
        },
      ];
    if (u === "/api/reservations/generate-code")
      body = { code: "RES-SYNTHETIC" };
    if (u.endsWith("/account")) body = { ok: true, data: account };
    if (u.endsWith("/prefactura-context"))
      body = {
        ok: true,
        data: {
          environment: "homologacion",
          point: 5,
          voucherPoint: 23,
          companies: [],
        },
      };
    if (u.endsWith("/recipient"))
      body = {
        ok: true,
        data: {
          guestId: "g",
          kind: "guest",
          firstName: "Ana",
          lastName: "Prueba",
          documentType: "DNI",
          documentNumber: "30111222",
          vatCondition: "consumidor_final",
          cuit: "",
          address: "",
          editable: true,
        },
      };
    if (u.endsWith("/collection-shifts")) body = { ok: true, data: [] };
    if (u.includes("/scopes/spa/"))
      body = {
        ok: true,
        data: {
          scope: { kind: "spa", id: account.id },
          debtCents: 6000000,
          receipts: [],
          documents: [],
          operations: [],
          rectifications: [],
        },
      };
    if (u === "/api/billing/config") body = {};
    if (u === "/api/planning")
      body = {
        rooms: [lodging.room],
        days: [today],
        occupancy: { r: ["confirmed"] },
        reservations: {
          res: {
            id: "res",
            guestName: "Ana Prueba",
            checkIn: today,
            checkOut: tomorrow,
            status: "confirmed",
            source: "directo",
          },
        },
        cellReservations: { r: { [today]: "res" } },
        groupBlocks: {},
        cellGroupBlocks: {},
      };
    if (u === "/api/reservations/res") body = lodging;
    if (u.endsWith("/nightly-pricing"))
      body = {
        reservation: lodging,
        blocked: null,
        fiscal: { state: "pendiente", coveredCents: 0, pendingCents: 9000000 },
      };
    if (u === "/api/reservation-edit-permission") body = { canEdit: true };
    if (u === "/api/restaurant/areas")
      body = [
        { id: "area", name: "Justo", areaType: "restaurant", isActive: true },
      ];
    if (u === "/api/restaurant/tables")
      body = [
        {
          id: "table",
          tableNumber: "1",
          areaId: "area",
          status: "occupied",
          capacity: 2,
          shape: "square",
          positionX: 0,
          positionY: 0,
        },
      ];
    if (u === "/api/restaurant/orders") body = [order];
    if (u === "/api/restaurant/orders/order") body = order;
    if (u === "/api/spa/cabins")
      body = [{ id: "cabin", name: "Gabinete de prueba", isActive: "true" }];
    if (u === "/api/spa/treatments")
      body = [
        {
          id: "treatment",
          name: "Masaje de prueba",
          durationMinutes: 60,
          price: "60000",
          isActive: "true",
        },
      ];
    if (u === "/api/spa/appointments")
      body = [
        {
          id: "turn",
          guestName: "Ana",
          guestLastName: "Prueba",
          appointmentDate: today,
          startTime: "09:00",
          endTime: "10:00",
          cabinId: "cabin",
          treatmentId: "treatment",
          treatment: { id: "treatment", name: "Masaje de prueba" },
          cabin: { id: "cabin", name: "Gabinete de prueba" },
          status: "confirmed",
          price: "60000",
          totalPrice: "60000",
        },
      ];
    if (u === "/api/spa/accounts/by-appointment/turn") body = null;
    await route.fulfill({ json: body });
  });
  for (const [name, path, button, save] of [
    [
      "reservation",
      "/reservations",
      "button-new-reservation",
      "button-submit-reservation",
    ],
    ["company", "/companies", "button-add-company", "button-save-company"],
    [
      "spa-client",
      "/spa-clients",
      "button-new-spa-client",
      "button-save-client",
    ],
    ["room", "/rooms", "button-new-room", "button-submit-room"],
  ]) {
    await page.goto(origin + path);
    await page.getByTestId(button).click();
    for (const [w, h] of [
      [1366, 768],
      [1024, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(350);
      const box = await page.getByRole("dialog").boundingBox(),
        saveBox = await page.getByTestId(save).boundingBox();
      if (
        !box ||
        box.x < 0 ||
        box.x + box.width > w + 1 ||
        box.y < 0 ||
        box.y + box.height > h + 1
      ) {
        await page.screenshot({ path: outputDir + "/overflow.png" });
        throw Error(
          name +
            " dialog overflow " +
            JSON.stringify({
              w,
              box,
              metrics: await page
                .getByRole("dialog")
                .evaluate((el) => ({
                  width: getComputedStyle(el).width,
                  viewport: innerWidth,
                  css: getComputedStyle(el).maxWidth,
                  min: getComputedStyle(el).minWidth,
                })),
            }),
        );
      }
      if (!saveBox || saveBox.y + saveBox.height > h || saveBox.y < 0)
        throw Error(name + " footer hidden " + w);
      if (
        await page
          .getByRole("dialog")
          .evaluate((el) => el.scrollWidth > el.clientWidth + 2)
      )
        throw Error(name + " content overflow " + w);
      await page.screenshot({ path: `${outputDir}/${name}-${w}.png` });
    }
    console.log(name + " desktop/notebook/mobile: dialog and footer fit");
    await page.setViewportSize({ width: 1366, height: 768 });
  }
  await page.goto(
    origin + "/operaciones/emitir-comprobante?spaAccountId=spa-account",
  );
  await page.getByTestId("spa-cash-notice").waitFor();
  if (
    (await page
      .getByRole("textbox", { name: "Condición IVA", exact: true })
      .inputValue()) !== "Consumidor final"
  )
    throw Error("Saved IVA missing");
  const notice = await page.getByTestId("spa-cash-notice").boundingBox();
  if (notice.y > 500) throw Error("Cash warning too low");
  await page.screenshot({ path: outputDir + "/spa-receipt-1366.png" });
  await page
    .getByRole("button", { name: "Revisar factura", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Revisión del comprobante SPA" })
    .waitFor();
  for (const [name, path, clicks, save] of [
    [
      "restaurant",
      "/restaurant",
      ["table-1", "button-close-table"],
      "button-confirm-close",
    ],
    ["planning", "/planning", [`cell-r-${today}`], null],
    ["spa-detail", "/spa", ["appointment-turn"], "button-start-appointment"],
  ]) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(origin + path);
    for (const id of clicks) await page.getByTestId(id).click();
    await page.waitForTimeout(350);
    for (const [w, h] of [
      [1366, 768],
      [1024, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(350);
      const dialog = page.getByRole("dialog").last(),
        box = await dialog.boundingBox();
      await page.screenshot({ path: `${outputDir}/${name}-${w}.png` });
      if (
        !box ||
        box.x < 0 ||
        box.x + box.width > w + 2 ||
        box.y < 0 ||
        box.y + box.height > h + 2
      )
        throw Error(name + " overflow " + JSON.stringify({ w, box }));
      if (save) {
        const sb = await page.getByTestId(save).boundingBox();
        if (sb.y + sb.height > h) throw Error(name + " hidden footer " + w);
      }
    }
    console.log(name + " desktop/notebook/mobile checked");
  }
  if (writes.length || errors.length)
    throw Error(JSON.stringify({ writes, errors }));
  console.log(
    "All screen checks passed; synthetic API fixtures, no writes, no runtime errors",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
