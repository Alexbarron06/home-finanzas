import {extractWalmartProducts} from './parser.js';

const allowed=new Set(['https://home-finanzas.pages.dev','http://localhost:5173']);
const blockedMarkers=['¿robot o humano?','press and hold','verify you are human','captcha'];

Deno.serve(async (req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers:Record<string,string>={
  'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
 };
 if(allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.has(origin))return reply({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'Solicitud demasiado grande.'},413);
 try{
  const raw=await req.text();if(raw.length>2048)return reply({error:'Solicitud demasiado grande.'},413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return reply({error:'Solicitud inválida.'},400);}
  const query=typeof body==='object'&&body!==null&&'query' in body?String((body as {query:unknown}).query).trim():'';
  if(query.length<3||query.length>120)return reply({error:'Escribe un producto de 3 a 120 caracteres.'},400);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  let response:Response;
  try{
   response=await fetch(`https://www.walmart.com.mx/search?q=${encodeURIComponent(query)}`,{
    signal:controller.signal,redirect:'follow',headers:{
     'Accept':'text/html,application/xhtml+xml','Accept-Language':'es-MX,es;q=0.9',
     'User-Agent':'Mozilla/5.0 (compatible; HOME-Finanzas/1.0; +https://home-finanzas.pages.dev/)'
    }
   });
  }finally{clearTimeout(timeout);}
  if(!response.ok)return reply({error:'Walmart no respondió. Captura el precio manualmente.'},503);
  const html=await response.text();
  if(html.length>8_000_000)return reply({error:'La respuesta de Walmart fue demasiado grande. Captura el precio manualmente.'},503);
  const lower=html.toLocaleLowerCase('es-MX');
  if(blockedMarkers.some(marker=>lower.includes(marker)))return reply({error:'Walmart solicitó una verificación. Captura el precio manualmente por ahora.'},503);
  const matches=extractWalmartProducts(html,query);
  if(!matches.length)return reply({error:'No encontramos una coincidencia clara en Walmart. Captura el precio manualmente.'},404);
  return reply({query,match:matches[0],matches,checked_at:new Date().toISOString()});
 }catch(error){
  const timeout=error instanceof DOMException&&error.name==='AbortError';
  return reply({error:timeout?'Walmart tardó demasiado. Captura el precio manualmente.':'No fue posible consultar Walmart. Captura el precio manualmente.'},503);
 }
});
