export function demoData() {
  const today = new Date().toLocaleDateString('en-CA');
  return {
    household: { id:'demo', name:'Hogar de demostración' },
    funds:[{ id:'salary', name:'Nómina', kind:'salary', opening_cents:480000, starts_on:today },{id:'voucher',name:'Vales',kind:'voucher',opening_cents:125000,starts_on:today}],
    expenses:[{id:'example',fund_id:'salary',description:'Compra de ejemplo',category:'Despensa',amount_cents:42550,method:'card',occurred_on:today,created_by:'demo'}],
    products:[], shopping_items:[], inventory_events:[], expense_history:[],
    reservations:[{id:'bill',fund_id:'salary',description:'Servicio de ejemplo',amount_cents:32000,due_on:today}],
  };
}
