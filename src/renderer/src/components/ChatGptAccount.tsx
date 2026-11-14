import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import type { AccountStatus } from '@shared/types'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'
import { Button, Modal } from './ui'
import openaiMark from '../assets/providers/openai.svg?raw'

const USAGE_URL = 'https://chatgpt.com/settings/usage'

/** OpenAI's sign-in guidelines ask for this exact label and the white ChatGPT mark on the button. */
function ContinueButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button variant="secondary" className="h-11 gap-2.5 border-edge bg-black px-4 text-white hover:border-fg/60" loading={busy} onClick={onClick}>
      {!busy && <span aria-hidden="true" className="flex size-[18px] text-white [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: openaiMark }} />}
      {busy ? 'Menunggu login di browser…' : 'Continue with ChatGPT'}
    </Button>
  )
}

/** Sign-in state of the ChatGPT plan for the story writer, shown instead of an API key field. */
export function ChatGptAccount({
  account,
  welcomeSeen,
  onWelcomeSeen,
  onSignedIn
}: {
  account?: AccountStatus
  welcomeSeen: boolean
  onWelcomeSeen: () => void
  onSignedIn: () => void
}) {
  const { toast } = useApp()
  const [busy, setBusy] = useState<'login' | 'logout' | null>(null)
  const [welcome, setWelcome] = useState(false)
  const ready = !!account?.signedIn && account.planUsageAllowed !== false

  const login = async (): Promise<void> => {
    setBusy('login')
    try {
      const s = await window.api.auth.login('chatgpt')
      if (s.planUsageAllowed === false) {
        toast('error', 'Login berhasil, tapi izin pemakaian paket ChatGPT belum diberikan.')
        return
      }
      toast('success', `Masuk ke ChatGPT sebagai ${s.label ?? 'akunmu'}`)
      if (!welcomeSeen) setWelcome(true)
      onSignedIn()
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const logout = async (): Promise<void> => {
    setBusy('logout')
    try {
      const r = await window.api.auth.logout('chatgpt')
      if (r.revoked) toast('success', 'Kamu sudah keluar dari ChatGPT di aplikasi ini.')
      else
        toast(
          'error',
          'Kamu sudah keluar di aplikasi ini, tapi pencabutan akses di ChatGPT belum terkonfirmasi. Putuskan aplikasi dari pengaturan ChatGPT kalau perlu.'
        )
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const closeWelcome = (): void => {
    setWelcome(false)
    onWelcomeSeen()
  }

  const usageLink = (
    <button
      type="button"
      onClick={() => void window.api.app.openExternal(USAGE_URL)}
      className="inline-flex shrink-0 items-center gap-1 font-semibold text-link hover:underline"
    >
      Kelola pemakaian
      <ExternalLink className="size-3.5" />
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {ready ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <Check className="size-4 shrink-0 text-ok-ink" strokeWidth={3} />
            <span className="truncate">{account?.label ?? 'Akun ChatGPT'}</span>
          </span>
          <span className="text-[13px] text-fg-2">Memakai paket ChatGPT</span>
          <span className="text-[13px]">{usageLink}</span>
          <span className="flex-1" />
          <Button className="h-10" loading={busy === 'logout'} onClick={() => void logout()}>
            Keluar
          </Button>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-fg-2">
            {account?.needsReauth
              ? 'Sesi ChatGPT berakhir. Login ulang untuk melanjutkan.'
              : account?.signedIn && account.planUsageAllowed === false
                ? 'Izin pemakaian paket belum diberikan. Login ulang dan setujui izinnya.'
                : 'Login dengan akun ChatGPT-mu. Penyusunan cerita memakai kuota paket ChatGPT, terpisah dari biaya layanan lain.'}
          </p>
          <div className="flex items-center gap-2">
            <ContinueButton busy={busy === 'login'} onClick={() => void login()} />
            {busy === 'login' && (
              <Button variant="ghost" className="h-11" onClick={() => void window.api.auth.cancel()}>
                Batal
              </Button>
            )}
            <span className="flex-1" />
            <span className="text-[13px]">{usageLink}</span>
          </div>
        </>
      )}
      <Modal open={welcome} onClose={closeWelcome} title="Kamu memakai paket ChatGPT" width={480}>
        <p className="text-[15px] leading-relaxed text-fg-2">
          Permintaan menyusun cerita memakai kuota paket ChatGPT-mu, terpisah dari biaya layanan lain. Atur batasnya di pengaturan ChatGPT.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" autoFocus onClick={closeWelcome}>
            Mengerti
          </Button>
        </div>
      </Modal>
    </div>
  )
}
