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

    // Create rooms
    const rooms: Room[] = [
      { id: "r1", roomNumber: "101", roomTypeId: "rt1", floor: 1, status: "available", notes: null },
      { id: "r2", roomNumber: "102", roomTypeId: "rt1", floor: 1, status: "available", notes: null },
      { id: "r3", roomNumber: "103", roomTypeId: "rt2", floor: 1, status: "occupied", notes: null },
      { id: "r4", roomNumber: "201", roomTypeId: "rt2", floor: 2, status: "available", notes: null },
      { id: "r5", roomNumber: "202", roomTypeId: "rt2", floor: 2, status: "cleaning", notes: "Limpieza programada" },
      { id: "r6", roomNumber: "203", roomTypeId: "rt3", floor: 2, status: "available", notes: null },
      { id: "r7", roomNumber: "301", roomTypeId: "rt3", floor: 3, status: "occupied", notes: null },
      { id: "r8", roomNumber: "302", roomTypeId: "rt4", floor: 3, status: "maintenance", notes: "Reparación de aire acondicionado" },
      { id: "r9", roomNumber: "303", roomTypeId: "rt4", floor: 3, status: "available", notes: null },
      { id: "r10", roomNumber: "401", roomTypeId: "rt3", floor: 4, status: "available", notes: null },
      { id: "r11", roomNumber: "402", roomTypeId: "rt2", floor: 4, status: "available", notes: null },
      { id: "r12", roomNumber: "403", roomTypeId: "rt1", floor: 4, status: "available", notes: null },
    ];
    rooms.forEach((r) => this.rooms.set(r.id, r));

    // Create guests
    const guests: Guest[] = [
      { id: "g1", firstName: "Carlos", lastName: "García", email: "carlos.garcia@email.com", phone: "+54 11 4567-8901", documentType: "dni", documentNumber: "30456789", nationality: "Argentina", address: "Av. Corrientes 1234, CABA" },
      { id: "g2", firstName: "María", lastName: "López", email: "maria.lopez@email.com", phone: "+54 11 5678-9012", documentType: "dni", documentNumber: "28765432", nationality: "Argentina", address: "Calle Florida 567, CABA" },
      { id: "g3", firstName: "John", lastName: "Smith", email: "john.smith@email.com", phone: "+1 555 123-4567", documentType: "passport", documentNumber: "US123456", nationality: "Estados Unidos", address: "123 Main St, New York" },
      { id: "g4", firstName: "Ana", lastName: "Martínez", email: "ana.martinez@email.com", phone: "+54 11 6789-0123", documentType: "dni", documentNumber: "35678901", nationality: "Argentina", address: "Av. Santa Fe 890, CABA" },
      { id: "g5", firstName: "Roberto", lastName: "Fernández", email: "roberto.f@email.com", phone: "+54 11 7890-1234", documentType: "dni", documentNumber: "32109876", nationality: "Argentina", address: "Callao 456, CABA" },
    ];
    guests.forEach((g) => this.guests.set(g.id, g));

    // Create reservations
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    
    const reservations: Reservation[] = [
      { id: "res1", guestId: "g1", roomId: "r3", checkInDate: today, checkOutDate: tomorrow, status: "checked_in", numberOfGuests: 2, totalAmount: "160.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res2", guestId: "g2", roomId: "r7", checkInDate: today, checkOutDate: nextWeek, status: "checked_in", numberOfGuests: 3, totalAmount: "1050.00", notes: "VIP - Aniversario", createdAt: new Date().toISOString() },
      { id: "res3", guestId: "g3", roomId: "r6", checkInDate: today, checkOutDate: tomorrow, status: "confirmed", numberOfGuests: 2, totalAmount: "150.00", notes: null, createdAt: new Date().toISOString() },
      { id: "res4", guestId: "g4", roomId: "r1", checkInDate: tomorrow, checkOutDate: nextWeek, status: "pending", numberOfGuests: 1, totalAmount: "300.00", notes: "Llegada tardía", createdAt: new Date().toISOString() },
      { id: "res5", guestId: "g5", roomId: "r4", checkInDate: today, checkOutDate: tomorrow, status: "confirmed", numberOfGuests: 2, totalAmount: "80.00", notes: null, createdAt: new Date().toISOString() },
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
}

export const storage = new MemStorage();
