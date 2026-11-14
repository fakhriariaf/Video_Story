export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'

const TONE: Record<ButtonVariant, string> = {
  // Yellow is the one action that moves the flow forward; a screen shows at most one of these.
  primary: 'bg-sun text-sun-on hover:brightness-105 font-semibold',
  secondary: 'bg-raised text-fg border border-line-2 hover:border-edge font-medium',
  accent: 'bg-accent text-canvas hover:brightness-110 font-semibold',
  ghost: 'bg-transparent text-fg-2 border border-transparent hover:bg-raised hover:text-fg font-medium',
  danger: 'bg-bad-soft text-bad-ink hover:brightness-110 font-medium'
}

// A disabled button becomes a grey plate with readable text instead of a faded copy of its colour.
const PLATE = 'disabled:bg-raised disabled:text-muted disabled:brightness-100'
const OFF: Record<ButtonVariant, string> = {
  primary: PLATE,
  secondary: 'disabled:text-muted disabled:hover:border-line-2',
  accent: PLATE,
  // A plate would make a borderless button appear from nowhere, so this one only dims.
  ghost: 'disabled:opacity-50',
  danger: PLATE
}

/**
 * Colour classes of a Button. A busy button is disabled too, but keeps its colour: it shows a spinner, and grey would
 * read as "not available" during the longest waits (creating a project, writing the script, exporting).
 */
export function buttonTone(variant: ButtonVariant, busy: boolean): string {
  if (busy) return `${TONE[variant]} disabled:brightness-100 disabled:cursor-progress`
  return `${TONE[variant]} ${OFF[variant]} disabled:cursor-not-allowed`
}
