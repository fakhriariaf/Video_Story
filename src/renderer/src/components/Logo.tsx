export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      {/* Same shapes as the app icon (build/icon.ico); only the colours follow the dark theme. */}
      <circle cx="17" cy="17.5" r="15.5" fill="#7C6CFF" />
      <path d="M13.2 10.6v13.8l12.1-6.9z" fill="#121026" strokeLinejoin="round" />
      <path d="M27 2.6Q27.55 6.15 31.1 6.7Q27.55 7.25 27 10.8Q26.45 7.25 22.9 6.7Q26.45 6.15 27 2.6Z" fill="#FFB627" />
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
