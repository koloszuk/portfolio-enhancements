# Interaction modules

Add one ES module per feature (project-hover.js, scroll.js, transitions.js).
Import enabled modules explicitly from ../main.js. Each module must clean up its
listeners/observers, tolerate Cargo replacing content during navigation, respect
prefers-reduced-motion, and leave links and touch navigation usable.

Do not write Freeform x/y/z/scale attributes, reorder thumbnails, replace Cargo
media items, intercept navigation, or change Cargo positioning. Custom media
must use an inspected supported slot or a non-interactive visual layer.

Project-specific data belongs in ../projects.js. project-hover.js is enabled for
Nothing only. Its visual layer lives inside Cargo's existing shadow link.

project-scale.js adds homepage-only mouse hover focus on desktop (901px+, hover
and fine pointer, no reduced motion). Values live in ../config.js. Individual
CSS scale affects inner media, tint and caption, including Nothing's whole hover
layer; the native moving link stays unscaled for stable hit testing. Cargo's
host/figure transforms and z-order are untouched. Existing opacity transitions
are composed with scale, and all owned state/listeners are removed on teardown.
Editor previews never import this interaction.
Each hover snapshots native moving link geometry: selected origin is centered,
others use the nearest corner to its center. Origin interpolation shares the
scale duration/easing to avoid pivot jumps; scrolling never recomputes origins.

scroll-reveal.js observes all linked thumbnails in Freeform Thumbnail Indexes.
It synchronizes a finite media-item fade with a 10%-height individual translate
on the existing internal figure. No hidden CSS, added wrappers, Cargo positioning
changes, or native transform overrides. Tests use Node's built-in runner.
Each thumbnail stays observed and replays in either scroll direction only after
its native box and moving visual figure have fully exited the viewport.
Scroll direction is sampled at entry: down starts below, up starts above.
Direction changes never modify an already-running animation.

Cargo's native Fly in-out preset owns thumbnail scroll movement. External code
must not change its settings, transforms or timing. The custom reveal module
above remains disabled via ENABLE_SCROLL_REVEAL = false in ../main.js; when
inactive it mounts no observers/listeners and applies no opacity or translate.
