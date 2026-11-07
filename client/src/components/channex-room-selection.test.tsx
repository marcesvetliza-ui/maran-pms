import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
import {ChannexRoomSelection} from './channex-room-selection';
afterEach(cleanup);
const rooms=[{id:'301',roomNumber:'301',roomTypeId:'premium',floor:3},{id:'307',roomNumber:'307',roomTypeId:'premium',floor:3},{id:'302',roomNumber:'302',roomTypeId:'exec',floor:3}];
it('saves an explicit room selection without sending the other Premium or another category',async()=>{
 const onSave=vi.fn(),user=userEvent.setup();
 render(<ChannexRoomSelection mapping={{id:'m',channexRoomTypeTitle:'Premium 4',roomTypeId:'premium'}} types={[{id:'premium',name:'Premium'}]} rooms={rooms} disabled={false} onSave={onSave}/>);
 await user.selectOptions(screen.getByLabelText('Alcance de Premium 4'),'specific');
 expect(screen.getByRole('button')).toBeDisabled();
 expect(screen.queryByRole('checkbox',{name:'302'})).not.toBeInTheDocument();
 // The shared PointerEvent shim extends Event; use a native MouseEvent for checkbox activation.
 fireEvent.click(screen.getByRole('checkbox',{name:'301'}));
 expect(screen.getByRole('checkbox',{name:'301'})).toBeChecked();
 expect(screen.getByRole('button')).toBeEnabled();
 await user.click(screen.getByRole('button'));
 expect(onSave).toHaveBeenCalledWith({roomTypeId:'premium',roomIds:['301']});
});
it('preserves whole-category mode explicitly as null and clears room selections when changing category',async()=>{
 const onSave=vi.fn(),user=userEvent.setup();
 render(<ChannexRoomSelection mapping={{id:'m',channexRoomTypeTitle:'Premium 2',roomTypeId:'premium',roomIds:['307']}} types={[{id:'premium',name:'Premium'},{id:'exec',name:'Ejecutiva'}]} rooms={rooms} disabled={false} onSave={onSave}/>);
 expect(screen.getByRole('checkbox',{name:'307'})).toBeChecked();
 await user.selectOptions(screen.getByLabelText('Categoría de Premium 2'),'exec');
 expect(screen.getByRole('button')).toBeDisabled();
 await user.selectOptions(screen.getByLabelText('Alcance de Premium 2'),'category');
 await user.click(screen.getByRole('button'));
 expect(onSave).toHaveBeenCalledWith({roomTypeId:'exec',roomIds:null});
});
