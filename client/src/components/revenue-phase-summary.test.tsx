import {render,screen,within,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {RevenuePhaseSummary} from './revenue-phase-summary';
afterEach(cleanup);
it('shows actual and forecast income in separate sections and warns about partial data',()=>{
 render(<RevenuePhaseSummary days={[{actualRoomsSold:2,forecastRoomsSold:3,actualRatedRoomNights:1,forecastRatedRoomNights:3,actualRoomRevenue:100,forecastRoomRevenue:900,actualCapacityNights:4,forecastCapacityNights:6,roomsWithMissingRate:1,estimatedRoomNights:2}]}/>);
 expect(within(screen.getByRole('region',{name:'Alojamiento realizado'})).getByText(/Ingreso realizado/)).toHaveTextContent('100,00');expect(within(screen.getByRole('region',{name:'Reservas por venir'})).getByText(/Ingreso previsto/)).toHaveTextContent('900,00');expect(screen.getByRole('alert')).toHaveTextContent('ingresos parciales');expect(screen.getByText(/incluye 2 noches/)).toBeInTheDocument();
});
