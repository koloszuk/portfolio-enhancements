# Cargo portfolio enhancements

Cargo remains the visual editor and CMS for https://danfrodrigues.cargo.site/.
This repository hosts optional CSS, JavaScript, and hover assets on GitHub Pages.
It does not replace Cargo or control its layout.

## Current status

- Repository: https://github.com/koloszuk/portfolio-enhancements (main).
- GitHub Actions deploys external code to GitHub Pages; Cargo remains the CMS.
- Nothing hover, desktop project scaling and the stationary homepage dot grid remain enabled.
- Cargo owns native Fly in-out thumbnail movement. Custom reveals remain disabled
  via `ENABLE_SCROLL_REVEAL = false` in `js/main.js`.
- Desktop decorative lines require the intro marker described in
  `cargo/line-anchors.md`; the footer also supports its existing semantic link.
- Interactive code stays excluded from Cargo's editor. Only the passive line
  stylesheet/module may run in its same-origin `client-frame` preview, outside
  editable bodycopy. Unknown embeddings and the editor UI itself remain inert.

## Files

| Path | Purpose |
| --- | --- |
| `js/loader.js` | Stable entry point pasted into Cargo once |
| `js/main.js` | Explicitly enable interaction modules here |
| `js/config.js` | Background, decorative-line and hover-scale settings |
| `js/editor-decorations.js` | Passive editor-preview entry, no interactions |
| `js/decorations/` | Page-level SVG decoration independent of Cargo layout |
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

## GitHub deployment setup (completed)

The remote and GitHub Pages are configured. The following steps document the
setup; do not recreate the repository or add the remote again. Future pushes to
`main` automatically deploy. On this Mac, use the working Git executable below:

```sh
/Library/Developer/CommandLineTools/usr/bin/git push
```

Git authentication uses the macOS Keychain. The temporary GitHub CLI used for
device login is not a project dependency and is not required by the workflow.

1. Sign in to GitHub in Chrome. Authentication and MFA stay with you; do not
   paste passwords or tokens into chat.
2. Create an empty repository named `portfolio-enhancements`. A public repository
   supports Pages on GitHub Free. Do not initialize it with a README or .gitignore.
3. Connect the local repository using its exact URL:

   ```sh
   git remote add origin https://github.com/koloszuk/portfolio-enhancements.git
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
   `https://koloszuk.github.io/portfolio-enhancements/` and verify
   `state: ready` with a release ID. This tests both the external CSS and module.

GitHub's deployment uses the built-in Actions token. No deployment token or
Cargo credentials belong in the repository. Only the deploy job gets Pages write
and OIDC permissions.

## One-time Cargo integration

After Pages is verified, use the prepared `cargo/integration.html` snippet.
In Cargo, open Site Settings → CSS/HTML → HTML. Read and preserve the existing
HTML, then append the single script tag. Click Update and publish if Cargo asks.
Do not replace the CSS editor contents or paste this into page-specific code.

The stable loader fetches the latest release manifest on each full page load,
then loads matching CSS and JavaScript from a content-versioned directory.
Further pushes require no Cargo edits. GitHub/browser caching may delay an
update briefly; reload after deployment succeeds. Already open pages do not
hot-reload. Cargo internal navigation stays under Cargo's control.

The loader exits in the outer `/edit` UI, unrelated editable documents, and
inaccessible embedding contexts. Its only editor exception is the verified
same-origin `client-frame`: this loads `editor-decorations.js` and line CSS,
never main.js or hover/reveal/background modules. If a download fails, Cargo's existing thumbnail/content stays intact.
Only mapped projects receive interaction styles; Cargo owns all layout behavior.

## Verify end to end before enabling interactions

1. Verify the Pages status page says `ready` and note the release ID.
2. Open the published Cargo site outside its editor and reload.
3. In the browser console, inspect `window.danPortfolio`. Expect `state: "ready"`,
   `phase: "project-interactions"`, and the same release ID as Pages. Network requests
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

## Enabled interaction: Nothing

- Source: `assets/hover/Nothing_ThumbHover_v01.gif` (800 × 450, about 16 MB).
- Default: Cargo's original static thumbnail.
- Hover: grayscale animation; `#E6E6E6` overlay at 50%; centered black project
  title; approximately 200 ms transitions.
- A non-interactive visual layer is appended inside Cargo's existing shadow link.
  The original image, link sizing, Freeform attributes, and positioning remain
  intact. The original image fades out only once the GIF has loaded successfully.
- The feature's stylesheet is loaded inside the shadow root. `css/main.css` only
  suppresses the old host overlay/caption on initialized projects to avoid double
  tint and duplicate titles. Existing Cargo CSS and other projects are untouched.
- Keyboard focus also shows the effect. Touch and reduced-motion users keep the
  static image. The loader and module both guard against editor execution.
- GIF loading begins on pointer entry or keyboard focus. After hover/focus exit,
  the image source is removed following the fade to stop hidden GIF decoding.
  The first hover can therefore be delayed by downloading the 16 MB GIF.
- Mutation observers support Cargo replacing thumbnails during navigation;
  cleanup removes only the feature's nodes, listeners, label, and data attributes.
- This GIF is fairly large. Avoid downloading all future GIFs on initial load.

For future projects: drop the public animation in `assets/hover/` and provide the
Cargo project URL or page ID. Add its mapping, commit, and push. No Cargo paste
is needed again.

## Local build and maintenance

```sh
python3 scripts/build.py
node --test tests/*.test.mjs
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080/` to check infrastructure loading. There are no npm
dependencies. The build publishes only CSS, JavaScript, and hover assets, under
`dist/releases/<content-hash>/`. `dist/` is generated and ignored by Git.

For routine updates, review `git diff`, commit, and push to main. Watch Actions
before reloading Cargo. Roll back by reverting the bad commit and pushing the
revert. To disconnect all custom code immediately, remove only the integration
script from Cargo's site-wide HTML. Native content/layout remains in Cargo.

## Homepage project hover scaling

`js/interactions/project-scale.js` tracks mouse entry into each existing shadow
link in the homepage Freeform Thumbnail Index. `css/interactions/project-scale.css`
scales the image, native tint/caption and Nothing's complete GIF/tint/title layer
through the separate CSS `scale` property. Cargo's host, figure and link remain
unscaled; native Fly in-out transforms, Freeform attributes, dimensions and
z-order are unchanged. Visual images do not receive pointer events, leaving the
original moving link as a stable hit area. No wrappers or click handlers are added.

Settings in `js/config.js`: `ENABLE_PROJECT_SCALE`, `PROJECT_SCALE_HOVER` (1.05),
`PROJECT_SCALE_OTHERS` (0.95), `PROJECT_SCALE_NORMAL` (1),
`PROJECT_SCALE_DURATION` (300 ms), and `PROJECT_SCALE_EASING`
(`cubic-bezier(0.22, 1, 0.36, 1)`). All projects update together; one-frame leave
deferral allows smooth handoff between links. Existing opacity transitions are
retained, including Nothing's 200 ms GIF crossfade.

On each hover-target change, the module snapshots the native moving link boxes
and chooses each other thumbnail's nearest corner to the selected link's center.
The selected project's origin is centered. Origins stay locked during scrolling;
no per-frame geometry measurement is added. CSS interpolates transform-origin
alongside scale over the same 300 ms curve, avoiding an instant pivot jump during
handoff (including corner-to-opposite-corner changes). On exit the last origin
is retained while scale returns to 1, which restores the exact native geometry.

Enabled only at desktop widths (901px+) with hover/fine-pointer support and no
reduced-motion preference. Touch input, window blur and preference changes reset
the state. Editor code never imports this module. Cargo navigation and newly
added projects are discovered automatically; teardown restores owned styles.
`tests/project-scale.test.mjs` covers handoff, reset, guards and cleanup.

## Project scroll reveals

`js/interactions/scroll-reveal.js` can be mounted independently from hover by
`js/main.js`. It automatically discovers linked media items inside
`gallery-freeform[thumbnail-index]`, including future Cargo projects.

- Opacity 0 → 1 and direction-aware movement, both 1000 ms with
  `cubic-bezier(0.22, 1, 0.36, 1)` ease-out and a shared animation start time.
- The fade covers the whole media item, including its native hover decoration.
  Only the internal `figure[part~="figure"]` moves: individual CSS `translate`
  goes from `0 10%` when scrolling down or `0 -10%` when scrolling up to `0 0%`.
  Its height matches each thumbnail, so displacement
  scales independently with each project and the responsive layout.
- Each item triggers on its first nonzero viewport intersection. No stagger,
  delay, extra wrapper, or Cargo transform/position override. Both finite
  animations use `fill: none` and are removed on completion/cancellation, leaving
  exactly the original Freeform coordinates and no inline styles.
- If the internal figure is unavailable, the browser lacks movement support, or
  Cargo is already using that figure's individual `translate` property, retain
  the fade without overriding Cargo's styling.
- Replay on each viewport entry, in either scroll direction. The observer stays
  attached to Cargo's stationary media-item box after every reveal.
- A passive scroll listener tracks direction with a 0.5 px jitter tolerance and
  elastic overscroll clamping. IO also samples position before starting reveals.
  Direction is captured in each animation's keyframes, so reversing scroll while
  a thumbnail is visible never reverses or restarts its current animation.
  Initial/restored pages default to the downward-entry effect until scroll moves.
- Per-thumbnail visibility state prevents duplicate/partial intersections from
  restarting the animation. Reset only after full exit; the reset cancels both
  effects and restores normal visibility offscreen rather than hiding the item.
- If the host exits the viewport while its moving figure is still visible,
  defer reset until that visual edge also exits. A short-lived animation-frame
  check handles that edge case; the scroll listener itself only samples position.
- Rapid full exits cancel the previous effects before re-entry starts a fresh,
  direction-appropriate reveal. Stale completion promises cannot reset a newer effect.
- Normal visibility is never hidden by CSS or an inline style. Only a finite,
  non-filling Web Animation controls opacity for 1000 ms. If JS/IO is unavailable,
  callbacks are delayed, or animations fail, thumbnails stay visible by default.
- Reduced-motion preferences skip reveals and cancel any running fades.
  Editor guards apply independently in both the loader and reveal module.
- The reel, fixed navigation, image filters, hover tint, titles, and dimensions
  are outside the reveal module's scope. Nothing's hover remains independent.

Reference observation: [Itsacat Studio](https://itsacatstudio.com/) fades its
project imagery and lifts its inner figure about 40 px on individual viewport
entry. Nearby items can reveal together; there is no fixed row sequence.
Its items reset below the viewport and replay on re-entry. Timing appears
smooth and on the order of a second; it was visually estimated, not measured
exactly. Our refined adaptation uses a 1000 ms fade with proportional ±10% movement
on the existing internal figure, replaying on viewport re-entry in either scroll
direction while leaving Cargo's media-item transforms entirely alone.

`tests/scroll-reveal.test.mjs` covers independent/repeated reveals, partial/edge
intersections, rapid direction changes, moving visual edges, existing Cargo
style preservation, new/rebuilt projects, editor/reduced-motion
fallbacks, synchronized internal movement, preservation of native figure styling,
missing APIs, failed animation, and cleanup. GitHub Actions runs these
tests before publishing; there are no npm package dependencies.

### Native scroll animation and reference background

Cargo owns thumbnail scroll movement through its native Fly in-out preset,
intensity 2. External code does not set movement transforms, animation timing,
or Freeform coordinates. Native animation settings remain managed in Cargo.

Background controls stay in `js/config.js`: `ENABLE_BACKGROUND_GRID`,
`GRID_SPACING` (36), `GRID_DOT_SIZE` (2), and `HOMEPAGE_ID`.

`js/backgrounds/dot-grid.js` mounts a fixed, pointer-inert decoration only inside
the homepage (`L3482832595`). `css/backgrounds/dot-grid.css` paints #BDBDBD dots
on #E6E6E6, using radial-gradient and CSS variables. The layer uses the page's
existing isolated stacking context; no native pseudo-elements, positioning,
blend modes, or new stacking contexts are applied to Cargo content/navigation.
Turning `ENABLE_BACKGROUND_GRID` off removes only the dots, retaining the grey
background. Replacement/removal of the homepage and teardown remove the layer.
The background module remains independent for future graphics work.

Scroll reveals are temporarily disabled with `ENABLE_SCROLL_REVEAL = false` in
`js/main.js` while Cargo handles thumbnail movement. Set it to
`true` to reactivate. Existing reveal instances are destroyed before mounting,
cancelling their opacity/translate animations and removing reveal markers.
The reveal implementation is preserved. It is never mounted while disabled, so
no reveal listeners, observers, opacity effects or movement animations run.
Nothing hover, background, loader and GitHub Pages deployment remain enabled.


### Anchored desktop lines

`js/decorations/anchored-lines.js` appends one passive SVG as a direct homepage
child, outside `.page-layout` and editable `bodycopy`. It does not wrap or alter
Cargo Columns, images, anchors, Freeform attributes, transforms or native timing.
Its negative stacking level is above the grid and behind the existing content.
The grid's internal layer is now -2; its appearance and configuration are unchanged.

Add the minimal attributes from `cargo/line-anchors.md`. Intro x follows the
marked description's right edge plus half the scribble width; its start is the
scribble's bottom (or the description bottom when no scribble is present).
Its endpoint is the rendered midpoint of the project linked as
`#project-08-logitech`, selected by link rather than gallery index. The stable
Freeform host identifies it; the inner figure supplies Cargo's animated visual
position. Missing/nonintersecting targets hide only line 1 and leave X unchanged. The footer line begins 50% down that
same content box and ends at the Back to Top link's vertical center, half a
link-height to its left. All coordinates subtract the homepage origin. A passive scroll callback samples only Logitech's visual rect once per
frame to keep the endpoint hidden during native Fly in-out; it never remeasures
all text/columns on scrolling or writes any native transform. No idle loop. A missing intro marker draws no guessed line.
Text changes never select anchors by visible string or column index.

`js/config.js` exposes `ENABLE_DECORATIVE_LINES`, `ENABLE_LINES_IN_EDITOR`,
`INTRO_LINE_TARGET_HREF`, `INTRO_LINE_TARGET_FRACTION`, `BACK_TOP_LINE_START_FRACTION`, color and stroke width.
Lines appear only on desktop (901px and wider), with 1.5px #BABABA strokes.
ResizeObserver watches page/content/anchor/column sizes; filtered mutations,
font readiness, image loads, Freeform coordinate edits and browser resizing
request one full measurement frame.
SVG writes and native image-animation style churn do not schedule a loop.

Geometry and loader tests run in CI. For interactive local verification, serve
the repository and open `tests/fixtures/anchored-lines.html`; buttons move each
anchor independently and add content without editing the real Cargo website.
