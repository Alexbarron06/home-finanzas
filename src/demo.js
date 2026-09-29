export function demoData() {
  const today = new Date().toLocaleDateString('en-CA');
  return {
    household: { id:'demo', name:'Hogar de demostración', service_budget_cents:300000 },
    funds:[{ id:'salary', name:'Nómina', kind:'salary', opening_cents:480000, starts_on:today },{id:'voucher',name:'Vales',kind:'voucher',opening_cents:125000,starts_on:today}],
    expenses:[{id:'example',fund_id:'salary',description:'Compra de ejemplo',category:'Despensa',amount_cents:42550,method:'card',occurred_on:today,created_by:'demo'}],
    products:[], shopping_items:[], shopping_lists:[], purchases:[], expense_items:[], product_price_history:[], inventory_events:[], expense_history:[], fund_deposits:[], weekly_payment_entries:[],
    weekly_payment_plans:[{id:'friday-plan',household_id:'demo',fund_id:'salary',name:'Pago de los viernes',amount_cents:140000,reserve_starts_on:'2026-09-29',first_payment_on:'2026-10-02',transition_periods:3,transition_total_cents:980000,regular_contribution_cents:305000,active:true}],
    reservations:[{id:'bill',fund_id:'salary',description:'Luz de casa',service_type:'electricity',service_provider:'CFE',cutoff_on:today,amount_cents:32000,due_on:today,weekly_plan_id:null}],
  };
}
