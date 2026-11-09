import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import {SupportExecutionDetails} from './support-execution-details';
const base={id:'synthetic-case',status:'failed',execution:{revision:'a'.repeat(40),finishedAt:'2026-11-08T20:00:00Z',outcome:'failed',failureCode:'codex_turn_failed',tokens:0,calls:0,stages:[]}};
it('does not present incomplete provider usage as proof of zero cost',()=>{
 render(<SupportExecutionDetails ticket={{...base,execution:{...base.execution,usageIncomplete:true}} as any}/>);
 expect(screen.getByText(/Tokens registrados \(parcial\)/)).toBeInTheDocument();
 expect(screen.getByText(/no demuestra costo cero/)).toBeInTheDocument();
 expect(screen.getByText(/codex_turn_failed/)).toBeInTheDocument();
});
it('identifies the requested model while explicitly leaving the effective model unverified',()=>{
 render(<SupportExecutionDetails ticket={{...base,investigator:{engine:'codex',requestedModel:'synthetic-test-model',effectiveModel:null,providerTurns:1,inputTokens:0,cachedInputTokens:0,outputTokens:0}} as any}/>);
 expect(screen.getByText(/modelo solicitado: synthetic-test-model/)).toBeInTheDocument();
 expect(screen.getByText(/El SDK no informó la identificación del modelo efectivo/)).toBeInTheDocument();
});
it('shows the effective model reported by Responses',()=>{
 render(<SupportExecutionDetails ticket={{...base,investigator:{engine:'codex',requestedModel:'requested-model',effectiveModel:'reported-model',providerTurns:3,inputTokens:100,cachedInputTokens:0,outputTokens:20}} as any}/>);
 expect(screen.getByText(/Modelo informado: reported-model/)).toBeInTheDocument();
 expect(screen.queryByText(/El SDK no informó/)).not.toBeInTheDocument();
});
