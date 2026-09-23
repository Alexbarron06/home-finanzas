import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cents,summary,validateExpense} from '../src/finance.js';
test('money uses exact cents and rejects ambiguous input',()=>{assert.equal(cents('19.99'),1999);for(const n of ['-1','0','2.999','1e3','abc'])assert.throws(()=>cents(n));});
test('settling a reserved bill does not double deduct available funds',()=>{const f={id:'f',opening_cents:100000};const r=[{id:'r',fund_id:'f',amount_cents:20000}];assert.equal(summary(f,[],r).available,80000);const s=summary(f,[{fund_id:'f',amount_cents:20000,reservation_id:'r'}],r);assert.equal(s.available,80000);assert.equal(s.reserved,0);assert.equal(s.balance,80000);});
test('funds are isolated and deficits remain visible',()=>{const s=summary({id:'a',opening_cents:1000},[{fund_id:'b',amount_cents:500}],[{id:'r',fund_id:'a',amount_cents:1500}]);assert.equal(s.available,-500);});
test('voucher cash and pre-reconciliation expenses are rejected',()=>{const f={kind:'voucher',starts_on:'2030-02-01'};assert.throws(()=>validateExpense({method:'cash',description:'x',occurred_on:'2030-02-01'},f));assert.throws(()=>validateExpense({method:'card',description:'x',occurred_on:'2030-01-01'},f));});
