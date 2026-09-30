# Hosting

flatplan is served by GitHub Pages at
[docs.melchard.org/flatplan](https://docs.melchard.org/flatplan/), with this documentation under
`/docs/`. The domain belongs to the org's Pages root; each repo's site hangs off it by name.

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`:

1. Stage the app shell: `index.html`, `tokens.css`, `sw.js`, the manifest, `icons/` and `src/`.
   Nothing from `node_modules`, `test/` or `serve.js` is published.
2. Write a `version` file with the deployed commit, which the app polls to offer a reload.
3. Render `docs/` with the org docs action into `docs/` of the site.
4. Upload and deploy through `actions/deploy-pages`.

The Environments page of the repo shows what is live and since when.

## Updates on devices

The service worker is network first, so an installed copy picks up a deploy on its next start.
An app that resumed from the background compares the deployed version with the running one and
offers a reload.

## History

Until 2026-09-30 flatplan ran on the home server behind Tailscale, deployed by the monitor repo's
reconciler. Moving to Pages made the repo public and removed the need for a server, a tailnet
port and a health probe.
