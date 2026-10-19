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
