// base64url (RFC 4648 §5, no padding) for UTF-8 text. Used by the shareable link.
//
// The URL is untrusted input, so decoding is strict: only the 64 base64url characters are
// accepted (no padding, whitespace or '+' '/'), and the bytes must be valid UTF-8.
// Both helpers return null instead of throwing.

const BASE64URL = /^[A-Za-z0-9_-]*$/

/** UTF-8 text → base64url without '=' padding. */
export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  // btoa works on "binary strings" (one char per byte), so convert the bytes first.
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url → UTF-8 text, or null if the input is not strict base64url or not valid UTF-8. */
export function decodeBase64Url(encoded: string): string | null {
  // A length of 1 mod 4 can never come from whole bytes.
  if (!BASE64URL.test(encoded) || encoded.length % 4 === 1) return null
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    // fatal: true → malformed UTF-8 throws instead of becoming U+FFFD.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
