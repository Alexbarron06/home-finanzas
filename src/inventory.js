export const activeItems=data=>data.shopping_items.filter(x=>['pending','cart'].includes(x.state));
export function quantity(value,{zero=true}={}){
 if(!/^\d+(\.\d{1,3})?$/.test(String(value)))throw new Error('Usa una cantidad con hasta tres decimales.');
 const n=Number(value);if(!Number.isFinite(n)||n>1000000||n<0||(!zero&&n===0))throw new Error('Revisa la cantidad.');return n;
}
export const lineTotal=x=>Math.round(Number(x.quantity)*Number(x.unit_price_cents));
export function cartTotal(items){if(items.some(x=>x.unit_price_cents===null))throw new Error('Falta el precio de un producto.');return items.reduce((s,x)=>s+lineTotal(x),0);}
export function replenish(data,p){
 const existing=activeItems(data).find(x=>x.product_id===p.id);
 if(p.on_hand<=p.minimum&&p.target>p.on_hand){
  const q=Math.round((p.target-p.on_hand)*1000)/1000;
  if(!existing)data.shopping_items.push({id:crypto.randomUUID(),product_id:p.id,quantity:q,unit_price_cents:null,state:'pending',automatic:true,version:1});
  else if(existing.automatic&&existing.state==='pending'&&existing.quantity!==q){existing.quantity=q;existing.version++;}
 }else if(existing?.automatic&&existing.state==='pending'){existing.state='removed';existing.version++;}
}
export function demoCommand(data,action,x){
 const event=(p,delta,reason,expense_id=null)=>data.inventory_events.push({id:crypto.randomUUID(),product_id:p.id,delta,balance:p.on_hand,reason,expense_id,actor_name:'Demo',created_at:new Date().toISOString()});
 const version=(row)=>{if(!row||row.version!==x.version)throw new Error('El registro cambió. Actualiza.');};
 if(action==='expense_edit'){
  const e=data.expenses.find(e=>e.id===x.id);if(!e||(e.revision||1)!==x.version)throw new Error('El gasto cambió. Actualiza.');
  const before=structuredClone(e);Object.assign(e,{description:x.description,amount_cents:x.amount_cents,occurred_on:x.occurred_on,method:x.method,category:x.category,revision:(e.revision||1)+1});data.expense_history.push({id:crypto.randomUUID(),expense_id:e.id,before_data:before,after_data:structuredClone(e),actor_name:'Demo',created_at:new Date().toISOString()});return e;
 }
 if(action==='product_save'){
  if(data.products.some(p=>p.name.trim().toLowerCase()===x.name.trim().toLowerCase()&&p.id!==x.id))throw new Error('Ya existe un producto con ese nombre.');
  let p=data.products.find(p=>p.id===x.id);
  if(p){version(p);Object.assign(p,{name:x.name,category:x.category,unit:x.unit,minimum:x.minimum,target:x.target,version:p.version+1});}
  else{p={...x,version:1};data.products.push(p);event(p,p.on_hand,'Inventario inicial');}replenish(data,p);return p;
 }
 if(action==='stock_adjust'){
  const p=data.products.find(p=>p.id===x.id);version(p);if(p.on_hand+x.delta<0)throw new Error('No puedes consumir más de lo disponible.');p.on_hand=Math.round((p.on_hand+x.delta)*1000)/1000;p.version++;event(p,x.delta,x.reason);replenish(data,p);return p;
 }
 if(action==='shopping_add'){
  const row=activeItems(data).find(i=>i.product_id===x.product_id);if(row)return row;
  const s={id:crypto.randomUUID(),...x,state:'pending',unit_price_cents:null,automatic:false,version:1};data.shopping_items.push(s);return s;
 }
 if(action==='shopping_edit'){
  const s=data.shopping_items.find(s=>s.id===x.id);version(s);if(!['pending','cart'].includes(s.state))throw new Error('Este producto ya fue procesado.');Object.assign(s,{quantity:x.quantity,unit_price_cents:x.unit_price_cents,state:x.state,automatic:false,version:s.version+1});return s;
 }
 if(action==='checkout'){
  if(data.expenses.some(e=>e.id===x.id))return data.expenses.find(e=>e.id===x.id);
  const rows=x.lines.map(l=>{const s=data.shopping_items.find(i=>i.id===l.id);if(!s||s.state!=='cart'||s.version!==l.version)throw new Error('El carrito cambió.');return s;});
  if(new Set(rows.map(s=>s.id)).size!==rows.length||!rows.length)throw new Error('Carrito no válido.');
  const total=cartTotal(rows);if(total!==x.total_cents||total<=0)throw new Error('Revisa el total.');
  const e={id:x.id,fund_id:x.fund_id,amount_cents:total,description:x.description,occurred_on:x.occurred_on,method:x.method,category:'Despensa',revision:1};data.expenses.push(e);
  rows.forEach(s=>{s.state='bought';s.expense_id=e.id;s.version++;const p=data.products.find(p=>p.id===s.product_id);p.on_hand=Math.round((p.on_hand+s.quantity)*1000)/1000;p.version++;event(p,s.quantity,'Compra',e.id);replenish(data,p);});return e;
 }
 throw new Error('Acción no válida.');
}
