import './style.css';
import { createClient } from '@supabase/supabase-js';
import { money, cents, summary, validateExpense } from './finance.js';
import { demoData } from './demo.js';
import { createWorkflows } from './workflows.js';
import { validatePin, normalizeUsername, activationFromHash } from './pin.js';
const app = document.querySelector('#app');
let runtime={};
try { const response=await fetch('/config.json',{cache:'no-store'}); if(response.ok)runtime=await response.json(); } catch { /* Show setup message below. */ }
const url = import.meta.env.VITE_SUPABASE_URL || runtime.supabaseUrl;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || runtime.publishableKey;
let remember=localStorage.getItem('home-remember')==='true';
const storage={
 getItem:k=>localStorage.getItem(k)||sessionStorage.getItem(k),
 setItem:(k,v)=>{(remember?sessionStorage:localStorage).removeItem(k);(remember?localStorage:sessionStorage).setItem(k,v);},
 removeItem:k=>{localStorage.removeItem(k);sessionStorage.removeItem(k);}
};
const db = url && key ? createClient(url,key,{auth:{storage,detectSessionInUrl:false}}) : null;
let activation=null,activationError='';
try{activation=activationFromHash(location.hash);}catch(e){activationError=e.message;}
if(location.hash.includes('activate='))history.replaceState(null,'',location.pathname+location.search);
async function pinRequest(payload,accessToken){
 const response=await fetch(`${url}/functions/v1/pin-auth`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({error:'El servidor no respondió correctamente.'}));
 if(!response.ok)throw new Error(result.error||'No fue posible completar el acceso.');
 return result;
}
let demo = false, session = null, page = 'Inicio', data = null, busy = false, banner = '';
let liveChannel=null,liveHousehold=null,liveTimer=null,pendingLive=false,loadSequence=0,syncText='Conectando…';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toLocaleDateString('en-CA');
const dateLabel = s => new Date(`${s}T12:00:00`).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
const brand = '<div class="brand"><span class="brand-mark">⌂</span>home<span>·</span></div>';
const categories = ['Despensa','Higiene personal','Limpieza del hogar','Servicios','Entretenimiento','Servicio de limpieza','Otros'];
const workflows=createWorkflows({getData:()=>data,isDemo:()=>demo,db,render,load,esc,money,cents,today,validateExpense,categories});
function syncLabel(text){syncText=text;const el=document.querySelector('#sync-status');if(el)el.textContent=text;}
function subscribe(household){
 if(liveHousehold===household)return;if(liveChannel)db.removeChannel(liveChannel);liveHousehold=household;syncLabel('Conectando…');
 liveChannel=db.channel('home-'+household);
 for(const table of ['products','shopping_items','expenses','reservations','inventory_events','expense_history'])liveChannel.on('postgres_changes',{event:'*',schema:'public',table,filter:'household_id=eq.'+household},()=>{clearTimeout(liveTimer);liveTimer=setTimeout(()=>{if(demo||!session)return;if(document.querySelector('dialog')||document.hidden){pendingLive=true;syncLabel('Cambios pendientes de actualizar');}else load();},250);});
 liveChannel.subscribe(status=>{syncLabel(status==='SUBSCRIBED'?'En vivo':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'Sin conexión en vivo · puedes actualizar':'Conectando…');if(status==='SUBSCRIBED')load();});
}
document.addEventListener('close',()=>queueMicrotask(()=>{if(pendingLive&&!document.querySelector('dialog')&&session&&!demo){pendingLive=false;load();}}),true);
function authScreen(message='') {
 const activating=Boolean(activation);
 app.innerHTML=`<section class="auth card">${brand}<span class="eyebrow">Finanzas en equipo</span><h1>${activating?'Elige tu PIN.':'Un hogar,<br>un buen plan.'}</h1><p class="muted">${activating?'Activa tu acceso personal con cuatro números. Este enlace solo puede utilizarse una vez.':'Entra con tu usuario y PIN para organizar las finanzas de tu hogar.'}</p>${message||activationError?`<p class="notice error" role="alert">${esc(message||activationError)}</p>`:''}${db?`<form id="login"><label>Usuario<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" required value="${esc(activation?.username||localStorage.getItem('home-last-user')||'')}" ${activating?'readonly':''}></label><label>${activating?'Elige un PIN de 4 números':'PIN de 4 números'}<input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="${activating?'new-password':'current-password'}" required></label>${activating?'<label>Repite tu PIN<input type="password" name="confirm" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label>':''}<label class="remember"><input type="checkbox" name="remember" ${remember?'checked':''}> Mantener sesión en este dispositivo</label><button class="full">${activating?'Activar mi acceso':'Entrar a mi hogar'}</button></form><p class="subtle muted">${activating?'El PIN se guarda protegido en el servidor.':'¿Es tu primer acceso? Abre tu enlace privado de activación. Si olvidaste tu PIN, solicita un nuevo enlace de recuperación al administrador.'}</p>`:'<p class="notice">Conexión pendiente de configurar. Puedes explorar la demostración.</p>'}<button id="demo" class="secondary full">${activating?'Volver al inicio':'Explorar demostración'}</button>${activating?'':'<p class="subtle muted">La demostración usa datos ficticios. Los cambios desaparecen al salir o recargar.</p>'}</section>`;
 document.querySelector('#demo').onclick=()=>{if(activating){activation=null;authScreen();return;}demo=true;data=demoData();page='Inicio';render();};
 document.querySelector('#login')?.addEventListener('submit',async e=>{
  e.preventDefault();const f=new FormData(e.target);const b=e.target.querySelector('button');b.disabled=true;b.textContent=activating?'Activando…':'Entrando…';
  try{
   const username=normalizeUsername(f.get('username'));const pin=validatePin(f.get('pin'));
   if(activating&&pin!==f.get('confirm'))throw new Error('Los PIN no coinciden.');
   remember=f.get('remember')==='on';localStorage.setItem('home-remember',String(remember));
   const result=await pinRequest({action:activating?'activate':'login',username,pin,...(activating?{token:activation.token}:{})});
   const {data:auth,error}=await db.auth.setSession(result.session);if(error)throw error;
   session=auth.session;activation=null;activationError='';localStorage.setItem('home-last-user',username);demo=false;page='Inicio';await load();
  }catch(error){authScreen(error.message||'No fue posible entrar. Revisa la conexión.');}
 });
}
async function readAll(table, householdId) {
 const rows=[];
 for(let from=0;;from+=500){const {data:chunk,error}=await db.from(table).select('*').eq('household_id',householdId).order('id').range(from,from+499);if(error)throw error;rows.push(...chunk);if(chunk.length<500)return rows;}
}
async function load(){
 const request=++loadSequence,userId=session?.user.id;if(!userId||demo)return;
 try{
 const {data:member,error}=await db.from('memberships').select('household_id').eq('user_id',userId).maybeSingle();if(error)throw error;
 if(!member){data=null;app.innerHTML=`<section class="auth card">${brand}<h1>Cuenta pendiente</h1><p>Tu cuenta todavía no está vinculada al hogar. Solicita que se habilite tu acceso.</p><button id="logout">Cerrar sesión</button></section>`;document.querySelector('#logout').onclick=logout;return;}
 const {data:household,error:err}=await db.from('households').select('*').eq('id',member.household_id).single();if(err)throw err;
 const [funds,expenses,reservations,products,shopping_items,inventory_events,expense_history]=await Promise.all(['funds','expenses','reservations','products','shopping_items','inventory_events','expense_history'].map(t=>readAll(t,household.id)));
 if(request!==loadSequence||session?.user.id!==userId||demo)return;
 data={household,funds,expenses,reservations,products,shopping_items,inventory_events,expense_history};render();subscribe(household.id);
 }catch{if(request!==loadSequence||!session||demo)return;banner='No fue posible actualizar los datos. Revisa tu conexión e intenta de nuevo.';if(data)render();else{app.innerHTML=`<section class="auth card"><h1>No pudimos cargar tu hogar</h1><p class="notice error">${esc(banner)}</p><button id="retry">Reintentar</button> <button id="logout" class="secondary">Salir</button></section>`;document.querySelector('#retry').onclick=load;document.querySelector('#logout').onclick=logout;}}
}
async function logout(){if(db&&!demo){const {error}=await db.auth.signOut();if(error){banner='No se pudo cerrar sesión. Intenta otra vez.';if(data)render();return;}}if(liveChannel)db.removeChannel(liveChannel);liveChannel=null;liveHousehold=null;clearTimeout(liveTimer);loadSequence++;demo=false;data=null;session=null;banner='';authScreen();}
function expenseRows(){return [...data.expenses].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).map(e=>`<tr><td>${esc(dateLabel(e.occurred_on))}</td><td><strong>${esc(e.description)}</strong><br><small>${esc(e.category)}</small></td><td>${esc(data.funds.find(f=>f.id===e.fund_id)?.name)}</td><td>${e.method==='card'?'Tarjeta':'Efectivo'}</td><td>${money(e.amount_cents)}</td><td><button class="text" data-expense-edit="${esc(e.id)}">Modificar</button><button class="text" data-expense-history="${esc(e.id)}">Historial</button></td></tr>`).join('');}
function pending(){const paid=new Set(data.expenses.map(e=>e.reservation_id));return data.reservations.filter(r=>!paid.has(r.id)).sort((a,b)=>a.due_on.localeCompare(b.due_on));}
function bills(){return pending().map(r=>`<div class="row"><span class="row-icon">↗</span><div class="row-main"><p><strong>${esc(r.description)}</strong></p><small>${esc(dateLabel(r.due_on))} · ${esc(data.funds.find(f=>f.id===r.fund_id)?.name)}</small></div><div class="row-amount"><strong>${money(r.amount_cents)}</strong><br><button class="text" data-pay="${esc(r.id)}">Registrar pago</button></div></div>`).join('')||'<div class="empty">No hay pagos pendientes.</div>';}
function dashboard(){const results=data.funds.map(f=>({...f,...summary(f,data.expenses,data.reservations)}));const total=results.reduce((s,f)=>s+f.available,0);return `${data.products.some(p=>Number(p.on_hand)<=Number(p.minimum))?'<div class="notice">Hay productos por terminar. <button class="text" data-nav="Inventario">Ver inventario</button></div>':''}<div class="cards"><section class="card primary"><small>Disponible para gastar</small><div class="amount">${money(total)}</div><div class="rule"><span>Reservas ya descontadas</span><span>MXN</span></div></section>${results.map(f=>`<section class="card"><small>${esc(f.name)} · ${f.kind==='voucher'?'Solo tarjeta':'Efectivo y tarjeta'}</small><div class="amount ${f.available<0?'negative':''}">${money(f.available)}</div><div class="rule"><span>Saldo ${money(f.balance)}</span><span>Reservado ${money(f.reserved)}</span></div></section>`).join('')}</div>${results.some(f=>f.available<0)?'<p class="notice">Hay compromisos que superan el saldo disponible. Revisa las reservas y el fondo asignado.</p>':''}<div class="columns"><section class="card"><div class="section-title"><h2>Últimos movimientos</h2><button class="text" data-nav="Movimientos">Ver todos →</button></div>${[...data.expenses].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).slice(0,5).map(e=>`<div class="row"><span class="row-icon">↙</span><div class="row-main"><p><strong>${esc(e.description)}</strong></p><small>${esc(e.category)} · ${esc(dateLabel(e.occurred_on))}</small></div><strong>−${money(e.amount_cents)}</strong></div>`).join('')||'<div class="empty">Registra tu primer gasto para ver tu avance.</div>'}</section><section class="card"><div class="section-title"><h2>Próximos pagos</h2><span class="pill">${pending().length} pendientes</span></div>${bills()}</section></div><footer>El disponible considera el saldo inicial, los gastos registrados y las reservas pendientes.</footer>`;}
function render(){if(!data)return;const pages=[['Inicio','⌂'],['Movimientos','↗'],['Pagos','▦'],['Comprar','▱'],['Inventario','▤'],['Resumen','◷'],['Configuración','⚙']];app.innerHTML=`<div class="layout"><aside class="sidebar">${brand}<div><span class="eyebrow">Mi hogar</span><nav style="margin-top:16px">${pages.map(([p,i])=>`<button data-nav="${p}" class="${page===p?'active':''}" ${page===p?'aria-current="page"':''}><span class="nav-icon">${i}</span>${p}</button>`).join('')}</nav></div><div class="side-foot"><strong>Un poco de orden,<br>más tranquilidad.</strong><p>Finanzas del hogar<br>Inventario y compras · 0.2</p></div></aside><main><div class="topbar"><span>${esc(data.household.name)}<small id="sync-status" class="sync-status">${demo?'Demo local':esc(syncText)}</small></span><div><span class="pill">${demo?'Demostración':'Acceso privado'}</span> <button class="text" id="logout">Salir</button></div></div>${demo?'<div class="notice">Datos ficticios · Esta demostración no guarda ni sincroniza cambios.</div>':''}${banner?`<div class="notice error" role="alert">${esc(banner)}</div>`:''}<div class="heading"><div><span class="eyebrow">Cada decisión cuenta</span><h1>${page==='Inicio'?'Tu hogar, en equilibrio.':esc(page)}</h1><p>${page==='Inicio'?'Una mirada clara a lo que tienes y lo que viene.':'Organiza hoy para disfrutar con tranquilidad.'}</p></div>${['Inicio','Movimientos'].includes(page)?'<button id="add-expense">＋ Registrar gasto</button>':page==='Pagos'?'<button id="add-reservation">＋ Reservar un pago</button>':''}</div><div id="content"></div></main></div>`;
 const content=document.querySelector('#content');
 if(page==='Inicio')content.innerHTML=dashboard();
 else if(page==='Movimientos')content.innerHTML=`<section class="card table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Fondo</th><th>Medio</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>${expenseRows()}</tbody></table>${data.expenses.length?'':'<div class="empty">Todavía no hay gastos registrados.</div>'}</section>`;
 else if(page==='Pagos')content.innerHTML=`<p class="notice">Esta entrega permite reservar y pagar compromisos individuales. Las recurrencias y los recibos variables se incorporarán en la siguiente etapa.</p><section class="card">${bills()}</section>`;
 else if(page==='Resumen')content.innerHTML=`<section class="card"><h2>Gastos registrados por categoría</h2>${categories.map(c=>({c,v:data.expenses.filter(e=>e.category===c).reduce((s,e)=>s+e.amount_cents,0)})).filter(x=>x.v).map(x=>`<div class="row"><span>${esc(x.c)}</span><strong>${money(x.v)}</strong></div>`).join('')||'<div class="empty">Sin gastos para resumir.</div>'}<p class="subtle muted">Resumen de todos los movimientos cargados. Los cierres por periodo y el ahorro todavía no están habilitados.</p></section>`;
 else if(page==='Configuración')content.innerHTML=`<section class="card"><h2>Conexión y alcance</h2><p>Modo: <strong>${demo?'demostración temporal':'Supabase'}</strong></p><p>Fondos, membresías y saldos iniciales se habilitan durante la configuración del hogar. No existe registro público de usuarios en esta interfaz.</p><p class="muted">Próxima etapa: montos por periodo, calendario de depósitos, cierres automáticos y notificaciones.</p><button class="secondary" id="refresh">Actualizar datos</button> ${demo?'':'<button id="change-pin">Cambiar mi PIN</button>'}</section>`;
 else if(page==='Inventario')content.innerHTML=workflows.inventoryView();
 else if(page==='Comprar')content.innerHTML=workflows.shoppingView();
 workflows.bind();
 document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{page=b.dataset.nav;banner='';render();});document.querySelector('#logout').onclick=logout;
 document.querySelector('#add-expense')?.addEventListener('click',()=>openForm('expense'));
 document.querySelector('#add-reservation')?.addEventListener('click',()=>openForm('reservation'));
 document.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>openForm('expense',data.reservations.find(r=>r.id===b.dataset.pay)));
 document.querySelector('#refresh')?.addEventListener('click',()=>demo?render():load());
 document.querySelector('#change-pin')?.addEventListener('click',changePin);
}
function openForm(type,reservation=null){if(!data.funds.length){banner='Primero deben configurarse los fondos del hogar.';render();return;}const isExpense=type==='expense';const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>${reservation?'Registrar pago':isExpense?'Registrar gasto':'Reservar un pago'}</h2><p class="muted">${reservation?'El pago sustituye la reserva, sin descontar dos veces.':isExpense?'Los gastos se descuentan del fondo seleccionado.':'La reserva aparta dinero; todavía no es un gasto.'}</p><form id="entry"><div class="form-grid"><label class="wide">Concepto<input name="description" maxlength="160" required value="${esc(reservation?.description||'')}"></label><label>Importe (MXN)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" required value="${reservation?reservation.amount_cents/100:''}" ${reservation?'readonly':''}></label><label>${isExpense?'Fecha del gasto':'Vencimiento'}<input name="date" type="date" value="${today()}" ${isExpense?`max="${today()}"`:''} required></label><label>Fondo<select name="fund" ${reservation?'disabled':''}>${data.funds.map(f=>`<option value="${esc(f.id)}" ${reservation?.fund_id===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>${isExpense?`<label>Medio de pago<select name="method"><option value="card">Tarjeta</option><option value="cash">Efectivo</option></select></label><label class="wide">Categoría<select name="category">${categories.map(c=>`<option>${c}</option>`).join('')}</select></label>`:''}</div><p id="form-error" class="notice error" role="alert" hidden></p><div class="actions"><button type="button" class="secondary" id="cancel">Cancelar</button><button type="submit">${isExpense?'Guardar gasto':'Reservar'}</button></div></form>`;
 document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('#cancel').onclick=()=>dialog.close();const form=dialog.querySelector('form');
 const enforceMethod=()=>{if(!isExpense)return;const voucher=data.funds.find(f=>f.id===form.elements.fund.value)?.kind==='voucher';form.elements.method.querySelector('[value="cash"]').disabled=voucher;if(voucher)form.elements.method.value='card';};form.elements.fund.onchange=enforceMethod;enforceMethod();
 const id=crypto.randomUUID();form.onsubmit=async e=>{e.preventDefault();if(busy)return;const b=form.querySelector('[type="submit"]');const errorBox=form.querySelector('#form-error');try{const f=new FormData(form);const fund=data.funds.find(x=>x.id===(reservation?.fund_id||f.get('fund')));const entry={id,household_id:data.household.id,fund_id:fund.id,description:f.get('description').trim(),amount_cents:cents(f.get('amount')),created_by:demo?'demo':session.user.id};if(isExpense){Object.assign(entry,{occurred_on:f.get('date'),method:f.get('method'),category:f.get('category'),reservation_id:reservation?.id||null});validateExpense(entry,fund);}else entry.due_on=f.get('date');
 busy=true;b.disabled=true;b.textContent='Guardando…';
 if(demo){(isExpense?data.expenses:data.reservations).push(entry);}else{const {error}=await db.from(isExpense?'expenses':'reservations').insert(entry);if(error)throw error;}
 dialog.close();banner='';if(demo)render();else await load();
 }catch(error){errorBox.hidden=false;errorBox.textContent=error.code==='23505'?'Este movimiento ya está registrado. Cierra y actualiza los datos.':error.message||'No se pudo guardar. Intenta nuevamente.';}finally{busy=false;b.disabled=false;b.textContent=isExpense?'Guardar gasto':'Reservar';}};
}
function changePin(){
 const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>Cambiar mi PIN</h2><form><label>Usuario<input name="username" value="${esc(localStorage.getItem('home-last-user')||'')}" autocomplete="username" required></label><label>PIN actual<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required></label><label>Nuevo PIN<input name="newPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label><label>Repite el nuevo PIN<input name="confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label><p class="notice error" hidden role="alert"></p><div class="actions"><button class="secondary" type="button">Cancelar</button><button type="submit">Guardar nuevo PIN</button></div></form>`;
 document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[type="button"]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=dialog.querySelector('[type="submit"]');b.disabled=true;const f=new FormData(e.target);try{
  const newPin=validatePin(f.get('newPin'));if(newPin!==f.get('confirm'))throw new Error('Los PIN no coinciden.');
  const {data:auth,error}=await db.auth.getSession();if(error||!auth.session)throw new Error('Inicia sesión de nuevo.');
  await pinRequest({action:'change',username:normalizeUsername(f.get('username')),pin:validatePin(f.get('pin')),newPin},auth.session.access_token);
  dialog.close();banner='';render();const note=document.createElement('p');note.className='notice success';note.textContent='Tu PIN fue actualizado.';document.querySelector('#content').prepend(note);
 }catch(error){const note=dialog.querySelector('[role="alert"]');note.hidden=false;note.textContent=error.message;}finally{b.disabled=false;}};
}
window.addEventListener('hashchange',()=>{if(!location.hash.includes('activate='))return;activationError='';try{activation=activationFromHash(location.hash);}catch(error){activation=null;activationError=error.message;}history.replaceState(null,'',location.pathname+location.search);demo=false;authScreen();});
window.addEventListener('offline',()=>{banner='Sin conexión. No podrás guardar cambios hasta recuperar internet.';if(data)render();});
window.addEventListener('online',()=>{banner='';if(session&&!demo)load();else if(data)render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&!demo&&!document.querySelector('dialog'))load();});
if(db){const {data:auth}=await db.auth.getSession();session=auth.session;if(session&&!activation&&!activationError)await load();else authScreen();}else authScreen();
