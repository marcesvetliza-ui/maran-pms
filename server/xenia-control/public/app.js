"use strict";
const $ = (selector) => document.querySelector(selector);
const names = {
  lodging: "Alojamiento",
  restaurant: "Restaurant",
  spa: "Spa",
  events: "Eventos",
  groups: "Grupos",
};
const roles = {
  owner: "Administración general",
  customer_admin: "Administración del cliente",
  manager: "Responsable",
  reception: "Recepción",
  viewer: "Sólo consulta",
};
const state = {
  user: null,
  csrf: "",
  properties: [],
  selected: null,
  section: "operations",
  organizations: [],
  users: [],
  pmsLinks: [],
  customerOrganizations: [],
  teamOrganizationId: "",
  teamGeneration: 0,
  teamProperties: [],
};
let dirty = false,
  generation = 0,
  identityGeneration = 0,
  noticeTimer;
const accountChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("xenia-control-session")
    : null;
function accountChanged() {
  identityGeneration++;
  accountChannel?.postMessage("changed");
}
if (accountChannel)
  accountChannel.onmessage = () => {
    identityGeneration++;
    clearAccount();
    void session().catch((error) => notice(error.message, true));
  };
const node = (tag, className, text) => {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = String(text);
  return value;
};
function notice(message, error = false) {
  clearTimeout(noticeTimer);
  $("#notice").textContent = message;
  $("#notice").className = "notice" + (error ? " error" : "");
  $("#notice").hidden = false;
  if (!error)
    noticeTimer = setTimeout(() => {
      $("#notice").hidden = true;
    }, 6000);
}
function clearAccount() {
  generation++;
  if (state.user)
    try {
      sessionStorage.removeItem("xenia.property." + state.user.id);
    } catch {}
  state.user = null;
  state.properties = [];
  state.selected = null;
  state.organizations = [];
  state.users = [];
  state.pmsLinks = [];
  state.customerOrganizations = [];
  state.teamOrganizationId = "";
  state.teamProperties = [];
  state.teamGeneration++;
  $("#team-view").hidden = true;
  $("#team-tab").hidden = true;
  clearPmsCredentials();
  $("#pms-workspace").hidden = true;
  $("#open-pms").removeAttribute("href");
  dirty = false;
  for (const id of [
    "team-list",
    "team-organization",
    "team-property-options",
    "customer-admin-list",
    "customer-admin-organization",
    "reservation-list",
    "membership-list",
    "organization-list",
    "user-property-options",
    "assignment-user",
    "property-client",
    "property-selector",
    "modules",
  ])
    $("#" + id).replaceChildren();
  for (const id of [
    "team-user-form",
    "customer-admin-form",
    "reservation-form",
    "user-form",
    "property-form",
    "organization-form",
    "assignment-form",
  ])
    $("#" + id).reset();
  $("#user-name").textContent = "";
  $("#property-name").textContent = "";
  $("#operations-view").hidden = true;
  $("#administration-view").hidden = true;
  $("#admin-tab").hidden = true;
  $("#workspace").hidden = true;
  $("#identity").hidden = true;
  $("#login-view").hidden = false;
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrf,
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      "Se interrumpió la conexión. Tu formulario se conserva; revisá la conexión antes de reintentar.",
    );
  }
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      accountChanged();
      clearAccount();
    }
    throw new Error(value.message || "No se pudo completar la operación.");
  }
  return value;
}
async function submit(form, operation) {
  const button = form.querySelector("button[type=submit],button:not([type])");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await operation(new FormData(form));
  } catch (error) {
    notice(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}
function safeStorageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeStorageSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}
function showSection(section) {
  if (section === "administration" && !state.user?.platformAdmin) return;
  if (section === "team" && !state.customerOrganizations.length) return;
  state.section = section;
  $("#operations-view").hidden = section !== "operations";
  $("#administration-view").hidden = section !== "administration";
  $("#team-view").hidden = section !== "team";
  for (const [id, value] of [
    ["#operations-tab", "operations"],
    ["#admin-tab", "administration"],
    ["#team-tab", "team"],
  ]) {
    if (section === value) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  }
}
async function session() {
  const version = ++identityGeneration;
  const result = await api("/session");
  if (version !== identityGeneration) return;
  state.csrf = result.csrfToken;
  $("#demo-badge").hidden = !result.demo;
  $("#demo-login").hidden = !result.demo;
  state.user = result.user;
  if (!state.user) {
    clearAccount();
    return;
  }
  await enterWorkspace();
}
async function enterWorkspace() {
  state.section = "operations";
  $("#login-view").hidden = true;
  $("#workspace").hidden = false;
  $("#identity").hidden = false;
  $("#user-name").textContent = state.user.name;
  $("#admin-tab").hidden = !state.user.platformAdmin;
  $("#welcome-title").textContent = state.user.platformAdmin
    ? "Mis establecimientos"
    : "Mi espacio de trabajo";
  showSection("operations");
  await refreshProperties();
  await refreshCustomerOrganizations();
  if (!state.user) return;
  if (state.user.platformAdmin) await refreshAdministration();
}
async function refreshProperties(preferred) {
  const principalId = state.user?.id;
  const [properties, pmsLinks] = await Promise.all([
    api("/properties"),
    api("/pms/installations"),
  ]);
  if (!state.user || state.user.id !== principalId) return;
  state.properties = properties;
  state.pmsLinks = pmsLinks;
  const selector = $("#property-selector");
  selector.replaceChildren();
  for (const property of state.properties)
    selector.add(
      new Option(
        property.name +
          (property.status !== "active" ? " · En preparación" : ""),
        property.id,
      ),
    );
  const remembered =
    preferred ||
    state.selected?.id ||
    safeStorageGet("xenia.property." + state.user.id);
  await selectProperty(
    state.properties.find((property) => property.id === remembered) ||
      state.properties[0] ||
      null,
  );
}
async function selectProperty(property) {
  const version = ++generation;
  state.selected = property;
  clearPmsCredentials();
  const pms = state.pmsLinks.find((link) => link.propertyId === property?.id);
  $("#pms-workspace").hidden = !pms || property?.status !== "active";
  $("#open-pms").removeAttribute("href");
  if (pms && property.status === "active") {
    $("#pms-title").textContent = property.name;
    $("#open-pms").href = new URL("/xenia/start", pms.origin).href;
  }
  $("#pms-configuration").hidden = !state.user?.platformAdmin || !property;
  $("#pms-configuration-title").textContent = property
    ? "PMS de " + property.name
    : "";
  $("#pms-origin").value = pms?.origin || "";
  const pmsUnavailable = !property
    ? ""
    : property.status !== "active" && property.storageKind !== "pms"
      ? "El establecimiento debe estar activo para conectar su PMS de pruebas."
      : !property.modules.includes("lodging")
        ? "Habilitá el módulo Alojamiento para conectar su PMS de pruebas."
        : "";
  $("#pms-form").hidden = !property || !!pmsUnavailable;
  $("#pms-unavailable").hidden = !pmsUnavailable;
  $("#pms-unavailable").textContent = pmsUnavailable;
  const template =
    pms?.template || (property?.storageKind === "pms" ? "custom" : "") ||
    pms?.origin?.match(/^https:\/\/(aurora|brisa)\.qa\.xeniapms\.com$/)?.[1] ||
    (property?.name.toLowerCase().includes("brisa")
      ? "brisa"
      : property?.name.toLowerCase().includes("aurora")
        ? "aurora"
        : "");
  $("#pms-template").value = template;
  $("#pms-origin").placeholder = template === "custom" ? "https://hotel-nuevo.qa.xeniapms.com" : template
    ? `https://${template}.qa.xeniapms.com`
    : "https://brisa.qa.xeniapms.com";
  dirty = false;
  $("#reservation-form").reset();
  $("#reservation-list").replaceChildren();
  $("#membership-list").replaceChildren();
  $("#reservation-count").textContent = "";
  $("#empty-state").hidden = !!property;
  $("#property-pending").hidden = true;
  $("#lodging-disabled").hidden = true;
  $("#lodging-workspace").hidden = true;
  $(".context-banner").hidden = !property;
  $("#modules").replaceChildren();
  if (!property) return;
  $("#property-selector").value = property.id;
  safeStorageSet("xenia.property." + state.user.id, property.id);
  $("#property-name").textContent = property.name;
  $("#property-role").textContent = roles[property.role] || property.role;
  for (const module of property.modules)
    $("#modules").append(node("span", "", names[module] || module));
  if (property.status !== "active") {
    $("#property-pending").hidden = false;
    $("#property-pending p").textContent = property.storageKind === "pms"
      ? "Generá la ficha y prepará el PMS en su base exclusiva. La instalación confirmará su identidad con Xenia al iniciar."
      : "Podés reintentar su preparación conservando el alta anterior.";
    $("#retry-activation").textContent = property.storageKind === "pms" ? "Actualizar estado del PMS" : "Reintentar preparación";
    return;
  }
  if (property.storageKind === "pms") {
    if (state.user.platformAdmin && version === generation) await refreshMemberships();
    return;
  }
  if (!property.modules.includes("lodging"))
    $("#lodging-disabled").hidden = false;
  else {
    $("#lodging-workspace").hidden = false;
    $("#read-only-notice").hidden = property.role !== "viewer";
    $("#reservation-form").hidden = property.role === "viewer";
    const rows = await api(`/properties/${property.id}/reservations`);
    if (version === generation) renderReservations(rows, property);
  }
  if (state.user.platformAdmin && version === generation)
    await refreshMemberships();
}
function date(value) {
  return value.split("-").reverse().join("/");
}
function renderReservations(rows, property) {
  const list = $("#reservation-list");
  list.replaceChildren();
  $("#reservation-count").textContent = rows.length + " reservas";
  if (!rows.length) {
    list.append(
      node(
        "p",
        "muted",
        "Todavía no hay reservas de prueba en este establecimiento.",
      ),
    );
    return;
  }
  for (const reservation of rows) {
    const row = node(
      "article",
      "reservation-row" +
        (reservation.status === "cancelled" ? " cancelled" : ""),
    );
    const content = node("div");
    content.append(
      node("strong", "", reservation.guestName),
      node(
        "p",
        "",
        `Unidad ${reservation.room} · ${date(reservation.checkIn)} → ${date(reservation.checkOut)}`,
      ),
    );
    row.append(
      content,
      node(
        "span",
        "status",
        reservation.status === "cancelled" ? "Anulada" : "Confirmada",
      ),
    );
    if (property.role !== "viewer" && reservation.status !== "cancelled") {
      const button = node("button", "danger", "Anular prueba");
      button.type = "button";
      button.addEventListener("click", async () => {
        if (!confirm(`¿Anular esta reserva de prueba en ${property.name}?`))
          return;
        button.disabled = true;
        try {
          await api(
            `/properties/${property.id}/reservations/${reservation.id}/cancel`,
            { method: "POST", body: {} },
          );
          if (state.selected?.id === property.id) {
            const version = generation;
            const fresh = await api(`/properties/${property.id}/reservations`);
            if (version === generation) renderReservations(fresh, property);
          }
        } catch (error) {
          notice(error.message, true);
        } finally {
          button.disabled = false;
        }
      });
      row.append(button);
    }
    list.append(row);
  }
}
async function refreshAdministration() {
  if (!state.user?.platformAdmin) return;
  const principalId = state.user.id;
  const [organizations, users] = await Promise.all([
    api("/admin/organizations"),
    api("/admin/users"),
  ]);
  if (state.user?.id !== principalId) return;
  state.organizations = organizations;
  const adminSelector = $("#customer-admin-organization");
  const selectedAdminOrganization = adminSelector.value;
  adminSelector.replaceChildren(new Option("Elegí un cliente", ""));
  for (const organization of organizations) adminSelector.add(new Option(organization.name, organization.id));
  adminSelector.value = organizations.some(value => value.id === selectedAdminOrganization) ? selectedAdminOrganization : "";
  await refreshCustomerAdministrators();
  state.users = users;
  $("#organization-list").replaceChildren(
    ...organizations.map((value) => node("div", "compact-row", value.name)),
  );
  const orgSelector = $("#property-client");
  orgSelector.replaceChildren();
  orgSelector.add(new Option("Elegí un cliente", ""));
  for (const value of organizations)
    orgSelector.add(new Option(value.name, value.id));
  const options = $("#user-property-options");
  options.replaceChildren();
  for (const property of state.properties.filter(
    (value) => value.status === "active",
  )) {
    const label = node("label"),
      input = node("input");
    input.type = "checkbox";
    input.name = "propertyId";
    input.value = property.id;
    label.append(input, document.createTextNode(property.name));
    options.append(label);
  }
  const usersSelect = $("#assignment-user");
  usersSelect.replaceChildren();
  usersSelect.add(new Option("Elegí un usuario", ""));
  for (const user of users.filter(
    (value) => !value.platformAdmin && value.active,
  ))
    usersSelect.add(new Option(`${user.name} · ${user.username}`, user.id));
  await refreshMemberships();
}
async function refreshMemberships() {
  const property = state.selected,
    version = generation;
  if (!state.user?.platformAdmin || !property) return;
  $("#memberships-title").textContent = "Usuarios de " + property.name;
  $("#assignment-form").hidden = property.status !== "active";
  if (property.status !== "active") {
    $("#membership-list").replaceChildren(
      node(
        "p",
        "muted",
        "Los permisos estarán disponibles cuando termine la preparación.",
      ),
    );
    return;
  }
  const memberships = await api(`/properties/${property.id}/memberships`);
  if (version !== generation) return;
  const list = $("#membership-list");
  list.replaceChildren();
  for (const member of memberships) {
    const row = node("div", "compact-row"),
      identity = node("div");
    identity.append(
      node("strong", "", member.name),
      node("small", "", member.username),
    );
    const actions = node("div", "row-actions"),
      selector = node("select");
    selector.setAttribute("aria-label", "Permiso de " + member.name);
    for (const role of ["reception", "manager", "viewer"])
      selector.add(new Option(roles[role], role));
    selector.value = member.role;
    const save = node("button", "quiet", "Guardar");
    save.type = "button";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await api(`/properties/${property.id}/memberships/${member.id}`, {
          method: "PUT",
          body: { role: selector.value },
        });
        notice("Permiso actualizado.");
      } catch (error) {
        notice(error.message, true);
      } finally {
        save.disabled = false;
      }
    });
    const remove = node("button", "danger", "Quitar acceso");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!confirm(`¿Quitar a ${member.name} el acceso a ${property.name}?`))
        return;
      remove.disabled = true;
      try {
        await api(`/properties/${property.id}/memberships/${member.id}`, {
          method: "DELETE",
        });
        if (state.selected?.id === property.id) await refreshMemberships();
        notice("Acceso retirado.");
      } catch (error) {
        notice(error.message, true);
      } finally {
        remove.disabled = false;
      }
    });
    actions.append(selector, save, remove);
    row.append(identity, actions);
    list.append(row);
  }
  if (!memberships.length)
    list.append(
      node(
        "p",
        "muted",
        "Todavía no hay usuarios asignados. La administración general conserva acceso.",
      ),
    );
}
$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void submit(event.currentTarget, async (data) => {
    const result = await api("/login", {
      method: "POST",
      body: { username: data.get("username"), password: data.get("password") },
    });
    accountChanged();
    state.user = result.user;
    state.csrf = result.csrfToken;
    $("#login-form").reset();
    if (result.redirectTo) {
      window.location.assign(result.redirectTo);
      return;
    }
    await enterWorkspace();
  });
});
document.querySelectorAll("[data-persona]").forEach((button) =>
  button.addEventListener("click", async () => {
    const buttons = [...document.querySelectorAll("[data-persona]")];
    if (buttons.some((value) => value.disabled)) return;
    buttons.forEach((value) => (value.disabled = true));
    try {
      const result = await api("/demo-login", {
        method: "POST",
        body: { persona: button.dataset.persona },
      });
      accountChanged();
      state.user = result.user;
      state.csrf = result.csrfToken;
      if (result.redirectTo) {
        window.location.assign(result.redirectTo);
        return;
      }
      await enterWorkspace();
    } catch (error) {
      notice(error.message, true);
    } finally {
      buttons.forEach((value) => (value.disabled = false));
    }
  }),
);
$("#logout").addEventListener("click", async () => {
  try {
    await api("/logout", { method: "POST", body: {} });
    accountChanged();
    clearAccount();
    await session();
  } catch (error) {
    notice(error.message, true);
  }
});
$("#property-selector").addEventListener("change", async (event) => {
  const previous = state.selected;
  if (
    dirty &&
    !confirm(
      "Hay una reserva de prueba sin guardar. ¿Querés descartarla y cambiar de establecimiento?",
    )
  ) {
    event.target.value = previous?.id || "";
    return;
  }
  try {
    await selectProperty(
      state.properties.find((property) => property.id === event.target.value) ||
        null,
    );
  } catch (error) {
    notice(error.message, true);
  }
});
$("#operations-tab").addEventListener("click", () => showSection("operations"));
$("#admin-tab").addEventListener("click", () => showSection("administration"));
$("#team-tab").addEventListener("click", () => { showSection("team"); void refreshTeam().catch(error => notice(error.message, true)); });
$("#reservation-form").addEventListener("input", () => {
  dirty = true;
});
$("#reservation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const property = state.selected;
  if (!property) return;
  void submit(event.currentTarget, async (data) => {
    await api(`/properties/${property.id}/reservations`, {
      method: "POST",
      body: Object.fromEntries(data),
    });
    if (state.selected?.id === property.id) {
      dirty = false;
      $("#reservation-form").reset();
      const version = generation;
      const rows = await api(`/properties/${property.id}/reservations`);
      if (version === generation) renderReservations(rows, property);
    }
    notice("Reserva de prueba guardada en " + property.name + ".");
  });
});
$("#organization-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  void submit(form, async (data) => {
    await api("/admin/organizations", {
      method: "POST",
      body: { name: data.get("name") },
    });
    form.reset();
    await refreshAdministration();
    notice("Cliente creado.");
  });
});
$("#new-property-name").addEventListener("input", (event) => {
  if (!$("#property-slug").dataset.edited)
    $("#property-slug").value = event.target.value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
});
$("#property-slug").addEventListener("input", () => {
  $("#property-slug").dataset.edited = "true";
});
$("#property-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  void submit(form, async (data) => {
    const body = { name: data.get("name"), slug: data.get("slug"), organizationId: data.get("organizationId"),
      modules: data.getAll("module"), storageKind: data.get("storageKind") };
    const key = `xenia-property-create:${state.user.id}:${body.organizationId}`;
    const profile = JSON.stringify({ ...body, modules: [...body.modules].sort() });
    let pending;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try { pending = JSON.parse(raw); } catch { throw Error("Revisá el catálogo: la solicitud pendiente no se pudo recuperar."); }
    }
    if (!pending || pending.profile !== profile) {
      pending = { id: crypto.randomUUID(), profile }; sessionStorage.setItem(key, JSON.stringify(pending));
    }
    const property = await api("/admin/properties", {
      method: "POST",
      body: { ...body, requestId: pending.id },
    });
    sessionStorage.removeItem(key);
    form.reset();
    delete $("#property-slug").dataset.edited;
    await refreshProperties(property.id);
    await refreshAdministration();
    showSection("operations");
    notice(
      property.status === "active"
        ? "Establecimiento preparado."
        : "El alta se conservó. Falta completar la preparación.",
      property.status !== "active",
    );
  });
});
$("#retry-activation").addEventListener("click", async () => {
  const property = state.selected;
  if (!property) return;
  const button = $("#retry-activation");
  button.disabled = true;
  try {
    await api(`/admin/properties/${property.id}/activate`, {
      method: "POST",
      body: {},
    });
    await refreshProperties(property.id);
    notice(
      state.selected.status === "active"
        ? "Establecimiento preparado."
        : "La preparación sigue pendiente. Revisá la instalación desde Administración.",
      state.selected.status !== "active",
    );
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$("#user-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  void submit(form, async (data) => {
    await api("/admin/users", {
      method: "POST",
      body: {
        username: data.get("username"),
        name: data.get("name"),
        password: data.get("password"),
        role: data.get("role"),
        propertyIds: data.getAll("propertyId"),
      },
    });
    form.reset();
    await refreshAdministration();
    notice("Usuario creado y permisos asignados.");
  });
});
$("#assignment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const property = state.selected;
  if (!property) return;
  void submit(event.currentTarget, async (data) => {
    await api(
      `/properties/${property.id}/memberships/${data.get("principalId")}`,
      { method: "PUT", body: { role: data.get("role") } },
    );
    if (state.selected?.id === property.id) await refreshMemberships();
    notice("Acceso asignado a " + property.name + ".");
  });
});
function clearPmsCredentials() {
  $("#pms-connection-sheet").value = "";
  $("#pms-credentials").hidden = true;
}
$("#pms-hide-credentials").addEventListener("click", clearPmsCredentials);
$("#pms-template").addEventListener("change", (event) => {
  const template = event.currentTarget.value;
  $("#pms-origin").placeholder = template === "custom" ? "https://hotel-nuevo.qa.xeniapms.com" : template
    ? `https://${template}.qa.xeniapms.com`
    : "https://brisa.qa.xeniapms.com";
});
$("#pms-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const property = state.selected;
  if (!property || !state.user?.platformAdmin) return;
  const existing = state.pmsLinks.some(
    (link) => link.propertyId === property.id,
  );
  if (
    existing &&
    !confirm(
      "Generar una nueva ficha invalida el secreto y las sesiones del PMS de " +
        property.name +
        ". ¿Continuar?",
    )
  )
    return;
  void submit(event.currentTarget, async (data) => {
    const result = await api(`/admin/properties/${property.id}/pms`, {
      method: "POST",
      body: { origin: data.get("origin"), template: data.get("template") },
    });
    await refreshProperties(property.id);
    if (state.selected?.id !== property.id || !state.user?.platformAdmin)
      return;
    $("#pms-connection-sheet").value = [
      "XENIA_PMS_MODE=qa",
      "NODE_ENV=production",
      "PORT=5000",
      "RAILWAY_DOCKERFILE_PATH=Dockerfile.xenia-pms",
      "SESSION_SECRET=" +
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      "XENIA_PMS_TEMPLATE=" + result.template,
      ...(result.template === "custom" ? ["XENIA_PMS_PROPERTY_NAME=" + JSON.stringify(result.propertyName)] : []),
      "XENIA_PMS_OPERATIONS_ENABLED=true",
      "XENIA_CONTROL_ORIGIN=" + window.location.origin,
      "XENIA_PMS_ORIGIN=" + result.origin,
      "XENIA_PMS_PROPERTY_ID=" + result.propertyId,
      "XENIA_PMS_CLIENT_ID=" + result.clientId,
      "XENIA_PMS_CLIENT_SECRET=" + result.clientSecret,
    ].join("\n");
    $("#pms-credentials").hidden = false;
    notice(
      "Ficha generada para " + property.name + ". Guardala antes de salir.",
    );
  });
});
async function refreshCustomerOrganizations() {
  const actorId = state.user?.id;
  const organizations = await api("/organizations");
  if (!actorId || state.user?.id !== actorId) return;
  state.customerOrganizations = organizations;
  $("#team-tab").hidden = !organizations.length;
  const previous = state.teamOrganizationId;
  state.teamOrganizationId = organizations.some(value => value.id === previous) ? previous : organizations[0]?.id || "";
  const selector = $("#team-organization");
  selector.replaceChildren(...organizations.map(value => new Option(value.name, value.id)));
  selector.value = state.teamOrganizationId;
  if (!organizations.length) {
    state.teamGeneration++;
    $("#team-list").replaceChildren();
    $("#team-property-options").replaceChildren();
    $("#team-user-form").hidden = true;
    if (state.section === "team") showSection("operations");
  }
}
function sameTeam(actorId, organizationId) {
  return state.user?.id === actorId && state.teamOrganizationId === organizationId;
}
async function refreshTeam() {
  const actorId = state.user?.id, organizationId = state.teamOrganizationId, version = ++state.teamGeneration;
  $("#team-list").replaceChildren();
  if (!actorId || !organizationId) return;
  try {
    const [properties, users] = await Promise.all([
      api(`/organizations/${organizationId}/properties`), api(`/organizations/${organizationId}/users`),
    ]);
    if (!sameTeam(actorId, organizationId) || version !== state.teamGeneration) return;
    state.teamProperties = properties;
    $("#team-title").textContent = "Equipo de " + state.customerOrganizations.find(value => value.id === organizationId).name;
    const selected = new Set([...$("#team-property-options").querySelectorAll("input:checked")].map(input => input.value));
    $("#team-property-options").replaceChildren();
    for (const property of properties.filter(value => value.status === "active")) {
      const label = node("label"), input = node("input");
      input.type = "checkbox"; input.name = "propertyId"; input.value = property.id; input.checked = selected.has(property.id);
      label.append(input, document.createTextNode(property.name)); $("#team-property-options").append(label);
    }
    const hasHotels = properties.some(value => value.status === "active");
    $("#team-empty").hidden = hasHotels; $("#team-user-form").hidden = !hasHotels;
    const list = $("#team-list");
    for (const user of users) {
      const card = node("section", "card"); card.dataset.principalId = user.id;
      card.append(node("h3", "", user.name), node("p", "muted", user.username));
      if (user.isAdministrator) {
        card.append(node("p", "muted", "Administrador del cliente. Este permiso lo gestiona Xenia.")); list.append(card); continue;
      }
      card.append(node("p", "muted", user.active ? "Habilitado en este cliente" : "Suspendido en este cliente"));
      for (const property of properties.filter(value => value.status === "active")) {
        const row = node("div", "compact-row"), selector = node("select");
        selector.setAttribute("aria-label", `Permiso de ${user.name} en ${property.name}`);
        selector.add(new Option("Sin acceso", ""));
        for (const role of ["reception", "manager", "viewer"]) selector.add(new Option(roles[role], role));
        selector.value = user.properties.find(value => value.propertyId === property.id)?.role || "";
        selector.disabled = !user.active;
        const save = node("button", "quiet", "Guardar permiso"); save.type = "button"; save.disabled = !user.active;
        save.dataset.propertyId = property.id;
        save.addEventListener("click", () => teamAction(save, () => api(`/organizations/${organizationId}/users/${user.id}/properties/${property.id}`,
          selector.value ? { method: "PUT", body: { role: selector.value } } : { method: "DELETE" })));
        row.append(node("span", "", property.name), selector, save); card.append(row);
      }
      const toggle = node("button", user.active ? "danger" : "quiet", user.active ? "Suspender en este cliente" : "Habilitar en este cliente");
      toggle.type = "button";
      toggle.addEventListener("click", () => {
        if (user.active && !confirm(`¿Suspender a ${user.name} en este cliente y retirar sus accesos a sus hoteles?`)) return;
        void teamAction(toggle, () => api(`/organizations/${organizationId}/users/${user.id}`, { method: "PATCH", body: { active: !user.active } }));
      });
      card.append(toggle); list.append(card);
    }
    if (!users.length) list.append(node("p", "muted", "Todavía no hay colaboradores de este cliente."));
  } catch (error) {
    if (sameTeam(actorId, organizationId) && version === state.teamGeneration) {
      state.teamProperties = []; $("#team-user-form").hidden = true; $("#team-property-options").replaceChildren();
    }
    throw error;
  }
}
async function teamAction(button, operation) {
  const actorId = state.user?.id, organizationId = state.teamOrganizationId;
  button.disabled = true;
  try {
    await operation();
    if (sameTeam(actorId, organizationId)) { await refreshTeam(); notice("Permisos de este cliente actualizados."); }
  } catch (error) { if (sameTeam(actorId, organizationId)) notice(error.message, true); }
  finally { button.disabled = false; }
}
function pendingAccountRequest(kind, organizationId, body) {
  // Keep only the public profile and operation ID. Never persist a password or
  // a password-derived browser digest. The server compares a keyed fingerprint.
  const key = `xenia-customer-create:${state.user.id}:${organizationId}:${kind}`;
  const profile = JSON.stringify({ username: body.username, name: body.name, role: body.role || null,
    propertyIds: [...(body.propertyIds || [])].sort() });
  const raw = sessionStorage.getItem(key);
  if (raw) {
    let previous;
    try { previous = JSON.parse(raw); } catch { throw Error("Revisá el equipo: no se pudo recuperar la solicitud pendiente."); }
    if (previous.profile === profile && /^[a-f0-9-]{36}$/i.test(previous.id)) return { id: previous.id, key };
  }
  const id = crypto.randomUUID(); sessionStorage.setItem(key, JSON.stringify({ id, profile }));
  return { id, key };
}
async function refreshCustomerAdministrators() {
  const actorId = state.user?.id, organizationId = $("#customer-admin-organization").value;
  $("#customer-admin-list").replaceChildren();
  if (!actorId || !state.user.platformAdmin || !organizationId) return;
  const users = await api(`/admin/organizations/${organizationId}/administrators`);
  if (state.user?.id !== actorId || !state.user.platformAdmin || $("#customer-admin-organization").value !== organizationId) return;
  for (const user of users) {
    const row = node("div", "compact-row"), revoke = node("button", "danger", "Retirar administración del cliente");
    revoke.type = "button";
    revoke.addEventListener("click", async () => {
      if (!confirm(`¿Retirar a ${user.name} la administración de este cliente?`)) return;
      revoke.disabled = true;
      try {
        await api(`/admin/organizations/${organizationId}/administrators/${user.id}`, { method: "DELETE" });
        if (state.user?.id === actorId && $("#customer-admin-organization").value === organizationId) await refreshCustomerAdministrators();
      } catch (error) { if (state.user?.id === actorId) notice(error.message, true); }
      finally { revoke.disabled = false; }
    });
    row.append(node("span", "", user.name + " · " + user.username), revoke); $("#customer-admin-list").append(row);
  }
}
$("#team-organization").addEventListener("change", async event => {
  state.teamOrganizationId = event.target.value; state.teamGeneration++;
  $("#team-user-form").reset(); $("#team-property-options").replaceChildren();
  try { await refreshTeam(); } catch (error) { notice(error.message, true); }
});
$("#customer-admin-organization").addEventListener("change", () => { void refreshCustomerAdministrators().catch(error => notice(error.message, true)); });
$("#team-user-form").addEventListener("submit", event => {
  event.preventDefault(); const form = event.currentTarget, actorId = state.user?.id, organizationId = state.teamOrganizationId;
  void submit(form, async data => {
    if (!actorId || !organizationId) return;
    const body = { name: String(data.get("name") || "").trim(), username: String(data.get("username") || "").trim().toLowerCase(), password: data.get("password"),
      role: data.get("role"), propertyIds: data.getAll("propertyId") };
    if (!body.propertyIds.length) throw Error("Elegí al menos un hotel de este cliente.");
    const pending = pendingAccountRequest("staff", organizationId, body);
    const result = await api(`/organizations/${organizationId}/users`, { method: "POST", body: { ...body, requestId: pending.id } });
    sessionStorage.removeItem(pending.key);
    if (sameTeam(actorId, organizationId)) {
      form.reset(); await refreshTeam(); notice(result.replayed ? "La cuenta ya estaba creada; se recuperó el resultado." : "Colaborador creado con sus accesos.");
    }
  });
});
$("#customer-admin-form").addEventListener("submit", event => {
  event.preventDefault(); const form = event.currentTarget, actorId = state.user?.id;
  void submit(form, async data => {
    if (!state.user?.platformAdmin) return;
    const organizationId = data.get("organizationId");
    const body = { name: String(data.get("name") || "").trim(), username: String(data.get("username") || "").trim().toLowerCase(), password: data.get("password") };
    const pending = pendingAccountRequest("administrator", organizationId, body);
    const result = await api(`/admin/organizations/${organizationId}/administrators`, { method: "POST", body: { ...body, requestId: pending.id } });
    sessionStorage.removeItem(pending.key);
    if (state.user?.id !== actorId || !state.user.platformAdmin) return;
    form.reset(); $("#customer-admin-organization").value = organizationId; await refreshCustomerAdministrators();
    notice(result.replayed ? "La cuenta ya estaba creada; se recuperó el resultado." : "Administrador creado para este cliente.");
  });
});

void session().catch((error) => {
  clearAccount();
  notice(error.message, true);
});
