const demoProducts=[{
 name:'Huevo blanco San Juan 18 pzas',
 price_cents:4300,
 url:'https://www.walmart.com.mx/ip/huevo-blanco-san-juan-18-pzas-/00750300055509'
}];

export function walmartQueryFor(form,products=[]){
 const selected=form.elements.product_id?.value;
 if(selected&&selected!=='__new__')return products.find(product=>product.id===selected)?.name?.trim()||'';
 return form.elements.name?.value?.trim()||'';
}

export function applyWalmartMatch(form,match){
 if(!match||!Number.isInteger(match.price_cents)||match.price_cents<0)return false;
 form.elements.estimated_price.value=(match.price_cents/100).toFixed(2);
 form.elements.estimated_price.dispatchEvent(new Event('input',{bubbles:true}));
 return true;
}

export async function findWalmartPrice(db,query,{demo=false}={}){
 const clean=String(query||'').trim();
 if(clean.length<3)throw new Error('Escribe al menos tres caracteres del producto.');
 if(demo){
  const words=clean.toLocaleLowerCase('es-MX').split(/\s+/).filter(Boolean);
  const matches=demoProducts.filter(product=>words.every(word=>product.name.toLocaleLowerCase('es-MX').includes(word)));
  if(!matches.length)throw new Error('En la demostración prueba con “Huevo blanco San Juan 18 pzas”.');
  return {query:clean,match:matches[0],matches,demo:true};
 }
 const {data,error}=await db.functions.invoke('walmart-price',{body:{query:clean}});
 if(error){
  let detail;
  try{detail=await error.context?.json();}catch{/* La respuesta puede no contener JSON. */}
  throw new Error(detail?.error||error.message||'Walmart no respondió. Captura el precio manualmente.');
 }
 if(!data?.match)throw new Error('No encontramos una coincidencia clara. Captura el precio manualmente.');
 return data;
}
