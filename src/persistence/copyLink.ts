// "Copy link": puts a shareable URL for the current circuit on the clipboard.
// If the clipboard is unavailable (insecure context, permission denied, old browser) the
// link is shown in a notice with a read-only, pre-selected text field instead.
import { showNotice } from '../components/Notices/noticeStore'
import { useCircuitStore } from '../model/store'
import { encodeCircuitHash, shareUrl } from './shareLink'

export const LINK_COPIED_MESSAGE = 'Link copied to the clipboard.'
export const LINK_FALLBACK_MESSAGE = 'Could not use the clipboard. Copy this link:'

export async function copyShareLink(): Promise<void> {
  const encoded = encodeCircuitHash(useCircuitStore.getState().circuit)
  if ('error' in encoded) {
    showNotice(encoded.error, { kind: 'warning' })
    return
  }
  const url = shareUrl(encoded.hash, window.location.href)
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(url)
    showNotice(LINK_COPIED_MESSAGE)
  } catch {
    showNotice(LINK_FALLBACK_MESSAGE, { link: url })
  }
}
