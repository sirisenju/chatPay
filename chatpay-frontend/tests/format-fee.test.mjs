import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFeeStroops } from '../lib/format-fee.ts';
test('converts live backend stroops to XLM',()=>{assert.equal(formatFeeStroops('100'),'0.00001');assert.equal(formatFeeStroops('10000000'),'1');assert.equal(formatFeeStroops('1'),'0.0000001');assert.equal(formatFeeStroops('0'),'0');});
test('keeps fee precision without floating point conversion',()=>{assert.equal(formatFeeStroops('123456789012345678901'),'12345678901234.5678901');});
test('does not label malformed or decimal fee values as XLM',()=>{for(const value of ['','0.00001','-100','unknown'])assert.equal(formatFeeStroops(value),null);});
