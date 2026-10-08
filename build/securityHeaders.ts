// Security headers for the deployed site: one source of truth, used by vite.config.ts to
//   1. inject the Content-Security-Policy as a <meta> tag into the built index.html (works on
//      any static host, including GitHub Pages, which cannot set headers),
//   2. write dist/_headers (read by Netlify and Cloudflare Pages: real HTTP headers, including
//      the ones a <meta> tag cannot carry, plus caching rules),
//   3. send the same headers from `npm run preview`, so the production build is tested locally
//      under exactly the policy it will be deployed with.
//
// Why each CSP source is needed:
//   script-src 'self'                 all JS is bundled; no inline scripts (theme-init.js is a file)
//   style-src 'self' 'unsafe-inline'  Monaco and React set inline styles; CSS cannot run code
//   img-src data: blob:               Monaco's inline icons; the PNG download uses a blob URL
//   font-src data:                    Monaco ships its codicon font inline
//   worker-src 'self' blob:           engine + Monaco editor workers (same-origin files)
//   connect-src 'self'                no network calls at all beyond the site itself

export const CSP_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:",
  'font-src': "'self' data:",
  'connect-src': "'self'",
  'worker-src': "'self' blob:",
  'manifest-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'none'",
}

/** Directives that only work as an HTTP header (browsers ignore them in a <meta> tag). */
export const HEADER_ONLY_DIRECTIVES: Record<string, string> = {
  'frame-ancestors': "'none'",
}

const join = (d: Record<string, string>) =>
  Object.entries(d)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ')

export const META_CSP = join(CSP_DIRECTIVES)
export const HEADER_CSP = join({ ...CSP_DIRECTIVES, ...HEADER_ONLY_DIRECTIVES })

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': HEADER_CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
}

/** dist/_headers in the Netlify / Cloudflare Pages format. */
export function headersFile(): string {
  const block = (path: string, headers: Record<string, string>) =>
    [path, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n')
  return (
    [
      block('/*', SECURITY_HEADERS),
      // Hashed file names never change content, so they can be cached forever.
      block('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
      // The page itself must always be revalidated so a new deploy is picked up.
      block('/', { 'Cache-Control': 'no-cache' }),
      block('/index.html', { 'Cache-Control': 'no-cache' }),
      block('/theme-init.js', { 'Cache-Control': 'no-cache' }),
    ].join('\n\n') + '\n'
  )
}
