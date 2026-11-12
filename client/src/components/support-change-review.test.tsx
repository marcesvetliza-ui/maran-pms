import { render,screen,fireEvent } from '@testing-library/react';
import { it,expect,vi } from 'vitest';
import { SupportChangeReview } from './support-change-review';
const candidate={id:'candidate',digest:'digest',reportId:'report',status:'awaiting_review',kind:'simulation',target:'xenia-pilot',baseRevision:'revision',diff:'fictitious',tests:[]};
const ticket={id:'case',status:'proposal_ready',changeCandidate:candidate} as any;
it('shows proposals to the owner without exposing approval controls',()=>{
 render(<SupportChangeReview ticket={ticket} canReview={false} simulation busy={false} onDecision={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'Aprobar simulación'})).not.toBeInTheDocument();
 expect(screen.getByText(/Este cambio es ficticio/)).toBeInTheDocument();
});
it('binds the administrator decision to the exact proposal and report',()=>{
 const onDecision=vi.fn();render(<SupportChangeReview ticket={ticket} canReview simulation busy={false} onDecision={onDecision}/>);
 fireEvent.click(screen.getByRole('button',{name:'Aprobar simulación'}));
 expect(onDecision).toHaveBeenCalledWith({candidateId:'candidate',digest:'digest',reportId:'report',decision:'approve',comment:''});
});
it('does not permit approving an invalidated candidate',()=>{
 render(<SupportChangeReview ticket={{...ticket,changeCandidate:{...candidate,status:'invalidated'}} as any} canReview simulation busy={false} onDecision={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'Aprobar simulación'})).not.toBeInTheDocument();
 expect(screen.getByRole('status')).toHaveTextContent('Propuesta desactualizada');
});
it('lets a reviewer approve preparation without presenting it as deployment authorization',()=>{
 const onDecision=vi.fn();render(<SupportChangeReview ticket={{...ticket,report:{recommendedAction:'code_change'},changeCandidate:{...candidate,kind:'proposal',tests:[{name:'Prueba de mensaje',result:'planned'}]}} as any} canReview simulation={false} proposalReview busy={false} onDecision={onDecision}/>);
 expect(screen.getByText(/Todavía no hay archivos modificados ni pruebas ejecutadas/)).toBeInTheDocument();
 expect(screen.getByText(/pendiente de ejecución/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Aprobar preparación del cambio'}));
 expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({candidateId:'candidate',decision:'approve',digest:'digest'}));
});

it.each(['no_change','verification'])('offers no code approval for a %s report even if an old candidate remains',recommendedAction=>{
 render(<SupportChangeReview ticket={{...ticket,report:{recommendedAction},changeCandidate:{...candidate,kind:'proposal'}} as any} canReview proposalReview simulation={false} busy={false} onDecision={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'Aprobar preparación del cambio'})).not.toBeInTheDocument();
 expect(screen.queryByText('Tu decisión sobre la propuesta')).not.toBeInTheDocument();
});
