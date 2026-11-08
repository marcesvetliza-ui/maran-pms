import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { prepareSimulatedChange, decideSimulatedChange, invalidateChange } from '../../services/programming-assistant/change-workflow';
import type { SupportTicket } from '../../shared/programming-support';
const revision='a'.repeat(40);
function fixture(){const ticket={id:randomUUID(),version:revision,status:'proposal_ready',reportId:randomUUID(),report:{summary:'simulated'}} as SupportTicket;ticket.changeCandidate=prepareSimulatedChange(ticket);return ticket;}
function decision(ticket:SupportTicket){return {requestId:randomUUID(),candidateId:ticket.changeCandidate!.id,digest:ticket.changeCandidate!.digest,reportId:ticket.reportId!,decision:'approve' as const,comment:'Revisado'};}
it('records one simulated approval on repeated requests without marking the case resolved',()=>{
 const ticket=fixture(),body=decision(ticket);decideSimulatedChange(ticket,body,'marcelo',revision);decideSimulatedChange(ticket,body,'marcelo',revision);
 expect(ticket.changeCandidate!.status).toBe('approved_simulation');expect(ticket.workflowEvents).toHaveLength(1);expect(ticket.status).toBe('proposal_ready');
 expect(()=>decideSimulatedChange(ticket,{...body,decision:'reject'},'marcelo',revision)).toThrow('Identificador');
 expect(()=>decideSimulatedChange(ticket,{...body,reportId:randomUUID()},'marcelo',revision)).toThrow('Identificador');
});
it.each(['diff','revision','report','digest','candidate','new_message'])('rejects stale or tampered proposals: %s',kind=>{
 const ticket=fixture(),body=decision(ticket);
 if(kind==='diff')ticket.changeCandidate!.diff+='changed';
 if(kind==='revision')ticket.version='b'.repeat(40);
 if(kind==='report')ticket.reportId=randomUUID();
 if(kind==='digest')body.digest='0'.repeat(64);
 if(kind==='candidate')body.candidateId=randomUUID();
 if(kind==='new_message')invalidateChange(ticket,'owner');
 expect(()=>decideSimulatedChange(ticket,body,'marcelo',revision)).toThrow();
 expect(ticket.changeCandidate!.status).not.toBe('approved_simulation');
});
it('new information invalidates approval while retaining its audit',()=>{
 const ticket=fixture();decideSimulatedChange(ticket,decision(ticket),'marcelo',revision);invalidateChange(ticket,'owner');
 expect(ticket.changeCandidate!.status).toBe('invalidated');expect(ticket.workflowEvents!.map(event=>event.kind)).toEqual(['approve','invalidated']);
});
