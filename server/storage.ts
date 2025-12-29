import {
  type User,
  type InsertUser,
  type Room,
  type InsertRoom,
  type RoomType,
  type InsertRoomType,
  type RatePlan,
  type InsertRatePlan,
  type RatePlanWithRoomType,
  type Company,
  type InsertCompany,
  type Guest,
  type InsertGuest,
  type Reservation,
  type InsertReservation,
  type Charge,
  type InsertCharge,
  type CancelledReservationLog,
  type InsertCancelledReservationLog,
  type OTAChannel,
  type InsertOTAChannel,
  type OTAChannelWithStats,
  type OTAReservationLog,
  type InsertOTAReservationLog,
  type OTAReservationLogWithChannel,
  type RoomWithType,
  type ReservationWithDetails,
  type RoomStatus,
  type ReservationStatus,
  type PlanningData,
  type PlanningCellStatus,
  type Group,
  type InsertGroup,
  type GroupRoomBlock,
  type InsertGroupRoomBlock,
  type GroupReservationLink,
  type InsertGroupReservationLink,
  type GroupWithDetails,
  type GroupRoomBlockWithDetails,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Room Types
  getRoomTypes(): Promise<RoomType[]>;
  getRoomType(id: string): Promise<RoomType | undefined>;
  createRoomType(roomType: InsertRoomType): Promise<RoomType>;
  updateRoomType(id: string, roomType: Partial<InsertRoomType>): Promise<RoomType | undefined>;
  deleteRoomType(id: string): Promise<boolean>;

  // Rate Plans
  getRatePlans(): Promise<RatePlanWithRoomType[]>;
  getRatePlan(id: string): Promise<RatePlanWithRoomType | undefined>;
  getRatePlansByRoomType(roomTypeId: string): Promise<RatePlan[]>;
  createRatePlan(ratePlan: InsertRatePlan): Promise<RatePlan>;
  updateRatePlan(id: string, ratePlan: Partial<InsertRatePlan>): Promise<RatePlan | undefined>;
  deleteRatePlan(id: string): Promise<boolean>;

  // Rooms
  getRooms(): Promise<RoomWithType[]>;
  getRoom(id: string): Promise<RoomWithType | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, room: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;

  // Companies
  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  searchCompanies(query: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;

  // Guests
  getGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | undefined>;
  searchGuests(query: string): Promise<Guest[]>;
  createGuest(guest: InsertGuest): Promise<Guest>;
  updateGuest(id: string, guest: Partial<InsertGuest>): Promise<Guest | undefined>;
  deleteGuest(id: string): Promise<boolean>;

  // Reservations
  getReservations(): Promise<ReservationWithDetails[]>;
  getReservation(id: string): Promise<ReservationWithDetails | undefined>;
  getReservationByCode(code: string): Promise<ReservationWithDetails | undefined>;
  getRecentReservations(limit: number): Promise<ReservationWithDetails[]>;
  getReservationsForCheckIn(): Promise<ReservationWithDetails[]>;
  getReservationsForCheckOut(): Promise<ReservationWithDetails[]>;
  getCheckInsByDate(date: string): Promise<ReservationWithDetails[]>;
  getReservationsByGuest(guestId: string): Promise<ReservationWithDetails[]>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, reservation: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservation(id: string): Promise<boolean>;
  generateReservationCode(): string;

  // Charges
  getCharges(reservationId: string): Promise<Charge[]>;
  createCharge(charge: InsertCharge): Promise<Charge>;
  updateCharge(id: string, charge: Partial<InsertCharge>): Promise<Charge | undefined>;
  deleteCharge(id: string): Promise<boolean>;
  getChargesTotal(reservationId: string): Promise<number>;

  // Cancelled Reservation Logs
  getCancelledReservationLogs(): Promise<CancelledReservationLog[]>;
  createCancelledReservationLog(log: InsertCancelledReservationLog): Promise<CancelledReservationLog>;

  // Overbooking check
  checkOverbooking(roomId: string, checkInDate: string, checkOutDate: string, excludeReservationId?: string): Promise<boolean>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    dirtyRooms: number;
    cleaningRooms: number;
    maintenanceRooms: number;
    oosRooms: number;
    todayCheckIns: number;
    todayCheckOuts: number;
    occupancyRate: number;
    totalGuests: number;
    pendingReservations: number;
  }>;

  // Planning
  getPlanningData(startDate: string, endDate: string): Promise<PlanningData>;

  // OTA Channels
  getOTAChannels(): Promise<OTAChannelWithStats[]>;
  getOTAChannel(id: string): Promise<OTAChannel | undefined>;
  createOTAChannel(channel: InsertOTAChannel): Promise<OTAChannel>;
  updateOTAChannel(id: string, channel: Partial<InsertOTAChannel>): Promise<OTAChannel | undefined>;
  deleteOTAChannel(id: string): Promise<boolean>;

  // OTA Reservation Logs
  getOTAReservationLogs(channelId?: string): Promise<OTAReservationLogWithChannel[]>;
  getOTAReservationLog(id: string): Promise<OTAReservationLogWithChannel | undefined>;
  createOTAReservationLog(log: InsertOTAReservationLog): Promise<OTAReservationLog>;
  updateOTAReservationLog(id: string, log: Partial<InsertOTAReservationLog>): Promise<OTAReservationLog | undefined>;
  syncOTAReservation(logId: string): Promise<Reservation | undefined>;

  // Groups
  getGroups(): Promise<GroupWithDetails[]>;
  getGroup(id: string): Promise<GroupWithDetails | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group | undefined>;
  deleteGroup(id: string): Promise<boolean>;
  generateGroupCode(): string;

  // Group Room Blocks
  getGroupBlocks(groupId: string): Promise<GroupRoomBlockWithDetails[]>;
  createGroupBlock(block: InsertGroupRoomBlock): Promise<GroupRoomBlock>;
  updateGroupBlock(id: string, block: Partial<InsertGroupRoomBlock>): Promise<GroupRoomBlock | undefined>;
  deleteGroupBlock(id: string): Promise<boolean>;

  // Group Reservation Links
  getGroupReservationLinks(groupId: string): Promise<GroupReservationLink[]>;
  createGroupReservationLink(link: InsertGroupReservationLink): Promise<GroupReservationLink>;
  assignRoomToGroup(
    groupId: string, 
    roomId: string, 
    guestFirstName: string, 
    guestLastName: string,
    options?: {
      checkInDate?: string;
      checkOutDate?: string;
      agreedRate?: string;
      ratePlanId?: string | null;
    }
  ): Promise<Reservation | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private roomTypes: Map<string, RoomType>;
  private ratePlans: Map<string, RatePlan>;
  private rooms: Map<string, Room>;
  private companies: Map<string, Company>;
  private guests: Map<string, Guest>;
  private reservations: Map<string, Reservation>;
  private charges: Map<string, Charge>;
  private cancelledReservationLogs: Map<string, CancelledReservationLog>;
  private otaChannels: Map<string, OTAChannel>;
  private otaReservationLogs: Map<string, OTAReservationLog>;
  private groups: Map<string, Group>;
  private groupRoomBlocks: Map<string, GroupRoomBlock>;
  private groupReservationLinks: Map<string, GroupReservationLink>;
  private reservationCounter: number;
  private guestCounter: number;
  private groupCounter: number;

  constructor() {
    this.users = new Map();
    this.roomTypes = new Map();
    this.ratePlans = new Map();
    this.rooms = new Map();
    this.companies = new Map();
    this.guests = new Map();
    this.reservations = new Map();
    this.charges = new Map();
    this.cancelledReservationLogs = new Map();
    this.otaChannels = new Map();
    this.otaReservationLogs = new Map();
    this.groups = new Map();
    this.groupRoomBlocks = new Map();
    this.groupReservationLinks = new Map();
    this.reservationCounter = 1000;
    this.guestCounter = 0;
    this.groupCounter = 0;

    // Seed with demo data
    this.seedData();
  }

  private seedData() {
    // Create room types
    const roomTypes: RoomType[] = [
      { id: "rt1", code: "STD", name: "Standard", description: "Habitación standard con cama simple", baseOccupancy: 1, maxOccupancy: 2 },
      { id: "rt2", code: "DBL", name: "Doble", description: "Habitación doble con cama matrimonial", baseOccupancy: 2, maxOccupancy: 3 },
      { id: "rt3", code: "SUITE", name: "Suite", description: "Suite de lujo con sala y jacuzzi", baseOccupancy: 2, maxOccupancy: 4 },
      { id: "rt4", code: "FAM", name: "Familiar", description: "Habitación familiar con dos camas dobles", baseOccupancy: 4, maxOccupancy: 6 },
    ];
    roomTypes.forEach((rt) => this.roomTypes.set(rt.id, rt));

    // Create rate plans
    const ratePlans: RatePlan[] = [
      { id: "rp1", name: "BAR (Mejor Tarifa)", roomTypeId: "rt1", baseRate: "50.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp2", name: "BAR (Mejor Tarifa)", roomTypeId: "rt2", baseRate: "80.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp3", name: "BAR (Mejor Tarifa)", roomTypeId: "rt3", baseRate: "150.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp4", name: "BAR (Mejor Tarifa)", roomTypeId: "rt4", baseRate: "120.00", currency: "USD", refundable: "true", cancellationPolicy: "Cancelación gratuita hasta 24h antes" },
      { id: "rp5", name: "No Reembolsable", roomTypeId: "rt1", baseRate: "40.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelación" },
      { id: "rp6", name: "No Reembolsable", roomTypeId: "rt2", baseRate: "65.00", currency: "USD", refundable: "false", cancellationPolicy: "Sin reembolso por cancelación" },
      { id: "rp7", name: "Corporativo", roomTypeId: "rt2", baseRate: "70.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturación a empresa" },
      { id: "rp8", name: "Corporativo", roomTypeId: "rt3", baseRate: "130.00", currency: "USD", refundable: "true", cancellationPolicy: "Facturación a empresa" },
    ];
    ratePlans.forEach((rp) => this.ratePlans.set(rp.id, rp));

    // Create 66 rooms across 6 floors
    const roomTypeDistribution = ["rt1", "rt2", "rt2", "rt3", "rt4", "rt2", "rt1", "rt2", "rt3", "rt4", "rt2"];
    const rooms: Room[] = [];
    let roomId = 1;
    
    for (let floor = 1; floor <= 6; floor++) {
      const roomsPerFloor = floor <= 5 ? 11 : 11; // 11 rooms per floor = 66 total
      for (let roomNum = 1; roomNum <= roomsPerFloor; roomNum++) {
        const roomNumber = `${floor}${roomNum.toString().padStart(2, "0")}`;
        const typeIndex = (roomNum - 1) % roomTypeDistribution.length;
        const status: RoomStatus = 
          roomId === 3 || roomId === 15 || roomId === 28 || roomId === 45 ? "occupied" :
          roomId === 5 || roomId === 22 ? "cleaning" :
          roomId === 8 || roomId === 33 ? "maintenance" : "available";
        
        rooms.push({
          id: `r${roomId}`,
          roomNumber,
          roomTypeId: roomTypeDistribution[typeIndex],
          floor,
          status,
          notes: status === "cleaning" ? "Limpieza programada" : 
                 status === "maintenance" ? "Mantenimiento programado" : null,
        });
        roomId++;
      }
    }
    rooms.forEach((r) => this.rooms.set(r.id, r));

    // Create companies
    const seedDate = new Date().toISOString().split("T")[0];
    const companies: Company[] = [
      { id: "comp1", razonSocial: "TechCorp Argentina S.A.", nombreFantasia: "TechCorp", direccion: "Av. del Libertador 1000", pais: "Argentina", codigoPostal: "1001", localidad: "CABA", provincia: "Buenos Aires", telefono: "+54 11 4000-1234", email: "reservas@techcorp.com.ar", cuilCuit: "30-71234567-8", numeroFiscal: "30714567", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Pablo Mendez", contactEmail: "pablo.mendez@techcorp.com.ar", contactPhone: "+54 11 4000-1235", creditLimit: "50000.00", paymentTermDays: 30, notes: "Cliente corporativo frecuente", isActive: "true", createdAt: seedDate },
      { id: "comp2", razonSocial: "Consultoría Global S.R.L.", nombreFantasia: "ConsultGlobal", direccion: "Callao 500", pais: "Argentina", codigoPostal: "1002", localidad: "CABA", provincia: "Buenos Aires", telefono: "+54 11 5000-5678", email: "viajes@consultglobal.com", cuilCuit: "30-70987654-3", numeroFiscal: "30709876", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Lucia Torres", contactEmail: "lucia.t@consultglobal.com", contactPhone: "+54 11 5000-5679", creditLimit: "25000.00", paymentTermDays: 15, notes: null, isActive: "true", createdAt: seedDate },
      { id: "comp3", razonSocial: "Exportadora del Sur S.A.", nombreFantasia: "ExportSur", direccion: "Bv. Oroño 2000", pais: "Argentina", codigoPostal: "2000", localidad: "Rosario", provincia: "Santa Fe", telefono: "+54 341 456-7890", email: "admin@exportsur.com.ar", cuilCuit: "30-65432198-7", numeroFiscal: "30654321", condicionIva: "responsable_inscripto", inscripcionNacional: "SI", inscripcionProvincial: "SI", contactName: "Martin Gomez", contactEmail: "martin@exportsur.com.ar", contactPhone: "+54 341 456-7891", creditLimit: "30000.00", paymentTermDays: 30, notes: "Empresa de Rosario", isActive: "true", createdAt: seedDate },
    ];
    companies.forEach((c) => this.companies.set(c.id, c));

    // Create guests
    const guestSeedDate = new Date().toISOString().split("T")[0];
    const guests: Guest[] = [
      { id: "g1", codigo: "H-2025-0001", firstName: "Carlos", lastName: "García", email: "carlos.garcia@email.com", phone: "+54 11 4567-8901", documentType: "dni", documentNumber: "30456789", nationality: "Argentina", direccion: "Av. Corrientes 1234", localidad: "CABA", codigoPostal: "1043", fechaNacimiento: "1985-03-15", sexo: "masculino", cuilCuit: "20-30456789-3", companyId: null, fechaAlta: guestSeedDate },
      { id: "g2", codigo: "H-2025-0002", firstName: "María", lastName: "López", email: "maria.lopez@email.com", phone: "+54 11 5678-9012", documentType: "dni", documentNumber: "28765432", nationality: "Argentina", direccion: "Calle Florida 567", localidad: "CABA", codigoPostal: "1005", fechaNacimiento: "1990-07-22", sexo: "femenino", cuilCuit: "27-28765432-4", companyId: null, fechaAlta: guestSeedDate },
      { id: "g3", codigo: "H-2025-0003", firstName: "John", lastName: "Smith", email: "john.smith@email.com", phone: "+1 555 123-4567", documentType: "passport", documentNumber: "US123456", nationality: "Estados Unidos", direccion: "123 Main St", localidad: "New York", codigoPostal: "10001", fechaNacimiento: "1978-11-30", sexo: "masculino", cuilCuit: null, companyId: null, fechaAlta: guestSeedDate },
      { id: "g4", codigo: "H-2025-0004", firstName: "Ana", lastName: "Martínez", email: "ana.martinez@email.com", phone: "+54 11 6789-0123", documentType: "dni", documentNumber: "35678901", nationality: "Argentina", direccion: "Av. Santa Fe 890", localidad: "CABA", codigoPostal: "1059", fechaNacimiento: "1995-01-10", sexo: "femenino", cuilCuit: "27-35678901-9", companyId: null, fechaAlta: guestSeedDate },
      { id: "g5", codigo: "H-2025-0005", firstName: "Roberto", lastName: "Fernández", email: "roberto.f@email.com", phone: "+54 11 7890-1234", documentType: "dni", documentNumber: "32109876", nationality: "Argentina", direccion: "Callao 456", localidad: "CABA", codigoPostal: "1022", fechaNacimiento: "1982-05-20", sexo: "masculino", cuilCuit: "20-32109876-5", companyId: "comp1", fechaAlta: guestSeedDate },
      { id: "g6", codigo: "H-2025-0006", firstName: "Laura", lastName: "Pérez", email: "laura.p@email.com", phone: "+54 11 8901-2345", documentType: "dni", documentNumber: "29876543", nationality: "Argentina", direccion: "Av. Libertador 123", localidad: "CABA", codigoPostal: "1426", fechaNacimiento: "1988-09-08", sexo: "femenino", cuilCuit: "27-29876543-2", companyId: null, fechaAlta: guestSeedDate },
      { id: "g7", codigo: "H-2025-0007", firstName: "Diego", lastName: "Ramírez", email: "diego.r@email.com", phone: "+54 11 9012-3456", documentType: "dni", documentNumber: "31234567", nationality: "Argentina", direccion: "Av. Belgrano 456", localidad: "CABA", codigoPostal: "1092", fechaNacimiento: "1992-12-25", sexo: "masculino", cuilCuit: "20-31234567-8", companyId: null, fechaAlta: guestSeedDate },
      { id: "g8", codigo: "H-2025-0008", firstName: "Sophie", lastName: "Martin", email: "sophie.m@email.com", phone: "+33 1 2345 6789", documentType: "passport", documentNumber: "FR789012", nationality: "Francia", direccion: "15 Rue de Paris", localidad: "Lyon", codigoPostal: "69001", fechaNacimiento: "1987-04-18", sexo: "femenino", cuilCuit: null, companyId: null, fechaAlta: guestSeedDate },
    ];
    guests.forEach((g) => this.guests.set(g.id, g));
    this.guestCounter = 8;

    // Create reservations with varied dates
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    
    const reservations: Reservation[] = [
      { id: "res1", reservationCode: "RES-1001", guestId: "g1", companyId: null, roomTypeId: "rt2", roomId: "r3", ratePlanId: "rp2", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "80.00", status: "checked_in", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res2", reservationCode: "RES-1002", guestId: "g2", companyId: null, roomTypeId: "rt3", roomId: "r15", ratePlanId: "rp3", checkInDate: today, checkOutDate: nextWeek, nights: 7, baseRatePerNight: "150.00", discountType: "percent", discountValue: "10", finalRatePerNight: "135.00", totalRoomAmount: "945.00", status: "checked_in", source: "web", otaChannelId: null, externalReservationId: null, numberOfGuests: 3, notes: "VIP - Aniversario", createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res3", reservationCode: "RES-1003", guestId: "g3", companyId: null, roomTypeId: "rt3", roomId: "r28", ratePlanId: "rp3", checkInDate: today, checkOutDate: in3Days, nights: 3, baseRatePerNight: "150.00", discountType: "none", discountValue: "0", finalRatePerNight: "150.00", totalRoomAmount: "450.00", status: "checked_in", source: "booking", otaChannelId: null, externalReservationId: "BK-123456", numberOfGuests: 2, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res4", reservationCode: "RES-1004", guestId: "g4", companyId: null, roomTypeId: "rt4", roomId: "r45", ratePlanId: "rp4", checkInDate: today, checkOutDate: dayAfter, nights: 2, baseRatePerNight: "120.00", discountType: "none", discountValue: "0", finalRatePerNight: "120.00", totalRoomAmount: "240.00", status: "checked_in", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 4, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res5", reservationCode: "RES-1005", guestId: "g5", companyId: "comp1", roomTypeId: "rt2", roomId: "r6", ratePlanId: "rp7", checkInDate: today, checkOutDate: tomorrow, nights: 1, baseRatePerNight: "70.00", discountType: "fixed", discountValue: "10", finalRatePerNight: "60.00", totalRoomAmount: "60.00", status: "confirmed", source: "empresa", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res6", reservationCode: "RES-1006", guestId: "g6", companyId: null, roomTypeId: "rt1", roomId: "r1", ratePlanId: "rp1", checkInDate: tomorrow, checkOutDate: in5Days, nights: 4, baseRatePerNight: "50.00", discountType: "none", discountValue: "0", finalRatePerNight: "50.00", totalRoomAmount: "200.00", status: "tentative", source: "telefono", otaChannelId: null, externalReservationId: null, numberOfGuests: 1, notes: "Llegada tardía", createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res7", reservationCode: "RES-1007", guestId: "g7", companyId: null, roomTypeId: "rt2", roomId: "r10", ratePlanId: "rp2", checkInDate: dayAfter, checkOutDate: nextWeek, nights: 5, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "400.00", status: "confirmed", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res8", reservationCode: "RES-1008", guestId: "g8", companyId: null, roomTypeId: "rt2", roomId: "r20", ratePlanId: "rp2", checkInDate: in3Days, checkOutDate: in10Days, nights: 7, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "560.00", status: "pending", source: "expedia", otaChannelId: null, externalReservationId: "EX-789012", numberOfGuests: 2, notes: "Turista francés", createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res9", reservationCode: "RES-1009", guestId: "g1", companyId: null, roomTypeId: "rt2", roomId: "r35", ratePlanId: "rp2", checkInDate: in5Days, checkOutDate: in10Days, nights: 5, baseRatePerNight: "80.00", discountType: "none", discountValue: "0", finalRatePerNight: "80.00", totalRoomAmount: "400.00", status: "confirmed", source: "directo", otaChannelId: null, externalReservationId: null, numberOfGuests: 2, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
      { id: "res10", reservationCode: "RES-1010", guestId: "g2", companyId: null, roomTypeId: "rt2", roomId: "r50", ratePlanId: "rp6", checkInDate: tomorrow, checkOutDate: in3Days, nights: 2, baseRatePerNight: "65.00", discountType: "percent", discountValue: "5", finalRatePerNight: "61.75", totalRoomAmount: "123.50", status: "confirmed", source: "airbnb", otaChannelId: null, externalReservationId: null, numberOfGuests: 3, notes: null, createdAt: new Date().toISOString(), lastModifiedBy: null },
    ];
    reservations.forEach((r) => this.reservations.set(r.id, r));

    // Create sample charges for checked-in reservations
    const charges: Charge[] = [
      { id: "ch1", reservationId: "res1", description: "Alojamiento - 1 noche", amount: "80.00", date: today, category: "room", createdBy: null },
      { id: "ch2", reservationId: "res2", description: "Alojamiento - 7 noches", amount: "945.00", date: today, category: "room", createdBy: null },
      { id: "ch2b", reservationId: "res2", description: "Minibar", amount: "25.00", date: today, category: "minibar", createdBy: null },
      { id: "ch3", reservationId: "res3", description: "Alojamiento - 3 noches", amount: "450.00", date: today, category: "room", createdBy: null },
      { id: "ch3b", reservationId: "res3", description: "Restaurante - Cena", amount: "85.00", date: today, category: "restaurant", createdBy: null },
      { id: "ch4", reservationId: "res4", description: "Alojamiento - 2 noches", amount: "240.00", date: today, category: "room", createdBy: null },
    ];
    charges.forEach((c) => this.charges.set(c.id, c));

    this.reservationCounter = 1010;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      id,
      username: insertUser.username,
      password: insertUser.password,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      role: (insertUser.role ?? "reception") as "reception" | "housekeeping" | "management" | "director" | "restaurant" | "spa" | "security",
    };
    this.users.set(id, user);
    return user;
  }

  // Room Types
  async getRoomTypes(): Promise<RoomType[]> {
    return Array.from(this.roomTypes.values());
  }

  async getRoomType(id: string): Promise<RoomType | undefined> {
    return this.roomTypes.get(id);
  }

  async createRoomType(roomType: InsertRoomType): Promise<RoomType> {
    const id = randomUUID();
    const newRoomType: RoomType = { 
      id,
      code: roomType.code,
      name: roomType.name,
      description: roomType.description ?? null,
      baseOccupancy: roomType.baseOccupancy ?? 2,
      maxOccupancy: roomType.maxOccupancy ?? 4,
    };
    this.roomTypes.set(id, newRoomType);
    return newRoomType;
  }

  async updateRoomType(id: string, updates: Partial<InsertRoomType>): Promise<RoomType | undefined> {
    const roomType = this.roomTypes.get(id);
    if (!roomType) return undefined;
    const updatedRoomType: RoomType = { ...roomType, ...updates };
    this.roomTypes.set(id, updatedRoomType);
    return updatedRoomType;
  }

  async deleteRoomType(id: string): Promise<boolean> {
    return this.roomTypes.delete(id);
  }

  // Rate Plans
  async getRatePlans(): Promise<RatePlanWithRoomType[]> {
    const ratePlans = Array.from(this.ratePlans.values());
    return ratePlans.map((rp) => ({
      ...rp,
      roomType: this.roomTypes.get(rp.roomTypeId)!,
    }));
  }

  async getRatePlan(id: string): Promise<RatePlanWithRoomType | undefined> {
    const ratePlan = this.ratePlans.get(id);
    if (!ratePlan) return undefined;
    return {
      ...ratePlan,
      roomType: this.roomTypes.get(ratePlan.roomTypeId)!,
    };
  }

  async getRatePlansByRoomType(roomTypeId: string): Promise<RatePlan[]> {
    return Array.from(this.ratePlans.values()).filter((rp) => rp.roomTypeId === roomTypeId);
  }

  async createRatePlan(ratePlan: InsertRatePlan): Promise<RatePlan> {
    const id = randomUUID();
    const newRatePlan: RatePlan = {
      id,
      name: ratePlan.name,
      roomTypeId: ratePlan.roomTypeId,
      baseRate: ratePlan.baseRate,
      currency: ratePlan.currency ?? "ARS",
      refundable: ratePlan.refundable ?? "true",
      cancellationPolicy: ratePlan.cancellationPolicy ?? null,
    };
    this.ratePlans.set(id, newRatePlan);
    return newRatePlan;
  }

  async updateRatePlan(id: string, updates: Partial<InsertRatePlan>): Promise<RatePlan | undefined> {
    const ratePlan = this.ratePlans.get(id);
    if (!ratePlan) return undefined;
    const updatedRatePlan: RatePlan = { ...ratePlan, ...updates };
    this.ratePlans.set(id, updatedRatePlan);
    return updatedRatePlan;
  }

  async deleteRatePlan(id: string): Promise<boolean> {
    return this.ratePlans.delete(id);
  }

  // Rooms
  async getRooms(): Promise<RoomWithType[]> {
    const rooms = Array.from(this.rooms.values());
    return rooms.map((room) => ({
      ...room,
      roomType: this.roomTypes.get(room.roomTypeId)!,
    }));
  }

  async getRoom(id: string): Promise<RoomWithType | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    return {
      ...room,
      roomType: this.roomTypes.get(room.roomTypeId)!,
    };
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = randomUUID();
    const room: Room = { 
      id,
      roomNumber: insertRoom.roomNumber,
      roomTypeId: insertRoom.roomTypeId,
      floor: insertRoom.floor ?? 1,
      status: (insertRoom.status ?? "available") as RoomStatus,
      notes: insertRoom.notes ?? null,
    };
    this.rooms.set(id, room);
    return room;
  }

  async updateRoom(id: string, updates: Partial<InsertRoom>): Promise<Room | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    const updatedRoom: Room = { 
      ...room, 
      ...updates,
      status: (updates.status ?? room.status) as RoomStatus,
    };
    this.rooms.set(id, updatedRoom);
    return updatedRoom;
  }

  async deleteRoom(id: string): Promise<boolean> {
    return this.rooms.delete(id);
  }

  // Companies
  async getCompanies(): Promise<Company[]> {
    return Array.from(this.companies.values()).filter((c) => c.isActive === "true");
  }

  async getCompany(id: string): Promise<Company | undefined> {
    return this.companies.get(id);
  }

  async searchCompanies(query: string): Promise<Company[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.companies.values()).filter((c) => 
      c.isActive === "true" && (
        c.razonSocial.toLowerCase().includes(lowerQuery) ||
        c.nombreFantasia?.toLowerCase().includes(lowerQuery) ||
        c.cuilCuit.toLowerCase().includes(lowerQuery)
      )
    );
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const id = randomUUID();
    const company: Company = {
      id,
      razonSocial: insertCompany.razonSocial,
      nombreFantasia: insertCompany.nombreFantasia ?? null,
      direccion: insertCompany.direccion ?? null,
      pais: insertCompany.pais ?? "Argentina",
      codigoPostal: insertCompany.codigoPostal ?? null,
      localidad: insertCompany.localidad ?? null,
      provincia: insertCompany.provincia ?? null,
      telefono: insertCompany.telefono ?? null,
      email: insertCompany.email ?? null,
      cuilCuit: insertCompany.cuilCuit,
      numeroFiscal: insertCompany.numeroFiscal ?? null,
      condicionIva: (insertCompany.condicionIva ?? "responsable_inscripto") as "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable",
      inscripcionNacional: insertCompany.inscripcionNacional ?? null,
      inscripcionProvincial: insertCompany.inscripcionProvincial ?? null,
      contactName: insertCompany.contactName ?? null,
      contactEmail: insertCompany.contactEmail ?? null,
      contactPhone: insertCompany.contactPhone ?? null,
      creditLimit: insertCompany.creditLimit ?? "0",
      paymentTermDays: insertCompany.paymentTermDays ?? 30,
      notes: insertCompany.notes ?? null,
      isActive: insertCompany.isActive ?? "true",
      createdAt: new Date().toISOString().split("T")[0],
    };
    this.companies.set(id, company);
    return company;
  }

  async updateCompany(id: string, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const company = this.companies.get(id);
    if (!company) return undefined;
    const updatedCompany: Company = { 
      ...company, 
      ...updates,
      condicionIva: (updates.condicionIva ?? company.condicionIva) as "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | "no_responsable",
    };
    this.companies.set(id, updatedCompany);
    return updatedCompany;
  }

  async deleteCompany(id: string): Promise<boolean> {
    const company = this.companies.get(id);
    if (!company) return false;
    company.isActive = "false";
    this.companies.set(id, company);
    return true;
  }

  // Guests
  async getGuests(): Promise<Guest[]> {
    return Array.from(this.guests.values());
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    return this.guests.get(id);
  }

  async searchGuests(query: string): Promise<Guest[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.guests.values()).filter((g) =>
      g.firstName.toLowerCase().includes(lowerQuery) ||
      g.lastName.toLowerCase().includes(lowerQuery) ||
      g.email?.toLowerCase().includes(lowerQuery) ||
      g.documentNumber?.toLowerCase().includes(lowerQuery)
    );
  }

  private generateGuestCode(): string {
    this.guestCounter++;
    const year = new Date().getFullYear();
    return `H-${year}-${this.guestCounter.toString().padStart(4, "0")}`;
  }

  async createGuest(insertGuest: InsertGuest): Promise<Guest> {
    const id = randomUUID();
    const guest: Guest = { 
      id,
      codigo: this.generateGuestCode(),
      firstName: insertGuest.firstName,
      lastName: insertGuest.lastName,
      email: insertGuest.email ?? null,
      phone: insertGuest.phone ?? null,
      documentType: insertGuest.documentType ?? null,
      documentNumber: insertGuest.documentNumber ?? null,
      nationality: insertGuest.nationality ?? null,
      direccion: insertGuest.direccion ?? null,
      localidad: insertGuest.localidad ?? null,
      codigoPostal: insertGuest.codigoPostal ?? null,
      fechaNacimiento: insertGuest.fechaNacimiento ?? null,
      sexo: (insertGuest.sexo ?? "no_especifica") as "masculino" | "femenino" | "otro" | "no_especifica",
      cuilCuit: insertGuest.cuilCuit ?? null,
      companyId: insertGuest.companyId ?? null,
      fechaAlta: new Date().toISOString().split("T")[0],
    };
    this.guests.set(id, guest);
    return guest;
  }

  async updateGuest(id: string, updates: Partial<InsertGuest>): Promise<Guest | undefined> {
    const guest = this.guests.get(id);
    if (!guest) return undefined;
    const updatedGuest: Guest = { 
      ...guest, 
      ...updates,
      sexo: (updates.sexo ?? guest.sexo) as "masculino" | "femenino" | "otro" | "no_especifica",
    };
    this.guests.set(id, updatedGuest);
    return updatedGuest;
  }

  async deleteGuest(id: string): Promise<boolean> {
    return this.guests.delete(id);
  }

  // Reservations
  private enrichReservation(reservation: Reservation): ReservationWithDetails {
    const guest = this.guests.get(reservation.guestId);
    const room = this.rooms.get(reservation.roomId);
    const roomType = room ? this.roomTypes.get(room.roomTypeId) : undefined;
    const ratePlan = reservation.ratePlanId ? this.ratePlans.get(reservation.ratePlanId) : undefined;
    const charges = Array.from(this.charges.values()).filter((c) => c.reservationId === reservation.id);

    return {
      ...reservation,
      guest: guest!,
      room: room ? { ...room, roomType } : undefined as any,
      ratePlan,
      charges,
    };
  }

  generateReservationCode(): string {
    this.reservationCounter++;
    return `RES-${this.reservationCounter}`;
  }

  async getReservations(): Promise<ReservationWithDetails[]> {
    const reservations = Array.from(this.reservations.values());
    return reservations.map((r) => this.enrichReservation(r)).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getReservation(id: string): Promise<ReservationWithDetails | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    return this.enrichReservation(reservation);
  }

  async getReservationByCode(code: string): Promise<ReservationWithDetails | undefined> {
    const reservation = Array.from(this.reservations.values()).find((r) => r.reservationCode === code);
    if (!reservation) return undefined;
    return this.enrichReservation(reservation);
  }

  async getRecentReservations(limit: number): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.slice(0, limit);
  }

  async getReservationsForCheckIn(): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.status === "confirmed");
  }

  async getReservationsForCheckOut(): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.status === "checked_in");
  }

  async getCheckInsByDate(date: string): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.checkInDate === date && r.status === "checked_in");
  }

  async getReservationsByGuest(guestId: string): Promise<ReservationWithDetails[]> {
    const reservations = await this.getReservations();
    return reservations.filter((r) => r.guestId === guestId);
  }

  async createReservation(insertReservation: InsertReservation): Promise<Reservation> {
    const id = randomUUID();
    const reservation: Reservation = { 
      id,
      reservationCode: insertReservation.reservationCode,
      guestId: insertReservation.guestId,
      companyId: insertReservation.companyId ?? null,
      roomTypeId: insertReservation.roomTypeId,
      roomId: insertReservation.roomId,
      ratePlanId: insertReservation.ratePlanId ?? null,
      checkInDate: insertReservation.checkInDate,
      checkOutDate: insertReservation.checkOutDate,
      nights: insertReservation.nights ?? 1,
      baseRatePerNight: insertReservation.baseRatePerNight ?? null,
      discountType: (insertReservation.discountType ?? "none") as "none" | "percent" | "fixed",
      discountValue: insertReservation.discountValue ?? "0",
      finalRatePerNight: insertReservation.finalRatePerNight ?? null,
      totalRoomAmount: insertReservation.totalRoomAmount ?? null,
      status: (insertReservation.status ?? "pending") as ReservationStatus,
      source: (insertReservation.source ?? "directo") as any,
      otaChannelId: insertReservation.otaChannelId ?? null,
      externalReservationId: insertReservation.externalReservationId ?? null,
      numberOfGuests: insertReservation.numberOfGuests ?? 1,
      notes: insertReservation.notes ?? null,
      createdAt: insertReservation.createdAt || new Date().toISOString(),
      lastModifiedBy: insertReservation.lastModifiedBy ?? null,
    };
    this.reservations.set(id, reservation);
    return reservation;
  }

  async updateReservation(id: string, updates: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    const updatedReservation: Reservation = { 
      ...reservation, 
      ...updates,
      status: (updates.status ?? reservation.status) as ReservationStatus,
      discountType: (updates.discountType ?? reservation.discountType) as "none" | "percent" | "fixed",
      source: (updates.source ?? reservation.source) as any,
      otaChannelId: updates.otaChannelId !== undefined ? updates.otaChannelId : reservation.otaChannelId,
      externalReservationId: updates.externalReservationId !== undefined ? updates.externalReservationId : reservation.externalReservationId,
    };
    this.reservations.set(id, updatedReservation);
    return updatedReservation;
  }

  async deleteReservation(id: string): Promise<boolean> {
    return this.reservations.delete(id);
  }

  // Charges
  async getCharges(reservationId: string): Promise<Charge[]> {
    return Array.from(this.charges.values()).filter((c) => c.reservationId === reservationId);
  }

  async createCharge(charge: InsertCharge): Promise<Charge> {
    const id = randomUUID();
    const newCharge: Charge = {
      id,
      reservationId: charge.reservationId,
      description: charge.description,
      amount: charge.amount,
      date: charge.date,
      category: (charge.category ?? "otros") as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
      createdBy: charge.createdBy ?? null,
    };
    this.charges.set(id, newCharge);
    return newCharge;
  }

  async updateCharge(id: string, updates: Partial<InsertCharge>): Promise<Charge | undefined> {
    const charge = this.charges.get(id);
    if (!charge) return undefined;
    const updatedCharge: Charge = { 
      ...charge, 
      ...updates,
      category: (updates.category ?? charge.category) as "room" | "restaurant" | "spa" | "minibar" | "otros" | "adjustment",
    };
    this.charges.set(id, updatedCharge);
    return updatedCharge;
  }

  async deleteCharge(id: string): Promise<boolean> {
    return this.charges.delete(id);
  }

  async getChargesTotal(reservationId: string): Promise<number> {
    const charges = await this.getCharges(reservationId);
    return charges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
  }

  // Cancelled Reservation Logs
  async getCancelledReservationLogs(): Promise<CancelledReservationLog[]> {
    return Array.from(this.cancelledReservationLogs.values()).sort((a, b) => 
      new Date(b.cancellationDate).getTime() - new Date(a.cancellationDate).getTime()
    );
  }

  async createCancelledReservationLog(log: InsertCancelledReservationLog): Promise<CancelledReservationLog> {
    const id = randomUUID();
    const newLog: CancelledReservationLog = {
      id,
      reservationCode: log.reservationCode,
      guestName: log.guestName,
      roomNumber: log.roomNumber,
      checkInDate: log.checkInDate,
      checkOutDate: log.checkOutDate,
      cancellationDate: log.cancellationDate,
      cancelledBy: log.cancelledBy ?? null,
      reason: log.reason ?? null,
    };
    this.cancelledReservationLogs.set(id, newLog);
    return newLog;
  }

  // Overbooking check - returns true if there is a conflict
  async checkOverbooking(roomId: string, checkInDate: string, checkOutDate: string, excludeReservationId?: string): Promise<boolean> {
    const reservations = Array.from(this.reservations.values());
    const activeStatuses: ReservationStatus[] = ["tentative", "pending", "confirmed", "checked_in"];
    
    for (const res of reservations) {
      if (res.roomId !== roomId) continue;
      if (excludeReservationId && res.id === excludeReservationId) continue;
      if (!activeStatuses.includes(res.status)) continue;
      
      // Check for date overlap
      // Reservation A conflicts with B if A.checkIn < B.checkOut AND A.checkOut > B.checkIn
      if (checkInDate < res.checkOutDate && checkOutDate > res.checkInDate) {
        return true; // Conflict found
      }
    }
    return false; // No conflict
  }

  // Dashboard Stats
  async getDashboardStats() {
    const rooms = Array.from(this.rooms.values());
    const reservations = Array.from(this.reservations.values());
    const guests = Array.from(this.guests.values());
    const today = new Date().toISOString().split("T")[0];

    const totalRooms = rooms.length;
    const availableRooms = rooms.filter((r) => r.status === "available").length;
    const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
    const dirtyRooms = rooms.filter((r) => r.status === "dirty").length;
    const cleaningRooms = rooms.filter((r) => r.status === "cleaning").length;
    const maintenanceRooms = rooms.filter((r) => r.status === "maintenance").length;
    const oosRooms = rooms.filter((r) => r.status === "oos").length;

    const todayCheckIns = reservations.filter(
      (r) => r.checkInDate === today && (r.status === "confirmed" || r.status === "pending" || r.status === "tentative")
    ).length;
    const todayCheckOuts = reservations.filter(
      (r) => r.checkOutDate === today && r.status === "checked_in"
    ).length;

    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const totalGuests = guests.length;
    const pendingReservations = reservations.filter((r) => r.status === "pending" || r.status === "tentative").length;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      dirtyRooms,
      cleaningRooms,
      maintenanceRooms,
      oosRooms,
      todayCheckIns,
      todayCheckOuts,
      occupancyRate,
      totalGuests,
      pendingReservations,
    };
  }

  // Planning
  async getPlanningData(startDate: string, endDate: string): Promise<PlanningData> {
    const rooms = await this.getRooms();
    const allReservations = Array.from(this.reservations.values());
    
    // Generate array of days between start and end
    const days: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split("T")[0]);
    }

    // Build occupancy map and cell reservations
    const occupancy: Record<string, PlanningCellStatus[]> = {};
    const cellReservations: Record<string, Record<string, string>> = {};
    const reservationsMap: Record<string, { id: string; guestName: string; checkIn: string; checkOut: string; status: ReservationStatus }> = {};

    // Filter active reservations (not cancelled or checked_out)
    const activeReservations = allReservations.filter(r => 
      r.status !== "cancelled" && r.status !== "checked_out"
    );

    // Build reservation info map
    for (const res of activeReservations) {
      const guest = this.guests.get(res.guestId);
      if (guest) {
        reservationsMap[res.id] = {
          id: res.id,
          guestName: `${guest.firstName} ${guest.lastName}`,
          checkIn: res.checkInDate,
          checkOut: res.checkOutDate,
          status: res.status as ReservationStatus,
        };
      }
    }

    // Calculate occupancy for each room
    for (const room of rooms) {
      occupancy[room.id] = [];
      cellReservations[room.id] = {};

      for (const day of days) {
        // Check room status first
        if (room.status === "maintenance") {
          occupancy[room.id].push("maintenance");
          continue;
        }
        if (room.status === "cleaning") {
          occupancy[room.id].push("cleaning");
          continue;
        }

        // Find reservation for this room on this day
        const reservation = activeReservations.find(r => {
          if (r.roomId !== room.id) return false;
          const checkIn = r.checkInDate;
          const checkOut = r.checkOutDate;
          return day >= checkIn && day < checkOut;
        });

        if (reservation) {
          cellReservations[room.id][day] = reservation.id;
          if (reservation.status === "checked_in") {
            if (day === reservation.checkOutDate) {
              occupancy[room.id].push("checkout_today");
            } else {
              occupancy[room.id].push("checked_in");
            }
          } else {
            occupancy[room.id].push("booked");
          }
        } else {
          occupancy[room.id].push("available");
        }
      }
    }

    return {
      rooms,
      days,
      occupancy,
      reservations: reservationsMap,
      cellReservations,
    };
  }

  // OTA Channels
  async getOTAChannels(): Promise<OTAChannelWithStats[]> {
    const channels = Array.from(this.otaChannels.values());
    return channels.map((channel) => {
      const logs = Array.from(this.otaReservationLogs.values()).filter(
        (log) => log.channelId === channel.id
      );
      const totalReservations = logs.length;
      const pendingSync = logs.filter((log) => log.status === "pending").length;
      const totalRevenue = logs.reduce((sum, log) => sum + parseFloat(log.totalAmount || "0"), 0);
      const totalCommission = logs.reduce((sum, log) => sum + parseFloat(log.commission || "0"), 0);
      return {
        ...channel,
        totalReservations,
        pendingSync,
        totalRevenue,
        totalCommission,
      };
    });
  }

  async getOTAChannel(id: string): Promise<OTAChannel | undefined> {
    return this.otaChannels.get(id);
  }

  async createOTAChannel(channel: InsertOTAChannel): Promise<OTAChannel> {
    const id = randomUUID();
    const newChannel: OTAChannel = {
      id,
      name: channel.name,
      channelType: channel.channelType as "booking" | "expedia" | "airbnb" | "despegar" | "hotelbeds" | "agoda" | "trivago" | "manual",
      status: (channel.status || "inactive") as "active" | "inactive" | "pending" | "error",
      apiKey: channel.apiKey ?? null,
      apiSecret: channel.apiSecret ?? null,
      hotelCode: channel.hotelCode ?? null,
      commissionPercent: channel.commissionPercent ?? "15.00",
      syncEnabled: channel.syncEnabled ?? "false",
      lastSyncAt: channel.lastSyncAt ?? null,
      createdAt: channel.createdAt,
    };
    this.otaChannels.set(id, newChannel);
    return newChannel;
  }

  async updateOTAChannel(id: string, channel: Partial<InsertOTAChannel>): Promise<OTAChannel | undefined> {
    const existing = this.otaChannels.get(id);
    if (!existing) return undefined;
    const updated: OTAChannel = { ...existing, ...channel } as OTAChannel;
    this.otaChannels.set(id, updated);
    return updated;
  }

  async deleteOTAChannel(id: string): Promise<boolean> {
    return this.otaChannels.delete(id);
  }

  // OTA Reservation Logs
  async getOTAReservationLogs(channelId?: string): Promise<OTAReservationLogWithChannel[]> {
    let logs = Array.from(this.otaReservationLogs.values());
    if (channelId) {
      logs = logs.filter((log) => log.channelId === channelId);
    }
    return logs.map((log) => ({
      ...log,
      channel: this.otaChannels.get(log.channelId)!,
    })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getOTAReservationLog(id: string): Promise<OTAReservationLogWithChannel | undefined> {
    const log = this.otaReservationLogs.get(id);
    if (!log) return undefined;
    return {
      ...log,
      channel: this.otaChannels.get(log.channelId)!,
    };
  }

  async createOTAReservationLog(log: InsertOTAReservationLog): Promise<OTAReservationLog> {
    const id = randomUUID();
    const newLog: OTAReservationLog = {
      id,
      channelId: log.channelId,
      externalReservationId: log.externalReservationId,
      internalReservationId: log.internalReservationId ?? null,
      guestName: log.guestName,
      checkInDate: log.checkInDate,
      checkOutDate: log.checkOutDate,
      roomTypeName: log.roomTypeName ?? null,
      totalAmount: log.totalAmount ?? null,
      commission: log.commission ?? null,
      netAmount: log.netAmount ?? null,
      status: (log.status || "pending") as "pending" | "synced" | "failed" | "cancelled",
      rawData: log.rawData ?? null,
      syncedAt: log.syncedAt ?? null,
      createdAt: log.createdAt,
    };
    this.otaReservationLogs.set(id, newLog);
    return newLog;
  }

  async updateOTAReservationLog(id: string, log: Partial<InsertOTAReservationLog>): Promise<OTAReservationLog | undefined> {
    const existing = this.otaReservationLogs.get(id);
    if (!existing) return undefined;
    const updated: OTAReservationLog = { ...existing, ...log } as OTAReservationLog;
    this.otaReservationLogs.set(id, updated);
    return updated;
  }

  async syncOTAReservation(logId: string): Promise<Reservation | undefined> {
    const log = this.otaReservationLogs.get(logId);
    if (!log || log.status === "synced") return undefined;

    const channel = this.otaChannels.get(log.channelId);
    if (!channel) return undefined;

    // Parse guest name
    const nameParts = log.guestName.split(" ");
    const firstName = nameParts[0] || "OTA";
    const lastName = nameParts.slice(1).join(" ") || "Guest";

    // Create or find guest
    let guest = Array.from(this.guests.values()).find(
      (g) => g.firstName === firstName && g.lastName === lastName
    );
    if (!guest) {
      guest = await this.createGuest({
        firstName,
        lastName,
        email: null,
        phone: null,
        documentType: null,
        documentNumber: null,
        nationality: null,
      });
    }

    // Find room type by name or use first available
    let roomType = Array.from(this.roomTypes.values()).find(
      (rt) => rt.name === log.roomTypeName
    );
    if (!roomType) {
      roomType = Array.from(this.roomTypes.values())[0];
    }

    // Find available room
    const availableRoom = Array.from(this.rooms.values()).find(
      (r) => r.roomTypeId === roomType!.id && r.status === "available"
    );
    if (!availableRoom) return undefined;

    // Calculate nights
    const checkIn = new Date(log.checkInDate);
    const checkOut = new Date(log.checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Create reservation
    const reservation = await this.createReservation({
      reservationCode: this.generateReservationCode(),
      guestId: guest.id,
      roomTypeId: roomType!.id,
      roomId: availableRoom.id,
      ratePlanId: null,
      checkInDate: log.checkInDate,
      checkOutDate: log.checkOutDate,
      nights,
      baseRatePerNight: log.netAmount ? (parseFloat(log.netAmount) / nights).toFixed(2) : null,
      discountType: "none",
      discountValue: "0",
      finalRatePerNight: log.netAmount ? (parseFloat(log.netAmount) / nights).toFixed(2) : null,
      totalRoomAmount: log.netAmount,
      status: "confirmed",
      source: channel.channelType as any,
      otaChannelId: channel.id,
      externalReservationId: log.externalReservationId,
      numberOfGuests: 1,
      notes: `Reserva importada de ${channel.name}`,
      createdAt: new Date().toISOString(),
      lastModifiedBy: null,
    });

    // Update log
    await this.updateOTAReservationLog(logId, {
      status: "synced",
      internalReservationId: reservation.id,
      syncedAt: new Date().toISOString(),
    });

    return reservation;
  }

  // Groups
  generateGroupCode(): string {
    this.groupCounter++;
    return `GRP-${this.groupCounter.toString().padStart(4, "0")}`;
  }

  private async buildGroupWithDetails(group: Group): Promise<GroupWithDetails> {
    const blocks = await this.getGroupBlocks(group.id);
    const links = await this.getGroupReservationLinks(group.id);
    const reservations: ReservationWithDetails[] = [];
    
    for (const link of links) {
      const res = await this.getReservation(link.reservationId);
      if (res) reservations.push(res);
    }

    const totalRooms = blocks.reduce((sum, b) => sum + b.quantity, 0);
    const assignedRooms = reservations.length;

    return {
      ...group,
      blocks,
      reservations,
      totalRooms,
      assignedRooms,
    };
  }

  async getGroups(): Promise<GroupWithDetails[]> {
    const groups = Array.from(this.groups.values());
    const result: GroupWithDetails[] = [];
    for (const group of groups) {
      result.push(await this.buildGroupWithDetails(group));
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getGroup(id: string): Promise<GroupWithDetails | undefined> {
    const group = this.groups.get(id);
    if (!group) return undefined;
    return this.buildGroupWithDetails(group);
  }

  async createGroup(group: InsertGroup): Promise<Group> {
    const id = randomUUID();
    const newGroup: Group = {
      id,
      groupCode: group.groupCode,
      name: group.name,
      contactName: group.contactName ?? null,
      contactPhone: group.contactPhone ?? null,
      contactEmail: group.contactEmail ?? null,
      eventDate: group.eventDate ?? null,
      checkInDate: group.checkInDate,
      checkOutDate: group.checkOutDate,
      status: (group.status ?? "tentative") as Group["status"],
      releaseDate: group.releaseDate ?? null,
      notes: group.notes ?? null,
      createdAt: group.createdAt,
      createdBy: group.createdBy ?? null,
    };
    this.groups.set(id, newGroup);
    return newGroup;
  }

  async updateGroup(id: string, group: Partial<InsertGroup>): Promise<Group | undefined> {
    const existing = this.groups.get(id);
    if (!existing) return undefined;
    const updated: Group = { ...existing, ...group } as Group;
    this.groups.set(id, updated);
    return updated;
  }

  async deleteGroup(id: string): Promise<boolean> {
    // Delete all associated blocks and links
    Array.from(this.groupRoomBlocks.values())
      .filter(b => b.groupId === id)
      .forEach(b => this.groupRoomBlocks.delete(b.id));
    Array.from(this.groupReservationLinks.values())
      .filter(l => l.groupId === id)
      .forEach(l => this.groupReservationLinks.delete(l.id));
    return this.groups.delete(id);
  }

  // Group Room Blocks
  async getGroupBlocks(groupId: string): Promise<GroupRoomBlockWithDetails[]> {
    const blocks = Array.from(this.groupRoomBlocks.values()).filter(b => b.groupId === groupId);
    return blocks.map(block => {
      const roomType = this.roomTypes.get(block.roomTypeId);
      const ratePlan = block.ratePlanId ? this.ratePlans.get(block.ratePlanId) : undefined;
      return {
        ...block,
        roomType: roomType!,
        ratePlan,
      };
    });
  }

  async createGroupBlock(block: InsertGroupRoomBlock): Promise<GroupRoomBlock> {
    const id = randomUUID();
    const newBlock: GroupRoomBlock = {
      id,
      groupId: block.groupId,
      roomTypeId: block.roomTypeId,
      quantity: block.quantity,
      ratePlanId: block.ratePlanId ?? null,
      agreedRate: block.agreedRate ?? null,
      blockCheckInDate: block.blockCheckInDate ?? null,
      blockCheckOutDate: block.blockCheckOutDate ?? null,
    };
    this.groupRoomBlocks.set(id, newBlock);
    return newBlock;
  }

  async updateGroupBlock(id: string, block: Partial<InsertGroupRoomBlock>): Promise<GroupRoomBlock | undefined> {
    const existing = this.groupRoomBlocks.get(id);
    if (!existing) return undefined;
    const updated: GroupRoomBlock = { ...existing, ...block } as GroupRoomBlock;
    this.groupRoomBlocks.set(id, updated);
    return updated;
  }

  async deleteGroupBlock(id: string): Promise<boolean> {
    return this.groupRoomBlocks.delete(id);
  }

  // Group Reservation Links
  async getGroupReservationLinks(groupId: string): Promise<GroupReservationLink[]> {
    return Array.from(this.groupReservationLinks.values()).filter(l => l.groupId === groupId);
  }

  async createGroupReservationLink(link: InsertGroupReservationLink): Promise<GroupReservationLink> {
    const id = randomUUID();
    const newLink: GroupReservationLink = {
      id,
      groupId: link.groupId,
      reservationId: link.reservationId,
    };
    this.groupReservationLinks.set(id, newLink);
    return newLink;
  }

  async assignRoomToGroup(
    groupId: string, 
    roomId: string, 
    guestFirstName: string, 
    guestLastName: string,
    options?: {
      checkInDate?: string;
      checkOutDate?: string;
      agreedRate?: string;
      ratePlanId?: string | null;
    }
  ): Promise<Reservation | undefined> {
    const group = this.groups.get(groupId);
    if (!group) return undefined;

    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    // Create guest for this room assignment
    const guest = await this.createGuest({
      firstName: guestFirstName,
      lastName: guestLastName,
      email: null,
      phone: null,
      documentType: null,
      documentNumber: null,
      nationality: null,
    });

    // Find matching block for defaults
    const blocks = await this.getGroupBlocks(groupId);
    const matchingBlock = blocks.find(b => b.roomTypeId === room.roomTypeId);

    // Use provided values or fall back to block values or group values
    const checkInDate = options?.checkInDate || matchingBlock?.blockCheckInDate || group.checkInDate;
    const checkOutDate = options?.checkOutDate || matchingBlock?.blockCheckOutDate || group.checkOutDate;
    const agreedRate = options?.agreedRate || matchingBlock?.agreedRate || "0";
    const ratePlanId = options?.ratePlanId !== undefined ? options.ratePlanId : (matchingBlock?.ratePlanId || null);

    // Calculate nights
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Create reservation
    const reservation = await this.createReservation({
      reservationCode: `G${group.groupCode}-${room.roomNumber}`,
      guestId: guest.id,
      roomTypeId: room.roomTypeId,
      roomId: room.id,
      ratePlanId,
      checkInDate,
      checkOutDate,
      nights,
      baseRatePerNight: agreedRate,
      discountType: "none",
      discountValue: "0",
      finalRatePerNight: agreedRate,
      totalRoomAmount: (parseFloat(agreedRate) * nights).toFixed(2),
      status: "confirmed",
      source: "empresa",
      otaChannelId: null,
      externalReservationId: null,
      numberOfGuests: 1,
      notes: `Grupo: ${group.name}`,
      createdAt: new Date().toISOString(),
      lastModifiedBy: null,
    });

    // Create link
    await this.createGroupReservationLink({
      groupId,
      reservationId: reservation.id,
    });

    return reservation;
  }
}

export const storage = new MemStorage();
