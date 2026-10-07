import {render,screen} from '@testing-library/react';
import {describe,it,expect} from 'vitest';
import {InventoryMovementDetail} from './inventory-movement-detail';
const movement={id:'m1',movementType:'entrada',quantity:'32.290',previousStock:'0.000',newStock:'32.290',createdAt:'2026-10-06T12:35:00Z',notes:'Comprobante 00003-00001234: ingreso completo',sourceType:'purchase_invoice',sourceId:'42',warehouseId:'w1',createdBy:'Operador'};
describe('Detalle de movimiento de inventario',()=>{
 it('muestra origen, depósito, cantidades y vínculo al comprobante exacto',()=>{render(<InventoryMovementDetail movement={movement} warehouses={[{id:'w1',name:'Cocina'}]}/>);expect(screen.getByText('Cocina')).toBeInTheDocument();expect(screen.getByText(movement.notes)).toBeInTheDocument();expect(screen.getByText('0.000 → 32.290')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Abrir comprobante de compra'})).toHaveAttribute('href','/purchase-invoices?invoiceId=42');});
 it('no inventa origen ni comprobantes si no fueron registrados',()=>{render(<InventoryMovementDetail movement={{...movement,sourceType:null,sourceId:null,createdBy:null,warehouseId:null}} warehouses={[]}/>);expect(screen.getAllByText('No registrado').length).toBeGreaterThan(0);expect(screen.queryByRole('link')).not.toBeInTheDocument();});
});
