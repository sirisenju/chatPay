import { describe, it, expect } from 'vitest';
import { parseWithRules } from '../../src/modules/commands/parser.js';

describe('Unit Tests: Command Parser Table (40+ Phrasing Permutations)', () => {
  const testPhrasings = [
    // Standard "Verb Amount Asset to Alias"
    { input: 'Send 10 USDC to Alex', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'send 10 usdc to alex', expected: { amount: '10', asset: 'USDC', recipient: 'alex' } },
    { input: 'SEND 10 USDC TO ALEX', expected: { amount: '10', asset: 'USDC', recipient: 'ALEX' } },
    { input: 'Pay 10 USDC to Alex', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'pay 10 usdc to alex', expected: { amount: '10', asset: 'USDC', recipient: 'alex' } },
    { input: 'PAY 10 USDC TO ALEX', expected: { amount: '10', asset: 'USDC', recipient: 'ALEX' } },
    { input: 'Transfer 10 USDC to Alex', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'transfer 10 usdc to alex', expected: { amount: '10', asset: 'USDC', recipient: 'alex' } },
    { input: 'TRANSFER 10 USDC TO ALEX', expected: { amount: '10', asset: 'USDC', recipient: 'ALEX' } },

    // Standard "Verb Alias Amount Asset"
    { input: 'Send Alex 10 USDC', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'send alex 10 usdc', expected: { amount: '10', asset: 'USDC', recipient: 'alex' } },
    { input: 'SEND ALEX 10 USDC', expected: { amount: '10', asset: 'USDC', recipient: 'ALEX' } },
    { input: 'Pay Alex 10 USDC', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'pay alex 10 usdc', expected: { amount: '10', asset: 'USDC', recipient: 'alex' } },
    { input: 'Transfer Alex 10 USDC', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'transfer alex 10 usdc', expected: { amount: '10', asset: 'USDC', recipient: 'alex' } },

    // Decimal numbers
    { input: 'Send 50.25 USDC to Sarah', expected: { amount: '50.25', asset: 'USDC', recipient: 'Sarah' } },
    { input: 'Pay Bob 100.5 USDC', expected: { amount: '100.5', asset: 'USDC', recipient: 'Bob' } },
    { input: 'Transfer 0.0000001 USDC to David', expected: { amount: '0.0000001', asset: 'USDC', recipient: 'David' } },
    { input: 'pay 12.3456789 usdc to sam', expected: { amount: '12.3456789', asset: 'USDC', recipient: 'sam' } },

    // Dollar sign prefixes
    { input: 'Send $10 to Alex', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'Pay $25 to Bob', expected: { amount: '25', asset: 'USDC', recipient: 'Bob' } },
    { input: 'Transfer $50 to Charlie', expected: { amount: '50', asset: 'USDC', recipient: 'Charlie' } },
    { input: 'Send Alex $10', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'Pay Bob $25.50', expected: { amount: '25.50', asset: 'USDC', recipient: 'Bob' } },
    { input: 'Transfer Charlie $50', expected: { amount: '50', asset: 'USDC', recipient: 'Charlie' } },

    // Shorthand "[Amount] [Asset] to [Alias]"
    { input: '10 USDC to Alex', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: '50.5 USDC to Bob', expected: { amount: '50.5', asset: 'USDC', recipient: 'Bob' } },
    { input: '$100 to Charlie', expected: { amount: '100', asset: 'USDC', recipient: 'Charlie' } },
    { input: '$5 to Sarah', expected: { amount: '5', asset: 'USDC', recipient: 'Sarah' } },

    // Shorthand "[Alias] [Amount] [Asset]"
    { input: 'Alex 10 USDC', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'Bob 50 USDC', expected: { amount: '50', asset: 'USDC', recipient: 'Bob' } },
    { input: 'Charlie 0.5 USDC', expected: { amount: '0.5', asset: 'USDC', recipient: 'Charlie' } },
    { input: 'Sarah $20', expected: { amount: '20', asset: 'USDC', recipient: 'Sarah' } },

    // Direct address phrasing with comma
    { input: 'Alex, send 10 USDC', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'Bob, pay 20 USDC', expected: { amount: '20', asset: 'USDC', recipient: 'Bob' } },
    { input: 'Charlie, transfer 50 USDC', expected: { amount: '50', asset: 'USDC', recipient: 'Charlie' } },

    // XLM asset support
    { input: 'Send 10 XLM to Alex', expected: { amount: '10', asset: 'XLM', recipient: 'Alex' } },
    { input: 'Pay Alex 25 XLM', expected: { amount: '25', asset: 'XLM', recipient: 'Alex' } },
    { input: 'Transfer 50 XLM to Bob', expected: { amount: '50', asset: 'XLM', recipient: 'Bob' } },

    // Implicit asset (default USDC)
    { input: 'Send 10 to Alex', expected: { amount: '10', asset: 'USDC', recipient: 'Alex' } },
    { input: 'Pay Bob 50', expected: { amount: '50', asset: 'USDC', recipient: 'Bob' } },
    { input: 'Transfer 100 to Charlie', expected: { amount: '100', asset: 'USDC', recipient: 'Charlie' } }
  ];

  it(`verifies all ${testPhrasings.length} standard phrasing variants`, () => {
    expect(testPhrasings.length).toBeGreaterThanOrEqual(40);

    for (const testCase of testPhrasings) {
      const result = parseWithRules(testCase.input);
      expect(result.intent, `Failed intent for: ${testCase.input}`).toBe('payment');
      expect(result.amount, `Failed amount for: ${testCase.input}`).toBe(testCase.expected.amount);
      expect(result.asset, `Failed asset for: ${testCase.input}`).toBe(testCase.expected.asset);
      expect(result.recipientAlias, `Failed recipient for: ${testCase.input}`).toBe(testCase.expected.recipient);
    }
  });

  it('correctly handles incomplete commands requiring clarification', () => {
    // Missing recipient
    const res1 = parseWithRules('Send 10 USDC');
    expect(res1.intent).toBe('payment');
    expect(res1.amount).toBe('10');
    expect(res1.recipientAlias).toBeUndefined();

    // Missing amount
    const res2 = parseWithRules('Send to Alex');
    expect(res2.intent).toBe('payment');
    expect(res2.recipientAlias).toBe('Alex');
    expect(res2.amount).toBeUndefined();
  });

  it('correctly identifies non-payment conversation', () => {
    expect(parseWithRules('hello bot').intent).toBe('unknown');
    expect(parseWithRules('what is my current balance?').intent).toBe('unknown');
    expect(parseWithRules('help me').intent).toBe('unknown');
  });
});
