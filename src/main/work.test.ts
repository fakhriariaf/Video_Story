import assert from 'node:assert/strict'
import { test } from 'node:test'
import { workLine } from '@shared/work'

test('workLine shows the time spent and how long the step usually takes', () => {
  assert.equal(workLine(0, 60), 'Sudah 0:00 · biasanya kurang dari 1 menit')
  assert.equal(workLine(23_400, 60), 'Sudah 0:23 · biasanya kurang dari 1 menit')
  assert.equal(workLine(75_000, 120), 'Sudah 1:15 · biasanya kurang dari 2 menit')
  assert.equal(workLine(10_000, 45), 'Sudah 0:10 · biasanya kurang dari 45 detik')
})

test('workLine says so when the step runs longer than usual, instead of looking stuck', () => {
  assert.equal(workLine(60_000, 60), 'Sudah 1:00 · lebih lama dari biasanya, AI masih bekerja')
  assert.equal(workLine(200_000, 120), 'Sudah 3:20 · lebih lama dari biasanya, AI masih bekerja')
})
