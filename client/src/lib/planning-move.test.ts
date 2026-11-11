import { expect, it } from 'vitest';
import { planningMoveDates } from './planning-move';
it('keeps the whole stay unchanged when dragging a continuation night to another room',()=>{
 expect(planningMoveDates('2026-11-10','2026-11-13','2026-11-11','2026-11-11')).toEqual({checkIn:'2026-11-10',checkOut:'2026-11-13',dateChanged:false});
});
it('shifts both dates by the dragged-cell distance rather than using the drop as arrival',()=>{
 expect(planningMoveDates('2026-11-10','2026-11-13','2026-11-11','2026-11-12')).toEqual({checkIn:'2026-11-11',checkOut:'2026-11-14',dateChanged:true});
});
it('supports a stay that starts before the visible calendar and backwards moves across months',()=>{
 expect(planningMoveDates('2026-10-28','2026-11-05','2026-11-03','2026-11-01')).toEqual({checkIn:'2026-10-26',checkOut:'2026-11-03',dateChanged:true});
});
