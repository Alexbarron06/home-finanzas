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
test('deposits add funds and weekly allocations reduce them once',()=>{
 const fund={id:'salary',opening_cents:600000};
 const deposits=[{fund_id:'salary',amount_cents:600000}];
 const allocations=[{amount_cents:326700}];
 assert.deepEqual(summary(fund,[],[],undefined,deposits,allocations),{spent:0,deposited:600000,allocated:326700,reserved:0,balance:873300,available:873300});
});

test('a new fund period starts from its declared balance without carrying prior activity',()=>{
 const fund={id:'salary',opening_cents:600000,starts_on:'2026-09-29'};
 const expenses=[
  {id:'old',fund_id:'salary',amount_cents:300000,occurred_on:'2026-09-28',reservation_id:'paid-old'},
  {id:'current',fund_id:'salary',amount_cents:50000,occurred_on:'2026-09-29'},
 ];
 const reservations=[{id:'paid-old',fund_id:'salary',amount_cents:300000,due_on:'2026-09-28'}];
 const deposits=[
  {fund_id:'salary',amount_cents:100000,received_on:'2026-09-28'},
  {fund_id:'salary',amount_cents:200000,received_on:'2026-09-29'},
 ];
 assert.deepEqual(summary(fund,expenses,reservations,'2026-10-14',deposits,[],fund.starts_on),{
  spent:50000,
  deposited:200000,
  allocated:0,
  reserved:0,
  balance:750000,
  available:750000,
 });
});
