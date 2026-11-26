export type OtaRoomDetails = {
  version: 1;
  bookerName: string;
  guestNames: string[];
  guestSource: 'room' | 'booker';
  guestStatus: 'imported' | 'preserved_local';
  bedRequest: { text: string; scope: 'room' | 'booking' } | null;
  importedBedNotes: string | null;
};
export function displayOtaBedRequest(text: string) {
  return text.replace(/BED PREFERENCE\s*:/gi, 'Preferencia de camas: ')
    .replace(/\b2 singoli\b/gi, '2 camas individuales')
    .replace(/\b1 matrimoniale alla francese\b/gi, '1 cama matrimonial francesa');
}
