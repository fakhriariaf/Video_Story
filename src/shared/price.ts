/**
 * How prices are written everywhere in the app: Higgsfield bills in credits, fal.ai and Gemini in dollars.
 * One place, so the model pickers, the Storyboard buttons and the Idea step's slate never disagree.
 */

/** Credits: whole numbers from 10 up, one decimal below. */
export function creditLabel(n: number): string {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('id-ID')
}

/** Dollars with Indonesian decimals; amounts under a dollar keep a third decimal when they have one. */
export function usdLabel(n: number): string {
  return `US$${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`
}

/** "12 kr" for credits, "US$0,40" for dollar-priced providers, null when the price is unknown. */
export function costLabel(e: { credits: number | null; usd: number | null } | null | undefined, times = 1): string | null {
  if (e?.credits != null) return `${creditLabel(e.credits * times)} kr`
  if (e?.usd != null) return usdLabel(e.usd * times)
  return null
}
