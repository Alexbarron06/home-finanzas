import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cents,summary,periodAt,validateExpense} from '../src/finance.js';
test('money uses exact cents and rejects ambiguous input',()=>{assert.equal(cents('19.99'),1999);for(const n of ['-1','0','2.999','1e3','abc'])assert.throws(()=>cents(n));});
test('settling a reserved bill does not double deduct available funds',()=>{const f={id:'f',opening_cents:100000};const r=[{id:'r',fund_id:'f',amount_cents:20000}];assert.equal(summary(f,[],r).available,80000);const s=summary(f,[{fund_id:'f',amount_cents:20000,reservation_id:'r'}],r);assert.equal(s.available,80000);assert.equal(s.reserved,0);assert.equal(s.balance,80000);});
test('funds are isolated and deficits remain visible',()=>{const s=summary({id:'a',opening_cents:1000},[{fund_id:'b',amount_cents:500}],[{id:'r',fund_id:'a',amount_cents:1500}]);assert.equal(s.available,-500);});
test('voucher cash and pre-reconciliation expenses are rejected',()=>{const f={kind:'voucher',starts_on:'2030-02-01'};assert.throws(()=>validateExpense({method:'cash',description:'x',occurred_on:'2030-02-01'},f));assert.throws(()=>validateExpense({method:'card',description:'x',occurred_on:'2030-01-01'},f));});
test('October 2 belongs to the next period and does not reduce September 25 available',()=>{
 const {startsOn,nextOn}=periodAt('2026-09-14','2026-09-25');
 assert.deepEqual([startsOn,nextOn],['2026-09-14','2026-09-29']);
 const fund={id:'salary',opening_cents:600000};
 const reservations=[{id:'now',fund_id:'salary',amount_cents:140000,due_on:'2026-09-25'}, {id:'next',fund_id:'salary',amount_cents:200000,due_on:'2026-10-02'}];
 assert.deepEqual(summary(fund,[],reservations,nextOn),{spent:0,reserved:140000,balance:600000,available:460000});
 const paid=[{fund_id:'salary',amount_cents:140000,reservation_id:'now'}];
 assert.deepEqual(summary(fund,paid,reservations,nextOn),{spent:140000,reserved:0,balance:460000,available:460000});
 assert.equal(periodAt('2026-09-14','2026-10-02').nextOn,'2026-10-14');
});
