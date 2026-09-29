import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceRecords, serviceType, validateServiceDraft} from '../src/services.js';

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
