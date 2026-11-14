import assert from 'node:assert/strict'
import { test } from 'node:test'
import { costLabel, creditLabel, usdLabel } from '@shared/price'

test('creditLabel rounds like the pickers do', () => {
  assert.equal(creditLabel(12.4), '12')
  assert.equal(creditLabel(1.55), '1,6')
  assert.equal(creditLabel(6), '6')
})

test('usdLabel uses Indonesian decimals and three places under a dollar', () => {
  assert.equal(usdLabel(0.25), 'US$0,25')
  assert.equal(usdLabel(0.0504), 'US$0,05')
  assert.equal(usdLabel(0.624), 'US$0,624')
  assert.equal(usdLabel(3.5), 'US$3,50')
})

test('costLabel picks credits first, then dollars, then nothing', () => {
  assert.equal(costLabel({ credits: 2, usd: 0.1 }, 3), '6 kr')
  assert.equal(costLabel({ credits: null, usd: 0.05 }, 5), 'US$0,25')
  assert.equal(costLabel(null), null)
  assert.equal(costLabel({ credits: null, usd: null }), null)
})
