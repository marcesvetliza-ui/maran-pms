import { ACCOMMODATION_PERMISSION } from "./accommodationPermission";

export type XeniaPmsRole = "owner" | "manager" | "reception" | "viewer";
export type XeniaPmsIdentity = {
  principalId: string;
  username: string;
  name: string;
  propertyId: string;
  propertyName: string;
  clientId: string;
  role: XeniaPmsRole;
};

export const XENIA_QA_READ_RESOURCES = [
  "sidebar:/",
  "sidebar:/planning",
  "sidebar:/reservations",
  "sidebar:/rooms",
  "sidebar:/guests",
  "sidebar:/rate-plans",
];
export const XENIA_QA_WRITE_RESOURCES = [
  ...XENIA_QA_READ_RESOURCES,
  "sidebar:/new-reservation",
  "api:rooms:write",
  "api:rates:write",
  ACCOMMODATION_PERMISSION,
];

export const XENIA_QA_OPERATIONS_RESOURCES = [
  "sidebar:/check-in",
  "sidebar:/check-out",
  "sidebar:/cash-register",
];
export const XENIA_QA_OPERATE_STAY = "api:xenia-qa:operate-stay";

// This map is restricted to the QA installation. It does not alter the role
// catalogue or permissions of an operational hotel.
export function xeniaPmsLocalRole(role: XeniaPmsRole): string {
  return role === "owner" ? "admin" : role === "viewer" ? "xenia_viewer" : role;
}
