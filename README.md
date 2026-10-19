# Cargo portfolio enhancements

Cargo remains the visual editor and CMS for https://danfrodrigues.cargo.site/.
This repository hosts optional CSS, JavaScript, and hover assets on GitHub Pages.
It does not replace Cargo or control its layout.

## Current status

- Local infrastructure prepared; no visual interactions enabled.
- GitHub repository creation, Pages deployment, and live Cargo loading are pending.
- Implement Nothing only after the verification steps below pass.

## Files

| Path | Purpose |
| --- | --- |
| `js/loader.js` | Stable entry point pasted into Cargo once |
| `js/main.js` | Explicitly enable interaction modules here |
| `js/projects.js` | Project ID/URL to animation mappings |
| `js/interactions/` | Independent hover, scroll, transition modules |
| `css/main.css` | External style entry point |
| `css/interactions/` | Opt-in feature styles |
| `assets/hover/` | Animations intended for public deployment |
| `cargo/integration.html` | One-time Cargo snippet template |
| `scripts/build.py` | Dependency-free static release packaging |
| `.github/workflows/pages.yml` | Automatic deployment on pushes to main |

Existing `Layout_references/`, `assets/Projects/`, and `assets/thumbnails/` stay
on disk but are ignored by Git. Only `assets/hover/` is published. Everything
tracked in this repository will be visible if the GitHub repository is public.
Keep secrets, client production files, and unpublished artwork out of it.

## Connect GitHub and enable deployment

1. Sign in to GitHub in Chrome. Authentication and MFA stay with you; do not
   paste passwords or tokens into chat.
2. Create an empty repository named `portfolio-enhancements`. A public repository
   supports Pages on GitHub Free. Do not initialize it with a README or .gitignore.
3. Connect the local repository using its exact URL:

   ```sh
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/portfolio-enhancements.git
   git push -u origin main
   ```

   HTTPS pushes require an authenticated Git credential helper or a token;
   GitHub account passwords do not authenticate Git pushes. Alternatively use
   your existing GitHub SSH key and the SSH remote URL provided by GitHub.
   On this Mac, `/Library/Developer/CommandLineTools/usr/bin/git` works even
   though the default `/usr/bin/git` currently fails through Xcode.
4. Open repository Settings → Pages → Build and deployment → Source → GitHub
   Actions. If the first workflow ran before Pages was enabled, rerun it in Actions.
5. Wait for **Deploy Cargo enhancements** to succeed. Open
   `https://YOUR_GITHUB_USERNAME.github.io/portfolio-enhancements/` and verify
   `state: ready` with a release ID. This tests both the external CSS and module.

GitHub's deployment uses the built-in Actions token. No deployment token or
Cargo credentials belong in the repository. Only the deploy job gets Pages write
and OIDC permissions.

## One-time Cargo integration

After Pages is verified, replace the username in `cargo/integration.html`.
In Cargo, open Site Settings → CSS/HTML → HTML. Read and preserve the existing
HTML, then append the single script tag. Click Update and publish if Cargo asks.
Do not replace the CSS editor contents or paste this into page-specific code.

The stable loader fetches the latest release manifest on each full page load,
then loads matching CSS and JavaScript from a content-versioned directory.
Further pushes require no Cargo edits. GitHub/browser caching may delay an
update briefly; reload after deployment succeeds. Already open pages do not
hot-reload. Cargo internal navigation stays under Cargo's control.

The loader exits on `/edit` URLs, editable documents, and inaccessible embedding
contexts. If a download fails, Cargo's existing thumbnail/content stays intact.
No interaction styles are present in the infrastructure release.

## Verify end to end before enabling interactions

1. Verify the Pages status page says `ready` and note the release ID.
2. Open the published Cargo site outside its editor and reload.
3. In the browser console, inspect `window.danPortfolio`. Expect `state: "ready"`,
   `phase: "infrastructure"`, and the same release ID as Pages. Network requests
   should include `loader.js`, `release.json`, versioned `css/main.css`,
   `js/main.js`, and `js/projects.js`, all successful.
4. Make a small diagnostic wording change in `js/main.js`, commit, and push.
   Wait for the workflow and confirm the new release ID and wording appear
   in Cargo. This proves GitHub → Pages → Cargo updating.
5. Check the editor still allows normal thumbnail dragging and that Freeform
   positions and static thumbnails are unchanged. Only then implement hover.

## Cargo inspection (2026-10-19)

The live home page `L3482832595` contains a `gallery-freeform` with
`thumbnail-index="set:U3454076329"`. This is an automatically populated Thumbnail
Index using Freeform layout, not an ordinary collection of HTML image links.

Nothing's page ID is `L0516127503` in `thumbnail-index-metadata`; its media host is:

```html
<media-item href="#project-01-nothing" rel="history" class="thumbnail linked" …>
```

Its link and static image are inside the media item's open shadow root. The
link exposes `part="link sizing-frame"`; its `slot name="custom-media"` has a
fallback static `<img part="media">`. Ordinary document-level `a` selectors do
not reach that link. Inspect the slot, dimensions, and editor behavior before
using it. Match the host's project URL/page ID, never `slot-0` or nth-child.

Cargo owns `freeform-x`, `freeform-y`, `freeform-z`, `freeform-scale`, `scale`,
gallery metadata, sizing and positioning. Never change these, reset host
positioning, move/reorder media items, or intercept the `rel="history"` link.
Cargo may replace thumbnails on internal navigation; modules must support that.

References: [Thumbnail Index](https://docs.cargo.site/thumbnail-index),
[Freeform galleries](https://docs.cargo.site/galleries),
[site-wide custom HTML](https://docs.cargo.site/css-and-html),
[GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Next interaction: Nothing (pending verification)

- Source: `assets/hover/Nothing_ThumbHover_v01.gif` (800 × 450, about 16 MB).
- Default: Cargo's original static thumbnail.
- Hover: grayscale animation; `#E6E6E6` overlay at 50%; centered black project
  title; approximately 200 ms transitions.
- Use a non-interactive visual layer with native link behavior, touch fallback,
  keyboard focus, reduced-motion support, lazy animation loading, and cleanup.
- This GIF is fairly large. Avoid downloading all future GIFs on initial load.

For future projects: drop the public animation in `assets/hover/` and provide the
Cargo project URL or page ID. Add its mapping, commit, and push. No Cargo paste
is needed again.

## Local build and maintenance

```sh
python3 scripts/build.py
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080/` to check infrastructure loading. There are no npm
dependencies. The build publishes only CSS, JavaScript, and hover assets, under
`dist/releases/<content-hash>/`. `dist/` is generated and ignored by Git.

For routine updates, review `git diff`, commit, and push to main. Watch Actions
before reloading Cargo. Roll back by reverting the bad commit and pushing the
revert. To disconnect all custom code immediately, remove only the integration
script from Cargo's site-wide HTML. Native content/layout remains in Cargo.
