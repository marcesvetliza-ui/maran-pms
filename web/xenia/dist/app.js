"use strict";

const q = (selector, parent = document) => parent.querySelector(selector);
const qa = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const currency = (value) => "$ " + new Intl.NumberFormat("es-AR", {maximumFractionDigits: 0}).format(value);
const contactEmail = "contacto@xeniapms.com";
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
  restaurant: {
    pill: "La operación del restaurant", title: "De la mesa al cierre.\nCada pedido, en su lugar.",
    description: "Mesas, pedidos y consumos para acompañar el servicio del restaurant y relacionarlo con sus cobros, sus comprobantes y la cuenta del huésped cuando corresponde.",
    features: ["Mesas y pedidos para organizar el servicio.", "Consumos con su origen identificado.", "Cobros, comprobantes y cargos al folio cuando corresponde."],
    label: "UNA MESA, TODO EL SERVICIO",
    stages: [["Mesa y pedido", "Atención y consumos"], ["Servicio", "Seguimiento del pedido"], ["Cierre", "Cobro, comprobante o cargo al folio"]]
  },
  spa: {
    pill: "La atención en el spa", title: "Cada turno, preparado.\nCada servicio, registrado.",
    description: "Turnos, servicios y clientes para organizar la atención del spa y acompañar el seguimiento de sus consumos y cobros.",
    features: ["Turnos y servicios para planificar la atención.", "Clientes y consumos con su información relacionada.", "Cobros y relación con el alojamiento cuando corresponde."],
    label: "UN TURNO, TODA LA ATENCIÓN",
    stages: [["Turno", "Cliente y servicio"], ["Atención", "Prestación y consumo"], ["Cuenta", "Cobro y seguimiento"]]
  },
  eventos: {
    pill: "La organización de eventos", title: "Del primer presupuesto\nal encuentro que imaginaste.",
    description: "Presupuestos, servicios y seguimiento para reunir la información de cada evento y acompañar su organización y su gestión administrativa.",
    features: ["Presupuestos y servicios con su contexto.", "Información de cada evento para coordinar el trabajo.", "Seguimiento de los movimientos y la cuenta."],
    label: "UN EVENTO, UNA ORGANIZACIÓN CONECTADA",
    stages: [["Propuesta", "Necesidades y presupuesto"], ["Organización", "Coordinación de servicios"], ["Seguimiento", "Movimientos y cuenta del evento"]]
  },
  grupos: {
    pill: "La gestión de grupos y empresas", title: "Muchas reservas.\nUna coordinación compartida.",
    description: "Reservas de grupos, anticipos y cuentas de empresas para coordinar el trabajo comercial con la recepción y la administración.",
    features: ["Reservas y alojamiento del grupo relacionados.", "Anticipos y movimientos identificados.", "Seguimiento de la cuenta del grupo o la empresa."],
    label: "UN GRUPO, LA INFORMACIÓN REUNIDA",
    stages: [["Grupo", "Reservas y necesidades"], ["Coordinación", "Alojamiento y anticipos"], ["Cuenta", "Movimientos y saldo pendiente"]]
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
qa("[data-select-role]").forEach((link) => link.addEventListener("click", () => {
  const tab = document.getElementById(`role-${link.dataset.selectRole}`);
  if (tab) activateRole(tab);
}));

let preparedMessage = "";
q("#contact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const value = (key) => String(data.get(key) || "").trim();
  preparedMessage = `Hola, me gustaría conocer Xenia PMS.\n\nNombre: ${value("name")}\nCorreo: ${value("email")}\nEstablecimiento: ${value("hotel")}\nActividad: ${value("activity")}\nCapacidad de alojamiento: ${value("rooms") || "No aplica o a definir"}\n\nConsulta:\n${value("message") || "Me gustaría coordinar una demostración."}`;
  q("#send-email").href = `mailto:${contactEmail}?subject=${encodeURIComponent("Consulta sobre Xenia PMS")}&body=${encodeURIComponent(preparedMessage)}`;
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
  privacy: {title: "Privacidad", paragraphs: ["Los ejemplos de la web usan datos ficticios. No acceden a huéspedes, clientes, reservas ni operaciones de ningún establecimiento.", "El formulario prepara un mensaje en tu navegador. Esta página no lo guarda en una base de datos ni lo envía automáticamente. Si elegís abrir tu correo, el envío se realiza desde tu aplicación y bajo sus condiciones.", "El correo de contacto es contacto@xeniapms.com. Este sitio no incorpora herramientas de analítica o seguimiento publicitario."]},
  terms: {title: "Sobre esta presentación", paragraphs: ["Xenia es una plataforma de gestión para la hospitalidad, con base hotelera y módulos de restaurant, spa, eventos y grupos. Las pantallas son ejemplos ilustrativos para explicar sus circuitos.", "El alcance, las adaptaciones a cada tipo de alojamiento, las conexiones con canales, la disponibilidad de funciones y las condiciones de cada implementación se confirman con el establecimiento. La gestión multihotel está en desarrollo.", "El dominio principal es xeniapms.com. Para consultas sobre esta web o sobre el producto, podés escribir a contacto@xeniapms.com."]}
};
qa("[data-legal]").forEach((button) => button.addEventListener("click", () => {
  const info = legal[button.dataset.legal];
  q("#legal-title").textContent = info.title;
  q("#legal-content").replaceChildren(...info.paragraphs.map((text) => { const p = document.createElement("p"); p.textContent = text; return p; }));
  openDialog(q("#legal-dialog"), button);
}));
