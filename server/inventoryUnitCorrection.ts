import {hasPermission} from './permissions';
/** Temporary catalogue cleanup authorised on 2026-11-04.
 * Set enabled=false and redeploy to restore the normal historical-unit lock.
 * No automatic expiry: the operator will request closure after the cleanup.
 */
export const inventoryUnitCorrectionWindow = {enabled:true};
export const canCorrectInventoryUnit = (role:unknown) => inventoryUnitCorrectionWindow.enabled && typeof role==='string' && hasPermission(role,'api:inventory:catalog');
