import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// Guards for the renderer's theme: the tests run from the repository root (npm test).
const RENDERER = join(process.cwd(), 'src', 'renderer', 'src')
const css = readFileSync(join(RENDERER, 'styles.css'), 'utf8')

function color(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)
  if (!m) throw new Error(`theme token --color-${name} is missing`)
  return m[1]
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAIRS: [string, string][] = [
  ['fg', 'canvas'],
  ['fg', 'panel'],
  ['fg', 'raised'],
  ['fg', 'select'],
  ['fg-2', 'panel'],
  ['fg-2', 'draft'],
  ['muted', 'canvas'],
  ['muted', 'panel'],
  ['muted', 'rail'],
  ['muted', 'raised'],
  ['faint', 'panel'],
  ['link', 'panel'],
  ['sun-on', 'sun'],
  ['canvas', 'accent'],
  ['ok-ink', 'ok-soft'],
  ['info-ink', 'info-soft'],
  ['sun-ink', 'sun-soft'],
  ['bad-ink', 'bad-soft']
]

test('every text and background pair of the theme reaches 4.5:1', () => {
  for (const [text, bg] of PAIRS) {
    const ratio = contrast(color(text), color(bg))
    assert.ok(ratio >= 4.5, `${text} on ${bg} is ${ratio.toFixed(2)}:1`)
  }
})

test('the theme defines every token of the Ruang Edit palette', () => {
  const names = [
    'canvas', 'panel', 'rail', 'raised', 'strip', 'select', 'fg', 'fg-2', 'muted', 'faint', 'line', 'line-2', 'line-3', 'edge',
    'accent', 'accent-press', 'accent-soft', 'link', 'sun', 'sun-on', 'sun-soft', 'sun-ink', 'ok-soft', 'ok-ink',
    'info-soft', 'info-ink', 'bad-soft', 'bad-ink', 'draft'
  ]
  for (const name of names) assert.ok(color(name), name)
  assert.equal(color('canvas').toLowerCase(), '#121026')
  assert.equal(color('sun').toLowerCase(), '#ffb627')
})
