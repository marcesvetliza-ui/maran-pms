import {
  type User,
  type InsertUser,
  type Room,
  type InsertRoom,
  type RoomType,
  type InsertRoomType,
  type Guest,
  type InsertGuest,
  type Reservation,
  type InsertReservation,
  type RoomWithType,
  type ReservationWithDetails,
  type RoomStatus,
  type ReservationStatus,
  type PlanningData,
  type PlanningCellStatus,
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

  // Rooms
  getRooms(): Promise<RoomWithType[]>;
  getRoom(id: string): Promise<RoomWithType | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, room: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;

  // Guests
  getGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | undefined>;
  createGuest(guest: InsertGuest): Promise<Guest>;
  updateGuest(id: string, guest: Partial<InsertGuest>): Promise<Guest | undefined>;
  deleteGuest(id: string): Promise<boolean>;

  // Reservations
  getReservations(): Promise<ReservationWithDetails[]>;
  getReservation(id: string): Promise<ReservationWithDetails | undefined>;
  getRecentReservations(limit: number): Promise<ReservationWithDetails[]>;
  getReservationsForCheckIn(): Promise<ReservationWithDetails[]>;
  getReservationsForCheckOut(): Promise<ReservationWithDetails[]>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, reservation: Partial<InsertReservation>): Promise<Reservation | undefined>;
  deleteReservation(id: string): Promise<boolean>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalRooms: number;
    availableRooms: number;
    occupiedRooms: number;
    cleaningRooms: number;
    maintenanceRooms: number;
    todayCheckIns: number;
    todayCheckOuts: number;
    occupancyRate: number;
    totalGuests: number;
    pendingReservations: number;
  }>;

  // Planning
  getPlanningData(startDate: string, endDate: string): Promise<PlanningData>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private roomTypes: Map<string, RoomType>;
  private rooms: Map<string, Room>;
  private guests: Map<string, Guest>;
  private reservations: Map<string, Reservation>;

  constructor() {
    this.users = new Map();
    this.roomTypes = new Map();
    this.rooms = new Map();
    this.guests = new Map();
    this.reservations = new Map();

    // Seed with demo data
    this.seedData();
  }

  private seedData() {
    // Create room types
    const roomTypes: RoomType[] = [
      { id: "rt1", name: "Individual", description: "Habitación individual con cama simple", basePrice: "50.00", capacity: 1 },
      { id: "rt2", name: "Doble", description: "Habitación doble con cama matrimonial", basePrice: "80.00", capacity: 2 },
      { id: "rt3", name: "Suite", description: "Suite de lujo con sala y jacuzzi", basePrice: "150.00", capacity: 4 },
      { id: "rt4", name: "Familiar", description: "Habitación familiar con dos camas dobles", basePrice: "120.00", capacity: 4 },
    ];
    roomTypes.forEach((rt) => this.roomTypes.set(rt.id, rt));

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

    // Create guests
    const guests: Guest[] = [
      { id: "g1", firstName: "Carlos", lastName: "García", email: "carlos.garcia@email.com", phone: "+54 11 4567-8901", documentType: "dni", documentNumber: "30456789", nationality: "Argentina", address: "Av. Corrientes 1234, CABA" },
      { id: "g2", firstName: "María", lastName: "López", email: "maria.lopez@email.com", phone: "+54 11 5678-9012", documentType: "dni", documentNumber: "28765432", nationality: "Argentina", address: "Calle Florida 567, CABA" },
      { id: "g3", firstName: "John", lastName: "Smith", email: "john.smith@email.com", phone: "+1 555 123-4567", documentType: "passport", documentNumber: "US123456", nationality: "Estados Unidos", address: "123 Main St, New York" },
      { id: "g4", firstName: "Ana", lastName: "Martínez", email: "ana.martinez@email.com", phone: "+54 11 6789-0123", documentType: "dni", documentNumber: "35678901", nationality: "Argentina", address: "Av. Santa Fe 890, CABA" },
      { id: "g5", firstName: "Roberto", lastName: "Fernández", email: "roberto.f@email.com", phone: "+54 11 7890-1234", documentType: "dni", documentNumber: "32109876", nationality: "Argentina", address: "Callao 456, CABA" },
      { id: "g6", firstName: "Laura", lastName: "Pérez", email: "laura.p@email.com", phone: "+54 11 8901-2345", documentType: "dni", documentNumber: "29876543", nationality: "Argentina", address: "Av. Libertador 123, CABA" },
      { id: "g7", firstName: "Diego", lastName: "Ramírez", email: "diego.r@email.com", phone: "+54 11 9012-3456", documentType: "dni", documentNumber: "31234567", nationality: "Argentina", address: "Av. Belgrano 456, CABA" },
      { id: "g8", firstName: "Sophie", lastName: "Martin", email: "sophie.m@email.com", phone: "+33 1 2345 6789", documentType: "passport", documentNumber: "FR789012", nationality: "Francia", address: "15 Rue de Paris, Lyon" },
    ];
    guests.forEach((g) => this.guests.set(g.id, g));

    // Create reservations with varied dates
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    
    const reservations: Reservation[] = [
      { id: "res1", guestId: "g1", roomId: "r3", checkInDate: today, checkOutDate: tomorrow, status: "checked_in", numberOfGuests: 2, totalAmount: "160.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res2", guestId: "g2", roomId: "r15", checkInDate: today, checkOutDate: nextWeek, status: "checked_in", numberOfGuests: 3, totalAmount: "1050.00", notes: "VIP - Aniversario", createdAt: new Date().toISOString() },
      { id: "res3", guestId: "g3", roomId: "r28", checkInDate: today, checkOutDate: in3Days, status: "checked_in", numberOfGuests: 2, totalAmount: "450.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res4", guestId: "g4", roomId: "r45", checkInDate: today, checkOutDate: dayAfter, status: "checked_in", numberOfGuests: 4, totalAmount: "240.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res5", guestId: "g5", roomId: "r6", checkInDate: today, checkOutDate: tomorrow, status: "confirmed", numberOfGuests: 2, totalAmount: "150.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res6", guestId: "g6", roomId: "r1", checkInDate: tomorrow, checkOutDate: in5Days, status: "pending", numberOfGuests: 1, totalAmount: "200.00", notes: "Llegada tardía", createdAt: new Date().toISOString() },
      { id: "res7", guestId: "g7", roomId: "r10", checkInDate: dayAfter, checkOutDate: nextWeek, status: "confirmed", numberOfGuests: 2, totalAmount: "400.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res8", guestId: "g8", roomId: "r20", checkInDate: in3Days, checkOutDate: in10Days, status: "pending", numberOfGuests: 2, totalAmount: "560.00", notes: "Turista francés", createdAt: new Date().toISOString() },
      { id: "res9", guestId: "g1", roomId: "r35", checkInDate: in5Days, checkOutDate: in10Days, status: "confirmed", numberOfGuests: 2, totalAmount: "400.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res10", guestId: "g2", roomId: "r50", checkInDate: tomorrow, checkOutDate: in3Days, status: "confirmed", numberOfGuests: 3, totalAmount: "240.00", notes: null, createdAt: new Date().toISOString() },
    ];
    reservations.forEach((r) => this.reservations.set(r.id, r));
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
    const user: User = { ...insertUser, id };
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
    const newRoomType: RoomType = { ...roomType, id };
    this.roomTypes.set(id, newRoomType);
    return newRoomType;
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
      status: insertRoom.status ?? "available",
      notes: insertRoom.notes ?? null,
    };
    this.rooms.set(id, room);
    return room;
  }

  async updateRoom(id: string, updates: Partial<InsertRoom>): Promise<Room | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    const updatedRoom: Room = { ...room, ...updates };
    this.rooms.set(id, updatedRoom);
    return updatedRoom;
  }

  async deleteRoom(id: string): Promise<boolean> {
    return this.rooms.delete(id);
  }

  // Guests
  async getGuests(): Promise<Guest[]> {
    return Array.from(this.guests.values());
  }

  async getGuest(id: string): Promise<Guest | undefined> {
    return this.guests.get(id);
  }

  async createGuest(insertGuest: InsertGuest): Promise<Guest> {
    const id = randomUUID();
    const guest: Guest = { 
      id,
      firstName: insertGuest.firstName,
      lastName: insertGuest.lastName,
      email: insertGuest.email ?? null,
      phone: insertGuest.phone ?? null,
      documentType: insertGuest.documentType ?? null,
      documentNumber: insertGuest.documentNumber ?? null,
      nationality: insertGuest.nationality ?? null,
      address: insertGuest.address ?? null,
    };
    this.guests.set(id, guest);
    return guest;
  }

  async updateGuest(id: string, updates: Partial<InsertGuest>): Promise<Guest | undefined> {
    const guest = this.guests.get(id);
    if (!guest) return undefined;
    const updatedGuest: Guest = { ...guest, ...updates };
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

    return {
      ...reservation,
      guest: guest!,
      room: room ? { ...room, roomType } : undefined as any,
    };
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

  async createReservation(insertReservation: InsertReservation): Promise<Reservation> {
    const id = randomUUID();
    const reservation: Reservation = { 
      id,
      guestId: insertReservation.guestId,
      roomId: insertReservation.roomId,
      checkInDate: insertReservation.checkInDate,
      checkOutDate: insertReservation.checkOutDate,
      status: insertReservation.status ?? "pending",
      numberOfGuests: insertReservation.numberOfGuests ?? 1,
      totalAmount: insertReservation.totalAmount ?? null,
      notes: insertReservation.notes ?? null,
      createdAt: insertReservation.createdAt || new Date().toISOString(),
    };
    this.reservations.set(id, reservation);
    return reservation;
  }

  async updateReservation(id: string, updates: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    const updatedReservation: Reservation = { ...reservation, ...updates };
    this.reservations.set(id, updatedReservation);
    return updatedReservation;
  }

  async deleteReservation(id: string): Promise<boolean> {
    return this.reservations.delete(id);
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
    const cleaningRooms = rooms.filter((r) => r.status === "cleaning").length;
    const maintenanceRooms = rooms.filter((r) => r.status === "maintenance").length;

    const todayCheckIns = reservations.filter(
      (r) => r.checkInDate === today && (r.status === "confirmed" || r.status === "pending")
    ).length;
    const todayCheckOuts = reservations.filter(
      (r) => r.checkOutDate === today && r.status === "checked_in"
    ).length;

    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const totalGuests = guests.length;
    const pendingReservations = reservations.filter((r) => r.status === "pending").length;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      cleaningRooms,
      maintenanceRooms,
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
}

export const storage = new MemStorage();
