import { afterEach, describe, expect, it, vi } from "vitest";
import { hasMaskedGuestData, matchesMaskedReplay, parseBookingRevision, redactBooking } from "../channex/bookingRevision";
import { archiveBookingNotes, readBookingNotes } from "../channex/bookingPrivate";
afterEach(() => vi.unstubAllEnvs());
const saved = () => ({ id:"r1", attributes:{ property_id:"p1", booking_id:"b1", inserted_at:"2026-11-11T10:00:00Z", status:"new", amount:"144.00", customer:{ name:"Test", mail:"test@example.invalid", phone:"12345", country:"AR", city:null }, notes:"[redacted]", raw_message:"[redacted]" }});
describe("Channex masked guest data", () => {
  it("recognizes a documented contact replay without relaxing financial comparisons", () => {
    const full = saved(), masked = saved();
    masked.attributes.customer.mail = "***"; masked.attributes.customer.phone = "***";
    expect(matchesMaskedReplay(full, masked)).toBe(true);
    masked.attributes.amount = "1.00";
    expect(matchesMaskedReplay(full, masked)).toBe(false);
  });
  it("does not treat null, changed identity or arbitrary masked fields as equivalent", () => {
    const full = saved(), masked: any = saved(); masked.attributes.customer.mail = "***";
    masked.attributes.customer.city = "***";
    expect(matchesMaskedReplay(full, masked)).toBe(false);
    masked.attributes.customer.city = null; masked.attributes.customer.name = "***";
    expect(matchesMaskedReplay(full, masked)).toBe(false);
    expect(matchesMaskedReplay(full, full)).toBe(false);
  });
  it("requires review rather than creating a guest with masked contact details", () => {
    const masked = saved(); masked.attributes.customer.phone = "***";
    expect(hasMaskedGuestData(masked)).toBe(true);
    expect(() => parseBookingRevision(masked, "p1")).toThrow("MASKED_GUEST_DATA");
  });
  it("archives notes encrypted and bound to the property connection and revision", () => {
    vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY", "test-key-with-at-least-thirty-two-characters");
    const raw = { attributes:{ notes:"Llegada a las 22", raw_message:"untrusted card data" }};
    const encrypted = archiveBookingNotes(raw, "c1", "r1")!;
    expect(encrypted).not.toContain("Llegada");
    expect(readBookingNotes(encrypted, "c1", "r1")).toEqual({notes:"Llegada a las 22"});
    expect(() => readBookingNotes(encrypted, "c2", "r1")).toThrow("CHANNEX_PRIVATE_ARCHIVE_UNREADABLE");
    expect(() => readBookingNotes(encrypted, "c1", "r2")).toThrow();
    expect(redactBooking(raw).attributes.notes).toBe("[redacted]");
  });
  it("omits payment-like notes, masked notes and raw messages", () => {
    vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY", "test-key-with-at-least-thirty-two-characters");
    const encrypted = archiveBookingNotes({attributes:{notes:"4111 1111 1111 1111 CVV 123"}}, "c", "r")!;
    expect(readBookingNotes(encrypted,"c","r").notes).toBe("[payment-related note omitted]");
    expect(archiveBookingNotes({attributes:{notes:"***",raw_message:"secret"}},"c","r")).toBeNull();
  });
  it("fails closed before storage when the archive key is missing", () => {
    vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY", "");
    expect(() => archiveBookingNotes({attributes:{notes:"Arrival late"}}, "c", "r")).toThrow("CHANNEX_PRIVATE_ARCHIVE_KEY_UNAVAILABLE");
  });
});
