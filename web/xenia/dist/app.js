"use strict";

const q = (selector, parent = document) => parent.querySelector(selector);
const qa = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const currency = (value) => "$ " + new Intl.NumberFormat("es-AR", {maximumFractionDigits: 0}).format(value);
const proposedContact = "contacto@xeniapms.com";
let returnFocus = null;

function openDialog(dialog, trigger) {
  returnFocus = trigger || document.activeElement;
  dialog.showModal();
  document.body.style.overflow = "hidden";
}
function closeDialog(dialog) { dialog.close(); }
qa("dialog").forEach((dialog) => {
  q(".dialog-close", dialog).addEventListener("click", () => closeDialog(dialog));
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => {
    document.body.style.overflow = "";
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
  });
});
qa("[data-open]").forEach((button) => button.addEventListener("click", () => {
  const target = document.getElementById(button.dataset.open);
  if (target) openDialog(target, button);
  closeMenu();
}));

const menuButton = q("#menu-toggle");
const mobileMenu = q("#mobile-nav");
function closeMenu() { menuButton.setAttribute("aria-expanded", "false"); mobileMenu.hidden = true; }
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  mobileMenu.hidden = !open;
});
qa("a", mobileMenu).forEach((a) => a.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
window.matchMedia("(min-width: 721px)").addEventListener("change", (e) => { if (e.matches) closeMenu(); });
q("#hide-review").addEventListener("click", () => { q("#review-strip").hidden = true; });

function addTabKeyboard(container, callback) {
  const tabs = qa('[role="tab"]', container);
  container.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    callback(tabs[next]);
  });
}
function activateMockTab(button) {
  qa(".mock-tabs button").forEach((tab) => {
    const selected = tab === button;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
  });
}
qa(".mock-tabs button").forEach((button) => button.addEventListener("click", () => activateMockTab(button)));
addTabKeyboard(q(".mock-tabs"), activateMockTab);

const rooms = ["201", "202", "203", "204", "205"];
const nights = ["Lun 16", "Mar 17", "Mié 18", "Jue 19", "Vie 20", "Sáb 21", "Dom 22"];
const bookings = [
  {room: "201", start: 0, length: 3, status: "Confirmada", color: ""},
  {room: "202", start: 0, length: 2, status: "En estadía", color: "teal"},
  {room: "203", start: 2, length: 3, status: "Próximo ingreso", color: "outline"},
  {room: "204", start: 0, length: 4, status: "En estadía", color: "teal"},
  {room: "205", start: 0, length: 1, status: "Salida", color: "light"},
];
const calendar = q("#planning-grid");
function cell(text, className, row, column) {
  const node = document.createElement("div");
  node.textContent = text;
  node.className = className;
  node.style.gridRow = row;
  node.style.gridColumn = column;
  calendar.append(node);
}
cell("HAB.", "calendar-day", 1, 1);
nights.forEach((label, day) => cell(label, "calendar-day", 1, day + 2));
rooms.forEach((room, index) => {
  cell(room, "calendar-room", index + 2, 1);
  nights.forEach((_, day) => cell("", "calendar-cell" + (day === 0 ? " today" : ""), index + 2, day + 2));
});
bookings.forEach((booking) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `booking ${booking.color}`;
  button.style.gridRow = rooms.indexOf(booking.room) + 2;
  button.style.gridColumn = `${booking.start + 2} / span ${booking.length}`;
  button.textContent = booking.status;
  button.setAttribute("aria-label", `Explorar reserva de ejemplo de habitación ${booking.room}, ${booking.length} ${booking.length === 1 ? "noche" : "noches"}`);
  button.addEventListener("click", () => showReservation(booking, button));
  calendar.append(button);
});
function showReservation(booking, trigger) {
  const accommodation = booking.length * 140000;
  const consumption = 32000;
  const pending = 52000;
  const payments = accommodation + consumption - pending;
  q("#reservation-room").textContent = `Habitación ${booking.room} · ${booking.status}`;
  q("#reservation-dates").textContent = `${booking.length} ${booking.length === 1 ? "noche" : "noches"} · importes en ARS · datos de ejemplo.`;
  const summary = q("#reservation-summary");
  summary.replaceChildren();
  [["Alojamiento", accommodation], ["Consumos", consumption], ["Pagos registrados", -payments], ["Saldo pendiente", pending]].forEach(([label, value], index) => {
    const row = document.createElement("div");
    if (index === 3) row.className = "account-balance";
    const name = document.createElement("span"); name.textContent = label;
    const amount = document.createElement("b"); amount.textContent = value < 0 ? "− " + currency(-value) : currency(value);
    row.append(name, amount); summary.append(row);
  });
  openDialog(q("#reservation-dialog"), trigger);
}
q("#view-payment-example").addEventListener("click", () => {
  returnFocus = q("#tab-cobros");
  q("#reservation-dialog").close();
  activateMockTab(q("#tab-cobros"));
  q(".product-visual").scrollIntoView({behavior: "smooth", block: "center"});
  q("#tab-cobros").focus({preventScroll: true});
});

const roles = {
  recepcion: {
    pill: "El recorrido del huésped", title: "De la primera reserva\nal último check-out.",
    description: "Planning, estadías y folios para acompañar el movimiento de cada habitación, con la información que recepción necesita a mano.",
    features: ["Reservas y disponibilidad en una misma vista.", "Estadías, cargos y consumos relacionados.", "Cobros y saldos con su contexto."],
    label: "UNA ESTADÍA, TODO EL RECORRIDO",
    stages: [["Reserva", "Disponibilidad y fechas"], ["Estadía", "Habitación, cargos y servicios"], ["Cierre de cuenta", "Cobros, comprobantes y saldo"]]
  },
  administracion: {
    pill: "Los movimientos, con contexto", title: "Del cobro al comprobante.\nCada vínculo, a la vista.",
    description: "Caja, comprobantes y cuentas corrientes para revisar cómo se relacionan los movimientos de la operación y los saldos de cada entidad.",
    features: ["Pagos y movimientos identificados.", "Comprobantes y ajustes con su historial.", "Cuentas de huéspedes, empresas y grupos."],
    label: "UN MOVIMIENTO, SU TRAZABILIDAD",
    stages: [["Registro", "Cobro e identificación de origen"], ["Comprobante", "Relación con el circuito fiscal"], ["Seguimiento", "Imputaciones y saldo pendiente"]]
  },
  servicios: {
    pill: "Los servicios del hotel", title: "Cada consumo acompaña\nla cuenta de la estadía.",
    description: "Restaurante, SPA y cargos de la habitación para relacionar los servicios del establecimiento con el trabajo de recepción y administración.",
    features: ["Consumos y cargos vinculados al folio.", "Servicios según el alcance de cada instalación.", "Información compartida para continuar el circuito."],
    label: "UN SERVICIO, SU LUGAR EN LA CUENTA",
    stages: [["Servicio", "Consumo identificado"], ["Folio", "Relación con la estadía"], ["Cuenta", "Cobro, comprobante y seguimiento"]]
  }
};
function activateRole(button) {
  const role = roles[button.dataset.role];
  if (!role) return;
  qa(".role-tabs button").forEach((b) => { const selected = b === button; b.setAttribute("aria-selected", String(selected)); b.tabIndex = selected ? 0 : -1; });
  q("#role-panel").setAttribute("aria-labelledby", button.id);
  q("#role-pill").textContent = role.pill;
  const heading = q("#role-heading"); heading.replaceChildren();
  role.title.split("\n").forEach((line, i) => { if (i) heading.append(document.createElement("br")); heading.append(document.createTextNode(line)); });
  q("#role-description").textContent = role.description;
  q("#role-features").replaceChildren(...role.features.map((text) => { const li = document.createElement("li"); li.textContent = text; return li; }));
  q("#journey-label").textContent = role.label;
  const stages = q("#journey-stages"); stages.replaceChildren();
  role.stages.forEach(([title, subtitle], i) => {
    const row = document.createElement("div"), number = document.createElement("span"), text = document.createElement("div"), name = document.createElement("strong"), info = document.createElement("span"), check = document.createElement("i");
    number.className = "stage-number"; number.textContent = String(i + 1).padStart(2, "0"); name.textContent = title; info.textContent = subtitle; check.textContent = "✓";
    text.append(name, info); row.append(number, text, check); stages.append(row);
  });
}
qa(".role-tabs button").forEach((button) => button.addEventListener("click", () => activateRole(button)));
addTabKeyboard(q(".role-tabs"), activateRole);

let preparedMessage = "";
q("#contact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const value = (key) => String(data.get(key) || "").trim();
  preparedMessage = `Hola, me gustaría conocer Xenia PMS.\n\nNombre: ${value("name")}\nCorreo: ${value("email")}\nEstablecimiento: ${value("hotel")}\nHabitaciones: ${value("rooms")}\n\nConsulta:\n${value("message") || "Me gustaría coordinar una demostración."}`;
  q("#send-email").href = `mailto:${proposedContact}?subject=${encodeURIComponent("Consulta sobre Xenia PMS")}&body=${encodeURIComponent(preparedMessage)}`;
  form.hidden = true; q("#contact-result").hidden = false; q("#copy-status").textContent = "";
  q("#send-email").focus();
});
q("#edit-message").addEventListener("click", () => { q("#contact-result").hidden = true; q("#contact-form").hidden = false; q('input[name="name"]').focus(); });
q("#copy-message").addEventListener("click", async () => {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(preparedMessage);
    else {
      const node = document.createElement("textarea"); node.value = preparedMessage; node.style.position = "fixed"; node.style.left = "-9999px"; q("#contact-dialog").append(node); node.select();
      if (!document.execCommand("copy")) throw new Error("No clipboard"); node.remove();
    }
    q("#copy-status").textContent = "Consulta copiada. Podés pegarla donde prefieras.";
  } catch { q("#copy-status").textContent = "No se pudo copiar automáticamente. Usá el borrador de correo para seleccionar el texto."; }
});
const legal = {
  privacy: {title: "Privacidad de esta vista previa", paragraphs: ["Los ejemplos de la web usan datos ficticios. No acceden a huéspedes, reservas ni operaciones de ningún hotel.", "El formulario prepara un mensaje en tu navegador. Esta página no lo guarda en una base de datos ni lo envía automáticamente. Si elegís abrir tu correo, el envío se realiza desde tu aplicación y bajo sus condiciones.", "La dirección contacto@xeniapms.com es una propuesta pendiente de activar. Esta vista previa no incorpora herramientas de analítica o seguimiento publicitario."]},
  terms: {title: "Sobre esta presentación", paragraphs: ["Esta es una primera propuesta de la web comercial de Xenia PMS. Las pantallas son ejemplos ilustrativos para explicar sus circuitos.", "El alcance, la configuración, la disponibilidad de funciones y las condiciones de cada implementación se confirman con el establecimiento. La gestión multihotel está en desarrollo.", "El sitio principal previsto es xeniapms.com. Sus dominios alternativos son xeniapms.com.ar, xeniapms.store y xeniapms.online. La conexión pública y los canales de contacto se completarán después de revisar esta propuesta."]}
};
qa("[data-legal]").forEach((button) => button.addEventListener("click", () => {
  const info = legal[button.dataset.legal];
  q("#legal-title").textContent = info.title;
  q("#legal-content").replaceChildren(...info.paragraphs.map((text) => { const p = document.createElement("p"); p.textContent = text; return p; }));
  openDialog(q("#legal-dialog"), button);
}));
