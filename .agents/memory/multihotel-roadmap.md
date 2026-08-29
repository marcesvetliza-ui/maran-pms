---
name: Roadmap Multihotel
description: Plan estratégico y técnico para convertir el sistema de single-tenant a multi-tenant (SaaS para múltiples hoteles).
---

# Roadmap Multihotel

## Estado actual (Junio 2026)
El sistema es single-tenant por diseño. Toda la data vive sin `hotelId`. La arquitectura está bien estructurada (módulos claros, API REST limpia, roles definidos) lo que facilita la migración futura.

## Capas de trabajo requeridas

### 1. Base de datos — `hotelId` en todas las tablas
- Agregar columna `hotelId` (FK) a: rooms, room_types, reservations, guests, charges, payments, folios, rate_plans, bed_types, companies, agencies, groups, packages, inventory, maintenance_blocks, audit_logs, etc.
- Migración incremental con Drizzle
- Todas las queries filtran por `hotelId` del contexto de sesión

### 2. Autenticación multihotel
- Tabla `hotels` con config por hotel (nombre, logo, AFIP data, timezone, etc.)
- Cada usuario tiene `hotelId` (o es `superadmin` sin hotel)
- La sesión lleva `hotelId` inyectado
- Middleware en Express que agrega `req.hotelId` a partir del usuario autenticado

### 3. Control de módulos por hotel
- Tabla `hotel_modules` (ya mencionada en replit.md como futura)
- Middleware que verifica acceso al módulo antes de cada ruta
- Panel de activación/desactivación por hotel

### 4. Superadmin y onboarding
- Rol `superadmin` con acceso cross-hotel
- Panel de superadmin: crear hoteles, asignar módulos, ver stats globales
- Flujo de onboarding para nuevos hoteles (configuración inicial guiada)
- Estrategia de URL: subdominio (`maran.sistema.com`) o path-based (`sistema.com/hotel/maran`)

### 5. UI por hotel
- Logo, nombre y colores configurables por hotel
- Branding básico per-tenant

## Esfuerzo estimado
| Capa | Esfuerzo |
|------|----------|
| `hotelId` en todas las tablas + migraciones | 1–2 semanas |
| Auth y middleware multihotel | 3–5 días |
| Panel superadmin + onboarding | 1 semana |
| Control de módulos por hotel | 2–3 días |
| Ajustes de UI por hotel | Variable |
| **Total** | **~4–6 semanas** |

## Prerrequisitos antes de arrancar
1. Sistema estabilizado y operativo en Maran (producción real)
2. Todos los módulos validados en uso real
3. Modelo de negocio definido (SaaS mensual por módulo, precio por habitación, etc.)
4. Prioridades comerciales e IA definidas y datos operativos confiables

## Primer hito técnico recomendado
Agregar `hotelId` a las tablas core (rooms, reservations, guests) + middleware de contexto. Todo lo demás se construye sobre eso.

**Why:** El sistema fue diseñado conscientemente como single-tenant primero para velocidad de desarrollo. La migración a multi-tenant es un refactor grande pero predecible dado que la arquitectura ya está modularizada.

## Secuencia acordada
No iniciar multihotel durante la estabilización actual. Primero se debe terminar el análisis, poner Maran en funcionamiento y observarlo en uso real. Las mejoras comerciales y la IA deben construirse sobre esa base validada; multihotel queda como etapa posterior.

**Why:** Es más seguro separar la puesta en marcha del producto de un refactor de aislamiento de datos y de una nueva capa de automatización.
