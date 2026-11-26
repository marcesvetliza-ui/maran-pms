import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {OtaRoomDetailsSummary} from './ota-room-details';
import type {OtaRoomDetails} from '@shared/otaRoomDetails';
afterEach(cleanup);
const details:OtaRoomDetails={version:1,bookerName:'Booker Alpha',guestNames:['Guest Beta'],guestSource:'room',guestStatus:'imported',bedRequest:{text:'BED PREFERENCE: 2 singoli - 1 matrimoniale alla francese',scope:'booking'},importedBedNotes:null};
it('distinguishes the booker from the per-room guest and makes the ambiguous request readable',()=>{
 render(<OtaRoomDetailsSummary details={details}/>);expect(screen.getByText(/Booker Alpha/)).toBeInTheDocument();expect(screen.getByText(/Guest Beta/)).toBeInTheDocument();expect(screen.getByText(/2 camas individuales/)).toBeInTheDocument();expect(screen.getByText(/confirmá con recepción/i)).toBeInTheDocument();
});
it('shows preserved local details as a review and keeps the housekeeping variant limited to beds',()=>{
 const {rerender}=render(<OtaRoomDetailsSummary details={{...details,guestStatus:'preserved_local'}}/>);expect(screen.getByRole('status')).toHaveTextContent('Se conservaron los datos locales');rerender(<OtaRoomDetailsSummary details={details} bedsOnly/>);expect(screen.queryByText(/Booker Alpha/)).not.toBeInTheDocument();expect(screen.getByText('Pedido de camas del canal')).toBeInTheDocument();
});
