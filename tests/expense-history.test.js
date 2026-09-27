import test from 'node:test';
import assert from 'node:assert/strict';
import { expensesByFund } from '../src/expense-history.js';

test('expense history is separated by fund, sorted and totaled', () => {
  const funds = [
    {id:'salary',name:'Nómina'},
    {id:'voucher',name:'Vales'},
  ];
  const expenses = [
    {id:'a',fund_id:'salary',occurred_on:'2026-09-20',amount_cents:10000},
    {id:'b',fund_id:'voucher',occurred_on:'2026-09-22',amount_cents:25000},
    {id:'c',fund_id:'salary',occurred_on:'2026-09-25',amount_cents:5000},
  ];

  const history = expensesByFund(funds, expenses);

  assert.deepEqual(history.map(x => x.fund.name), ['Nómina', 'Vales']);
  assert.deepEqual(history[0].movements.map(x => x.id), ['c', 'a']);
  assert.equal(history[0].total_cents, 15000);
  assert.deepEqual(history[1].movements.map(x => x.id), ['b']);
  assert.equal(history[1].total_cents, 25000);
});

test('funds without expenses remain visible with a zero total', () => {
  const [history] = expensesByFund([{id:'voucher',name:'Vales'}], []);

  assert.deepEqual(history.movements, []);
  assert.equal(history.total_cents, 0);
});
