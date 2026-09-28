import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWalmartProducts,rankWalmartProducts} from '../supabase/functions/walmart-price/parser.js';
import {findWalmartPrice,walmartQueryFor} from '../src/walmart-price.js';

test('Walmart parser ranks the product that matches brand and presentation',()=>{
 const html=`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{items:[
  {name:'Huevo blanco Bachoco 18 pzas',priceInfo:{currentPrice:{price:41}},productPageUrl:'/ip/bachoco/1'},
  {name:'Huevo blanco San Juan 18 pzas',priceInfo:{currentPrice:{price:43}},productPageUrl:'/ip/san-juan/2'},
  {name:'Huevo blanco San Juan 12 pzas',priceInfo:{currentPrice:{price:28}},productPageUrl:'/ip/san-juan/3'}
 ]}})}</script>`;
 const matches=extractWalmartProducts(html,'Huevo blanco San Juan 18 pzas');
 assert.equal(matches[0].name,'Huevo blanco San Juan 18 pzas');
 assert.equal(matches[0].price_cents,4300);
 assert.equal(matches[0].url,'https://www.walmart.com.mx/ip/san-juan/2');
});

test('Walmart ranking rejects an unrelated result',()=>{
 assert.deepEqual(rankWalmartProducts('Leche entera 1 l',[{name:'Televisor 55 pulgadas',price_cents:800000,url:''}]),[]);
});

test('demo lookup returns the published sample price',async()=>{
 const result=await findWalmartPrice(null,'Huevo blanco San Juan 18 pzas',{demo:true});
 assert.equal(result.match.price_cents,4300);
});

test('selected inventory product supplies the Walmart query',()=>{
 const form={elements:{product_id:{value:'egg'},name:{value:''}}};
 assert.equal(walmartQueryFor(form,[{id:'egg',name:'Huevo blanco San Juan 18 pzas'}]),'Huevo blanco San Juan 18 pzas');
});
