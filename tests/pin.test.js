import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePin,normalizeUsername,activationFromHash} from '../src/pin.js';
test('PIN preserves leading zeroes and rejects other formats',()=>{assert.equal(validatePin('0042'),'0042');for(const v of [42,'123','12345','1e03','12 3','abcd'])assert.throws(()=>validatePin(v));});
test('usernames normalize but cannot inject paths or SQL',()=>{assert.equal(normalizeUsername(' TEST_user '),'test_user');for(const v of ['a','../admin',"' OR true",''])assert.throws(()=>normalizeUsername(v));});
test('activation requires a high entropy token and valid user',()=>{const token='a'.repeat(64);assert.deepEqual(activationFromHash(`#activate=${token}&user=test`),{token,username:'test'});assert.equal(activationFromHash(''),null);assert.throws(()=>activationFromHash('#activate=1234&user=test'));});
