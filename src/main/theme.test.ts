import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
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
  ['fg', 'ok-soft'],
  ['fg', 'bad-soft'],
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

function rendererFiles(dir = RENDERER): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return rendererFiles(path)
    return /\.(tsx?|css)$/.test(e.name) ? [path] : []
  })
}

test('no legacy class, font or colour names remain in the renderer', () => {
  const LEGACY = [
    /shadow-ink/,
    /\b[a-z]+-(paper|surface|sand|accent-dark)\b/,
    /\b(text|bg|border|ring|fill|stroke|outline|divide|decoration|caret|placeholder)-ink(-2)?\b/,
    /--color-(ink|paper|surface|sand)\b/,
    /Bricolage|Plus Jakarta/i,
    /#(faf7f2|f3efe8|1f1d1a|57524a|6b665e|e6dfd3|d4cbbb|bfb5a4|efeae2)(?![0-9a-f])/i,
    // The old ink written as rgb, e.g. in a gradient.
    /rgba?\(\s*31,\s*29,\s*26/
  ]
  // Caption and overlay colour presets end up in the exported video; they are content, not app theme.
  const VIDEO_COLOURS = /_SWATCHES = \[|captionBg:/
  const hits = rendererFiles().flatMap((file) =>
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((text, i) => ({ text, at: `${relative(RENDERER, file)}:${i + 1}` }))
      .filter((l) => LEGACY.some((r) => r.test(l.text)) && !VIDEO_COLOURS.test(l.text))
      .map((l) => l.at)
  )
  assert.deepEqual(hits, [])
})

function rendererLines(): { text: string; at: string }[] {
  return rendererFiles().flatMap((file) =>
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((text, i) => ({ text, at: `${relative(RENDERER, file)}:${i + 1}` }))
  )
}

test('dark text is only used on the bright accent and sun fills', () => {
  // text-canvas is the dark colour for text on a bright fill; anywhere else it is dark on dark.
  const hits = rendererLines()
    .filter((l) => /\btext-canvas\b/.test(l.text) && !/\bbg-(accent|sun|fg)\b/.test(l.text))
    .map((l) => l.at)
  assert.deepEqual(hits, [])
})

test('light fills carry dark text', () => {
  // A bright yellow fill with the default light text is unreadable. The playhead line, its handle and the rail's
  // attention dot carry no text.
  const TEXTLESS = /w-0.5 bg-sun|size-3.5 rounded-.3px. bg-sun|size-2 shrink-0 rounded-full bg-sun/
  const hits = rendererLines()
    .filter((l) => !TEXTLESS.test(l.text))
    .filter((l) => /\bbg-sun\b(?![-/])/.test(l.text) && !/\btext-sun-on\b/.test(l.text) && /className|cx\(|'/.test(l.text))
    .map((l) => l.at)
  assert.deepEqual(hits, [])
})

test('outlines and borders never use the canvas colour', () => {
  const hits = rendererLines()
    .filter((l) => /\b(border|outline)-canvas\b/.test(l.text))
    .map((l) => l.at)
  assert.deepEqual(hits, [])
})

test('the window opens on the canvas colour, not on the old cream', () => {
  const main = readFileSync(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8')
  assert.match(main, new RegExp(`backgroundColor: '${color('canvas')}'`, 'i'))
})

test('the bold sans weight used in the UI is loaded', () => {
  // font-bold and <strong> on body text need Barlow 700; without it the browser fakes the weight.
  const entry = readFileSync(join(RENDERER, 'main.tsx'), 'utf8')
  assert.match(entry, /@fontsource\/barlow\/700\.css/)
})

test('font packages are build-time only', () => {
  // Vite bundles the font files; as runtime dependencies they would be copied into the installer a second time.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  assert.deepEqual(
    Object.keys(pkg.dependencies).filter((name) => name.startsWith('@fontsource')),
    []
  )
})
