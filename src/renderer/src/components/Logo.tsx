export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17.5" r="15.5" fill="#4338CA" stroke="#1F1D1A" strokeWidth="1.5" />
      <path d="M13.2 10.6v13.8l12.1-6.9z" fill="#FFFFFF" stroke="#1F1D1A" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M27 2.6Q27.55 6.15 31.1 6.7Q27.55 7.25 27 10.8Q26.45 7.25 22.9 6.7Q26.45 6.15 27 2.6Z"
        fill="#FFC93C"
        stroke="#1F1D1A"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[21px] font-bold tracking-[-0.01em]">Video Story</span>
        <span className="mt-[3px] self-end text-[10.5px] font-medium text-muted">by Fakhri Ariaf</span>
      </span>
    </span>
  )
}
