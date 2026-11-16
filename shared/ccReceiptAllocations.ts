import { z } from 'zod';
export const CC_REALLOCATE_PERMISSION = 'api:account-movements:reallocate';
export const ccReallocationInput = z.object({
 requestId: z.string().uuid(), version: z.string().regex(/^[a-f0-9]{64}$/),
 reason: z.string().trim().min(3).max(500),
 allocations: z.array(z.object({cargoId:z.string().min(1).max(160),amount:z.string().regex(/^\d{1,10}\.\d{2}$/)}).strict()).max(300),
}).strict();
export type CcReallocationInput = z.infer<typeof ccReallocationInput>;
export type CcAllocationPreview = {
 receiptId:string;receiptNumber:string|null;amount:string;version:string;unallocated:string;
 current:{cargoId:string;amount:string;description:string;date:string}[];
 charges:{id:string;description:string;date:string;reference:string|null;available:string;applied:string}[];
 history:{id:string;user_name:string;timestamp:string;description:string;details:string}[];
};
