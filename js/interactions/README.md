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

scroll-parallax.js applies a symmetric nonlinear viewport forcefield via a
paused additive transform on each internal figure. Speed derives from the
native host center: 0.4x in the center, 1x at quarter positions, 1.6x at edges.
Smooth outer tails return to native speed without snaps. Configuration and the
motion integral are documented in the root README. No height-based linear
mapping, physics, collision caps, or scroll interception. Temporary overlap is
allowed. One update per scroll/layout event; no continuous loop. Resize/mutation
observers support new projects and responsive layout; editor/motion guards apply.
