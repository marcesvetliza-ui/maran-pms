import { storage } from "./db-storage";

export async function audit(
  req: any,
  action: "create" | "update" | "delete" | "login" | "logout" | "export",
  module: string,
  description: string,
  options?: {
    entityType?: string;
    entityId?: string;
    details?: Record<string, any>;
  }
) {
  try {
    await storage.createAuditLog({
      userId: req.user?.id || null,
      userName: req.user?.fullName || req.user?.username || "Sistema",
      action,
      module,
      entityType: options?.entityType || null,
      entityId: options?.entityId || null,
      description,
      details: options?.details ? JSON.stringify(options.details) : null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
