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
];

// This map is restricted to the QA installation. It does not alter the role
// catalogue or permissions of an operational hotel.
export function xeniaPmsLocalRole(role: XeniaPmsRole): string {
  return role === "owner" ? "admin" : role === "viewer" ? "xenia_viewer" : role;
}
