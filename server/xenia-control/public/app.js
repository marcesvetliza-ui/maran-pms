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
  clearPmsCredentials();
  $("#pms-workspace").hidden = true;
  $("#open-pms").removeAttribute("href");
  dirty = false;
  for (const id of [
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
  state.section = section;
  $("#operations-view").hidden = section !== "operations";
  $("#administration-view").hidden = section !== "administration";
  for (const [id, value] of [
    ["#operations-tab", "operations"],
    ["#admin-tab", "administration"],
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
  $("#pms-workspace").hidden = !pms;
  $("#open-pms").removeAttribute("href");
  if (pms) {
    $("#pms-title").textContent = property.name;
    $("#open-pms").href = new URL("/xenia/start", pms.origin).href;
  }
  $("#pms-configuration").hidden =
    !state.user?.platformAdmin ||
    !property ||
    !["aurora-demo", "brisa-demo"].includes(property.slug) ||
    property.status !== "active" ||
    !property.modules.includes("lodging");
  $("#pms-configuration-title").textContent = property
    ? "PMS de " + property.name
    : "";
  $("#pms-origin").value = pms?.origin || "";
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
    const property = await api("/admin/properties", {
      method: "POST",
      body: {
        name: data.get("name"),
        slug: data.get("slug"),
        organizationId: data.get("organizationId"),
        modules: data.getAll("module"),
      },
    });
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
      body: { origin: data.get("origin") },
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
      "XENIA_PMS_TEMPLATE=" +
        (property.slug === "aurora-demo" ? "aurora" : "brisa"),
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
void session().catch((error) => {
  clearAccount();
  notice(error.message, true);
});
