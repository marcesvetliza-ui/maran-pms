import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {calendarEffective} from '@shared/rate-calendar';
import {RateMonthGrid} from './rate-month-grid';
afterEach(cleanup);
const cells=['2026-11-14','2026-11-15','2026-11-16'].map(date=>calendarEffective({id:'p',base_rate:'100.90',currency:'ARS',rate_1pax:'150.50',rate_2pax:'170.25'},date));
const props={month:'2026-11-01',cells,range:{from:'',to:''},canEdit:true,onMonth:vi.fn(),onRange:vi.fn(),occupancy:'2'};
it('shows the selected occupancy amount and normalizes a reversed inclusive range',()=>{
 const onRange=vi.fn();render(<RateMonthGrid {...props} onRange={onRange}/>);
 const end=screen.getByRole('button',{name:/2026-11-16:/});expect(end).toHaveTextContent('170,25');
 fireEvent.click(end);fireEvent.click(screen.getByRole('button',{name:/2026-11-14:/}));
 expect(onRange.mock.calls).toEqual([['2026-11-16','2026-11-16'],['2026-11-14','2026-11-16']]);
});
it('does not substitute a scalar rate when an occupancy price is missing and disables unreceived days',()=>{
 render(<RateMonthGrid {...props} occupancy="4"/>);
 expect(screen.getByRole('button',{name:/2026-11-14:/})).toHaveTextContent('Sin precio');
 expect(screen.getByRole('button',{name:/2026-11-17:/})).toBeDisabled();
});
it('preserves read-only consultation without allowing date edits',()=>{
 const onRange=vi.fn();render(<RateMonthGrid {...props} canEdit={false} onRange={onRange}/>);
 fireEvent.click(screen.getByRole('button',{name:/2026-11-14:/}));expect(onRange).not.toHaveBeenCalled();
});
