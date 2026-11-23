import type { XeniaPmsRole } from "../../shared/xeniaPms";

declare global {
  namespace Express {
    interface Request {
      // Set only after the central lease, installation and local user agree.
      xeniaPmsAccess?: {
        propertyId: string;
        principalId: string;
        role: XeniaPmsRole;
        operationsEnabled: boolean;
      };
    }
  }
}
export {};
