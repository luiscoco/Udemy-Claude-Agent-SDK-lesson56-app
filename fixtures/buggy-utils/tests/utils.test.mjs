import {test} from 'node:test';
import assert from 'node:assert/strict';
import {average} from '../src/utils.js';
test('average handles empty input',()=>assert.equal(average([]),0));
test('average keeps normal behavior',()=>{assert.equal(average([2,4,6]),4);assert.equal(average([-2,2]),0);});
