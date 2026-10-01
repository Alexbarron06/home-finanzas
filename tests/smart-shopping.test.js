import test from 'node:test';
import assert from 'node:assert/strict';
import {cartBreakdown,budgetMessages,consumptionEstimate,demoSmartCommand,itemTotal,totalFromUnitPrice,unitPriceFromTotal} from '../src/smart-shopping.js';

const base=()=>({
 household:{id:'home'},
 funds:[{id:'salary',name:'Nómina',kind:'salary'},{id:'voucher',name:'Vales',kind:'voucher'},{id:'service',name:'Servicios',kind:'service'}],
 products:[{id:'rice',name:'Arroz',category:'Despensa',unit:'paquete',on_hand:0,minimum:1,target:2,usual_purchase_quantity:1,estimated_unit_price_cents:4500,usual_fund_id:'salary',version:1}],
 shopping_items:[],shopping_lists:[],purchases:[],expense_items:[],product_price_history:[],expenses:[],inventory_events:[]
});

test('sync suggests a finished product once and does not deduct funds',()=>{
 const data=base();demoSmartCommand(data,'sync',{});demoSmartCommand(data,'sync',{});
 assert.equal(data.shopping_items.length,1);
 assert.equal(data.shopping_items[0].state,'suggested');
 assert.equal(data.shopping_items[0].priority,'necessary');
 assert.equal(data.expenses.length,0);
});

test('cart keeps salary and vouchers separated and warns only the depleted fund',()=>{
 const data=base();
 data.shopping_items=[
  {state:'in_cart',fund_id:'salary',quantity:1,unit_price_cents:55000},
  {state:'in_cart',fund_id:'voucher',quantity:2,unit_price_cents:14800}
 ];
 const available={salary:95700,voucher:20000};
 const result=cartBreakdown(data,fund=>({available:available[fund.id]}));
 assert.deepEqual(result.byFund.map(row=>row.fund.id),['salary','voucher']);
 assert.equal(result.total,84600);assert.equal(result.byFund[0].spent,55000);assert.equal(result.byFund[1].spent,29600);
 assert.match(budgetMessages(result).join(' '),/Vales/);
});

test('an explicit total is exact and keeps a useful unit price',()=>{
 assert.equal(unitPriceFromTotal(3,5000),1667);
 assert.equal(totalFromUnitPrice(3,1667),5001);
 assert.equal(itemTotal({quantity:3,unit_price_cents:1667,total_price_cents:5000}),5000);
 assert.equal(itemTotal({quantity:3,estimated_unit_price_cents:1667,estimated_total_price_cents:5000},true),5000);
});

test('checkout is idempotent and updates item detail and stock once',()=>{
 const data=base();demoSmartCommand(data,'sync',{});const item=data.shopping_items[0];
 demoSmartCommand(data,'add_suggested',{id:item.id});
 demoSmartCommand(data,'edit',{id:item.id,version:item.version,quantity:1,unit_price_cents:4700,estimated_unit_price_cents:4500,fund_id:'salary',payment_method:'card',state:'in_cart'});
 const payload={id:'purchase-1',purchased_on:'2026-09-28',merchant:'Mercado',total_cents:4700,lines:[{id:item.id,version:item.version}]};
 demoSmartCommand(data,'checkout',payload);demoSmartCommand(data,'checkout',payload);
 assert.equal(data.expenses.length,1);assert.equal(data.expense_items.length,1);assert.equal(data.product_price_history.length,1);
 assert.equal(data.products[0].on_hand,1);assert.equal(item.state,'purchased');assert.equal(itemTotal(item),4700);
});

test('consumption estimate uses inventory history without an external model',()=>{
 const product={id:'milk',on_hand:2};
 const events=[{product_id:'milk',delta:-1,created_at:'2026-09-14T00:00:00Z'},{product_id:'milk',delta:-1,created_at:'2026-09-21T00:00:00Z'}];
 assert.equal(consumptionEstimate(product,events).daysLeft,7);
});

test('finishing a product sets stock to zero and plans the chosen quantity once',()=>{
 const data=base();data.products[0].on_hand=1;data.products[0].usual_purchase_quantity=3;
 demoSmartCommand(data,'finish_and_plan',{id:'rice',version:1,add_to_list:true,quantity:5});
 assert.equal(data.products[0].on_hand,0);
 assert.equal(data.inventory_events.at(-1).delta,-1);
 assert.equal(data.shopping_items.length,1);
 assert.equal(data.shopping_items[0].quantity,5);
 assert.equal(data.shopping_items[0].state,'planned');
 assert.equal(data.shopping_items[0].priority,'necessary');
 assert.equal(data.expenses.length,0);
});
