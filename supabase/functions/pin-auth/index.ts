import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const allowed = new Set(['https://home-finanzas.pages.dev','http://localhost:5173']);
const options = { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false} };
Deno.serve(async (req:Request) => {
 const origin=req.headers.get('origin') || '';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
 if(allowed.has(origin)) headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.has(origin))return reply({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 if(Number(req.headers.get('content-length')||0)>4096)return reply({error:'Solicitud demasiado grande.'},413);
 try {
  const raw=await req.text();if(raw.length>4096)return reply({error:'Solicitud demasiado grande.'},413);
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'Solicitud inválida.'},400);}
  if(!body||typeof body!=='object')return reply({error:'Solicitud inválida.'},400);
  const admin=createClient(url,serviceKey,options);
  if(body.action==='provision'){
   if(typeof body.token!=='string'||body.token.length!==64)return reply({error:'No autorizado.'},401);
   const {data:setup,error}=await admin.rpc('pin_provision',{p_token:body.token,p_action:'list'});
   if(error||!setup?.ok)return reply({error:'No autorizado.'},401);
   for(const account of setup.accounts){
    if(account.user_id)continue;
    const {data:created,error:createError}=await admin.auth.admin.createUser({email:account.email,email_confirm:true,password:crypto.randomUUID()+crypto.randomUUID()});
    let userId=created?.user?.id;
    if(createError){
     // Recover only the exact pre-authorized account after an interrupted provision.
     const {data:users,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:100});
     if(listError)throw listError;
     userId=users.users.find(u=>u.email===account.email)?.id;
     if(!userId)throw createError;
    }
    const {data:bound,error:bindError}=await admin.rpc('pin_provision',{p_token:body.token,p_action:'bind',p_username:account.username,p_user_id:userId});
    if(bindError||!bound?.ok)throw new Error('Provision failed');
   }
   const {data:finished,error:finishError}=await admin.rpc('pin_provision',{p_token:body.token,p_action:'finish'});
   if(finishError||!finished?.ok)throw new Error('Provision failed');
   return reply({ok:true});
  }
  const {action,username,pin}=body;
  if(!['activate','login','change'].includes(action)||typeof username!=='string'||!/^[a-z0-9_]{2,32}$/i.test(username)||typeof pin!=='string'||!/^\d{4}$/.test(pin))return reply({error:'Escribe un usuario y un PIN de cuatro números.'},400);
  if(action==='activate'&&(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token)))return reply({error:'Enlace de activación inválido.'},400);
  let userId=null;
  if(action==='change'){
   if(typeof body.newPin!=='string'||!/^\d{4}$/.test(body.newPin))return reply({error:'El nuevo PIN debe tener cuatro números.'},400);
   const bearer=req.headers.get('authorization')?.replace(/^Bearer /i,'');
   if(!bearer)return reply({error:'Inicia sesión de nuevo.'},401);
   const {data:auth,error}=await admin.auth.getUser(bearer);
   if(error||!auth.user)return reply({error:'Inicia sesión de nuevo.'},401);
   userId=auth.user.id;
  }
  const {data:checked,error}=await admin.rpc('pin_authenticate',{p_action:action,p_username:username.toLowerCase(),p_pin:pin,p_token:body.token||null,p_user_id:userId,p_new_pin:body.newPin||null});
  if(error)throw error;
  if(!checked?.ok)return reply({error:checked?.locked?'Acceso bloqueado temporalmente por intentos fallidos. Espera antes de volver a intentar.':action==='activate'?'El enlace ya fue utilizado, venció o no corresponde a este usuario.':'Usuario o PIN incorrecto.'},checked?.locked?429:401);
  if(action==='change')return reply({ok:true});
  // Mint a normal Supabase session only after server-side PIN verification.
  // generateLink does not send mail. Its one-time hash never reaches the client.
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:checked.email});
  if(linkError||!link?.properties?.hashed_token)throw new Error('Session unavailable');
  const authClient=createClient(url,anonKey,options);
  const {data:verified,error:verifyError}=await authClient.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});
  if(verifyError||!verified.session||verified.user?.id!==checked.user_id)throw new Error('Session unavailable');
  return reply({session:{access_token:verified.session.access_token,refresh_token:verified.session.refresh_token},username:username.toLowerCase()});
 }catch{
  return reply({error:'No fue posible completar el acceso. Si acabas de activar tu PIN, intenta entrar desde la pantalla inicial.'},503);
 }
});
