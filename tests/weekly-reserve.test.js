import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedContribution, weeklyReserveStatus } from '../src/weekly-reserve.js';

const plan={first_payment_on:'2026-10-02',reserve_starts_on:'2026-09-29',amount_cents:140000,transition_periods:3,transition_total_cents:980000,regular_contribution_cents:305000};

test('transition spreads seven Friday payments across three periods',()=>{
 assert.deepEqual([0,1,2,3].map(index=>plannedContribution(plan,index)),[326700,326700,326600,305000]);
});

test('reserve starts after September 29 and advances paid Fridays',()=>{
 const before=weeklyReserveStatus(plan,[],'2026-09-27');
 assert.equal(before.balance,0);
 assert.equal(before.nextContributionOn,'2026-09-29');
 assert.equal(before.nextDue,'2026-10-02');
 assert.equal(before.paymentDue,false);

 const active=weeklyReserveStatus(plan,[
  {entry_type:'allocation',effective_on:'2026-09-29',amount_cents:326700},
  {entry_type:'payment',effective_on:'2026-10-02',amount_cents:140000},
 ],'2026-10-03');
 assert.equal(active.balance,186700);
 assert.equal(active.nextDue,'2026-10-09');
 assert.equal(active.nextContributionOn,'2026-10-14');
});
