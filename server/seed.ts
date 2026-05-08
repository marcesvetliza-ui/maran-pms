import { db } from "./db";
import { eq, sql, notInArray } from "drizzle-orm";
import {
  roomTypes,
  bedTypes,
  ratePlans,
  rooms,
  companies,
  guests,
  reservations,
  charges,
  payments,
  restaurantAreas,
  restaurantTables,
  menuCategories,
  menuItems,
  itemCategories,
  suppliers,
  inventoryItems,
  spaCabins,
  spaTreatmentCategories,
  spaTreatments,
  eventRooms,
  eventChargeTypes,
  maintenanceStaff,
  systemUsers,
  systemSettings,
  auditLogs,
  systemNotifications,
  guestPreferences,
  cashRegisterConfigs,
  groups,
  groupRoomBlocks,
  groupReservationLinks,
  spaAppointments,
} from "@shared/schema";

export async function seedDatabase() {
  const existingRoomTypes = await db.select().from(roomTypes).limit(1);
  if (existingRoomTypes.length > 0) {
    console.log("Database already seeded");
    return;
  }

  const now = new Date();

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
  const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];

  console.log("Seeding room types...");
  await db.insert(roomTypes).values([
    { id: "rt1", code: "EJEC", name: "Ejecutiva", description: "Habitacion ejecutiva, ideal para viajeros de negocios", baseOccupancy: 2, maxOccupancy: 2 },
    { id: "rt2", code: "PREM", name: "Premium", description: "Habitacion premium con amenities superiores", baseOccupancy: 2, maxOccupancy: 3 },
    { id: "rt3", code: "SPAN", name: "Suite Panoramica", description: "Suite con vistas panoramicas y living separado", baseOccupancy: 2, maxOccupancy: 4 },
    { id: "rt4", code: "SPRES", name: "Suite Presidencial", description: "La suite mas exclusiva del hotel", baseOccupancy: 2, maxOccupancy: 4 },
  ]);

  console.log("Seeding bed types...");
  await db.insert(bedTypes).values([
    { id: "bt-001", code: "SGL", name: "Simple", description: "Cama simple individual", isActive: true, displayOrder: 1, createdAt: now },
    { id: "bt-002", code: "DBL", name: "Doble", description: "Cama doble matrimonial", isActive: true, displayOrder: 2, createdAt: now },
    { id: "bt-003", code: "TWN", name: "Twin — 2 camas separadas", description: "Dos camas individuales separadas", isActive: true, displayOrder: 3, createdAt: now },
    { id: "bt-004", code: "TPL", name: "Triple", description: "Configuración triple (matrimonial + individual)", isActive: true, displayOrder: 4, createdAt: now },
    { id: "bt-005", code: "MAT_LIV", name: "Matrimonial con Living", description: "Cama matrimonial con living separado", isActive: true, displayOrder: 5, createdAt: now },
    { id: "bt-006", code: "STE_SOFA", name: "Suite con Sofá Cama", description: "Suite con sofá cama adicional", isActive: true, displayOrder: 6, createdAt: now },
  ]);

  console.log("Seeding rate plans...");
  await db.insert(ratePlans).values([
    { id: "rp1", name: "BAR (Mejor Tarifa)", roomTypeId: "rt1", baseRate: "85.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
    { id: "rp2", name: "BAR (Mejor Tarifa)", roomTypeId: "rt2", baseRate: "120.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
    { id: "rp3", name: "BAR (Mejor Tarifa)", roomTypeId: "rt3", baseRate: "180.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
    { id: "rp4", name: "BAR (Mejor Tarifa)", roomTypeId: "rt4", baseRate: "350.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelacion gratuita hasta 24h antes" },
    { id: "rp5", name: "No Reembolsable", roomTypeId: "rt1", baseRate: "70.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelacion" },
    { id: "rp6", name: "No Reembolsable", roomTypeId: "rt2", baseRate: "100.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelacion" },
    { id: "rp7", name: "Corporativo", roomTypeId: "rt1", baseRate: "75.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturacion a empresa" },
    { id: "rp8", name: "Corporativo", roomTypeId: "rt2", baseRate: "105.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturacion a empresa" },
    { id: "rp9", name: "Corporativo", roomTypeId: "rt3", baseRate: "160.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturacion a empresa" },
  ]);

  console.log("Seeding rooms...");
  await db.insert(rooms).values([
    { id: "r201", roomNumber: "201", roomTypeId: "rt2", floor: 2, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["accessible", "separable_bed"], maxOccupancy: 3, notes: null },
    { id: "r202", roomNumber: "202", roomTypeId: "rt1", floor: 2, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r204", roomNumber: "204", roomTypeId: "rt2", floor: 2, status: "available", bedConfig: "MAT_CC", features: ["accessible", "separable_bed", "sofa_bed", "living_room"], maxOccupancy: 4, notes: null },
    { id: "r205", roomNumber: "205", roomTypeId: "rt3", floor: 2, status: "available", bedConfig: "MAT_EXTRA", features: ["balcony", "living_room"], maxOccupancy: 4, notes: null },
    { id: "r206", roomNumber: "206", roomTypeId: "rt3", floor: 2, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room"], maxOccupancy: 4, notes: null },
    { id: "r207", roomNumber: "207", roomTypeId: "rt2", floor: 2, status: "available", bedConfig: "MAT", features: [], maxOccupancy: 2, notes: null },
    { id: "r301", roomNumber: "301", roomTypeId: "rt2", floor: 3, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r302", roomNumber: "302", roomTypeId: "rt1", floor: 3, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r303", roomNumber: "303", roomTypeId: "rt1", floor: 3, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r304", roomNumber: "304", roomTypeId: "rt1", floor: 3, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
    { id: "r305", roomNumber: "305", roomTypeId: "rt3", floor: 3, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r306", roomNumber: "306", roomTypeId: "rt3", floor: 3, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r307", roomNumber: "307", roomTypeId: "rt2", floor: 3, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r401", roomNumber: "401", roomTypeId: "rt2", floor: 4, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r402", roomNumber: "402", roomTypeId: "rt1", floor: 4, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r403", roomNumber: "403", roomTypeId: "rt1", floor: 4, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r404", roomNumber: "404", roomTypeId: "rt1", floor: 4, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
    { id: "r405", roomNumber: "405", roomTypeId: "rt3", floor: 4, status: "available", bedConfig: "MAT_EXTRA", features: ["living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r406", roomNumber: "406", roomTypeId: "rt3", floor: 4, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r407", roomNumber: "407", roomTypeId: "rt2", floor: 4, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r501", roomNumber: "501", roomTypeId: "rt2", floor: 5, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r502", roomNumber: "502", roomTypeId: "rt1", floor: 5, status: "available", bedConfig: "MAT_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r503", roomNumber: "503", roomTypeId: "rt1", floor: 5, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r504", roomNumber: "504", roomTypeId: "rt1", floor: 5, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
    { id: "r505", roomNumber: "505", roomTypeId: "rt3", floor: 5, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r506", roomNumber: "506", roomTypeId: "rt3", floor: 5, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r507", roomNumber: "507", roomTypeId: "rt2", floor: 5, status: "available", bedConfig: "MAT_CC", features: [], maxOccupancy: 2, notes: null },
    { id: "r601", roomNumber: "601", roomTypeId: "rt2", floor: 6, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r602", roomNumber: "602", roomTypeId: "rt1", floor: 6, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r603", roomNumber: "603", roomTypeId: "rt1", floor: 6, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r604", roomNumber: "604", roomTypeId: "rt1", floor: 6, status: "available", bedConfig: "MAT", features: [], maxOccupancy: 2, notes: null },
    { id: "r605", roomNumber: "605", roomTypeId: "rt3", floor: 6, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony", "extra_bed"], maxOccupancy: 4, notes: null },
    { id: "r606", roomNumber: "606", roomTypeId: "rt3", floor: 6, status: "available", bedConfig: "MAT_EXTRA", features: ["living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r607", roomNumber: "607", roomTypeId: "rt2", floor: 6, status: "available", bedConfig: "MAT", features: [], maxOccupancy: 2, notes: null },
    { id: "r701", roomNumber: "701", roomTypeId: "rt2", floor: 7, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r702", roomNumber: "702", roomTypeId: "rt1", floor: 7, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r703", roomNumber: "703", roomTypeId: "rt1", floor: 7, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r704", roomNumber: "704", roomTypeId: "rt1", floor: 7, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
    { id: "r705", roomNumber: "705", roomTypeId: "rt3", floor: 7, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r706", roomNumber: "706", roomTypeId: "rt3", floor: 7, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r707", roomNumber: "707", roomTypeId: "rt2", floor: 7, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r801", roomNumber: "801", roomTypeId: "rt2", floor: 8, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r802", roomNumber: "802", roomTypeId: "rt1", floor: 8, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r803", roomNumber: "803", roomTypeId: "rt1", floor: 8, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r804", roomNumber: "804", roomTypeId: "rt1", floor: 8, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
    { id: "r805", roomNumber: "805", roomTypeId: "rt3", floor: 8, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r806", roomNumber: "806", roomTypeId: "rt3", floor: 8, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r807", roomNumber: "807", roomTypeId: "rt2", floor: 8, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r901", roomNumber: "901", roomTypeId: "rt2", floor: 9, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r902", roomNumber: "902", roomTypeId: "rt1", floor: 9, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r903", roomNumber: "903", roomTypeId: "rt1", floor: 9, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r904", roomNumber: "904", roomTypeId: "rt1", floor: 9, status: "available", bedConfig: "MAT", features: ["shower_only"], maxOccupancy: 2, notes: null },
    { id: "r905", roomNumber: "905", roomTypeId: "rt3", floor: 9, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r906", roomNumber: "906", roomTypeId: "rt3", floor: 9, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r907", roomNumber: "907", roomTypeId: "rt2", floor: 9, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r1001", roomNumber: "1001", roomTypeId: "rt2", floor: 10, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r1002", roomNumber: "1002", roomTypeId: "rt1", floor: 10, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r1003", roomNumber: "1003", roomTypeId: "rt1", floor: 10, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r1005", roomNumber: "1005", roomTypeId: "rt3", floor: 10, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "living_room", "balcony"], maxOccupancy: 4, notes: null },
    { id: "r1006", roomNumber: "1006", roomTypeId: "rt3", floor: 10, status: "available", bedConfig: "MAT_EXTRA", features: ["extra_bed", "living_room", "balcony"], maxOccupancy: 5, notes: null },
    { id: "r1101", roomNumber: "1101", roomTypeId: "rt2", floor: 11, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r1102", roomNumber: "1102", roomTypeId: "rt1", floor: 11, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r1103", roomNumber: "1103", roomTypeId: "rt1", floor: 11, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r1201", roomNumber: "1201", roomTypeId: "rt2", floor: 12, status: "available", bedConfig: "MAT_CC_EXTRA", features: ["separable_bed", "extra_bed"], maxOccupancy: 3, notes: null },
    { id: "r1202", roomNumber: "1202", roomTypeId: "rt1", floor: 12, status: "available", bedConfig: "TWIN_CC", features: ["twin_config", "separable_bed"], maxOccupancy: 2, notes: null },
    { id: "r1203", roomNumber: "1203", roomTypeId: "rt1", floor: 12, status: "available", bedConfig: "MAT_CC", features: ["separable_bed"], maxOccupancy: 2, notes: null },
  ]);

  console.log("Seeding companies...");
  await db.insert(companies).values([
    { id: "comp1", razonSocial: "TechCorp Argentina S.A.", nombreFantasia: "TechCorp", direccion: "Av. del Libertador 1000", pais: "Argentina", codigoPostal: "1001", localidad: "CABA", provincia: "Buenos Aires", telefono: "+54 11 4000-1234", email: "reservas@techcorp.com.ar", cuilCuit: "30-71234567-8", numeroFiscal: "30714567", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Pablo Mendez", contactEmail: "pablo.mendez@techcorp.com.ar", contactPhone: "+54 11 4000-1235", creditLimit: "50000.00", paymentTermDays: 30, notes: "Cliente corporativo frecuente", isActive: "true", createdAt: now },
    { id: "comp2", razonSocial: "Consultoría Global S.R.L.", nombreFantasia: "ConsultGlobal", direccion: "Callao 500", pais: "Argentina", codigoPostal: "1002", localidad: "CABA", provincia: "Buenos Aires", telefono: "+54 11 5000-5678", email: "viajes@consultglobal.com", cuilCuit: "30-70987654-3", numeroFiscal: "30709876", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Lucia Torres", contactEmail: "lucia.t@consultglobal.com", contactPhone: "+54 11 5000-5679", creditLimit: "25000.00", paymentTermDays: 15, notes: null, isActive: "true", createdAt: now },
    { id: "comp3", razonSocial: "Exportadora del Sur S.A.", nombreFantasia: "ExportSur", direccion: "Bv. Oroño 2000", pais: "Argentina", codigoPostal: "2000", localidad: "Rosario", provincia: "Santa Fe", telefono: "+54 341 456-7890", email: "admin@exportsur.com.ar", cuilCuit: "30-65432198-7", numeroFiscal: "30654321", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Martin Gomez", contactEmail: "martin@exportsur.com.ar", contactPhone: "+54 341 456-7891", creditLimit: "30000.00", paymentTermDays: 30, notes: "Empresa de Rosario", isActive: "true", createdAt: now },
  ]);

  console.log("Seeding guests...");
  await db.insert(guests).values([
    { id: "g1", codigo: "H-2025-0001", firstName: "Carlos", lastName: "García", email: "carlos.garcia@email.com", phone: "+54 11 4567-8901", documentType: "dni", documentNumber: "30456789", nationality: "Argentina", direccion: "Av. Corrientes 1234", localidad: "CABA", codigoPostal: "1043", fechaNacimiento: "1985-03-15", sexo: "masculino", segment: "LEISURE", cuilCuit: "20-30456789-3", companyId: null, fechaAlta: now, vehiculoPatente: "AB 123 CD", vehiculoMarca: "Toyota", vehiculoModelo: "Corolla", vehiculoColor: "Blanco" },
    { id: "g2", codigo: "H-2025-0002", firstName: "María", lastName: "López", email: "maria.lopez@email.com", phone: "+54 11 5678-9012", documentType: "dni", documentNumber: "28765432", nationality: "Argentina", direccion: "Calle Florida 567", localidad: "CABA", codigoPostal: "1005", fechaNacimiento: "1990-07-22", sexo: "femenino", segment: "LEISURE", cuilCuit: "27-28765432-4", companyId: null, fechaAlta: now, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
    { id: "g3", codigo: "H-2025-0003", firstName: "John", lastName: "Smith", email: "john.smith@email.com", phone: "+1 555 123-4567", documentType: "passport", documentNumber: "US123456", nationality: "Estados Unidos", direccion: "123 Main St", localidad: "New York", codigoPostal: "10001", fechaNacimiento: "1978-11-30", sexo: "masculino", segment: "LEISURE", cuilCuit: null, companyId: null, fechaAlta: now, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
    { id: "g4", codigo: "H-2025-0004", firstName: "Ana", lastName: "Martínez", email: "ana.martinez@email.com", phone: "+54 11 6789-0123", documentType: "dni", documentNumber: "35678901", nationality: "Argentina", direccion: "Av. Santa Fe 890", localidad: "CABA", codigoPostal: "1059", fechaNacimiento: "1995-01-10", sexo: "femenino", segment: "LEISURE", cuilCuit: "27-35678901-9", companyId: null, fechaAlta: now, vehiculoPatente: "XY 456 ZW", vehiculoMarca: "Ford", vehiculoModelo: "Focus", vehiculoColor: "Negro" },
    { id: "g5", codigo: "H-2025-0005", firstName: "Roberto", lastName: "Fernández", email: "roberto.f@email.com", phone: "+54 11 7890-1234", documentType: "dni", documentNumber: "32109876", nationality: "Argentina", direccion: "Callao 456", localidad: "CABA", codigoPostal: "1022", fechaNacimiento: "1982-05-20", sexo: "masculino", segment: "CORP", cuilCuit: "20-32109876-5", companyId: "comp1", fechaAlta: now, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
    { id: "g6", codigo: "H-2025-0006", firstName: "Laura", lastName: "Pérez", email: "laura.p@email.com", phone: "+54 11 8901-2345", documentType: "dni", documentNumber: "29876543", nationality: "Argentina", direccion: "Av. Libertador 123", localidad: "CABA", codigoPostal: "1426", fechaNacimiento: "1988-09-08", sexo: "femenino", segment: "LEISURE", cuilCuit: "27-29876543-2", companyId: null, fechaAlta: now, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
    { id: "g7", codigo: "H-2025-0007", firstName: "Diego", lastName: "Ramírez", email: "diego.r@email.com", phone: "+54 11 9012-3456", documentType: "dni", documentNumber: "31234567", nationality: "Argentina", direccion: "Av. Belgrano 456", localidad: "CABA", codigoPostal: "1092", fechaNacimiento: "1992-12-25", sexo: "masculino", segment: "LEISURE", cuilCuit: "20-31234567-8", companyId: null, fechaAlta: now, vehiculoPatente: "MN 789 OP", vehiculoMarca: "Chevrolet", vehiculoModelo: "Cruze", vehiculoColor: "Gris" },
    { id: "g8", codigo: "H-2025-0008", firstName: "Sophie", lastName: "Martin", email: "sophie.m@email.com", phone: "+33 1 2345 6789", documentType: "passport", documentNumber: "FR789012", nationality: "Francia", direccion: "15 Rue de Paris", localidad: "Lyon", codigoPostal: "69001", fechaNacimiento: "1987-04-18", sexo: "femenino", segment: "LEISURE", cuilCuit: null, companyId: null, fechaAlta: now, vehiculoPatente: null, vehiculoMarca: null, vehiculoModelo: null, vehiculoColor: null },
  ]);

  console.log("Seeding reservations...");
  await db.insert(reservations).values([
    { id: "res1", reservationCode: "RES-1001", guestId: "g1", companyId: null, roomTypeId: "rt2", roomId: "r201", ratePlanId: "rp2", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "120.00", status: "checked_in", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: now, lastModifiedBy: null },
    { id: "res2", reservationCode: "RES-1002", guestId: "g2", companyId: null, roomTypeId: "rt3", roomId: "r305", ratePlanId: "rp3", checkInDate: today, checkOutDate: nextWeek, nights: 7, baseRatePerNight: "180.00", discountType: "percent", discountValue: "10", finalRatePerNight: "162.00", totalRoomAmount: "1134.00", status: "checked_in", source: "web", otaChannelId: null, externalReservationId: null, numberOfGuests: 3, notes: "VIP - Aniversario", createdAt: now, lastModifiedBy: null },
    { id: "res3", reservationCode: "RES-1003", guestId: "g3", companyId: null, roomTypeId: "rt3", roomId: "r505", ratePlanId: "rp3", checkInDate: today, checkOutDate: in3Days, nights: 3, baseRatePerNight: "180.00", discountType: "none", discountValue: "0", finalRatePerNight: "180.00", totalRoomAmount: "540.00", status: "checked_in", source: "booking", otaChannelId: null, externalReservationId: "BK-123456", numberOfGuests: 2, notes: null, createdAt: now, lastModifiedBy: null },
    { id: "res4", reservationCode: "RES-1004", guestId: "g4", companyId: null, roomTypeId: "rt2", roomId: "r401", ratePlanId: "rp2", checkInDate: today, checkOutDate: dayAfter, nights: 2, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "240.00", status: "checked_in", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: now, lastModifiedBy: null },
    { id: "res5", reservationCode: "RES-1005", guestId: "g5", companyId: "comp1", roomTypeId: "rt1", roomId: "r302", ratePlanId: "rp7", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "75.00", discountType: "fixed", discountValue: "10", finalRatePerNight: "65.00", totalRoomAmount: "65.00", status: "confirmed", source: "empresa", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: now, lastModifiedBy: null },
    { id: "res6", reservationCode: "RES-1006", guestId: "g6", companyId: null, roomTypeId: "rt1", roomId: "r202", ratePlanId: "rp1", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "85.00", discountType: "none", discountValue: "0", finalRatePerNight: "85.00", totalRoomAmount: "340.00", status: "tentative", source: "telefono", otaChannelId: null, externalReservationId: null, numberOfGuests: 1, notes: "Llegada tardia", createdAt: now, lastModifiedBy: null },
    { id: "res7", reservationCode: "RES-1007", guestId: "g7", companyId: null, roomTypeId: "rt2", roomId: "r307", ratePlanId: "rp2", checkInDate: dayAfter, checkOutDate: nextWeek, nights: 5, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "600.00", status: "confirmed", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: now, lastModifiedBy: null },
    { id: "res8", reservationCode: "RES-1008", guestId: "g8", companyId: null, roomTypeId: "rt3", roomId: "r405", ratePlanId: "rp3", checkInDate: in3Days, checkOutDate: in10Days, nights: 7, baseRatePerNight: "180.00", discountType: "none", discountValue: "0", finalRatePerNight: "180.00", totalRoomAmount: "1260.00", status: "pending", source: "expedia", otaChannelId: null, externalReservationId: "EX-789012", numberOfGuests: 2, notes: "Turista frances", createdAt: now, lastModifiedBy: null },
  ]);

  console.log("Seeding charges...");
  await db.insert(charges).values([
    { id: "ch1", reservationId: "res1", description: "Alojamiento - 1 noche", amount: "120.00", date: today, category: "room", createdBy: null },
    { id: "ch2", reservationId: "res2", description: "Alojamiento - 7 noches", amount: "1134.00", date: today, category: "room", createdBy: null },
    { id: "ch2b", reservationId: "res2", description: "Minibar", amount: "25.00", date: today, category: "minibar", createdBy: null },
    { id: "ch3", reservationId: "res3", description: "Alojamiento - 3 noches", amount: "540.00", date: today, category: "room", createdBy: null },
    { id: "ch3b", reservationId: "res3", description: "Restaurante - Cena", amount: "85.00", date: today, category: "restaurant", createdBy: null },
    { id: "ch4", reservationId: "res4", description: "Alojamiento - 2 noches", amount: "240.00", date: today, category: "room", createdBy: null },
  ]);

  console.log("Seeding restaurant areas...");
  await db.insert(restaurantAreas).values([
    { id: "area1", name: "Sector Bodega (Mesas 1-18)", areaType: "indoor", capacity: 72, hasTables: "true", isActive: "true", notes: "Mesas cuadradas" },
    { id: "area2", name: "Sector Moneda (Mesas 19-32)", areaType: "indoor", capacity: 56, hasTables: "true", isActive: "true", notes: "Mesas redondas" },
    { id: "area-rs", name: "Room Service", areaType: "private", capacity: 0, hasTables: "false", isActive: "true", notes: null },
    { id: "area-delivery", name: "Delivery", areaType: "private", capacity: 0, hasTables: "false", isActive: "true", notes: null },
    { id: "area-solarium", name: "Solarium", areaType: "outdoor", capacity: 0, hasTables: "false", isActive: "true", notes: null },
    { id: "area-spa", name: "SPA", areaType: "private", capacity: 0, hasTables: "false", isActive: "true", notes: null },
  ]);

  console.log("Seeding restaurant tables...");
  await db.insert(restaurantTables).values([
    { id: "t1", tableNumber: "1", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 2, isActive: "true" },
    { id: "t2", tableNumber: "2", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 2, isActive: "true" },
    { id: "t3", tableNumber: "3", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 2, isActive: "true" },
    { id: "t4", tableNumber: "4", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 3, isActive: "true" },
    { id: "t5", tableNumber: "5", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 3, positionY: 3, isActive: "true" },
    { id: "t6", tableNumber: "6", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 1, isActive: "true" },
    { id: "t7", tableNumber: "7", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 4, isActive: "true" },
    { id: "t8", tableNumber: "8", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 1, isActive: "true" },
    { id: "t9", tableNumber: "9", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 4, isActive: "true" },
    { id: "t10", tableNumber: "10", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 5, isActive: "true" },
    { id: "t11", tableNumber: "11", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 3, positionY: 5, isActive: "true" },
    { id: "t12", tableNumber: "12", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 5, isActive: "true" },
    { id: "t13", tableNumber: "13", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 5, isActive: "true" },
    { id: "t14", tableNumber: "14", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 3, isActive: "true" },
    { id: "t15", tableNumber: "15", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 2, positionY: 0, isActive: "true" },
    { id: "t16", tableNumber: "16", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 3, isActive: "true" },
    { id: "t17", tableNumber: "17", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 1, positionY: 0, isActive: "true" },
    { id: "t18", tableNumber: "18", areaId: "area1", capacity: 4, shape: "square", status: "available", positionX: 0, positionY: 0, isActive: "true" },
    { id: "t19", tableNumber: "19", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 5, isActive: "true" },
    { id: "t20", tableNumber: "20", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 0, isActive: "true" },
    { id: "t21", tableNumber: "21", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 4, isActive: "true" },
    { id: "t22", tableNumber: "22", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 4, isActive: "true" },
    { id: "t23", tableNumber: "23", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 3, isActive: "true" },
    { id: "t24", tableNumber: "24", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 3, isActive: "true" },
    { id: "t25", tableNumber: "25", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 2, positionY: 3, isActive: "true" },
    { id: "t26", tableNumber: "26", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 2, isActive: "true" },
    { id: "t27", tableNumber: "27", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 2, isActive: "true" },
    { id: "t28", tableNumber: "28", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 2, positionY: 2, isActive: "true" },
    { id: "t29", tableNumber: "29", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 1, positionY: 1, isActive: "true" },
    { id: "t30", tableNumber: "30", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 2, positionY: 1, isActive: "true" },
    { id: "t31", tableNumber: "31", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 3, positionY: 1, isActive: "true" },
    { id: "t32", tableNumber: "32", areaId: "area2", capacity: 4, shape: "round", status: "available", positionX: 0, positionY: 1, isActive: "true" },
  ]);

  console.log("Seeding menu categories...");
  await db.insert(menuCategories).values([
    { id: "mc5", name: "Bebidas sin Alcohol", description: "Aguas, gaseosas y jugos", displayOrder: 1, isActive: "true" },
    { id: "mc6", name: "Bebidas con Alcohol", description: "Vinos, cervezas y cocktails", displayOrder: 2, isActive: "true" },
    { id: "mc1", name: "Entradas", description: "Para comenzar", displayOrder: 3, isActive: "true" },
    { id: "mc2", name: "Platos Principales", description: "Carnes, pastas y pescados", displayOrder: 4, isActive: "true" },
    { id: "mc3", name: "Postres", description: "Dulces y helados", displayOrder: 5, isActive: "true" },
  ]);

  console.log("Seeding menu items...");
  await db.insert(menuItems).values([
    { id: "mi1", categoryId: "mc1", name: "Empanadas (3 unidades)", description: "Carne cortada a cuchillo", price: "3500.00", preparationTime: 10, isAvailable: "true", isActive: "true", allergens: ["gluten"], displayOrder: 1 },
    { id: "mi2", categoryId: "mc1", name: "Provoleta", description: "Queso provolone a la plancha con oregano", price: "4200.00", preparationTime: 12, isAvailable: "true", isActive: "true", allergens: ["lacteos"], displayOrder: 2 },
    { id: "mi3", categoryId: "mc1", name: "Tabla de Fiambres", description: "Jamon crudo, salamín, quesos", price: "6500.00", preparationTime: 8, isAvailable: "true", isActive: "true", allergens: ["lacteos"], displayOrder: 3 },
    { id: "mi4", categoryId: "mc2", name: "Bife de Chorizo", description: "400g, con guarnicion a eleccion", price: "12500.00", preparationTime: 25, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 1 },
    { id: "mi5", categoryId: "mc2", name: "Salmon Grille", description: "Con vegetales de estacion", price: "14000.00", preparationTime: 20, isAvailable: "true", isActive: "true", allergens: ["pescado"], displayOrder: 2 },
    { id: "mi6", categoryId: "mc2", name: "Ravioles de Ricota", description: "Con salsa bolognesa o filetto", price: "8500.00", preparationTime: 15, isAvailable: "true", isActive: "true", allergens: ["gluten", "lacteos"], displayOrder: 3 },
    { id: "mi7", categoryId: "mc2", name: "Pollo a la Parrilla", description: "Medio pollo con ensalada", price: "7500.00", preparationTime: 30, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 4 },
    { id: "mi8", categoryId: "mc3", name: "Flan con Dulce de Leche", description: "Casero", price: "2800.00", preparationTime: 5, isAvailable: "true", isActive: "true", allergens: ["lacteos", "huevo"], displayOrder: 1 },
    { id: "mi9", categoryId: "mc3", name: "Helado (3 bochas)", description: "Sabores a eleccion", price: "3200.00", preparationTime: 3, isAvailable: "true", isActive: "true", allergens: ["lacteos"], displayOrder: 2 },
    { id: "mi10", categoryId: "mc3", name: "Tiramisu", description: "Postre italiano clasico", price: "4500.00", preparationTime: 5, isAvailable: "true", isActive: "true", allergens: ["gluten", "lacteos", "huevo"], displayOrder: 3 },
    { id: "mi11", categoryId: "mc5", name: "Agua Mineral", description: "Con o sin gas 500ml", price: "1200.00", preparationTime: 1, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 1 },
    { id: "mi12", categoryId: "mc5", name: "Gaseosa", description: "Coca-Cola, Sprite, Fanta", price: "1500.00", preparationTime: 1, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 2 },
    { id: "mi15", categoryId: "mc5", name: "Jugo de Naranja", description: "Exprimido natural", price: "1800.00", preparationTime: 3, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 3 },
    { id: "mi13", categoryId: "mc6", name: "Copa de Vino Malbec", description: "Bodega Luigi Bosca", price: "3500.00", preparationTime: 2, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 1 },
    { id: "mi14", categoryId: "mc6", name: "Cerveza Artesanal", description: "Pinta 500ml", price: "2800.00", preparationTime: 2, isAvailable: "true", isActive: "true", allergens: ["gluten"], displayOrder: 2 },
    { id: "mi16", categoryId: "mc6", name: "Fernet con Cola", description: "Branca con Coca-Cola", price: "3000.00", preparationTime: 3, isAvailable: "true", isActive: "true", allergens: null, displayOrder: 3 },
  ]);

  console.log("Seeding inventory categories...");
  await db.insert(itemCategories).values([
    { id: "ic1", name: "Alimentos", description: "Productos alimenticios", parentId: null, isActive: "true" },
    { id: "ic2", name: "Bebidas", description: "Bebidas alcoholicas y sin alcohol", parentId: null, isActive: "true" },
    { id: "ic3", name: "Limpieza", description: "Productos de limpieza", parentId: null, isActive: "true" },
    { id: "ic4", name: "Amenities", description: "Articulos de tocador para huespedes", parentId: null, isActive: "true" },
    { id: "ic5", name: "Manteleria", description: "Sabanas, toallas, manteles", parentId: null, isActive: "true" },
  ]);

  console.log("Seeding suppliers...");
  await db.insert(suppliers).values([
    { id: "sup1", name: "Distribuidora Norte S.A.", contactName: "Juan Perez", phone: "+54 343 456-7890", email: "ventas@distnorte.com", address: "Ruta 14 Km 5", cuit: "30-71234567-8", paymentTermDays: 30, notes: null, isActive: "true" },
    { id: "sup2", name: "Bebidas Premium", contactName: "Maria Garcia", phone: "+54 343 567-8901", email: "pedidos@bebidaspremium.com", address: "Av. Ramirez 1500", cuit: "30-70987654-3", paymentTermDays: 15, notes: "Solo bebidas", isActive: "true" },
    { id: "sup3", name: "Limpieza Total S.R.L.", contactName: "Carlos Lopez", phone: "+54 343 678-9012", email: "ventas@limpiezatotal.com", address: "Zona Industrial", cuit: "30-65432198-7", paymentTermDays: 30, notes: null, isActive: "true" },
  ]);

  console.log("Seeding inventory items...");
  await db.insert(inventoryItems).values([
    { id: "inv1", sku: "ALI-001", name: "Cafe en grano", description: "Cafe colombiano premium", categoryId: "ic1", supplierId: "sup1", unit: "kg", costPrice: "8500.00", minStock: 5, maxStock: 20, currentStock: 12, location: "Deposito A", isActive: "true" },
    { id: "inv2", sku: "ALI-002", name: "Azucar", description: "Azucar comun", categoryId: "ic1", supplierId: "sup1", unit: "kg", costPrice: "1200.00", minStock: 10, maxStock: 50, currentStock: 25, location: "Deposito A", isActive: "true" },
    { id: "inv3", sku: "BEB-001", name: "Agua Mineral 500ml", description: "Pack x24", categoryId: "ic2", supplierId: "sup2", unit: "caja", costPrice: "4800.00", minStock: 10, maxStock: 50, currentStock: 8, location: "Deposito B", isActive: "true" },
    { id: "inv4", sku: "BEB-002", name: "Coca-Cola 500ml", description: "Pack x24", categoryId: "ic2", supplierId: "sup2", unit: "caja", costPrice: "7200.00", minStock: 8, maxStock: 40, currentStock: 15, location: "Deposito B", isActive: "true" },
    { id: "inv5", sku: "BEB-003", name: "Vino Malbec Reserva", description: "Bodega Luigi Bosca", categoryId: "ic2", supplierId: "sup2", unit: "unidad", costPrice: "12000.00", minStock: 12, maxStock: 48, currentStock: 24, location: "Bodega", isActive: "true" },
    { id: "inv6", sku: "LIM-001", name: "Detergente Industrial", description: "Bidon 5L", categoryId: "ic3", supplierId: "sup3", unit: "unidad", costPrice: "3500.00", minStock: 5, maxStock: 20, currentStock: 3, location: "Deposito C", isActive: "true" },
    { id: "inv7", sku: "LIM-002", name: "Desinfectante", description: "Bidon 5L", categoryId: "ic3", supplierId: "sup3", unit: "unidad", costPrice: "4200.00", minStock: 5, maxStock: 20, currentStock: 8, location: "Deposito C", isActive: "true" },
    { id: "inv8", sku: "AME-001", name: "Shampoo Individual", description: "Sachet 30ml x100", categoryId: "ic4", supplierId: "sup3", unit: "paquete", costPrice: "6500.00", minStock: 10, maxStock: 50, currentStock: 5, location: "Deposito D", isActive: "true" },
    { id: "inv9", sku: "AME-002", name: "Jabon Individual", description: "Pastilla 20g x100", categoryId: "ic4", supplierId: "sup3", unit: "paquete", costPrice: "5000.00", minStock: 10, maxStock: 50, currentStock: 35, location: "Deposito D", isActive: "true" },
    { id: "inv10", sku: "MAN-001", name: "Toallas Blancas", description: "Toalla 70x140cm", categoryId: "ic5", supplierId: "sup1", unit: "unidad", costPrice: "4500.00", minStock: 50, maxStock: 200, currentStock: 120, location: "Lavanderia", isActive: "true" },
  ]);

  console.log("Seeding SPA cabins...");
  await db.insert(spaCabins).values([
    { id: "cab1", name: "Agua", description: "Gabinete Agua", isActive: "true" },
    { id: "cab2", name: "Fuego", description: "Gabinete Fuego", isActive: "true" },
    { id: "cab3", name: "Aire", description: "Gabinete Aire", isActive: "true" },
    { id: "cab4", name: "Tierra", description: "Gabinete Tierra", isActive: "true" },
    { id: "cab5", name: "Hidromasaje", description: "Gabinete Hidromasaje", isActive: "true" },
    { id: "cab6", name: "Sauna H", description: "Sauna Hombres", isActive: "true" },
    { id: "cab7", name: "Sauna M", description: "Sauna Mujeres", isActive: "true" },
  ]);

  console.log("Seeding SPA treatment categories...");
  await db.insert(spaTreatmentCategories).values([
    { id: "stc1", name: "Masajes", description: "Masajes relajantes y terapeuticos", sortOrder: 1 },
    { id: "stc2", name: "Faciales", description: "Tratamientos de limpieza y rejuvenecimiento facial", sortOrder: 2 },
    { id: "stc3", name: "Corporales", description: "Tratamientos corporales de embellecimiento", sortOrder: 3 },
    { id: "stc4", name: "Circuitos", description: "Circuitos de aguas termales", sortOrder: 4 },
    { id: "stc5", name: "Especiales", description: "Tratamientos premium y paquetes especiales", sortOrder: 5 },
  ]);

  console.log("Seeding SPA treatments...");
  await db.insert(spaTreatments).values([
    { id: "st1", categoryId: "stc1", name: "Masaje Relajante", description: "Masaje corporal con aceites esenciales", durationMinutes: 60, price: "15000.00", isActive: "true" },
    { id: "st2", categoryId: "stc1", name: "Masaje Descontracturante", description: "Masaje profundo para aliviar tensiones musculares", durationMinutes: 60, price: "18000.00", isActive: "true" },
    { id: "st3", categoryId: "stc1", name: "Masaje con Piedras Calientes", description: "Terapia con piedras volcanicas calientes", durationMinutes: 90, price: "25000.00", isActive: "true" },
    { id: "st4", categoryId: "stc1", name: "Reflexologia Podal", description: "Masaje de pies con tecnica reflexologica", durationMinutes: 45, price: "12000.00", isActive: "true" },
    { id: "st5", categoryId: "stc2", name: "Limpieza Facial Profunda", description: "Limpieza e hidratacion profunda del rostro", durationMinutes: 60, price: "14000.00", isActive: "true" },
    { id: "st6", categoryId: "stc2", name: "Tratamiento Antiage", description: "Tratamiento rejuvenecedor con colageno", durationMinutes: 75, price: "22000.00", isActive: "true" },
    { id: "st7", categoryId: "stc2", name: "Mascara de Oro", description: "Mascara facial premium con particulas de oro", durationMinutes: 60, price: "28000.00", isActive: "true" },
    { id: "st8", categoryId: "stc3", name: "Exfoliacion Corporal", description: "Exfoliacion con sales marinas", durationMinutes: 45, price: "13000.00", isActive: "true" },
    { id: "st9", categoryId: "stc3", name: "Envoltura de Chocolate", description: "Tratamiento hidratante con cacao", durationMinutes: 60, price: "18000.00", isActive: "true" },
    { id: "st10", categoryId: "stc3", name: "Reductor Modelador", description: "Tratamiento reductivo con vendas frias", durationMinutes: 90, price: "24000.00", isActive: "true" },
    { id: "st11", categoryId: "stc4", name: "Circuito de Aguas", description: "Acceso a piscinas termales, sauna y jacuzzi", durationMinutes: 120, price: "10000.00", isActive: "true" },
    { id: "st12", categoryId: "stc4", name: "Circuito Premium", description: "Circuito de aguas + te y frutas", durationMinutes: 150, price: "15000.00", isActive: "true" },
    { id: "st13", categoryId: "stc5", name: "Dia de Spa Completo", description: "Circuito + masaje + facial + almuerzo", durationMinutes: 300, price: "45000.00", isActive: "true" },
    { id: "st14", categoryId: "stc5", name: "Experiencia en Pareja", description: "Circuito + masaje para dos personas", durationMinutes: 180, price: "55000.00", isActive: "true" },
  ]);

  console.log("Seeding event rooms...");
  await db.insert(eventRooms).values([
    { id: "er1", name: "Salón Mitre", capacity: 100, status: "available", description: "Salón principal para eventos grandes", amenities: ["projector", "audio", "wifi"], isActive: "true" },
    { id: "er2", name: "Salón Rivadavia", capacity: 60, status: "available", description: "Salón intermedio para eventos medianos", amenities: ["projector", "wifi", "whiteboard"], isActive: "true" },
    { id: "er3", name: "Salón Solárium", capacity: 40, status: "available", description: "Salón con vista panorámica", amenities: ["projector", "audio", "wifi", "videoconference"], isActive: "true" },
    { id: "er4", name: "Salón Rosedal", capacity: 30, status: "available", description: "Salón íntimo para reuniones", amenities: ["projector", "wifi"], isActive: "true" },
    { id: "er5", name: "Salón Justo", capacity: 50, status: "available", description: "Salón Justo", amenities: [], isActive: "true" },
  ]);

  console.log("Seeding event charge types...");
  await db.insert(eventChargeTypes).values([
    { id: "ect1", code: "CB1", name: "Coffee Break 1", defaultPrice: "8500.00", isActive: "true" },
    { id: "ect2", code: "CB2", name: "Coffee Break 2", defaultPrice: "12000.00", isActive: "true" },
    { id: "ect3", code: "CB3", name: "Coffee Break 3", defaultPrice: "15000.00", isActive: "true" },
    { id: "ect4", code: "CENA", name: "Cena Ejecutiva", defaultPrice: "35000.00", isActive: "true" },
    { id: "ect5", code: "COCKTAIL", name: "Cocktail", defaultPrice: "25000.00", isActive: "true" },
    { id: "ect6", code: "SOC1", name: "Social 1", defaultPrice: "18000.00", isActive: "true" },
    { id: "ect7", code: "SOC2", name: "Social 2", defaultPrice: "28000.00", isActive: "true" },
    { id: "ect8", code: "SOC3", name: "Social 3", defaultPrice: "38000.00", isActive: "true" },
  ]);

  console.log("Seeding maintenance staff...");
  await db.insert(maintenanceStaff).values([
    { id: "ms1", name: "Carlos Rodriguez", phone: "+54 343 456-7890", email: "carlos.rodriguez@maransuites.com", specialty: "Plomeria y Electricidad", isActive: "true" },
    { id: "ms2", name: "Miguel Fernandez", phone: "+54 343 456-7891", email: "miguel.fernandez@maransuites.com", specialty: "Climatizacion", isActive: "true" },
    { id: "ms3", name: "Jorge Martinez", phone: "+54 343 456-7892", email: "jorge.martinez@maransuites.com", specialty: "Mobiliario y Carpinteria", isActive: "true" },
    { id: "ms4", name: "Roberto Sanchez", phone: "+54 343 456-7893", email: "roberto.sanchez@maransuites.com", specialty: "General", isActive: "true" },
  ]);

  console.log("Seeding system users...");
  await db.insert(systemUsers).values([
    { id: "su1", username: "admin", email: "admin@maransuites.com", fullName: "Administrador Sistema", role: "admin", department: "Sistemas", phone: "+54 343 400-0001", isActive: "true", lastLogin: now, createdAt: now },
    { id: "su2", username: "gerencia", email: "gerencia@maransuites.com", fullName: "Gerente General", role: "manager", department: "Gerencia", phone: "+54 343 400-0002", isActive: "true", lastLogin: null, createdAt: now },
    { id: "su3", username: "recepcion1", email: "recepcion1@maransuites.com", fullName: "Maria Garcia", role: "reception", department: "Recepcion", phone: "+54 343 400-0003", isActive: "true", lastLogin: now, createdAt: now },
    { id: "su4", username: "housekeeping1", email: "housekeeping@maransuites.com", fullName: "Ana Martinez", role: "housekeeping", department: "Housekeeping", phone: "+54 343 400-0004", isActive: "true", lastLogin: null, createdAt: now },
    { id: "su5", username: "restaurante1", email: "restaurante@maransuites.com", fullName: "Carlos Lopez", role: "restaurant", department: "Restaurante", phone: "+54 343 400-0005", isActive: "true", lastLogin: null, createdAt: now },
    { id: "su6", username: "spa1", email: "spa@maransuites.com", fullName: "Laura Fernandez", role: "spa", department: "SPA", phone: "+54 343 400-0006", isActive: "true", lastLogin: null, createdAt: now },
  ]);

  console.log("Seeding system settings...");
  await db.insert(systemSettings).values([
    { id: "ss1", key: "hotel_name", value: "Maran Suites & Towers", category: "general", description: "Nombre del hotel", updatedAt: now, updatedBy: "admin" },
    { id: "ss2", key: "hotel_address", value: "Alameda de la Federacion 343, Parana, Entre Rios", category: "general", description: "Direccion del hotel", updatedAt: now, updatedBy: "admin" },
    { id: "ss3", key: "hotel_phone", value: "+54 343 400-0000", category: "general", description: "Telefono principal", updatedAt: now, updatedBy: "admin" },
    { id: "ss4", key: "hotel_email", value: "info@maransuites.com", category: "general", description: "Email de contacto", updatedAt: now, updatedBy: "admin" },
    { id: "ss5", key: "check_in_time", value: "15:00", category: "reservations", description: "Hora de check-in", updatedAt: now, updatedBy: "admin" },
    { id: "ss6", key: "check_out_time", value: "11:00", category: "reservations", description: "Hora de check-out", updatedAt: now, updatedBy: "admin" },
    { id: "ss7", key: "default_currency", value: "ARS", category: "billing", description: "Moneda predeterminada", updatedAt: now, updatedBy: "admin" },
    { id: "ss8", key: "tax_rate", value: "21", category: "billing", description: "Tasa de IVA (%)", updatedAt: now, updatedBy: "admin" },
    { id: "ss9", key: "breakfast_included", value: "true", category: "amenities", description: "Desayuno incluido por defecto", updatedAt: now, updatedBy: "admin" },
    { id: "ss10", key: "wifi_password", value: "MaranGuest2025", category: "amenities", description: "Contrasena WiFi huespedes", updatedAt: now, updatedBy: "admin" },
  ]);

  console.log("Seeding audit logs...");
  await db.insert(auditLogs).values([
    { id: "al1", userId: "su1", userName: "Administrador Sistema", action: "login", module: "system", entityType: null, entityId: null, description: "Inicio de sesion", details: null, ipAddress: "192.168.1.1", timestamp: now },
    { id: "al2", userId: "su3", userName: "Maria Garcia", action: "create", module: "reservations", entityType: "reservation", entityId: "r1001", description: "Nueva reserva creada", details: "Huesped: Juan Perez, Habitacion 301", ipAddress: "192.168.1.10", timestamp: now },
  ]);

  console.log("Seeding chatbot notifications...");
  await db.insert(systemNotifications).values([
    {
      id: "notif-001", type: "chatbot_housekeeping", title: "Solicitud de Carlos García - Hab. 201",
      message: "Solicita toallas adicionales para la habitación", targetArea: "housekeeping",
      relatedEntityType: "room", relatedEntityId: "201", isRead: false, readAt: null, readBy: null,
      priority: "normal", createdAt: new Date(now.getTime() - 45 * 60000),
    },
    {
      id: "notif-002", type: "chatbot_restaurant", title: "Solicitud de María López - Hab. 305",
      message: "Consulta horario de desayuno para mañana y si tienen opciones sin gluten",
      targetArea: "restaurant", relatedEntityType: "room", relatedEntityId: "305",
      isRead: false, readAt: null, readBy: null, priority: "normal",
      createdAt: new Date(now.getTime() - 30 * 60000),
    },
    {
      id: "notif-003", type: "chatbot_maintenance", title: "Solicitud de John Smith - Hab. 505",
      message: "El aire acondicionado no enfría correctamente, la habitación está muy calurosa",
      targetArea: "maintenance", relatedEntityType: "room", relatedEntityId: "505",
      isRead: false, readAt: null, readBy: null, priority: "urgent",
      createdAt: new Date(now.getTime() - 15 * 60000),
    },
    {
      id: "notif-004", type: "chatbot_spa", title: "Solicitud de Ana Martínez - Hab. 401",
      message: "Quiere reservar un masaje relajante para las 16:00 de hoy",
      targetArea: "spa", relatedEntityType: "room", relatedEntityId: "401",
      isRead: false, readAt: null, readBy: null, priority: "normal",
      createdAt: new Date(now.getTime() - 10 * 60000),
    },
    {
      id: "notif-005", type: "chatbot_housekeeping", title: "Solicitud de Diego Ramírez - Hab. 307",
      message: "Necesita almohada extra y una manta adicional por favor",
      targetArea: "housekeeping", relatedEntityType: "room", relatedEntityId: "307",
      isRead: true, readAt: new Date(now.getTime() - 60 * 60000), readBy: "reception",
      priority: "normal", createdAt: new Date(now.getTime() - 120 * 60000),
    },
    {
      id: "notif-006", type: "chatbot_request", title: "Solicitud de Sophie Martin - Hab. 405",
      message: "Consulta sobre el horario de check-out y si es posible late check-out",
      targetArea: "reception", relatedEntityType: "room", relatedEntityId: "405",
      isRead: true, readAt: new Date(now.getTime() - 90 * 60000), readBy: "reception",
      priority: "normal", createdAt: new Date(now.getTime() - 180 * 60000),
    },
  ]);

  console.log("Seeding guest preferences...");
  const prefNow = now;
  await db.insert(guestPreferences).values([
    { id: "pref-001", guestId: "g1", category: "alimentacion", subcategory: "alergias", title: "Alergia al maní", description: "Alergia severa al maní y derivados. Riesgo de anafilaxia.", isActive: true, priority: "critical", visibleTo: ["all"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 30 * 86400000), updatedAt: new Date(prefNow.getTime() - 30 * 86400000) },
    { id: "pref-002", guestId: "g1", category: "habitacion", subcategory: "ubicacion", title: "Piso alto", description: "Prefiere habitaciones en pisos altos con vista a la ciudad", isActive: true, priority: "normal", visibleTo: ["reception"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 30 * 86400000), updatedAt: new Date(prefNow.getTime() - 30 * 86400000) },
    { id: "pref-003", guestId: "g1", category: "amenities", subcategory: "almohadas", title: "Almohadas extra", description: "Solicita 2 almohadas adicionales firmes", isActive: true, priority: "normal", visibleTo: ["housekeeping"], recordedBy: "Housekeeping", sourceStay: null, createdAt: new Date(prefNow.getTime() - 20 * 86400000), updatedAt: new Date(prefNow.getTime() - 20 * 86400000) },
    { id: "pref-004", guestId: "g2", category: "fecha_especial", subcategory: "cumpleanos", title: "Cumpleaños 22 de julio", description: "Fecha de nacimiento: 22/07. Huésped frecuente, considerar detalle especial.", isActive: true, priority: "high", visibleTo: ["all"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 60 * 86400000), updatedAt: new Date(prefNow.getTime() - 60 * 86400000) },
    { id: "pref-005", guestId: "g2", category: "alimentacion", subcategory: "dieta", title: "Vegetariana", description: "Dieta vegetariana estricta. No consume carnes ni pescados.", isActive: true, priority: "high", visibleTo: ["restaurant", "reception"], recordedBy: "Restaurant", sourceStay: null, createdAt: new Date(prefNow.getTime() - 45 * 86400000), updatedAt: new Date(prefNow.getTime() - 45 * 86400000) },
    { id: "pref-006", guestId: "g3", category: "habitacion", subcategory: "almohadas", title: "Almohada hipoalergénica", description: "Requiere almohadas hipoalergénicas por sensibilidad", isActive: true, priority: "high", visibleTo: ["housekeeping"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 15 * 86400000), updatedAt: new Date(prefNow.getTime() - 15 * 86400000) },
    { id: "pref-007", guestId: "g3", category: "servicio", subcategory: "idioma", title: "Idioma inglés", description: "Prefiere comunicación en inglés", isActive: true, priority: "normal", visibleTo: ["all"], recordedBy: "Recepción", sourceStay: null, createdAt: new Date(prefNow.getTime() - 15 * 86400000), updatedAt: new Date(prefNow.getTime() - 15 * 86400000) },
    { id: "pref-008", guestId: "g4", category: "alimentacion", subcategory: "alergias", title: "Intolerancia a lactosa", description: "Intolerancia a la lactosa. Solicitar opciones sin lácteos.", isActive: true, priority: "high", visibleTo: ["restaurant", "reception"], recordedBy: "Restaurant", sourceStay: null, createdAt: new Date(prefNow.getTime() - 10 * 86400000), updatedAt: new Date(prefNow.getTime() - 10 * 86400000) },
  ]);

  console.log("Seeding groups...");
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  const in17Days = new Date(Date.now() + 17 * 86400000).toISOString().split("T")[0];

  await db.insert(groups).values([
    {
      id: "grp1",
      groupCode: "GRP-0001",
      name: "Congreso AACR 2026",
      contactName: "Dr. Roberto Fernández",
      contactPhone: "+54 343 455-1234",
      contactEmail: "rfernandez@aacr.org.ar",
      checkInDate: tomorrow,
      checkOutDate: in5Days,
      status: "confirmed",
      notes: "Congreso anual de cardiología, 4 noches",
      createdAt: now,
      createdBy: "su1",
    },
    {
      id: "grp2",
      groupCode: "GRP-0002",
      name: "Boda Martínez-Sosa",
      contactName: "Laura Martínez",
      contactPhone: "+54 343 456-7890",
      contactEmail: "laura.martinez@email.com",
      checkInDate: in14Days,
      checkOutDate: in17Days,
      eventDate: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
      status: "tentative",
      notes: "Boda el sábado, invitados llegan el viernes",
      createdAt: now,
      createdBy: "su1",
    },
  ]);

  await db.insert(groupRoomBlocks).values([
    { id: "grb1", groupId: "grp1", roomTypeId: "rt2", quantity: 3, ratePlanId: "rp2", agreedRate: "110.00", blockCheckInDate: tomorrow, blockCheckOutDate: in5Days },
    { id: "grb2", groupId: "grp1", roomTypeId: "rt1", quantity: 2, ratePlanId: "rp1", agreedRate: "75.00", blockCheckInDate: tomorrow, blockCheckOutDate: in5Days },
    { id: "grb3", groupId: "grp2", roomTypeId: "rt3", quantity: 2, ratePlanId: "rp3", agreedRate: "160.00", blockCheckInDate: in14Days, blockCheckOutDate: in17Days },
    { id: "grb4", groupId: "grp2", roomTypeId: "rt2", quantity: 3, ratePlanId: "rp2", agreedRate: "100.00", blockCheckInDate: in14Days, blockCheckOutDate: in17Days },
  ]);

  await db.insert(reservations).values([
    { id: "res-grp1-1", reservationCode: "RES-G001-1", guestId: "g5", companyId: "comp1", roomTypeId: "rt2", roomId: "r301", ratePlanId: "rp2", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "110.00", discountType: "none", discountValue: "0", finalRatePerNight: "110.00", totalRoomAmount: "440.00", status: "confirmed", source: "directo", numberOfGuests: 2, createdAt: now },
    { id: "res-grp1-2", reservationCode: "RES-G001-2", guestId: "g6", companyId: null, roomTypeId: "rt2", roomId: "r307", ratePlanId: "rp2", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "110.00", discountType: "none", discountValue: "0", finalRatePerNight: "110.00", totalRoomAmount: "440.00", status: "confirmed", source: "directo", numberOfGuests: 1, createdAt: now },
    { id: "res-grp1-3", reservationCode: "RES-G001-3", guestId: "g7", companyId: null, roomTypeId: "rt2", roomId: "r207", ratePlanId: "rp2", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "110.00", discountType: "none", discountValue: "0", finalRatePerNight: "110.00", totalRoomAmount: "440.00", status: "confirmed", source: "directo", numberOfGuests: 2, createdAt: now },
    { id: "res-grp1-4", reservationCode: "RES-G001-4", guestId: "g8", companyId: null, roomTypeId: "rt1", roomId: "r302", ratePlanId: "rp1", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "75.00", discountType: "none", discountValue: "0", finalRatePerNight: "75.00", totalRoomAmount: "300.00", status: "confirmed", source: "directo", numberOfGuests: 1, createdAt: now },
    { id: "res-grp1-5", reservationCode: "RES-G001-5", guestId: "g1", companyId: null, roomTypeId: "rt1", roomId: "r303", ratePlanId: "rp1", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "75.00", discountType: "none", discountValue: "0", finalRatePerNight: "75.00", totalRoomAmount: "300.00", status: "confirmed", source: "directo", numberOfGuests: 2, createdAt: now },
  ]);

  await db.insert(groupReservationLinks).values([
    { id: "grl1", groupId: "grp1", reservationId: "res-grp1-1" },
    { id: "grl2", groupId: "grp1", reservationId: "res-grp1-2" },
    { id: "grl3", groupId: "grp1", reservationId: "res-grp1-3" },
    { id: "grl4", groupId: "grp1", reservationId: "res-grp1-4" },
    { id: "grl5", groupId: "grp1", reservationId: "res-grp1-5" },
  ]);

  await db.insert(cashRegisterConfigs).values([
    { id: "crc1", area: "reception", areaLabel: "Recepción", shiftsPerDay: 3, isActive: true },
    { id: "crc2", area: "restaurant", areaLabel: "Restaurante", shiftsPerDay: 2, isActive: true },
    { id: "crc3", area: "spa", areaLabel: "SPA", shiftsPerDay: 1, isActive: true },
    { id: "crc4", area: "events", areaLabel: "Eventos", shiftsPerDay: 1, isActive: true },
  ]).onConflictDoNothing();

  console.log("Database seeded successfully!");
}

export async function refreshRealData() {
  console.log("Refreshing real hotel data...");

  try {
    // Rename legacy salon name in DB if it still exists
    await db.execute(sql`UPDATE event_rooms SET name = 'Salón Solárium' WHERE name = 'Salón Mirador'`);
    // Ensure display_order column exists in restaurant_areas
    await db.execute(sql`ALTER TABLE restaurant_areas ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0`);
    // Set display order for known areas
    await db.execute(sql`UPDATE restaurant_areas SET display_order = 0 WHERE id = 'area1'`);
    await db.execute(sql`UPDATE restaurant_areas SET display_order = 1 WHERE id = 'area2'`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS account_movements (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type TEXT NOT NULL,
        entity_id VARCHAR NOT NULL,
        date DATE NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        reservation_id VARCHAR,
        reservation_code TEXT,
        guest_name TEXT,
        reference TEXT,
        created_by VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_editable TEXT DEFAULT 'false'`);
    await db.execute(sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1'`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS attendees_adults integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS attendees_youth integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS attendees_children integer NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS notas_armado text`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS notas_cocina text`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS notas_mantenimiento text`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS notas_housekeeping text`);
    await db.execute(sql`ALTER TABLE cancelled_reservation_logs ADD COLUMN IF NOT EXISTS reservation_id VARCHAR`);
    await db.execute(sql`ALTER TABLE cancelled_reservation_logs ADD COLUMN IF NOT EXISTS total_amount TEXT`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reservation_companions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id VARCHAR NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        document_type TEXT DEFAULT 'DNI',
        document_number TEXT,
        date_of_birth DATE,
        nationality TEXT DEFAULT 'Argentina',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE charges ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
    await db.execute(sql`ALTER TABLE charges ADD COLUMN IF NOT EXISTS anulado_por text`);
    await db.execute(sql`ALTER TABLE charges ADD COLUMN IF NOT EXISTS motivo_anulacion text`);
    await db.execute(sql`ALTER TABLE charges ADD COLUMN IF NOT EXISTS anulado_at timestamp`);
    await db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
    await db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS anulado_por text`);
    await db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS motivo_anulacion text`);
    await db.execute(sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS anulado_at timestamp`);
    await db.execute(sql`ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
    await db.execute(sql`ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS motivo_anulacion text`);
    await db.execute(sql`ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS anulado_at timestamp`);
    await db.execute(sql`ALTER TABLE spa_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`);
    await db.execute(sql`ALTER TABLE spa_payments ADD COLUMN IF NOT EXISTS motivo_anulacion text`);
    await db.execute(sql`ALTER TABLE spa_payments ADD COLUMN IF NOT EXISTS anulado_at timestamp`);
    await db.execute(sql`ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS motivo_anulacion text`);
    await db.execute(sql`ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS anulado_por text`);
    await db.execute(sql`ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS anulado_at timestamp`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS maintenance_staff (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        specialty TEXT,
        is_active TEXT NOT NULL DEFAULT 'true'
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS work_orders (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        order_code TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        room_id VARCHAR,
        location TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_to_id VARCHAR,
        reported_by TEXT,
        reported_at TIMESTAMP NOT NULL,
        scheduled_date DATE,
        completed_at TIMESTAMP,
        completed_by TEXT,
        estimated_cost DECIMAL(10,2),
        actual_cost DECIMAL(10,2),
        notes TEXT
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS spa_professionals (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        last_name TEXT,
        is_active TEXT DEFAULT 'true'
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS spa_clients (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        last_name TEXT,
        phone TEXT,
        email TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      ALTER TABLE spa_appointments ADD COLUMN IF NOT EXISTS professional_id VARCHAR
    `);

    const existingStaff = await db.select({ id: maintenanceStaff.id }).from(maintenanceStaff);
    if (existingStaff.length === 0) {
      console.log("Seeding maintenance staff...");
      await db.insert(maintenanceStaff).values([
        { id: "ms1", name: "Carlos Rodriguez", phone: "+54 343 456-7890", email: "carlos.rodriguez@maransuites.com", specialty: "Plomeria y Electricidad", isActive: "true" },
        { id: "ms2", name: "Miguel Fernandez", phone: "+54 343 456-7891", email: "miguel.fernandez@maransuites.com", specialty: "Climatizacion", isActive: "true" },
        { id: "ms3", name: "Jorge Martinez", phone: "+54 343 456-7892", email: "jorge.martinez@maransuites.com", specialty: "Mobiliario y Carpinteria", isActive: "true" },
        { id: "ms4", name: "Roberto Sanchez", phone: "+54 343 456-7893", email: "roberto.sanchez@maransuites.com", specialty: "General", isActive: "true" },
      ]);
    }

    const existingRooms = await db.select({ id: rooms.id }).from(rooms);
    const existingRoomIds = existingRooms.map(r => r.id);

    const realRooms = [
      { id: "r201", roomNumber: "201", roomTypeId: "rt2", floor: 2, status: "available" as const },
      { id: "r202", roomNumber: "202", roomTypeId: "rt1", floor: 2, status: "available" as const },
      { id: "r204", roomNumber: "204", roomTypeId: "rt2", floor: 2, status: "available" as const },
      { id: "r205", roomNumber: "205", roomTypeId: "rt3", floor: 2, status: "available" as const },
      { id: "r206", roomNumber: "206", roomTypeId: "rt3", floor: 2, status: "available" as const },
      { id: "r207", roomNumber: "207", roomTypeId: "rt2", floor: 2, status: "available" as const },
      { id: "r301", roomNumber: "301", roomTypeId: "rt2", floor: 3, status: "available" as const },
      { id: "r302", roomNumber: "302", roomTypeId: "rt1", floor: 3, status: "available" as const },
      { id: "r303", roomNumber: "303", roomTypeId: "rt1", floor: 3, status: "available" as const },
      { id: "r304", roomNumber: "304", roomTypeId: "rt1", floor: 3, status: "available" as const },
      { id: "r305", roomNumber: "305", roomTypeId: "rt3", floor: 3, status: "available" as const },
      { id: "r306", roomNumber: "306", roomTypeId: "rt3", floor: 3, status: "available" as const },
      { id: "r307", roomNumber: "307", roomTypeId: "rt2", floor: 3, status: "available" as const },
      { id: "r401", roomNumber: "401", roomTypeId: "rt2", floor: 4, status: "available" as const },
      { id: "r402", roomNumber: "402", roomTypeId: "rt1", floor: 4, status: "available" as const },
      { id: "r403", roomNumber: "403", roomTypeId: "rt1", floor: 4, status: "available" as const },
      { id: "r404", roomNumber: "404", roomTypeId: "rt1", floor: 4, status: "available" as const },
      { id: "r405", roomNumber: "405", roomTypeId: "rt3", floor: 4, status: "available" as const },
      { id: "r406", roomNumber: "406", roomTypeId: "rt3", floor: 4, status: "available" as const },
      { id: "r407", roomNumber: "407", roomTypeId: "rt2", floor: 4, status: "available" as const },
      { id: "r501", roomNumber: "501", roomTypeId: "rt2", floor: 5, status: "available" as const },
      { id: "r502", roomNumber: "502", roomTypeId: "rt1", floor: 5, status: "available" as const },
      { id: "r503", roomNumber: "503", roomTypeId: "rt1", floor: 5, status: "available" as const },
      { id: "r504", roomNumber: "504", roomTypeId: "rt1", floor: 5, status: "available" as const },
      { id: "r505", roomNumber: "505", roomTypeId: "rt3", floor: 5, status: "available" as const },
      { id: "r506", roomNumber: "506", roomTypeId: "rt3", floor: 5, status: "available" as const },
      { id: "r507", roomNumber: "507", roomTypeId: "rt2", floor: 5, status: "available" as const },
      { id: "r601", roomNumber: "601", roomTypeId: "rt2", floor: 6, status: "available" as const },
      { id: "r602", roomNumber: "602", roomTypeId: "rt1", floor: 6, status: "available" as const },
      { id: "r603", roomNumber: "603", roomTypeId: "rt1", floor: 6, status: "available" as const },
      { id: "r604", roomNumber: "604", roomTypeId: "rt1", floor: 6, status: "available" as const },
      { id: "r605", roomNumber: "605", roomTypeId: "rt3", floor: 6, status: "available" as const },
      { id: "r606", roomNumber: "606", roomTypeId: "rt3", floor: 6, status: "available" as const },
      { id: "r607", roomNumber: "607", roomTypeId: "rt2", floor: 6, status: "available" as const },
      { id: "r701", roomNumber: "701", roomTypeId: "rt2", floor: 7, status: "available" as const },
      { id: "r702", roomNumber: "702", roomTypeId: "rt1", floor: 7, status: "available" as const },
      { id: "r703", roomNumber: "703", roomTypeId: "rt1", floor: 7, status: "available" as const },
      { id: "r704", roomNumber: "704", roomTypeId: "rt1", floor: 7, status: "available" as const },
      { id: "r705", roomNumber: "705", roomTypeId: "rt3", floor: 7, status: "available" as const },
      { id: "r706", roomNumber: "706", roomTypeId: "rt3", floor: 7, status: "available" as const },
      { id: "r707", roomNumber: "707", roomTypeId: "rt2", floor: 7, status: "available" as const },
      { id: "r801", roomNumber: "801", roomTypeId: "rt2", floor: 8, status: "available" as const },
      { id: "r802", roomNumber: "802", roomTypeId: "rt1", floor: 8, status: "available" as const },
      { id: "r803", roomNumber: "803", roomTypeId: "rt1", floor: 8, status: "available" as const },
      { id: "r804", roomNumber: "804", roomTypeId: "rt1", floor: 8, status: "available" as const },
      { id: "r805", roomNumber: "805", roomTypeId: "rt3", floor: 8, status: "available" as const },
      { id: "r806", roomNumber: "806", roomTypeId: "rt3", floor: 8, status: "available" as const },
      { id: "r807", roomNumber: "807", roomTypeId: "rt2", floor: 8, status: "available" as const },
      { id: "r901", roomNumber: "901", roomTypeId: "rt2", floor: 9, status: "available" as const },
      { id: "r902", roomNumber: "902", roomTypeId: "rt1", floor: 9, status: "available" as const },
      { id: "r903", roomNumber: "903", roomTypeId: "rt1", floor: 9, status: "available" as const },
      { id: "r904", roomNumber: "904", roomTypeId: "rt1", floor: 9, status: "available" as const },
      { id: "r905", roomNumber: "905", roomTypeId: "rt3", floor: 9, status: "available" as const },
      { id: "r906", roomNumber: "906", roomTypeId: "rt3", floor: 9, status: "available" as const },
      { id: "r907", roomNumber: "907", roomTypeId: "rt2", floor: 9, status: "available" as const },
      { id: "r1001", roomNumber: "1001", roomTypeId: "rt2", floor: 10, status: "available" as const },
      { id: "r1002", roomNumber: "1002", roomTypeId: "rt1", floor: 10, status: "available" as const },
      { id: "r1003", roomNumber: "1003", roomTypeId: "rt1", floor: 10, status: "available" as const },
      { id: "r1005", roomNumber: "1005", roomTypeId: "rt3", floor: 10, status: "available" as const },
      { id: "r1006", roomNumber: "1006", roomTypeId: "rt3", floor: 10, status: "available" as const },
      { id: "r1101", roomNumber: "1101", roomTypeId: "rt2", floor: 11, status: "available" as const },
      { id: "r1102", roomNumber: "1102", roomTypeId: "rt1", floor: 11, status: "available" as const },
      { id: "r1103", roomNumber: "1103", roomTypeId: "rt1", floor: 11, status: "available" as const },
      { id: "r1201", roomNumber: "1201", roomTypeId: "rt2", floor: 12, status: "available" as const },
      { id: "r1202", roomNumber: "1202", roomTypeId: "rt1", floor: 12, status: "available" as const },
      { id: "r1203", roomNumber: "1203", roomTypeId: "rt1", floor: 12, status: "available" as const },
    ];

    const missingRooms = realRooms.filter(r => !existingRoomIds.includes(r.id));
    if (missingRooms.length > 0) {
      await db.insert(rooms).values(missingRooms).onConflictDoNothing();
      console.log(`Inserted ${missingRooms.length} missing rooms`);
    }

    const existingRoomsFull = await db.select().from(rooms);
    for (const real of realRooms) {
      const existing = existingRoomsFull.find(r => r.id === real.id);
      if (existing && (!existing.roomTypeId || existing.floor !== real.floor)) {
        await db.update(rooms).set({
          roomTypeId: real.roomTypeId,
          floor: real.floor,
          status: real.status,
        }).where(eq(rooms.id, real.id));
        console.log(`Fixed room ${real.roomNumber} (type/floor were wrong)`);
      }
    }

    const realRoomIds = realRooms.map(r => r.id);
    const extraRooms = existingRoomIds.filter(id => !realRoomIds.includes(id));
    for (const extraId of extraRooms) {
      try {
        await db.delete(rooms).where(eq(rooms.id, extraId));
      } catch (e) {}
    }

    const realAreas = [
      { id: "area1", name: "Sector Bodega (Mesas 1-18)", areaType: "indoor" as const, capacity: 72, hasTables: "true" as const, isActive: "true" as const },
      { id: "area2", name: "Sector Moneda (Mesas 19-32)", areaType: "indoor" as const, capacity: 56, hasTables: "true" as const, isActive: "true" as const },
      { id: "area-rs", name: "Room Service", areaType: "private" as const, capacity: 0, hasTables: "false" as const, isActive: "true" as const },
      { id: "area-delivery", name: "Delivery", areaType: "private" as const, capacity: 0, hasTables: "false" as const, isActive: "true" as const },
      { id: "area-solarium", name: "Solarium", areaType: "outdoor" as const, capacity: 0, hasTables: "false" as const, isActive: "true" as const },
      { id: "area-spa", name: "SPA", areaType: "private" as const, capacity: 0, hasTables: "false" as const, isActive: "true" as const },
    ];

    const existingAreas = await db.select({ id: restaurantAreas.id }).from(restaurantAreas);
    const existingAreaIds = existingAreas.map(a => a.id);
    const realAreaIds = realAreas.map(a => a.id);

    for (const area of realAreas) {
      if (!existingAreaIds.includes(area.id)) {
        await db.insert(restaurantAreas).values(area).onConflictDoNothing();
      } else {
        await db.update(restaurantAreas).set({ name: area.name, areaType: area.areaType, capacity: area.capacity, hasTables: area.hasTables }).where(eq(restaurantAreas.id, area.id));
      }
    }

    for (const extraId of existingAreaIds.filter(id => !realAreaIds.includes(id))) {
      try {
        await db.delete(restaurantTables).where(eq(restaurantTables.areaId, extraId));
        await db.delete(restaurantAreas).where(eq(restaurantAreas.id, extraId));
      } catch (e) {}
    }

    const existingTables = await db.select({ id: restaurantTables.id }).from(restaurantTables);
    const existingTableIds = existingTables.map(t => t.id);
    const realTables: any[] = [];
    for (let i = 1; i <= 18; i++) {
      realTables.push({ id: `t${i}`, tableNumber: `${i}`, areaId: "area1", capacity: 4, shape: "square" as const, status: "available" as const });
    }
    for (let i = 19; i <= 32; i++) {
      realTables.push({ id: `t${i}`, tableNumber: `${i}`, areaId: "area2", capacity: 4, shape: "round" as const, status: "available" as const });
    }

    const missingTables = realTables.filter(t => !existingTableIds.includes(t.id));
    if (missingTables.length > 0) {
      await db.insert(restaurantTables).values(missingTables).onConflictDoNothing();
      console.log(`Inserted ${missingTables.length} missing tables`);
    }

    // Do NOT delete user-created tables (those with non-seed IDs); only insert missing seed tables

    const realEventRooms = [
      { id: "er1", name: "Salón Mitre", capacity: 100, status: "available" as const, description: "Salón principal para eventos grandes", isActive: "true" as const },
      { id: "er2", name: "Salón Rivadavia", capacity: 60, status: "available" as const, description: "Salón intermedio para eventos medianos", isActive: "true" as const },
      { id: "er3", name: "Salón Solárium", capacity: 40, status: "available" as const, description: "Salón con vista panorámica", isActive: "true" as const },
      { id: "er4", name: "Salón Rosedal", capacity: 30, status: "available" as const, description: "Salón íntimo para reuniones", isActive: "true" as const },
      { id: "er5", name: "Salón Justo", capacity: 50, status: "available" as const, description: "Salón Justo", isActive: "true" as const },
    ];

    const existingEventRooms = await db.select({ id: eventRooms.id }).from(eventRooms);
    const existingEventRoomIds = existingEventRooms.map(e => e.id);
    for (const er of realEventRooms) {
      if (!existingEventRoomIds.includes(er.id)) {
        await db.insert(eventRooms).values(er).onConflictDoNothing();
      } else {
        await db.update(eventRooms).set({ name: er.name, capacity: er.capacity, description: er.description }).where(eq(eventRooms.id, er.id));
      }
    }

    for (const extraId of existingEventRoomIds.filter(id => !realEventRooms.map(e => e.id).includes(id))) {
      try {
        await db.delete(eventRooms).where(eq(eventRooms.id, extraId));
      } catch (e) {}
    }

    await db.delete(spaAppointments);
    await db.delete(spaCabins);
    await db.insert(spaCabins).values([
      { id: "cab1", name: "Agua", description: "Gabinete Agua", isActive: "true" },
      { id: "cab2", name: "Fuego", description: "Gabinete Fuego", isActive: "true" },
      { id: "cab3", name: "Aire", description: "Gabinete Aire", isActive: "true" },
      { id: "cab4", name: "Tierra", description: "Gabinete Tierra", isActive: "true" },
      { id: "cab5", name: "Hidromasaje", description: "Gabinete Hidromasaje", isActive: "true" },
      { id: "cab6", name: "Sauna H", description: "Sauna Hombres", isActive: "true" },
      { id: "cab7", name: "Sauna M", description: "Sauna Mujeres", isActive: "true" },
    ]).onConflictDoNothing();

    // ─── MÓDULO CONTABLE ────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accounting_suppliers (
        id SERIAL PRIMARY KEY,
        razon_social TEXT NOT NULL,
        cuit TEXT NOT NULL UNIQUE,
        domicilio TEXT,
        localidad TEXT,
        provincia TEXT DEFAULT 'Entre Rios',
        cp TEXT,
        condicion_iva TEXT NOT NULL,
        alicuota_iibb NUMERIC(6,4) DEFAULT 0,
        alicuota_ganancias NUMERIC(6,4) DEFAULT 0,
        alicuota_iva NUMERIC(6,4) DEFAULT 0,
        cbu TEXT,
        banco TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accounting_accounts (
        id SERIAL PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        nivel INTEGER DEFAULT 1,
        activo BOOLEAN DEFAULT true
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id SERIAL PRIMARY KEY,
        tipo_comprobante TEXT NOT NULL,
        supplier_id INTEGER REFERENCES accounting_suppliers(id),
        proveedor_nombre TEXT,
        proveedor_cuit TEXT,
        punto_venta TEXT,
        numero_comprobante TEXT NOT NULL,
        numero_comprobante_ext TEXT,
        fecha_emision DATE NOT NULL,
        periodo TEXT,
        condicion_pago TEXT NOT NULL DEFAULT 'contado',
        monto_neto NUMERIC(14,2) NOT NULL DEFAULT 0,
        alicuota_iva TEXT DEFAULT '21',
        monto_iva27 NUMERIC(14,2) DEFAULT 0,
        monto_iva21 NUMERIC(14,2) DEFAULT 0,
        monto_iva105 NUMERIC(14,2) DEFAULT 0,
        monto_iva5 NUMERIC(14,2) DEFAULT 0,
        monto_iva25 NUMERIC(14,2) DEFAULT 0,
        monto_exento NUMERIC(14,2) DEFAULT 0,
        monto_no_gravado NUMERIC(14,2) DEFAULT 0,
        impuestos_internos NUMERIC(14,2) DEFAULT 0,
        ley_25413 NUMERIC(14,2) DEFAULT 0,
        percepcion_iibb NUMERIC(14,2) DEFAULT 0,
        percepcion_iva NUMERIC(14,2) DEFAULT 0,
        percepcion_ganancias NUMERIC(14,2) DEFAULT 0,
        retencion_iibb NUMERIC(14,2) DEFAULT 0,
        retencion_ganancias NUMERIC(14,2) DEFAULT 0,
        retencion_iva NUMERIC(14,2) DEFAULT 0,
        retencion_suss NUMERIC(14,2) DEFAULT 0,
        retencion_municipal NUMERIC(14,2) DEFAULT 0,
        monotributo_comp_bc NUMERIC(14,2) DEFAULT 0,
        monto_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        cuenta_contable_id INTEGER REFERENCES accounting_accounts(id),
        centro_costo TEXT,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        asiento_id INTEGER,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id SERIAL PRIMARY KEY,
        numero TEXT NOT NULL UNIQUE,
        supplier_id INTEGER NOT NULL REFERENCES accounting_suppliers(id),
        fecha DATE NOT NULL,
        forma_pago TEXT NOT NULL DEFAULT 'transferencia',
        dep_bancario NUMERIC(14,2) DEFAULT 0,
        efectivo NUMERIC(14,2) DEFAULT 0,
        cheques NUMERIC(14,2) DEFAULT 0,
        total_facturas NUMERIC(14,2) NOT NULL,
        retencion_iibb NUMERIC(14,2) DEFAULT 0,
        retencion_ganancias NUMERIC(14,2) DEFAULT 0,
        retencion_iva NUMERIC(14,2) DEFAULT 0,
        retencion_prof_libs NUMERIC(14,2) DEFAULT 0,
        compensacion NUMERIC(14,2) DEFAULT 0,
        total_abonado NUMERIC(14,2) NOT NULL,
        asiento_id INTEGER,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_order_items (
        id SERIAL PRIMARY KEY,
        payment_order_id INTEGER NOT NULL REFERENCES payment_orders(id),
        invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
        importe_cancelado NUMERIC(14,2) NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accounting_entries (
        id SERIAL PRIMARY KEY,
        numero_minuta INTEGER NOT NULL,
        fecha DATE NOT NULL,
        periodo TEXT NOT NULL,
        concepto TEXT NOT NULL,
        tipo_origen TEXT NOT NULL,
        origen_id INTEGER,
        origen_tipo TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accounting_entry_lines (
        id SERIAL PRIMARY KEY,
        entry_id INTEGER NOT NULL REFERENCES accounting_entries(id),
        account_id INTEGER NOT NULL REFERENCES accounting_accounts(id),
        comprobante_tipo TEXT,
        comprobante_numero TEXT,
        proveedor_nombre TEXT,
        debe NUMERIC(14,2) DEFAULT 0,
        haber NUMERIC(14,2) DEFAULT 0
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS iibb_retentions (
        id SERIAL PRIMARY KEY,
        nro_constancia INTEGER NOT NULL,
        supplier_id INTEGER REFERENCES accounting_suppliers(id),
        cuit_proveedor TEXT NOT NULL,
        fecha_retencion DATE NOT NULL,
        fecha_comprobante DATE NOT NULL,
        nro_comprobante INTEGER NOT NULL,
        letra_factura TEXT,
        importe_base NUMERIC(14,2) NOT NULL,
        alicuota NUMERIC(6,4) NOT NULL,
        importe_retenido NUMERIC(14,2) NOT NULL,
        anulacion BOOLEAN DEFAULT false,
        conv_multilateral BOOLEAN DEFAULT false,
        invoice_id INTEGER REFERENCES purchase_invoices(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Seed Plan de Cuentas (solo si vacío)
    const existingAccounts = await db.execute(sql`SELECT id FROM accounting_accounts LIMIT 1`);
    if (existingAccounts.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES
        ('1.1.4.01.04.01', 'Ret. IVA', 'activo'),
        ('1.1.4.01.04.02', 'Percep IVA', 'activo'),
        ('1.1.4.01.05', 'Ret Impuestos a las ganancias', 'activo'),
        ('1.1.4.01.08.01', 'Ret. Ing Brutos', 'activo'),
        ('1.1.4.01.08.02', 'Percep Ing Brutos', 'activo'),
        ('1.1.4.01.10', 'Retenciones SUSS', 'activo'),
        ('1.1.4.01.15', 'Impuesto Ley 25413', 'activo'),
        ('1.1.4.07.01', 'IVA 21%', 'activo'),
        ('1.1.4.07.02', 'IVA 10,5%', 'activo'),
        ('1.1.4.07.03', 'IVA 27%', 'activo'),
        ('2.1.3.02.09', 'Impuestos Internos', 'pasivo'),
        ('4.2.1.08.05.02', 'Gastos Comerciales', 'egreso'),
        ('4.2.1.08.06.01', 'Librería', 'egreso'),
        ('4.2.1.08.06.02', 'Imprenta', 'egreso'),
        ('4.2.1.08.07.02', 'Lavandería Hotel', 'egreso'),
        ('4.2.1.08.09.01', 'Combustibles', 'egreso'),
        ('4.2.1.08.09.05', 'Gastos Generales', 'egreso'),
        ('4.2.1.08.10.06', 'Gastos del Personal', 'egreso'),
        ('4.2.1.08.11.01', 'Luz', 'egreso'),
        ('4.2.1.08.11.02', 'Gas', 'egreso'),
        ('4.2.1.08.11.03', 'Teléfono', 'egreso'),
        ('4.2.1.08.12', 'Publicidad Maran Towers', 'egreso'),
        ('4.2.1.08.13.01', 'Honorarios', 'egreso'),
        ('4.2.1.08.14', 'Fletes y Franqueos Maran Tower', 'egreso'),
        ('4.2.1.08.15.01', 'Municipalidad', 'egreso'),
        ('4.2.1.08.16', 'Mantenimiento Bs de Uso Maran', 'egreso'),
        ('4.2.1.08.17', 'Gastos Computación Maran Tower', 'egreso'),
        ('4.2.1.08.18', 'Gastos Bancarios Maran Towers', 'egreso'),
        ('4.2.1.08.22', 'Mantenimiento Edificio Maran T', 'egreso'),
        ('4.2.1.08.23.01', 'Housekeeping', 'egreso'),
        ('4.2.1.08.23.02', 'Housekeeping Cocina', 'egreso'),
        ('4.2.1.08.23.03', 'Housekeeping Áreas Públicas', 'egreso'),
        ('4.2.1.08.23.04', 'Housekeeping Lavandería', 'egreso'),
        ('4.2.1.08.24', 'Cablevideo', 'egreso'),
        ('4.2.1.08.27', 'Costo Insumo y comestibles', 'egreso'),
        ('4.2.1.08.28.01', 'Aves Restaurant', 'egreso'),
        ('4.2.1.08.28.03', 'Cerdo Restaurant', 'egreso'),
        ('4.2.1.08.28.05', 'Pescado Restaurant', 'egreso'),
        ('4.2.1.08.28.09', 'Vacuno Restaurant', 'egreso'),
        ('4.2.1.08.29.01', 'Fiambres Restaurant', 'egreso'),
        ('4.2.1.08.32.01', 'Frut V y H Restaurant', 'egreso'),
        ('4.2.1.08.33.01', 'Lácteos Restaurant', 'egreso'),
        ('4.2.1.08.35.01', 'Costo Bebidas Restaurant', 'egreso'),
        ('4.2.1.08.36', 'Otros Gastos Restaurant', 'egreso'),
        ('4.2.1.08.39', 'Otros Gastos Spa', 'egreso'),
        ('1.1.1.01', 'Caja', 'activo'),
        ('1.1.1.02', 'Banco Macro', 'activo'),
        ('1.1.1.03', 'Banco Santander', 'activo'),
        ('1.1.1.04', 'Banco Nuevo Bersa', 'activo'),
        ('1.1.1.05', 'Banco de la Nación', 'activo'),
        ('2.1.1.01', 'Proveedores a Pagar', 'pasivo')
        ON CONFLICT (codigo) DO NOTHING
      `);
    }

    // Seed Proveedores Contables (solo si vacío)
    const existingAccSuppliers = await db.execute(sql`SELECT id FROM accounting_suppliers LIMIT 1`);
    if (existingAccSuppliers.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, alicuota_iibb, alicuota_ganancias, alicuota_iva) VALUES
        ('AGUA NUESTRA SA', '30-70786951-4', 'R.Inscrp.', 3.5000, 0, 0),
        ('BODEGAS CHANDON S.A.', '30-55371841-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('CAPUCHINO SRL', '33-71252875-9', 'R.Inscrp.', 3.5000, 0, 0),
        ('Congelados Veracruz SRL', '30-71490852-5', 'R.Inscrp.', 3.5000, 0, 0),
        ('DISTRIBUIDORA ANTARTIDA SA', '30-70848176-5', 'R.Inscrp.', 3.5000, 0, 0),
        ('FRUTAS RAULITO SAS', '33-71846981-9', 'R.Inscrp.', 3.5000, 0, 0),
        ('HUGO O ISAAC DISTRIB SRL', '30-70993544-1', 'R.Inscrp.', 3.5000, 0, 0),
        ('L & L FUTURA SRL', '30-69338113-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('Lobo Gustavo Hernan', '20-27833483-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('Logistica San Miguel SRL', '30-70826260-5', 'R.Inscrp.', 3.5000, 0, 0),
        ('MARTIN GABRIEL CIPRIANI', '20-22342199-8', 'R.Inscrp.', 3.5000, 0, 0),
        ('NESTLE ARGENTINA S.A', '30-54676404-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('PALADINI SA', '30-50334872-8', 'R.Inscrp.', 3.5000, 0, 0),
        ('PANIFICADORA RIO PARANA SA', '30-71573529-2', 'R.Inscrp.', 3.5000, 0, 0),
        ('Parana Beef SRL', '30-71553991-4', 'R.Inscrp.', 3.5000, 0, 0),
        ('SCHONFELD MAURICIO RUBEN', '20-25307793-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('Santana Javier Salvador', '20-21912741-4', 'R.Inscrp.', 3.5000, 0, 0),
        ('Total Litoral SA', '30-71703401-1', 'R.Inscrp.', 3.5000, 0, 0),
        ('Vazquez Maria Andrea', '27-22342883-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('Virtu SRL', '30-71701621-8', 'R.Inscrp.', 3.5000, 0, 0),
        ('FONTANA ROLANDO RAUL', '20-12756016-2', 'R.Inscrp.', 3.5000, 0, 0),
        ('MATZKIN DARIO JAVIER', '20-16958502-5', 'R.Inscrp.', 3.5000, 0, 0),
        ('PAPELERIA EL CUYANO SRL', '30-67118492-7', 'R.Inscrp.', 3.5000, 0, 0),
        ('MARCELO A. FERNANDEZ CUETO', '20-14310306-5', 'R.Inscrp.', 3.5000, 0, 0),
        ('Troceadero de Cerdos Don', '30-65553842-5', 'R.Inscrp.', 3.5000, 0, 0),
        ('VYG SRL', '30-71738382-2', 'R.Inscrp.', 3.5000, 0, 0),
        ('KORE SA', '30-71160470-3', 'R.Inscrp.', 3.5000, 0, 0),
        ('ELECTRICIDAD PARANA S.A', '30-71440399-7', 'R.Inscrp.', 3.5000, 0, 0),
        ('SELPLAST SA', '30-69050738-9', 'R.Inscrp.', 3.5000, 0, 0),
        ('Gervasoni Pablo Cesar', '20-30786763-0', 'Monotributo', 0, 0, 0),
        ('ANGEL H.BELLONI SRL', '30-64620565-0', 'R.Inscrp.', 3.5000, 0, 0),
        ('FADEFIL SA', '30-71295020-6', 'R.Inscrp.', 3.5000, 0, 0),
        ('ERTIC SRL', '30-71104918-1', 'R.Inscrp.', 3.5000, 0, 0),
        ('LA ALBORADA DEL SUD SA', '30-70828075-1', 'R.Inscrp.', 3.5000, 0, 0),
        ('Zurdo Nancy Viviana', '27-16996676-7', 'R.Inscrp.', 3.5000, 0, 0),
        ('Cancio Eduardo', '20-16608544-7', 'R.Inscrp.', 3.5000, 0, 0),
        ('LA RURAL VIÑEDOS Y BODEGAS', '30-52719611-2', 'R.Inscrp.', 3.5000, 0, 0),
        ('NOSTER SRL', '30-71151601-4', 'R.Inscrp.', 3.5000, 0, 0),
        ('ALDO M.FERNANDEZ OSUNA', '20-24592976-6', 'R.Inscrp.', 3.5000, 0, 0),
        ('Ramirez Alberto Adrian', '20-22342219-6', 'R.Inscrp.', 3.5000, 0, 0)
        ON CONFLICT (cuit) DO NOTHING
      `);
    }

    console.log("Real hotel data refreshed successfully!");
  } catch (error) {
    console.error("Error refreshing real data:", error);
  }
}
