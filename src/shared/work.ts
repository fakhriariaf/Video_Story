/**
 * The line under "AI sedang menyusun…" while one long request to the story model runs. The model answers in one
 * piece, so there is no real percentage to show; the time spent and the usual duration tell the user it is alive.
 */
export function workLine(elapsedMs: number, typicalSec: number): string {
  const s = Math.max(0, Math.floor(elapsedMs / 1000))
  const spent = `Sudah ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  // Past the usual time the promise would read as a lie, and silence as a hang.
  if (s >= typicalSec) return `${spent} · lebih lama dari biasanya, AI masih bekerja`
  const usual = typicalSec % 60 === 0 ? `${typicalSec / 60} menit` : `${typicalSec} detik`
  return `${spent} · biasanya kurang dari ${usual}`
}
