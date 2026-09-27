import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflows} from '../src/workflows.js';

test('inventory view renders product states without relying on missing globals',()=>{
 const data={products:[
  {id:'empty',name:'Arroz',category:'Despensa',unit:'paquete',on_hand:0,minimum:1,target:2},
  {id:'low',name:'Leche',category:'Despensa',unit:'litro',on_hand:1,minimum:2,target:6},
 ],shopping_items:[],inventory_events:[],expenses:[],expense_history:[],funds:[],reservations:[]};
 const workflows=createWorkflows({
  getData:()=>data,
  categories:['Despensa'],
  esc:value=>String(value),
  money:value=>String(value),
  cents:Number,
  today:()=> '2026-09-26',
  validateExpense:()=>{},
 });
 const html=workflows.inventoryView();
 assert.match(html,/Arroz/);
 assert.match(html,/Terminado/);
 assert.match(html,/Leche/);
 assert.match(html,/Por terminar/);
});
