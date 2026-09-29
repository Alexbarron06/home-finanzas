import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthlyServiceSummary, periodServiceSummary, pantryActivity, serviceRecords, serviceType, validateServiceDraft} from '../src/services.js';

test('lists only service reservations and marks their payment', () => {
  const reservations = [
    {id:'water', service_type:'water', due_on:'2026-10-08', weekly_plan_id:null},
    {id:'rent', service_type:null, due_on:'2026-10-01', weekly_plan_id:null},
    {id:'light', service_type:'electricity', due_on:'2026-10-04', weekly_plan_id:null},
  ];
  const expenses = [{id:'paid', reservation_id:'light', occurred_on:'2026-10-04'}];
  const records = serviceRecords(reservations, expenses);
  assert.deepEqual(records.map(row => row.id), ['water', 'light']);
  assert.equal(records[0].paidExpense, null);
  assert.equal(records[1].paidExpense.id, 'paid');
});

test('validates service dates and amount', () => {
  const draft = {service_type:'internet', description:'Internet casa', cutoff_on:'2026-10-01', due_on:'2026-10-10', amount_cents:59900};
  assert.equal(validateServiceDraft(draft), draft);
  assert.throws(() => validateServiceDraft({...draft, due_on:'2026-09-30'}), /anterior/);
  assert.throws(() => validateServiceDraft({...draft, amount_cents:0}), /monto/);
  assert.equal(serviceType('electricity')[1], 'Luz');
});

test('keeps service reservations and payments outside the pantry budget', () => {
  const reservations = [
    {id:'light', service_type:'electricity', amount_cents:80000, due_on:'2026-09-25'},
    {id:'food', service_type:null, amount_cents:40000, due_on:'2026-09-25'},
  ];
  const expenses = [
    {id:'light-paid', reservation_id:'light', amount_cents:80000},
    {id:'groceries', reservation_id:null, amount_cents:50000},
  ];
  const pantry = pantryActivity(reservations, expenses);
  assert.deepEqual(pantry.reservations.map(row => row.id), ['food']);
  assert.deepEqual(pantry.expenses.map(row => row.id), ['groceries']);
});

test('calculates the fixed monthly service budget from bills due that month', () => {
  const reservations = [
    {id:'light', service_type:'electricity', amount_cents:80000, due_on:'2026-09-25', weekly_plan_id:null},
    {id:'phone', service_type:'telephone', amount_cents:50000, due_on:'2026-09-28', weekly_plan_id:null},
    {id:'water', service_type:'water', amount_cents:30000, due_on:'2026-10-02', weekly_plan_id:null},
  ];
  const expenses = [{id:'light-paid', reservation_id:'light', occurred_on:'2026-09-26'}];
  assert.deepEqual(monthlyServiceSummary(200000, reservations, expenses, '2026-09'), {
    budgetCents:200000,
    paidCents:80000,
    pendingCents:50000,
    committedCents:130000,
    availableCents:70000,
  });
});

test('calculates services only inside the active fortnight', () => {
  const reservations = [
    {id:'old', service_type:'water', amount_cents:20000, due_on:'2026-09-28', weekly_plan_id:null},
    {id:'gas', service_type:'gas', amount_cents:28600, due_on:'2026-10-03', weekly_plan_id:null},
    {id:'light', service_type:'electricity', amount_cents:791700, due_on:'2026-10-04', weekly_plan_id:null},
    {id:'next', service_type:'telephone', amount_cents:50000, due_on:'2026-10-14', weekly_plan_id:null},
  ];
  assert.deepEqual(periodServiceSummary(500000, reservations, [], '2026-09-29', '2026-10-14'), {
    budgetCents:500000,
    paidCents:0,
    pendingCents:820300,
    committedCents:820300,
    availableCents:-320300,
  });
});
