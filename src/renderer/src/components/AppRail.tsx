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

function Item({ on, icon, children, onClick, small }: { on?: boolean; icon?: ReactNode; children: ReactNode; onClick: () => void; small?: boolean }) {
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
  services
}: {
  active: 'home' | 'settings'
  /** Settings tabs, shown as sub-items under "Pengaturan" (text only: the rail is narrow). */
  sub?: RailSubItem[]
  /** Shown first when Settings was opened from a project. */
  backToProject?: () => void
  services: ServiceLine[]
}) {
  const { go } = useApp()
  const openSettings = (): void => go({ name: 'settings', back: { name: 'home' } })
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
        <Item on={active === 'settings' && !sub?.length} icon={<SlidersHorizontal className="size-[17px]" />} onClick={() => active !== 'settings' && openSettings()}>
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
        <button
          type="button"
          onClick={() => active !== 'settings' && openSettings()}
          title="Buka Pengaturan layanan AI"
          className="flex flex-col gap-1.5 rounded-lg border-t border-line px-2 pb-1 pt-3.5 text-left text-[13px] hover:bg-raised"
        >
          <span className="pb-0.5 font-semibold text-fg">Layanan AI</span>
          {services.map((s) => (
            <span key={s.id} className="flex items-center gap-2 text-muted">
              <span className={cx('size-[7px] shrink-0 rounded-full', s.ok ? 'bg-ok-ink' : 'bg-line-3')} aria-hidden="true" />
              <span>{s.label}</span>
              <span className={cx('ml-auto truncate pl-2 text-right', s.ok ? 'text-fg-2' : 'text-muted')}>{s.provider}</span>
              <span className="sr-only">{s.ok ? 'siap' : 'belum siap'}</span>
            </span>
          ))}
        </button>
      )}
    </aside>
  )
}
