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
