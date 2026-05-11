export function Confirmacion() {
  const hotel = {
    name: "Maran Suites & Towers",
    address: "Alameda de la Federación 698, Paraná, Entre Ríos",
    phone: "+54 (0343) 503 8070",
    email: "recepcion@maran.com.ar",
    web: "MARAN.COM.AR",
    cuit: "33-68110008-9",
    iva: "Responsable Inscripto",
  };

  const reservation = {
    code: "RES-2026-00142",
    guestName: "GARCÍA Roberto",
    guestDni: "DNI: 28.456.789",
    guestEmail: "roberto.garcia@gmail.com",
    guestPhone: "+54 9 343 412 5678",
    checkIn: "15/06/2026",
    checkOut: "18/06/2026",
    nights: 3,
    room: "412",
    roomType: "Suite Ejecutiva",
    pax: 2,
    ratePerNight: "$ 45.000,00",
    totalAlojamiento: "$ 135.000,00",
    extraServices: [
      { desc: "Desayuno para 2 pax × 3 días", amount: "$ 18.000,00" },
      { desc: "Late Check-out (hasta 15:00 hs)", amount: "$ 5.000,00" },
    ],
    totalExtras: "$ 23.000,00",
    grandTotal: "$ 158.000,00",
    saldo: "$ 0,00",
    paymentMethod: "Tarjeta de crédito (pago anticipado)",
    notes: "Solicita habitación alta con vista al parque. Aniversario de bodas.",
    status: "Confirmada",
    issuedDate: "09/05/2026",
  };

  const accentOrange = "#e8841a";
  const footerBg = "#a0522d";

  return (
    <div
      style={{
        background: "#f0f0f0",
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 0 48px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* A4 page */}
      <div
        style={{
          width: 794,
          background: "#fff",
          boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* ── HEADER PHOTO */}
        <div style={{ position: "relative", width: "100%", height: 200, overflow: "hidden" }}>
          <img
            src="/__mockup/images/confirmacion-template.jpg"
            alt="Paraná"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
          />
        </div>

        {/* ── ORANGE ACCENT LINE */}
        <div style={{ height: 6, background: accentOrange, width: "100%" }} />

        {/* ── BODY CONTENT */}
        <div style={{ padding: "28px 40px 32px" }}>

          {/* Title + code row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: "#888", marginBottom: 4 }}>
                Confirmación de Reserva
              </div>
              <div style={{ fontSize: 22, fontWeight: "bold", color: "#1a1a1a", fontFamily: "Georgia, serif" }}>
                {hotel.name}
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>Hotel & Spa · Paraná, Entre Ríos</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  background: "#f8f4ef",
                  border: `1px solid ${accentOrange}`,
                  borderRadius: 6,
                  padding: "8px 14px",
                  display: "inline-block",
                }}
              >
                <div style={{ fontSize: 8, color: "#888", letterSpacing: 1, textTransform: "uppercase" }}>N° de Reserva</div>
                <div style={{ fontSize: 14, fontWeight: "bold", color: "#333", marginTop: 2 }}>{reservation.code}</div>
                <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>Emitida: {reservation.issuedDate}</div>
              </div>
              <div
                style={{
                  marginTop: 6,
                  display: "inline-block",
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  border: "1px solid #a5d6a7",
                  borderRadius: 12,
                  padding: "3px 10px",
                  fontSize: 9,
                  fontWeight: "bold",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginLeft: 2,
                }}
              >
                {reservation.status}
              </div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: "#e0e0e0", marginBottom: 20 }} />

          {/* KEY DATES GRID */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              border: "1px solid #ddd",
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            {[
              { label: "Check-in", value: reservation.checkIn, icon: "📅" },
              { label: "Check-out", value: reservation.checkOut, icon: "📅" },
              { label: "Noches", value: String(reservation.nights), icon: "🌙" },
              { label: "Habitación", value: reservation.room, icon: "🚪" },
              { label: "Huéspedes", value: String(reservation.pax), icon: "👤" },
            ].map((cell, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 8px",
                  textAlign: "center",
                  borderRight: i < 4 ? "1px solid #ddd" : "none",
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 3 }}>{cell.icon}</div>
                <div style={{ fontSize: 8, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  {cell.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: "bold", color: "#1a3a6c" }}>{cell.value}</div>
              </div>
            ))}
          </div>

          {/* TWO COLUMNS: Guest + Room */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Guest */}
            <div style={{ background: "#f8f9fa", borderRadius: 8, padding: "14px 16px", border: "1px solid #eee" }}>
              <div
                style={{
                  fontSize: 8,
                  color: "#888",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontWeight: "bold",
                  marginBottom: 8,
                  borderBottom: `2px solid ${accentOrange}`,
                  paddingBottom: 5,
                  display: "inline-block",
                }}
              >
                Huésped Principal
              </div>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#111", marginBottom: 4 }}>{reservation.guestName}</div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>{reservation.guestDni}</div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>{reservation.guestEmail}</div>
              <div style={{ fontSize: 10, color: "#555" }}>{reservation.guestPhone}</div>
            </div>

            {/* Room */}
            <div style={{ background: "#f8f9fa", borderRadius: 8, padding: "14px 16px", border: "1px solid #eee" }}>
              <div
                style={{
                  fontSize: 8,
                  color: "#888",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontWeight: "bold",
                  marginBottom: 8,
                  borderBottom: `2px solid ${accentOrange}`,
                  paddingBottom: 5,
                  display: "inline-block",
                }}
              >
                Tipo de Habitación
              </div>
              <div style={{ fontSize: 14, fontWeight: "bold", color: "#111", marginBottom: 4 }}>{reservation.roomType}</div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Tarifa por noche: <strong>{reservation.ratePerNight}</strong></div>
              <div style={{ fontSize: 10, color: "#555" }}>Método de pago: {reservation.paymentMethod}</div>
            </div>
          </div>

          {/* PRICING TABLE */}
          <div
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                background: "#1a3a6c",
                color: "white",
                padding: "8px 14px",
                fontSize: 9,
                fontWeight: "bold",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              Resumen de Cargos
            </div>
            <div style={{ padding: "0 14px" }}>
              {/* Alojamiento row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 11,
                }}
              >
                <span style={{ color: "#444" }}>
                  Alojamiento — {reservation.nights} noches × {reservation.ratePerNight}
                </span>
                <span style={{ fontWeight: "bold", color: "#111" }}>{reservation.totalAlojamiento}</span>
              </div>
              {/* Extra services */}
              {reservation.extraServices.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #f0f0f0",
                    fontSize: 11,
                    color: "#555",
                  }}
                >
                  <span>{s.desc}</span>
                  <span style={{ fontWeight: "bold" }}>{s.amount}</span>
                </div>
              ))}
              {/* Total */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0 10px",
                  fontSize: 13,
                  fontWeight: "bold",
                  borderTop: `2px solid ${accentOrange}`,
                  marginTop: 4,
                }}
              >
                <span style={{ color: "#1a3a6c" }}>TOTAL</span>
                <span style={{ color: "#1a3a6c", fontSize: 15 }}>{reservation.grandTotal}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0 0 10px",
                  fontSize: 11,
                  color: "#27ae60",
                }}
              >
                <span>Saldo pendiente</span>
                <span style={{ fontWeight: "bold" }}>{reservation.saldo}</span>
              </div>
            </div>
          </div>

          {/* NOTES */}
          {reservation.notes && (
            <div
              style={{
                background: "#fffbf0",
                border: `1px solid #ffe0a0`,
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 8, color: "#b8860b", fontWeight: "bold", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>
                Observaciones
              </div>
              <div style={{ fontSize: 10, color: "#555", lineHeight: 1.6 }}>{reservation.notes}</div>
            </div>
          )}

          {/* GREETING */}
          <div style={{ fontSize: 10, color: "#666", lineHeight: 1.7, textAlign: "center", fontStyle: "italic", marginBottom: 8 }}>
            Estimado/a <strong>{reservation.guestName}</strong>, gracias por elegirnos.<br />
            Le esperamos con mucho gusto en nuestro hotel. Ante cualquier consulta no dude en contactarnos.
          </div>
        </div>

        {/* ── FOOTER */}
        <div
          style={{
            background: footerBg,
            padding: "18px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Logo */}
          <div style={{ flexShrink: 0, width: 130 }}>
            <img
              src="/__mockup/images/hotel-logo.png"
              alt="Maran Suites & Towers"
              style={{ width: 120, filter: "brightness(0) invert(1)", opacity: 0.9 }}
            />
          </div>

          {/* Contact info center */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 9, lineHeight: 1.9 }}>
              <div>📍 {hotel.address}</div>
              <div>✉ {hotel.email} &nbsp;·&nbsp; 📞 {hotel.phone}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 8, marginTop: 2 }}>
                CUIT {hotel.cuit} · {hotel.iva}
              </div>
            </div>
          </div>

          {/* Web */}
          <div
            style={{
              flexShrink: 0,
              textAlign: "right",
              color: "white",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
            }}
          >
            {hotel.web}
          </div>
        </div>
      </div>
    </div>
  );
}
