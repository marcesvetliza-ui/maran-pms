# Documento de Transferencia Técnica — Maran Suite System

**Fecha:** Mayo 2025  
**Sistema:** Maran Suite System — PMS hotelero para Maran Suites & Towers (66 habitaciones)  
**Destinatario:** Programador externo encargado de migración de datos y configuración de producción

---

## 1. VISIÓN GENERAL DEL SISTEMA

Aplicación web full-stack monolítica. Un solo repositorio contiene el frontend (React) y el backend (Express/Node.js), que sirven desde el mismo proceso y puerto.

```
Cliente (React/Vite)  ←→  Express API  ←→  PostgreSQL
         ↕                     ↕
    Tailwind/shadcn        Drizzle ORM
```

**Stack tecnológico:**

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Routing frontend | Wouter |
| Estado del servidor | TanStack React Query v5 |
| UI components | shadcn/ui + Radix UI + Tailwind CSS |
| Backend | Node.js + Express + TypeScript (ESM) |
| ORM | Drizzle ORM |
| Base de datos | PostgreSQL |
| Autenticación | Passport.js (local strategy) + bcrypt + sesiones en PostgreSQL |
| Monitoreo de errores | Sentry (backend + frontend) |
| Generación de PDFs | PDFKit |
| Emails | SMTP via Nodemailer (configurado en la app) |
| IA / Chatbot | OpenAI API (integración gestionada por Replit) |

---

## 2. REPOSITORIO Y DESPLIEGUE

| Entorno | URL | Plataforma |
|---|---|---|
| **Producción** | https://maranpms.com.ar | Railway + Cloudflare (dominio apunta a Railway) |
| **Staging** | https://maran-pms-staging.up.railway.app | Railway (entorno separado) |
| **Desarrollo** | http://localhost:5000 | Replit (dev server) |

**GitHub:** https://github.com/marcesvetliza-ui/maran-pms  
**Rama principal:** `main` (se despliega automáticamente a producción en Railway)  
**Rama staging:** `staging` (se despliega al entorno staging de Railway)

**CI/CD:** GitHub Actions corre smoke tests automáticos en cada push a `main` y `staging`.

---

## 3. VARIABLES DE ENTORNO Y SECRETOS

Todas las variables de entorno se configuran en Railway (producción y staging) y en Replit (desarrollo). **Nunca se commitean al repositorio.**

### Variables obligatorias (la app no arranca sin estas)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL completa. Formato: `postgresql://user:password@host:port/dbname` |
| `SESSION_SECRET` | Clave secreta para firmar las sesiones HTTP. Mínimo 32 caracteres aleatorios. Rotar cada 90 días. |

### Variables opcionales pero importantes

| Variable | Descripción |
|---|---|
| `SENTRY_DSN` | DSN del proyecto Sentry para monitoreo de errores en el **backend** |
| `VITE_SENTRY_DSN` | DSN del proyecto Sentry para monitoreo de errores en el **frontend** (puede ser el mismo DSN) |
| `OPENAI_API_KEY` | API key de OpenAI para el chatbot MARA. Alternativa a la integración de Replit. |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | API key de OpenAI gestionada por Replit Integrations (prioridad sobre `OPENAI_API_KEY`) |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | PAT de GitHub con scopes `repo` + `workflow`. Usado para push manual de código. |
| `PORT` | Puerto del servidor (por defecto 5000). Railway lo asigna automáticamente. |
| `NODE_ENV` | `production` en Railway, `development` en Replit. |
| `ENVIRONMENT` | `staging` en el entorno de staging. Controla el banner de staging en la UI. |
| `VITE_ENVIRONMENT` | Igual que `ENVIRONMENT` pero expuesto al frontend Vite. |
| `CHATBOT_WEBHOOK_SECRET` | Secreto HMAC para webhooks del chatbot MARA (si está integrado con servicio externo). |
| `MARA_BASE_URL` | URL base del servicio externo del chatbot MARA (si aplica). |

### Configuración SMTP (almacenada en base de datos)

El SMTP **no usa variables de entorno** — se configura desde la interfaz en `Configuración → Correo & Backup → SMTP`. Los datos se guardan encriptados en la tabla `email_config`. Para obtener o migrar esta configuración, hacer un `SELECT * FROM email_config LIMIT 1;`

---

## 4. ESTRUCTURA DE ARCHIVOS

```
/
├── client/                    # Frontend React
│   └── src/
│       ├── App.tsx            # Rutas de la app (wouter)
│       ├── pages/             # Una página por módulo (~40 páginas)
│       ├── components/
│       │   └── app-sidebar.tsx  # Sidebar con navegación por rol
│       └── lib/
│           └── queryClient.ts   # TanStack Query config + apiRequest()
│
├── server/
│   ├── index.ts               # Entry point: middlewares + migraciones + arranque
│   ├── routes.ts              # Todos los endpoints REST (~1700 líneas)
│   ├── auth.ts                # Passport config, hashPassword, requireRole
│   ├── db.ts                  # Conexión Drizzle → PostgreSQL
│   ├── db-storage.ts          # Capa de abstracción de datos (IStorage)
│   ├── migrate.ts             # Migraciones Drizzle (crea tablas)
│   ├── seed.ts                # Datos iniciales (habitaciones, tipos, usuarios demo)
│   ├── backup.ts              # Lógica de backup SQL + scheduler 03:00 ARG
│   ├── night-audit.ts         # Auditoría nocturna automática
│   └── vite.ts                # Dev server Vite integrado (no tocar)
│
├── shared/
│   └── schema.ts              # Esquema Drizzle (113 tablas) + tipos Zod. 
│                              # Compartido entre frontend y backend.
│
├── .github/
│   └── workflows/
│       ├── smoke-test.yml         # Tests en push a main
│       └── staging-smoke-test.yml # Tests en push a staging
│
├── drizzle.config.ts          # Config de Drizzle ORM (no modificar)
├── vite.config.ts             # Config de Vite (no modificar)
└── HANDOFF_TECNICO.md         # Este documento
```

---

## 5. BASE DE DATOS

### Conexión

```bash
# Conexión directa con psql
psql $DATABASE_URL

# O con los datos separados (obtener de Railway dashboard)
psql -h HOST -p PORT -U USER -d DATABASE
```

### Tablas principales (113 en total)

Las tablas están organizadas por módulo:

**PMS Core (Recepción)**
| Tabla | Descripción |
|---|---|
| `room_types` | Tipos de habitación (Superior, Deluxe, Suite, etc.) |
| `rooms` | Las 66 habitaciones, con tipo, piso, estado |
| `bed_types` | Tipos de cama (simple, doble, king, etc.) |
| `rate_plans` | Planes tarifarios |
| `guests` | Huéspedes registrados (CRM) |
| `reservations` | Reservas con check-in/out, estado, folio |
| `charges` | Cargos individuales por reserva |
| `charge_types` | Tipos de cargo (alojamiento, restaurant, SPA, etc.) |
| `payments` | Pagos recibidos |
| `cancelled_reservation_logs` | Historial de cancelaciones |

**Grupos**
| Tabla | Descripción |
|---|---|
| `groups` | Grupos con folio maestro |
| `group_room_blocks` | Bloqueos de habitaciones por grupo |
| `group_reservation_links` | Relación grupo ↔ reservas |
| `group_charges` / `group_payments` | Cargos y pagos del grupo |

**Operaciones**
| Tabla | Descripción |
|---|---|
| `housekeeping_tasks` | Tareas de mucama con estado y asignación |
| `maintenance_requests` | Solicitudes de mantenimiento |
| `inventory_items` | Artículos de inventario |
| `inventory_warehouses` | Almacenes (multi-depósito) |
| `warehouse_stock` | Stock por almacén |
| `stock_movements` | Movimientos de inventario |

**Restaurant**
| Tabla | Descripción |
|---|---|
| `restaurant_areas` | Áreas del restaurante (salón, terraza, etc.) |
| `restaurant_tables` | Mesas con capacidad y posición |
| `menu_categories` / `menu_items` | Carta del restaurante |
| `restaurant_orders` / `order_items` | Comandas y sus ítems |

**SPA**
| Tabla | Descripción |
|---|---|
| `spa_clients` | Clientes del SPA (distinto a huéspedes) |
| `spa_treatments` / `spa_cabins` | Tratamientos y cabinas |
| `spa_professionals` | Profesionales del SPA |
| `spa_appointments` | Turnos del SPA |
| `spa_accounts` / `spa_account_items` | Cuentas corrientes del SPA |

**Eventos**
| Tabla | Descripción |
|---|---|
| `events` | Eventos con salón, fechas, cliente |
| `event_rooms` | Salones disponibles |
| `event_charges` / `event_payments` | Cargos y pagos de eventos |
| `event_tables` | Mesas de evento con cargos |

**Administración / Contabilidad**
| Tabla | Descripción |
|---|---|
| `accounting_accounts` | Plan de cuentas |
| `accounting_entries` | Asientos contables |
| `accounting_suppliers` | Proveedores |
| `cash_register_configs` | Configuración de cajas (recepción, restaurant, SPA, eventos) |
| `cash_shifts` | Turnos de caja |
| `cash_movements` | Movimientos de caja |
| `billing_config` | Configuración AFIP (CUIT, punto de venta, certificados) |
| `invoices` | Facturas electrónicas con CAE |

**Comercial**
| Tabla | Descripción |
|---|---|
| `companies` | Empresas con cuenta corriente |
| `agencies` | Agencias de viaje con comisiones |
| `ota_channels` | Canales OTA (Booking, Airbnb, etc.) |
| `packages` | Paquetes hoteleros con servicios incluidos |
| `quotes` | Presupuestos (PRES-YYYY-NNNN) |

**Sistema**
| Tabla | Descripción |
|---|---|
| `users` | Usuarios del sistema con roles y contraseña hasheada |
| `sessions` | Sesiones HTTP (manejadas por connect-pg-simple) |
| `audit_logs` | Log de auditoría de acciones críticas |
| `system_settings` | Configuración clave-valor del sistema |
| `email_config` | Configuración SMTP y plantillas de emails |
| `backup_logs` | Historial de backups (tipo, estado, tamaño, duración) |
| `notification_alerts` | Alertas internas del sistema |

### Migraciones

El sistema **no usa archivos de migración separados** — las migraciones se ejecutan como SQL directo en `server/index.ts` al arrancar (bloques `try/catch` con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` y `CREATE TABLE IF NOT EXISTS`). Son idempotentes: se pueden correr múltiples veces sin problema.

Para crear todas las tablas desde cero en una base de datos vacía:
```bash
# En el entorno de desarrollo (Replit), simplemente arrancar el servidor ya crea todo:
npm run dev

# O ejecutar las migraciones de Drizzle directamente:
npx drizzle-kit push
```

---

## 6. AUTENTICACIÓN Y SEGURIDAD

### Sistema de autenticación

- **Passport.js** con estrategia `local` (usuario + contraseña)
- Contraseñas hasheadas con **bcrypt** (salt rounds: 10)
- Sesiones almacenadas en PostgreSQL (tabla `sessions`) via `connect-pg-simple`
- Cookie de sesión: `maran.sid`, HttpOnly, SameSite=Strict, Secure en producción

### Credenciales del administrador

El bootstrap del primer usuario `admin` ya no usa una contraseña fija en el
código (ver `server/auth-bootstrap.ts`): requiere `ADMIN_BOOTSTRAP_ENABLED=true`
y `ADMIN_BOOTSTRAP_SECRET` configurados por variable de entorno, y la
contraseña real se elige en el momento del bootstrap — nunca vive en este
documento ni en el repositorio.

**⚠️ Si esta cuenta llegó a usar la contraseña por defecto que tenía el
código antes de esa migración, considerala comprometida (quedó en el
historial de Git) y rotala.**

### Roles del sistema (8 roles)

| Rol | Acceso |
|---|---|
| `admin` | Todo el sistema + administración de usuarios |
| `manager` | Dashboard ejecutivo + reportes + todo operativo |
| `reception` | PMS, reservas, check-in/out, folios |
| `housekeeping` | Módulo de mucamas |
| `maintenance` | Módulo de mantenimiento + bitácora |
| `restaurant` | POS restaurante |
| `spa` | Módulo SPA |
| `events` | Módulo eventos |

El sidebar filtra automáticamente los ítems de menú según el rol del usuario logueado.

### Seguridad de la API

- **Helmet.js**: headers HTTP de seguridad en producción
- **Rate limiting**: en endpoints críticos (login, etc.)
- **`requireAuth`**: middleware que verifica sesión activa
- **`requireRole([roles])`**: middleware que verifica permisos por rol
- **Audit log**: las acciones críticas (crear/eliminar usuarios, cancelar reservas, etc.) quedan registradas en `audit_logs`

---

## 7. PROCESO DE MIGRACIÓN DE DATOS (DEL SISTEMA ANTERIOR)

### Estrategia recomendada

1. **No migrar en producción directamente.** Hacer todo el proceso en staging primero.

2. **Exportar del sistema anterior** los datos en formato CSV o SQL por entidad. Las entidades prioritarias son:
   - Huéspedes (`guests`)
   - Habitaciones (`rooms`, `room_types`)
   - Reservas activas y futuras (`reservations`)
   - Usuarios del sistema (`users`)
   - Configuración tarifaria (`rate_plans`)

3. **Mapear los campos** del sistema viejo a las columnas de `shared/schema.ts`. Prestar atención a:
   - Los IDs son `varchar` con UUIDs generados por `gen_random_uuid()`. Si el sistema viejo usa IDs numéricos, hay que generar nuevos UUIDs y mapear las relaciones.
   - Las contraseñas **deben re-hashearse** con bcrypt. No se pueden migrar hashes de otros sistemas directamente.
   - Los estados de reserva usan valores específicos: `pending`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`.

4. **Script de inserción**: escribir INSERTs SQL con `ON CONFLICT DO NOTHING` para seguridad.

5. **Verificar integridad referencial** antes de insertar (foreign keys activos).

### Tablas con datos de seed (ya tienen datos al arrancar)

Estas tablas se populan automáticamente al arrancar por primera vez y **no necesitan migración**:
- Tipos de cargo (`charge_types`) — ya configurados
- Configuración de cajas (`cash_register_configs`) — ya configuradas
- Cuentas contables básicas (`accounting_accounts`) — ya creadas
- Usuario `admin` por defecto — ya creado

---

## 8. BACKUP Y RESTAURACIÓN

### Backup automático

- Corre todos los días a las **03:00 hs (hora Argentina)**
- Genera un dump SQL completo de la base de datos
- Lo envía por email SMTP al destinatario configurado en `Configuración → Correo & Backup`
- El historial de backups se guarda en la tabla `backup_logs` (retención 90 días)

### Backup manual

Desde la interfaz web (admin):
- `Configuración → Correo & Backup → Backup` → **Descargar .sql** (descarga directa)
- O: **Enviar por email ahora** (envía inmediatamente)

También via API directa:
```bash
# Requiere cookie de sesión válida de admin
curl -b session_cookie https://maranpms.com.ar/api/admin/backup/download -o backup.sql
```

### Restauración

```bash
# CUIDADO: esto borra y reemplaza toda la base de datos
psql $DATABASE_URL < backup.sql
```

El sistema incluye un **test de restore automático** (`Configuración → Correo & Backup → Test de Restore`) que restaura a un schema temporal y verifica los row counts sin tocar producción.

### Health check

```bash
# Verificar que el sistema está vivo
curl https://maranpms.com.ar/api/health
# Respuesta esperada: {"status":"ok","timestamp":"...","environment":"production","db":"connected"}
```

---

## 9. MONITOREO

- **Sentry**: captura errores de JavaScript (frontend) y excepciones de Node.js (backend) automáticamente. Dashboard: https://sentry.io → proyecto Maran PMS.
- **Railway**: logs de servidor en tiempo real desde el dashboard de Railway.
- **GitHub Actions**: smoke tests corren en cada deploy y notifican si algo falla.

---

## 10. COSAS IMPORTANTES A NO TOCAR

| Archivo/Recurso | Por qué |
|---|---|
| `vite.config.ts` | Configuración crítica del bundler. Tocar puede romper el build. |
| `server/vite.ts` | Integración Vite+Express para dev. No modificar. |
| `drizzle.config.ts` | Apunta a la base de datos correcta. No modificar. |
| `package.json` → scripts | Los scripts están alineados con Railway y Replit. |
| Tabla `sessions` | La maneja `connect-pg-simple` automáticamente. No modificar a mano. |
| Usuario `admin` | No eliminar ni degradar si es el único admin. El sistema lo impide por código también. |

---

## 11. COMANDOS ÚTILES

```bash
# Arrancar en desarrollo
npm run dev

# Instalar dependencias
npm install

# Ver logs de producción (desde Railway CLI)
railway logs --environment production

# Conectar a la DB de producción (desde Railway CLI)
railway connect postgresql

# Correr migraciones manualmente (solo si es necesario)
npx drizzle-kit push

# Generar un nuevo SESSION_SECRET seguro
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 12. CONTACTO Y ACCESOS NECESARIOS

Para trabajar en este sistema, el programador necesita acceso a:

- [ ] **GitHub**: invitación como colaborador al repo `marcesvetliza-ui/maran-pms`
- [ ] **Railway**: invitación al proyecto (para ver variables de entorno y logs de producción)
- [ ] **Sentry**: acceso al proyecto para ver errores en producción
- [ ] **Credenciales de la DB de producción** (se obtienen de Railway → Variables)
- [ ] **Backup reciente** del sistema anterior en formato exportable

---

*Documento generado automáticamente por el agente de desarrollo. Última actualización: Mayo 2025.*
