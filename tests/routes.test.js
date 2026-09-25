import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routes, hrefForPage, pageFromHash} from '../src/routes.js';

test('each sidebar destination opens its own page after reload or browser back',()=>{
 for(const [page] of routes) assert.equal(pageFromHash(hrefForPage(page)),page);
 assert.equal(new Set(routes.map(([page])=>hrefForPage(page))).size,routes.length);
 assert.equal(pageFromHash('#activate=private-token'),'Inicio');
});
