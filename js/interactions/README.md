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

scroll-reveal.js observes all linked thumbnails in Freeform Thumbnail Indexes.
It synchronizes a finite media-item fade with a 10%-height individual translate
on the existing internal figure. No hidden CSS, added wrappers, Cargo positioning
changes, or native transform overrides. Tests use Node's built-in runner.
Each thumbnail stays observed and replays in either scroll direction only after
its native box and moving visual figure have fully exited the viewport.
Scroll direction is sampled at entry: down starts below, up starts above.
Direction changes never modify an already-running animation.

inertial-parallax.js adds a maximum 12px velocity-responsive vertical offset to
that same internal figure using an additive transform Web Animation. It never
writes native transforms, positions, dimensions, or inline styles. The reveal's
individual translate remains independent. Height / 550 (clamped 0.15–1) scales
intensity; scroll down offsets upward and scroll up offsets downward. Input
velocity decays over 110ms and the visual follows over 85ms (exponential time
constants), settling exactly to zero and cancelling its effect. Offscreen
figures, hidden tabs, editor mode and reduced motion do not animate. Unsupported
additive animation safely disables the effect. Resize/mutation observers support
responsive and newly added projects. No continuous idle animation loop.
