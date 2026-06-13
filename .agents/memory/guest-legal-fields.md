---
name: Guest Profile Legal Compliance Fields
description: Extended guest schema for Argentine legal/fiscal compliance — what exists and why.
---

## Fields added to guests table (all nullable, all have migrate.ts entries)

| Field | Column | Purpose |
|---|---|---|
| estadoCivil | estado_civil | Libro de registro hotelero |
| procedencia | procedencia | Ciudad de origen del viaje |
| nationalityCode | nationality_code | Código AFIP del país (FK conceptual a countries.afipCode) |
| fechaIngresoArgentina | fecha_ingreso_argentina | Fecha de ingreso al país (extranjeros) |
| fechaSalidaArgentina | fecha_salida_argentina | Fecha de salida prevista (extranjeros) |
| esEmpresaGrande | es_empresa_grande | FCE MiPyME: si la empresa es grande |
| montoBaseFce | monto_base_fce | FCE MiPyME: monto base para la factura de crédito |
| codigoPostal | codigo_postal | Código postal del domicilio |
| vatCondition | vat_condition | Condición AFIP (consumidor_final, responsable_inscripto, etc.) |
| provincia | provincia | Provincia del domicilio |

## Countries table
- `countries` table with: id, afipCode (unique int), name, isActive (bool), displayOrder
- 63 countries seeded (Argentina=200, Uruguay=225, Brasil=101, etc.)
- Admin CRUD: `GET/POST/PATCH/DELETE /api/admin/countries`
- Public: `GET /api/countries` (active only, sorted by displayOrder)
- ABM page: `/admin/countries` → "Países (AFIP)" in Configuración sidebar

## Frontend form (guests.tsx) organization
1. Datos Personales (doc type, name, CUIT, vatCondition, estadoCivil)
2. Datos de Contacto (phone, email)
3. Información Migratoria (NationalityCombobox with AFIP code, fechaIngreso/Salida conditional on non-Argentina)
4. Procedencia
5. Domicilio Permanente (dirección, ProvinciaCiudadSelect, codigoPostal)
6. FCE MiPyME (esEmpresaGrande checkbox, montoBaseFce conditional)
7. Empresa asociada
8. Vehículo

**Why:** Argentine Libro de Registro hotelero legally requires nationality, migration dates for foreigners, and civil status. FCE MiPyME requires knowing if the client is a large company.
