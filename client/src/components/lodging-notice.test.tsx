import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {LodgingNotice} from './lodging-notice';
afterEach(cleanup);
it('makes estimated history, unknown prices and forecast distinct from actual income',()=>{
 render(<LodgingNotice report={{advertencias:{estimatedNights:3,missingRateNights:2,overlappingRoomNights:0,occupiedBlockedNights:0,invalidStays:0,unassignedReservations:0},proyeccion:{revenue:1234.5,roomNights:4}}}/>);
 expect(screen.getByText(/3 noches antiguas/)).toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('ingresos son parciales');expect(screen.getByText(/Reservas por venir: 4 noches/)).toHaveTextContent('1.234,50');
});
it('does not present valid free stays as unknown prices',()=>{render(<LodgingNotice report={{advertencias:{missingRateNights:0,estimatedNights:0}}}/>);expect(screen.queryByRole('alert')).not.toBeInTheDocument();});
it('shows conflicts for review without disguising them as rounding errors',()=>{render(<LodgingNotice report={{advertencias:{overlappingRoomNights:1,occupiedBlockedNights:2,invalidStays:0,unassignedReservations:3}}}/>);expect(screen.getByRole('alert')).toHaveTextContent('1 superposiciones');});
