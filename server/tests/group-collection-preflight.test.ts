import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),account:vi.fn()}));
vi.mock('../db',()=>({db:{execute:mocks.execute}}));
vi.mock('../billing/groupAccount',()=>({groupAccountSnapshot:mocks.account}));
import {assertNewGroupCollectionPreflight,groupCollectionPreflightIssue} from '../billing/groupCollectionPreflight';
const body=()=>({reservaId:'room',creditOperationId:'original-operation',reservationBillingAction:'collect_and_invoice',prefacturaRecovery:{version:2,payments:[{reservationId:'room',paymentRequestId:'card-payment',amount:'55000.00',method:'tarjeta_credito'}]}});
beforeEach(()=>{vi.resetAllMocks();mocks.account.mockResolvedValue({unassigned:3000000,reviewReceipts:[]});});
describe('group collection preflight',()=>{
  it('returns an editable rejection before creating a journal, invoice or payment',async()=>{
    mocks.execute.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{group_id:'group'}]}).mockResolvedValueOnce({rows:[]});
    const request=body();
    await expect(assertNewGroupCollectionPreflight(request)).rejects.toMatchObject({code:'GROUP_ADVANCE_CHOICE_REQUIRED',safeToReset:true,statusCode:409});
    expect(request.prefacturaRecovery.payments[0]).toMatchObject({method:'tarjeta_credito',amount:'55000.00'});
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });
  it('preserves an existing operation for guarded recovery',async()=>{
    mocks.execute.mockResolvedValueOnce({rows:[{one:1}]});
    await expect(assertNewGroupCollectionPreflight(body())).resolves.toBeUndefined();
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it('does not claim absence of effects when a payment key already exists',async()=>{
    mocks.execute.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{group_id:'group'}]}).mockResolvedValueOnce({rows:[{one:1}]});
    await expect(assertNewGroupCollectionPreflight(body())).resolves.toBeUndefined();
  });
  it('accepts an explicit separate collection without assigning the group advance',async()=>{
    expect(await groupCollectionPreflightIssue({...body(),acknowledgeUnassignedAdvance:true})).toBeNull();
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it('does not interfere with invoice-only or nongroup reservations',async()=>{
    expect(await groupCollectionPreflightIssue({...body(),reservationBillingAction:'invoice_only'})).toBeNull();
    mocks.execute.mockResolvedValueOnce({rows:[]});
    expect(await groupCollectionPreflightIssue(body())).toBeNull();
    expect(mocks.account).not.toHaveBeenCalled();
  });
});
