import type { Request } from "express";
import { FundingError, type Actor } from "../contracts";

export const fundingPermissions = ["funding:read","funding:write","funding:historical"] as const;
/** Uses the same administrable role_permissions policy as /permissions/mine.
 * No headers, request body, UI flags or hardcoded privileged roles grant access.
 */
export function sessionFundingActor(req: Request, hasPermission:(role:string,key:string)=>boolean):Actor {
 if(!req.isAuthenticated?.() || req.session?.pending2FA || !req.user?.id || !req.user?.role)
   throw new FundingError("UNAUTHENTICATED","Complete la sesión y la verificación de seguridad.",401);
 return {id:req.user.id,permissions:fundingPermissions.filter(key=>hasPermission(req.user!.role,key))};
}
