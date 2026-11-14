import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buttonTone, type ButtonVariant } from '../renderer/src/components/buttonTone'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'accent', 'ghost', 'danger']

test('a disabled button is a grey plate with readable text', () => {
  for (const v of ['primary', 'accent', 'danger'] as const) {
    const classes = buttonTone(v, false).split(' ')
    assert.ok(classes.includes('disabled:bg-raised'), v)
    assert.ok(classes.includes('disabled:text-muted'), v)
    // The hover brightening must not apply to a button that cannot be clicked.
    assert.ok(classes.includes('disabled:brightness-100'), v)
  }
})

test('a button that is working keeps its colour', () => {
  // "Mulai", "Susun naskah" and "Ekspor video" stay disabled for the whole run; grey would read as "not available".
  for (const v of VARIANTS) {
    const classes = buttonTone(v, true).split(' ')
    assert.deepEqual(
      classes.filter((c) => /^disabled:(bg-|text-|opacity-)/.test(c)),
      [],
      v
    )
    assert.ok(classes.includes('disabled:cursor-progress'), v)
  }
  assert.ok(buttonTone('primary', true).includes('bg-sun text-sun-on'))
})
