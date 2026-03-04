# MARAN SUITE SYSTEM - Resumen Completo del Sistema

## 1. VISION GENERAL

Sistema de gestión integral para Maran Suites & Towers (35 habitaciones, 5 pisos).
Full-stack: React + TypeScript (frontend) / Node.js + Express (backend) / PostgreSQL (base de datos).
Interfaz en español. Diseño Material Design con shadcn/ui + Tailwind CSS.
Actualmente usa almacenamiento en memoria (MemStorage) - la migración a PostgreSQL real está planificada como paso siguiente.

**Total del código fuente: ~35.000 líneas en TypeScript/TSX.**

---

## 2. ESTRUCTURA DE ARCHIVOS PRINCIPALES

```
shared/schema.ts          (1176 líneas) - Esquema de datos compartido (Drizzle ORM + Zod)
server/storage.ts         (4089 líneas) - Capa de datos con MemStorage + datos seed
server/routes.ts          (3422 líneas) - API REST (~180 endpoints)
server/index.ts           (98 líneas)   - Entry point del servidor Express
client/src/App.tsx         (97 líneas)   - Router principal con todas las rutas
client/src/components/app-sidebar.tsx (308 líneas) - Sidebar con navegación colapsable
```

### Páginas del frontend (client/src/pages/):
```
restaurant.tsx     (2614 líneas) - POS Restaurante completo
reservations.tsx   (1759 líneas) - Gestión de reservas
group-detail.tsx   (1198 líneas) - Detalle de grupo con check-in masivo
events.tsx         (1035 líneas) - Gestión de eventos
spa.tsx            (965 líneas)  - Gestión de SPA
maintenance.tsx    (945 líneas)  - Mantenimiento y OT
administration.tsx (944 líneas)  - Panel administrativo
planning.tsx       (915 líneas)  - Calendario visual de planning
groups.tsx         (856 líneas)  - Listado y gestión de grupos
check-in.tsx       (764 líneas)  - Proceso de check-in
inventory.tsx      (765 líneas)  - Inventario multi-depósito
housekeeping.tsx   (724 líneas)  - Gestión de limpieza
reviews.tsx        (683 líneas)  - Reseñas con análisis IA
guests.tsx         (669 líneas)  - Base de datos de huéspedes
dashboard.tsx      (619 líneas)  - Dashboard con métricas
rooms.tsx          (628 líneas)  - Gestión de habitaciones
packages.tsx       (571 líneas)  - Paquetes comerciales
rate-plans.tsx     (520 líneas)  - Planes tarifarios
ota-channels.tsx   (482 líneas)  - Canales OTA
new-reservation.tsx(451 líneas)  - Formulario reserva rápida
companies.tsx      (441 líneas)  - Base de datos de empresas
check-out.tsx      (255 líneas)  - Proceso de check-out
coworking.tsx      (156 líneas)  - Placeholder con tabs
```

---

## 3. NAVEGACION DEL SIDEBAR

```
Dashboard (página principal)
Hotel (desplegable):
  ├── Planning (calendario visual)
  ├── Reservas
  ├── Reserva Rápida
  ├── Check-in
  ├── Check-out
  ├── Habitaciones
  ├── Tarifas
  ├── Paquetes
  ├── Canales OTA
  ├── Grupos
  └── Reseñas
Base de Datos:
  ├── Huéspedes
  └── Empresas
Servicios:
  ├── Restaurante
  ├── SPA
  ├── Eventos
  └── Coworking
Operaciones:
  ├── Housekeeping
  ├── Mantenimiento
  └── Inventario
Administración
Footer: Configuración
```

---

## 4. MODULOS Y ESTADO FUNCIONAL

### 4.1 HOTEL PMS (Avanzado)

**Dashboard:**
- Métricas de ocupación (total, disponibles, ocupadas, limpieza, mantenimiento)
- Check-ins y check-outs del día
- Reservas pendientes
- Acciones rápidas

**Planning (Calendario Visual):**
- Vista de grilla: habitaciones (filas) x días (columnas)
- Colores por estado de reserva (pendiente, confirmada, checked-in, etc.)
- Colores por fuente/origen (directo, Booking, Expedia, Airbnb, etc.)
- Drag visual de reservas
- Leyenda de estados y fuentes

**Reservas:**
- CRUD completo con código auto-generado (RES-XXXX)
- Workflow: pendiente → confirmada → checked_in → checked_out
- Fuentes: directo, teléfono, web, booking, expedia, airbnb, despegar, hotelbeds, agoda, empresa
- Descuentos: ninguno, porcentaje, monto fijo
- Folio modal con cargos y pagos
- Duplicación de reservas
- Detección de overbooking

**Check-in:**
- Validación de disponibilidad de habitación
- Cambio de estado de reserva y habitación
- Creación automática de tarea de limpieza al check-out

**Check-out:**
- Validación de saldo cero
- Facturación al cerrar

**Habitaciones:**
- 35 habitaciones en 5 pisos (pisos 2-6)
- Estados: disponible, ocupada, limpieza, mantenimiento, fuera_servicio
- Configuración de camas (MAT_CC, TWIN_CC, MAT_CC_EXTRA, etc.)
- Características: accesible, cama separable, sofá cama, living, etc.
- Ocupación máxima configurable

**Tipos de Habitación:**
- Ejecutiva (EJEC), Premium (PREM), Suite Junior (SJUN), Suite Senior (SSEN), Departamento (DEPT)

**Tarifas:**
- Planes tarifarios vinculados a tipos de habitación
- Temporadas: baja, media, alta, especial
- Tipos: rack, promo, corporativa, agencia, paquete
- Override manual de tarifa por noche en reservas

**Paquetes:**
- Código, nombre, descripción
- Tipo de habitación y noches incluidas
- Precio base con descuento porcentual
- Servicios incluidos (tags)
- Ítems del paquete (alojamiento, gastronomía, spa, experiencia, otro)
- Vigencia desde/hasta, estado (activo/inactivo/borrador)

**Canales OTA:**
- Gestión de canales (Booking, Expedia, Airbnb, etc.)
- API key/secret por canal
- Comisión porcentual
- Log de reservas importadas con monto, comisión y neto
- Simulación de importación

**Grupos:**
- Código de grupo, contacto, fechas
- Bloqueo de habitaciones por tipo con tarifa acordada
- Asignación de habitaciones individuales
- Check-in masivo / Check-out masivo
- Factura grupal consolidada
- Rooming list imprimible (dialog con tabla formateada)

**Reseñas:**
- CRUD de reseñas vinculadas a reserva/huésped/habitación
- Fuentes: Google, TripAdvisor, Booking, Expedia, Airbnb, directo
- Rating 1-5, sentimiento (positivo/neutro/negativo)
- Análisis con IA: categorías, frases clave, sugerencias de mejora
- Respuesta del staff
- Dashboard analítico: promedio, distribución, tendencia

**Huéspedes:**
- Código auto-generado (H-YYYY-XXXX)
- Datos personales, documento, nacionalidad
- Segmentos: LEISURE, CORP, VIP, GROUP, OTA
- Datos de vehículo (patente auto-uppercase, marca, modelo, color)
- CUIL/CUIT
- Historial de reservas

**Empresas:**
- Razón social, nombre fantasía, CUIT
- Condición IVA (RI, Monotributo, Exento, CF)
- Dirección completa
- Persona de contacto
- Límite de crédito y plazo de pago
- CRUD completo con búsqueda

**Cargos y Pagos:**
- Cargos por reserva (alojamiento, minibar, lavandería, etc.)
- Transferencia de cargos entre reservas
- Métodos de pago: efectivo, tarjeta débito, tarjeta crédito, transferencia, MercadoPago, cuenta corriente

### 4.2 RESTAURANTE POS (Completo)

**Plano de Mesas (Floor Plan):**
- 2 sectores: Bodega (Mesas 1-18, cuadradas) y Moneda (Mesas 19-32, redondas)
- Grilla 8x6 con posicionamiento drag & drop
- Modo edición: agregar/eliminar mesas, arrastrar posiciones
- Atributo "Ventana" (hasWindow) con badge celeste
- Estados visuales: disponible (verde), ocupada (ámbar), reservada (azul)

**Pedidos/Comandas:**
- Apertura de mesa con cantidad de comensales editable
- Hora de apertura visible en folio
- Agregar ítems por categoría (ordenadas por displayOrder)
- Estados de ítem: pendiente, en preparación, listo, entregado
- Subtotal, impuestos, total automáticos

**Cierre de Mesa:**
- Tipo de comprobante: Ticket, Factura A, Factura B, Factura C, Nota Crédito
- Método de pago: Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia, Cuenta Habitación, MercadoPago
- Campos receiptType y paymentMethod guardados para futura integración ARCA

**Menú:**
- Categorías ordenadas por displayOrder:
  1. Bebidas sin Alcohol
  2. Bebidas con Alcohol
  3. Entradas
  4. Platos Principales
  5. Postres
- CRUD de categorías y platos
- Precio, tiempo preparación, alérgenos, disponibilidad

**Reservas de Restaurante:**
- Búsqueda por nombre + ordenamiento alfabético
- Turnos configurables (dialog de settings)
- Cuando hay turnos: dropdown; sin turnos: input libre
- Estado: pending, confirmed, seated, completed, cancelled, no_show

**Recetas y Costos:**
- Ingredientes por plato con cantidad, unidad y costo unitario
- Cálculo automático de costo por plato
- Reporte de margen bruto por producto (precio venta vs costo)
- Porcentaje de margen con indicador de color

### 4.3 SPA (Funcional)

**Cabinas:** CRUD de cabinas (nombre, descripción, activa/inactiva)
**Categorías de Tratamiento:** Con orden de visualización
**Tratamientos:** Nombre, duración, precio, categoría, estado
**Agenda/Turnos:**
- Vista semanal por cabina
- Grilla horaria (8:00-21:00) con slots de 30 min
- Crear/editar/eliminar turnos
- Estados: scheduled, confirmed, in_progress, completed, cancelled, no_show
- Vinculación opcional con reserva de hotel

**Cuentas/Folios:**
- Apertura de cuenta al iniciar tratamiento
- Agregar ítems (tratamiento, producto, extra)
- Cierre de cuenta con cargo a: efectivo, tarjeta, habitación
- Integración con folio de habitación

### 4.4 EVENTOS (Funcional)

**Salones:** CRUD de salones con capacidad y amenities
**Vista Semanal:** Agenda visual de eventos por salón
**Eventos:**
- Código auto-generado (EVT-XXXX)
- Tipos: corporate, social, wedding, conference, meeting, other
- Datos de contacto y empresa
- Fechas, horarios, cantidad de asistentes
- Estados: inquiry, quoted, confirmed, in_progress, completed, cancelled, invoiced

**Tipos de Cargo:** Configurables (salón, catering, equipamiento, etc.)
**Cargos por Evento:** Con cantidad, precio unitario y total
**Cotización:** Resumen de cargos como presupuesto

### 4.5 COWORKING (Placeholder)

- Tabs creados: Espacios, Membresías, Pases Diarios, Salas de Reunión
- Contenido placeholder con cards de ejemplo
- Sin backend funcional todavía

### 4.6 HOUSEKEEPING (Funcional)

- Tareas vinculadas a habitaciones
- Tipos: checkout_clean, stay_clean, deep_clean, inspection, turndown
- Prioridades: low, medium, high, urgent
- Estados: pending, in_progress, completed, verified
- Vista por piso con filtros
- Asignación a personal
- Creación automática de tarea al check-out
- Dashboard de estados

### 4.7 MANTENIMIENTO (Funcional)

**Personal:** CRUD de técnicos con especialidad
**Órdenes de Trabajo:**
- Código auto-generado (OT-XXXX)
- Categorías: plomería, electricidad, HVAC, carpintería, pintura, general, equipamiento
- Prioridades: baja, media, alta, urgente
- Estados: pending, assigned, in_progress, on_hold, completed, cancelled
- Asignación a técnico
- Costo estimado vs real
- Dashboard con métricas

### 4.8 INVENTARIO (Funcional)

**Categorías:** Alimentos, Bebidas, Limpieza, Amenities, Mantelería (con subcategorías)
**Proveedores:** CRUD con CUIT, condiciones de pago
**Ítems de Inventario:**
- SKU, nombre, categoría, proveedor
- Unidad de medida, precio de costo
- Stock mínimo/máximo/actual
- Ubicación (depósito)
- Alertas de stock bajo

**Movimientos de Stock:** Entrada, salida, ajuste, transferencia con trazabilidad
**Órdenes de Compra:**
- Vinculadas a proveedor
- Ítems con cantidad y costo
- Estados: draft, sent, partial, received, cancelled
- Recepción parcial

### 4.9 ADMINISTRACION (Funcional)

**Usuarios del Sistema:**
- CRUD con roles: admin, manager, receptionist, concierge, housekeeping, maintenance, restaurant, spa, accounting
- Departamentos configurables
- Estado activo/inactivo
- Último login

**Configuración del Sistema:**
- Pares clave-valor organizados por categoría (general, hotel, billing, notifications, integrations)
- Editor inline

**Log de Auditoría:**
- Registro de acciones por usuario
- Módulo, entidad, descripción
- Filtros por fecha, usuario, módulo
- Paginación

**Dashboard Admin:**
- Métricas del sistema: usuarios activos, configs, logs

---

## 5. ESQUEMA DE BASE DE DATOS (45 tablas)

### Core Hotel
- `users` - Usuarios de autenticación
- `companies` - Empresas/corporativos (razón social, CUIT, condición IVA)
- `guests` - Huéspedes (datos personales, documento, vehículo)
- `roomTypes` - Tipos de habitación
- `ratePlans` - Planes tarifarios
- `rooms` - Habitaciones individuales
- `reservations` - Reservas con workflow de estados
- `charges` - Cargos por reserva
- `payments` - Pagos por reserva
- `housekeepingTasks` - Tareas de limpieza

### Grupos
- `groups` - Grupos/contingentes
- `groupRoomBlocks` - Bloqueos de habitaciones por grupo
- `groupReservationLinks` - Vínculos grupo-reserva

### OTA
- `otaChannels` - Canales de distribución
- `otaReservationLogs` - Log de reservas importadas

### Reseñas
- `guestReviews` - Reseñas con análisis IA

### Restaurante
- `restaurantAreas` - Sectores (Bodega, Moneda)
- `restaurantTables` - Mesas con posición y hasWindow
- `tableReservations` - Reservas de mesa
- `menuCategories` - Categorías del menú con displayOrder
- `menuItems` - Platos con precio y alérgenos
- `restaurantOrders` - Pedidos con receiptType y paymentMethod
- `orderItems` - Ítems del pedido
- `restaurantTimeSlots` - Turnos configurables
- `recipes` - Recetas por plato
- `recipeIngredients` - Ingredientes de receta con costo

### SPA
- `spaCabins` - Cabinas
- `spaTreatmentCategories` - Categorías de tratamiento
- `spaTreatments` - Tratamientos
- `spaAppointments` - Turnos/citas
- `spaAccounts` - Cuentas/folios
- `spaAccountItems` - Ítems de cuenta

### Eventos
- `eventRooms` - Salones
- `events` - Eventos
- `eventChargeTypes` - Tipos de cargo
- `eventCharges` - Cargos por evento

### Inventario
- `itemCategories` - Categorías de ítems
- `suppliers` - Proveedores
- `inventoryItems` - Ítems de inventario
- `stockMovements` - Movimientos de stock
- `purchaseOrders` - Órdenes de compra
- `purchaseOrderItems` - Ítems de OC

### Mantenimiento
- `maintenanceStaff` - Personal técnico
- `workOrders` - Órdenes de trabajo

### Administración
- `systemUsers` - Usuarios del sistema con roles
- `systemSettings` - Configuraciones
- `auditLogs` - Logs de auditoría

### Paquetes
- `packages` - Paquetes comerciales
- `packageItems` - Ítems del paquete

### Chat IA
- `conversations` - Conversaciones
- `messages` - Mensajes

---

## 6. API REST (~180 endpoints)

### Dashboard: 3 endpoints
GET /api/dashboard/stats, /arrivals, /departures

### Hotel Core: ~50 endpoints
CRUD: room-types, rate-plans, rooms, companies, guests
Reservas: CRUD + check-in + check-out + cancel + duplicate + folio + overbooking
Cargos: CRUD + transfer
Pagos: CRUD + totals

### OTA: 6 endpoints
CRUD channels + reservations + simulate-import

### Grupos: 8 endpoints
CRUD + blocks + reservation-links + assign-room

### Reseñas: 7 endpoints
CRUD + analytics + analyze (IA)

### Housekeeping: 6 endpoints
CRUD + by-room + auto-create

### Restaurante: ~30 endpoints
Areas, tables, menu categories, menu items, orders, order-items
Time-slots, table-reservations, recipes, recipe-ingredients

### SPA: ~20 endpoints
Cabins, treatment-categories, treatments, appointments, accounts, account-items

### Eventos: ~15 endpoints
Rooms, events, charge-types, charges, planning

### Inventario: ~15 endpoints
Categories, suppliers, items, stock-movements, purchase-orders, PO-items

### Mantenimiento: ~10 endpoints
Staff, work-orders, dashboard

### Administración: ~12 endpoints
Users, settings, audit-logs, dashboard

### Paquetes: 8 endpoints
CRUD packages + package-items

---

## 7. TECNOLOGIAS

**Frontend:** React 18, TypeScript, Wouter (router), TanStack React Query v5, shadcn/ui + Radix UI, Tailwind CSS, Lucide icons, date-fns, Zod
**Backend:** Node.js, Express, TypeScript (ESM), Drizzle ORM
**Base de datos:** PostgreSQL (esquema definido, actualmente usa MemStorage)
**Build:** Vite + esbuild
**Integraciones:** OpenAI (análisis de reseñas)

---

## 8. ESTADO ACTUAL Y PENDIENTES

### Funcionando operativamente:
- Hotel PMS completo (reservas, planning, check-in/out, grupos, tarifas, paquetes, OTAs, reseñas)
- Restaurante POS completo (plano, pedidos, menú, reservas, recetas/costos, cierre con comprobante)
- SPA con agenda, tratamientos y cuentas
- Eventos con salones, agenda y cargos
- Housekeeping con tareas automáticas
- Mantenimiento con OTs
- Inventario con stock y OC
- Administración con usuarios, settings y auditoría

### Pendiente de desarrollo operativo:
- Coworking (solo placeholder, necesita backend completo)
- Ajustes finos según documentos PDF por módulo (SPA, Eventos, Housekeeping, etc.)

### Pendiente de backend/infraestructura (Fase siguiente):
1. Migración de MemStorage a PostgreSQL real (persistencia)
2. Autenticación y roles de usuario
3. Tesorería (cajas, turnos, arqueos)
4. Ledger transaccional central
5. Contabilidad simplificada (USALI)
6. Integración fiscal ARCA (facturación electrónica)
7. Multi-empresa / multi-propiedad

---

## 9. DATOS SEED PRECARGADOS

- 5 tipos de habitación, 7 planes tarifarios
- 34 habitaciones distribuidas en pisos 2-6
- 8 huéspedes de ejemplo, 3 empresas
- 7 reservas de ejemplo en distintos estados
- 2 sectores de restaurante, 32 mesas, 5 categorías de menú, 16 platos
- 3 cabinas de SPA, 3 categorías, 8 tratamientos
- 3 salones de eventos, 4 tipos de cargo
- 5 categorías de inventario, 3 proveedores, 10 ítems
- 3 técnicos de mantenimiento, 4 OTs
- 3 usuarios del sistema, 6 configuraciones, logs de auditoría
- 2 paquetes con ítems
