import type { ReactNode } from 'react'
import { ArrowLeft, Home as HomeIcon, SlidersHorizontal } from 'lucide-react'
import type { ServiceLine } from '@shared/services'
import { useApp } from '../store/app'
import { cx } from './cx'
import { Logo } from './Logo'

export interface RailSubItem {
  id: string
  label: string
  on: boolean
  onPick: () => void
}

function Item({
  on,
  icon,
  children,
  onClick,
  small,
  attention
}: {
  on?: boolean
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  small?: boolean
  /** A small dot after the label: something behind this item needs the user. */
  attention?: string
}) {
  return (
    <button
      type="button"
      aria-current={on ? 'page' : undefined}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-3 text-left transition-colors',
        small ? 'h-9 text-sm' : 'h-10 text-[15px]',
        // The yellow bar marks where you are; the rail has no other yellow.
        on ? 'bg-raised font-semibold text-fg shadow-[inset_3px_0_0_var(--color-sun)]' : 'font-medium text-muted hover:bg-raised hover:text-fg'
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
      {attention && <span className="ml-auto size-2 shrink-0 rounded-full bg-sun" role="img" aria-label={attention} title={attention} />}
    </button>
  )
}

/**
 * The left rail of the pages outside a project (Home and Settings): brand, navigation, and which AI service does
 * each job. Project pages keep their top bar, so the editor gets the full width.
 */
export function AppRail({
  active,
  sub,
  backToProject,
  onSettings,
  services
}: {
  active: 'home' | 'settings'
  /** Settings tabs, shown as sub-items under "Pengaturan" (text only: the rail is narrow). */
  sub?: RailSubItem[]
  /** Shown first when Settings was opened from a project. */
  backToProject?: () => void
  /** On Settings itself: show the AI services tab (there is no page to navigate to). */
  onSettings?: () => void
  services: ServiceLine[]
}) {
  const { go } = useApp()
  const openSettings = (): void => (onSettings ? onSettings() : go({ name: 'settings', back: { name: 'home' } }))
  // Captions work without Whisper (with estimated timing), so only the three required services raise the dot.
  const needsSetup = services.some((s) => s.id !== 'caption' && !s.ok)
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-rail px-4 pb-4 pt-5">
      <button type="button" onClick={() => go({ name: 'home' })} className="self-start rounded-lg px-1.5 pb-5" aria-label="Video Story, ke Beranda">
        <Logo />
      </button>
      <nav aria-label="Menu utama" className="flex flex-col gap-0.5">
        {backToProject && (
          <Item icon={<ArrowLeft className="size-[17px]" />} onClick={backToProject}>
            Kembali ke proyek
          </Item>
        )}
        <Item on={active === 'home'} icon={<HomeIcon className="size-[17px]" />} onClick={() => go({ name: 'home' })}>
          Beranda
        </Item>
        <Item on={active === 'settings' && !sub?.length} icon={<SlidersHorizontal className="size-[17px]" />}
          onClick={openSettings}
          attention={needsSetup && active !== 'settings' ? 'Ada layanan AI yang belum siap' : undefined}
        >
          Pengaturan
        </Item>
        {sub && (
          <div className="ml-[21px] flex flex-col gap-0.5 border-l border-line pl-2">
            {sub.map((s) => (
              <Item key={s.id} small on={s.on} onClick={s.onPick}>
                {s.label}
              </Item>
            ))}
          </div>
        )}
      </nav>
      <div className="flex-1" />
      {services.length > 0 && (
        // The separator sits on the wrapper so the button's rounded hover fill does not bend or cover it.
        <div className="border-t border-line pt-2">
          <button
            type="button"
            onClick={openSettings}
            title="Buka Pengaturan layanan AI"
            className="flex w-full flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-raised"
          >
            <span className="pb-0.5 font-semibold text-fg">Layanan AI</span>
            {services.map((s) => (
              <span key={s.id} className="flex items-center gap-2 text-muted">
                {/* Ready is a filled dot, not ready a hollow one: the difference does not rest on colour alone. */}
                <span className={cx('size-[7px] shrink-0 rounded-full', s.ok ? 'bg-ok-ink' : 'border border-muted')} aria-hidden="true" />
                <span>{s.label}</span>
                <span className={cx('ml-auto truncate pl-2 text-right', s.ok ? 'text-fg-2' : 'text-muted')} title={s.provider}>
                  {s.provider}
                </span>
                <span className="sr-only">{s.ok ? 'siap' : 'belum siap'}</span>
              </span>
            ))}
          </button>
        </div>
      )}
    </aside>
  )
}
