import {pantryFunds} from './finance.js';

export const SMART_ACTIVE = ['suggested','planned','in_cart'];
export const smartItems = data => data.shopping_items.filter(item => SMART_ACTIVE.includes(item.state));
export const itemTotal = (item, projected=false) => {
  const price = projected ? (item.estimated_unit_price_cents ?? item.unit_price_cents) : item.unit_price_cents;
  return price === null || price === undefined ? null : Math.round(Number(item.quantity) * Number(price));
};
export const priorityOrder = {necessary:0,next:1,recurring:2,optional:3};
export const priorityLabel = value => ({necessary:'Necesario',next:'Próximo',recurring:'Recurrente',optional:'Opcional'})[value] || 'Opcional';

export function cartBreakdown(data, fundSummary){
  const cart=smartItems(data).filter(item=>item.state==='in_cart');
  const byFund=pantryFunds(data.funds).map(fund=>{
    const spent=cart.filter(item=>item.fund_id===fund.id).reduce((sum,item)=>sum+(itemTotal(item)||0),0);
    const available=fundSummary(fund).available;
    return {fund,spent,available,after:available-spent};
  });
  return {cart,byFund,total:byFund.reduce((sum,row)=>sum+row.spent,0),available:byFund.reduce((sum,row)=>sum+row.available,0)};
}

export function budgetMessages(breakdown){
  const messages=[];
  for(const row of breakdown.byFund){
    if(row.spent>row.available) messages.push(`Fondos insuficientes en ${row.fund.name}: faltan ${(row.spent-row.available)/100}.`);
    else if(row.spent && row.after<Math.round(row.available*.15)) messages.push(`Esta compra dejaría poco margen en ${row.fund.name}.`);
  }
  if(!messages.length) messages.push('Compra dentro del presupuesto.');
  return messages;
}

export function consumptionEstimate(product, events, today=new Date()){
  const consumption=events.filter(e=>e.product_id===product.id&&Number(e.delta)<0).sort((a,b)=>a.created_at.localeCompare(b.created_at));
  if(consumption.length<2||Number(product.on_hand)<=0)return null;
  const first=new Date(consumption[0].created_at),last=new Date(consumption.at(-1).created_at);
  const days=Math.max(1,(last-first)/86400000);
  const units=consumption.reduce((sum,event)=>sum-Math.min(0,Number(event.delta)),0);
  const perDay=units/days;
  if(!Number.isFinite(perDay)||perDay<=0)return null;
  return {perDay,daysLeft:Math.max(0,Math.ceil(Number(product.on_hand)/perDay)),asOf:today};
}

export function demoSmartCommand(data,action,x){
  data.shopping_lists??=[];data.purchases??=[];data.expense_items??=[];data.product_price_history??=[];
  let list=data.shopping_lists.find(row=>row.status==='active');
  if(!list){list={id:crypto.randomUUID(),household_id:data.household.id,status:'active',created_at:new Date().toISOString()};data.shopping_lists.push(list);}
  const version=row=>{if(!row||row.version!==x.version)throw new Error('La lista cambió. Actualiza.');};
  if(action==='sync'){
    for(const product of data.products){
      if(data.shopping_items.some(item=>item.product_id===product.id&&SMART_ACTIVE.includes(item.state)))continue;
      const ended=Number(product.on_hand)===0&&Number(product.target)>0;
      const low=!ended&&Number(product.on_hand)<=Number(product.minimum)&&Number(product.target)>Number(product.on_hand);
      const recurring=product.recurring_days&&!product.last_purchase_on;
      if(ended||low||recurring)data.shopping_items.push({id:crypto.randomUUID(),list_id:list.id,product_id:product.id,quantity:Math.max(Number(product.target)-Number(product.on_hand),Number(product.usual_purchase_quantity||1)),estimated_unit_price_cents:product.estimated_unit_price_cents??product.last_unit_price_cents??null,unit_price_cents:null,fund_id:product.usual_fund_id||null,state:'suggested',automatic:true,priority:ended?'necessary':low?'next':'recurring',reason:ended?'Producto terminado':low?'Stock bajo':'Compra recurrente próxima',payment_method:'card',version:1});
    }
    return list;
  }
  if(action==='product_save'){
    let product=data.products.find(row=>row.id===x.id);
    if(product){version(product);Object.assign(product,x,{version:product.version+1});}
    else{product={...x,version:1,last_unit_price_cents:null,last_purchase_on:null};data.products.push(product);data.inventory_events.push({id:crypto.randomUUID(),product_id:product.id,delta:product.on_hand,balance:product.on_hand,reason:'Inventario inicial',actor_name:'Demo',created_at:new Date().toISOString()});}
    return product;
  }
  if(action==='finish_and_plan'){
    const product=data.products.find(row=>row.id===x.id);version(product);
    const before=Number(product.on_hand);
    if(before>0){product.on_hand=0;product.version++;data.inventory_events.push({id:crypto.randomUUID(),product_id:product.id,delta:-before,balance:0,reason:'Producto terminado',actor_name:'Demo',created_at:new Date().toISOString()});}
    let item=null;
    if(x.add_to_list!==false){
      if(!Number.isFinite(Number(x.quantity))||Number(x.quantity)<=0)throw new Error('Indica una cantidad para comprar mayor a cero.');
      item=data.shopping_items.find(row=>row.product_id===product.id&&SMART_ACTIVE.includes(row.state));
      if(item)Object.assign(item,{list_id:list.id,quantity:Number(x.quantity),estimated_unit_price_cents:item.estimated_unit_price_cents??product.estimated_unit_price_cents??product.last_unit_price_cents??null,fund_id:item.fund_id||product.usual_fund_id||null,state:item.state==='in_cart'?'in_cart':'planned',automatic:false,priority:'necessary',reason:'Producto terminado',version:item.version+1});
      else{item={id:crypto.randomUUID(),list_id:list.id,product_id:product.id,quantity:Number(x.quantity),estimated_unit_price_cents:product.estimated_unit_price_cents??product.last_unit_price_cents??null,unit_price_cents:null,fund_id:product.usual_fund_id||null,state:'planned',automatic:false,priority:'necessary',reason:'Producto terminado',payment_method:'card',version:1};data.shopping_items.push(item);}
    }
    return {product,item};
  }
  if(action==='add'){
    let product=data.products.find(row=>row.id===x.product_id);
    if(!product){product={id:x.new_product_id,name:x.name,category:x.category,unit:x.unit,on_hand:0,minimum:0,target:0,usual_purchase_quantity:x.quantity,estimated_unit_price_cents:x.estimated_unit_price_cents,usual_fund_id:x.fund_id,version:1};data.products.push(product);}
    let item=data.shopping_items.find(row=>row.product_id===product.id&&SMART_ACTIVE.includes(row.state));
    if(item)Object.assign(item,{quantity:x.quantity,estimated_unit_price_cents:x.estimated_unit_price_cents,fund_id:x.fund_id,state:'planned',automatic:false,version:item.version+1});
    else{item={id:crypto.randomUUID(),list_id:list.id,product_id:product.id,quantity:x.quantity,estimated_unit_price_cents:x.estimated_unit_price_cents,unit_price_cents:null,fund_id:x.fund_id,state:'planned',automatic:false,priority:'optional',reason:'Agregado manualmente',payment_method:'card',version:1};data.shopping_items.push(item);}
    return item;
  }
  if(action==='add_suggested'){for(const item of data.shopping_items.filter(row=>row.state==='suggested'&&(!x.id||row.id===x.id))){item.state='planned';item.automatic=false;item.version++;}return list;}
  if(action==='edit'){
    const item=data.shopping_items.find(row=>row.id===x.id);version(item);Object.assign(item,x,{version:item.version+1,automatic:false});return item;
  }
  if(action==='checkout'){
    if(data.purchases.some(row=>row.id===x.id))return data.purchases.find(row=>row.id===x.id);
    const rows=x.lines.map(line=>{const item=data.shopping_items.find(row=>row.id===line.id);if(!item||item.state!=='in_cart'||item.version!==line.version)throw new Error('El carrito cambió.');return item;});
    const total=rows.reduce((sum,row)=>sum+(itemTotal(row)||0),0);if(total!==x.total_cents||total<=0)throw new Error('Revisa el total.');
    const purchase={id:x.id,list_id:list.id,purchased_on:x.purchased_on,merchant:x.merchant,total_cents:total,item_count:rows.length,salary_cents:0,voucher_cents:0};data.purchases.push(purchase);
    const groups=new Map();for(const row of rows){const fund=data.funds.find(f=>f.id===row.fund_id);const key=row.fund_id+'|'+row.payment_method;groups.set(key,{fund,method:row.payment_method,rows:[...(groups.get(key)?.rows||[]),row]});}
    for(const group of groups.values()){
      const amount=group.rows.reduce((sum,row)=>sum+itemTotal(row),0);purchase[group.fund.kind==='voucher'?'voucher_cents':'salary_cents']+=amount;
      const expense={id:crypto.randomUUID(),fund_id:group.fund.id,description:'Compra del hogar · '+group.fund.name,category:'Despensa',amount_cents:amount,method:group.method,occurred_on:x.purchased_on};data.expenses.push(expense);
      for(const row of group.rows){const product=data.products.find(p=>p.id===row.product_id),total_cents=itemTotal(row);product.on_hand=Number(product.on_hand)+Number(row.quantity);product.last_unit_price_cents=row.unit_price_cents;product.estimated_unit_price_cents=row.unit_price_cents;product.last_purchase_on=x.purchased_on;product.version++;row.state='purchased';row.expense_id=expense.id;row.version++;data.inventory_events.push({id:crypto.randomUUID(),product_id:product.id,delta:row.quantity,balance:product.on_hand,reason:'Compra inteligente',expense_id:expense.id,actor_name:'Demo',created_at:new Date().toISOString()});const detail={id:crypto.randomUUID(),purchase_id:purchase.id,expense_id:expense.id,shopping_item_id:row.id,product_id:product.id,fund_id:row.fund_id,product_name:product.name,category:product.category,unit:product.unit,quantity:row.quantity,unit_price_cents:row.unit_price_cents,total_cents,method:row.payment_method};data.expense_items.push(detail);data.product_price_history.push({id:crypto.randomUUID(),product_id:product.id,purchase_id:purchase.id,expense_item_id:detail.id,fund_id:row.fund_id,purchased_on:x.purchased_on,quantity:row.quantity,unit_price_cents:row.unit_price_cents,merchant:x.merchant});}
    }
    list.status='purchased';list.completed_at=new Date().toISOString();return purchase;
  }
  throw new Error('Acción no válida.');
}
