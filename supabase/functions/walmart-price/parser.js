const ignored=new Set(['de','del','la','el','los','las','un','una','y','con','para','pza','pzas','pieza','piezas']);

export function normalizeProductText(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function tokens(value){return normalizeProductText(value).split(' ').filter(token=>token&&!ignored.has(token));}

function priceCents(value){
 if(value&&typeof value==='object')value=value.price??value.value??value.amount??value.currentPrice;
 if(typeof value==='string')value=Number(value.replace(/[^0-9.,-]/g,'').replace(/,/g,''));
 if(!Number.isFinite(value)||value<=0||value>1000000)return null;
 return Math.round(value*100);
}

function nested(source,path){return path.reduce((value,key)=>value&&typeof value==='object'?value[key]:undefined,source);}

function candidateFrom(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const name=[value.name,value.productName,value.title,value.displayName].find(item=>typeof item==='string'&&item.trim().length>2);
 if(!name)return null;
 const paths=[
  ['priceInfo','currentPrice','price'],['priceInfo','currentPrice'],['price','currentPrice'],
  ['offers','price'],['currentPrice','price'],['currentPrice'],['salesPrice'],['price']
 ];
 let cents=null;
 for(const path of paths){cents=priceCents(nested(value,path));if(cents!==null)break;}
 if(cents===null)return null;
 const rawUrl=[value.canonicalUrl,value.productPageUrl,value.productUrl,value.url,value.productHref].find(item=>typeof item==='string');
 let url='';
 if(rawUrl){
  try{const parsed=new URL(rawUrl,'https://www.walmart.com.mx');if(parsed.hostname==='www.walmart.com.mx'||parsed.hostname.endsWith('.walmart.com.mx'))url=parsed.href;}catch{/* Ignora URLs inválidas. */}
 }
 return {name:name.trim(),price_cents:cents,url};
}

function score(query,candidate){
 const wanted=tokens(query),found=new Set(tokens(candidate.name));
 if(!wanted.length)return 0;
 const overlap=wanted.filter(token=>found.has(token)).length/wanted.length;
 const normalizedQuery=normalizeProductText(query),normalizedName=normalizeProductText(candidate.name);
 const phrase=normalizedName.includes(normalizedQuery)||normalizedQuery.includes(normalizedName)?0.35:0;
 const wantedNumbers=wanted.filter(token=>/^\d+$/.test(token));
 const numberPenalty=wantedNumbers.some(token=>!found.has(token))?0.35:0;
 return overlap+phrase-numberPenalty;
}

function collectJson(value,output,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return;
 seen.add(value);
 const candidate=candidateFrom(value);if(candidate)output.push(candidate);
 if(Array.isArray(value)){for(const item of value)collectJson(item,output,seen);return;}
 for(const child of Object.values(value))collectJson(child,output,seen);
}

export function rankWalmartProducts(query,products,limit=5){
 const unique=new Map();
 for(const product of products){
  const key=`${normalizeProductText(product.name)}|${product.price_cents}`;
  const ranked={...product,score:score(query,product)};
  if(!unique.has(key)||unique.get(key).score<ranked.score)unique.set(key,ranked);
 }
 return [...unique.values()].filter(product=>product.score>=0.45).sort((a,b)=>b.score-a.score||a.price_cents-b.price_cents).slice(0,limit).map(({score:_,...product})=>product);
}

export function extractWalmartProducts(html,query){
 const products=[];
 const scripts=String(html||'').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
 for(const match of scripts){
  const raw=match[1].trim();
  if(!raw||(!raw.startsWith('{')&&!raw.startsWith('[')))continue;
  try{collectJson(JSON.parse(raw),products);}catch{/* Algunos scripts no son JSON estricto. */}
 }
 return rankWalmartProducts(query,products);
}
