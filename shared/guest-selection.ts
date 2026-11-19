/** For selection lists only. Historical links must still resolve inactive guests.
 * Older partial client records may omit active; only an explicit deactivation hides them.
 */
export function isSelectableGuest(guest: { active?: boolean }): boolean {
  return guest.active !== false;
}
