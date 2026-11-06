import { z } from 'zod';
export const restaurantAreaSettingsSchema = z.object({
 areas:z.array(z.object({id:z.string().min(1),name:z.string().trim().min(1).max(120),expectedName:z.string(),expectedOrder:z.number().int().nullable()})).min(1).max(500),
}).strict().refine(input=>new Set(input.areas.map(area=>area.id)).size===input.areas.length);
export type RestaurantAreaSettings = z.infer<typeof restaurantAreaSettingsSchema>;
