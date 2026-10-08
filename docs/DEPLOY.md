# Deploying

The app is a static site: `npm run build` writes everything to `dist/`. There is no backend,
no database and no secrets. Any static host works; the choice only changes **which security
headers the host can send**.

## What the build produces

| File                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `dist/index.html`    | The page. Has a `<meta>` Content-Security-Policy (works on every host).             |
| `dist/assets/*`      | Hashed JS/CSS/fonts/workers. Safe to cache forever.                                 |
| `dist/theme-init.js` | Sets light/dark before first paint (a file, so the CSP can forbid inline scripts).  |
| `dist/_headers`      | Real HTTP security + caching headers, read by **Netlify** and **Cloudflare Pages**. |

All of it comes from one source, `build/securityHeaders.ts`. `npm run preview` serves the build
with the same headers, so a local check matches production.

## Recommended: Cloudflare Pages or Netlify

Both are free for this, deploy automatically on every push to `main`, give every branch a
preview URL, and honour `dist/_headers` (full CSP including `frame-ancestors`, HSTS,
`X-Frame-Options`, caching rules).

Settings for either:

| Setting                    | Value                                                          |
| -------------------------- | -------------------------------------------------------------- |
| Repository                 | `Sridatta-Bharadwaj/QC_Capstone`                               |
| Production branch          | `main`                                                         |
| Build command              | `npm ci && npm run build` (Netlify: `npm run build` is enough) |
| Output / publish directory | `dist`                                                         |
| Node version               | from `.nvmrc` (24); set `NODE_VERSION=24` if the host asks     |

**Cloudflare Pages:** dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the
repo → framework preset "None" → fill in the table above → Save and Deploy. URL:
`https://<project>.pages.dev`.

**Netlify:** app.netlify.com → Add new site → Import an existing project → GitHub → pick the
repo → fill in the table above → Deploy. URL: `https://<site>.netlify.app`.

## Alternative: GitHub Pages

Works (asset paths are relative, `base: './'`), but GitHub Pages **cannot send custom
headers**: `_headers` is ignored, so only the `<meta>` CSP applies. That still blocks inline and
third-party scripts, but not framing (clickjacking) or HSTS. Fine for a course demo, weaker than
the two hosts above. Needs a workflow that runs `npm ci && npm run build` and publishes `dist/`
with `actions/upload-pages-artifact` + `actions/deploy-pages`, and Settings → Pages → Source →
"GitHub Actions". URL: `https://sridatta-bharadwaj.github.io/QC_Capstone/`.

## After the first deploy: checklist

- [ ] Open the URL in a private window: the workspace loads, no console errors.
- [ ] Bell preset → both spheres at the centre, status bar "Entangled: q0, q1", purity 0.500.
- [ ] Type in the Qiskit tab → canvas and QASM tab update.
- [ ] Copy link → open it in another browser → same circuit.
- [ ] Download → Bloch spheres (.png) works.
- [ ] Response headers (DevTools → Network → the document): `Content-Security-Policy`,
      `X-Frame-Options: DENY`, `Strict-Transport-Security` present (Netlify / Cloudflare only).
      Or scan the URL at https://securityheaders.com.
- [ ] DevTools console: no "Refused to … because it violates the Content Security Policy".
- [ ] On the presentation PC: open the URL once before the demo. Without WebGL the spheres switch
      to a flat drawing automatically; everything else is the same.

## Things that do not change after deploying

- The live site needs the internet only to load once; the app itself makes no network requests.
- For a demo without internet, use the local build: `npm run build && npm run preview`.
- Saved circuits live in each visitor's own browser (localStorage). Nothing is collected.

## Security notes

- `npm audit` reports 2 **low** advisories in DOMPurify 3.4.15, which Monaco bundles inside its
  own code. Both affect only DOMPurify's `IN_PLACE` mode, which Monaco never uses, so they are
  not reachable here. The only "fix" npm offers downgrades Monaco; revisit when Monaco ships a
  newer DOMPurify.
- `style-src` allows `'unsafe-inline'` because Monaco and React set inline styles. Inline
  styles cannot run code; scripts stay restricted to `'self'`.
