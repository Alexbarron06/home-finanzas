import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockStatus} from '../src/stock-status.js';

test('zero units are finished even when the minimum is also zero',()=>{
 assert.equal(stockStatus({on_hand:0,minimum:0}),'Terminado');
 assert.equal(stockStatus({on_hand:0,minimum:2}),'Terminado');
 assert.equal(stockStatus({on_hand:1,minimum:2}),'Por terminar');
 assert.equal(stockStatus({on_hand:3,minimum:2}),'Disponible');
});
