# Interaction styles

Use feature-specific, prefixed selectors only. project-hover.css is loaded inside
the enhanced media item's shadow root; do not also import it into ../main.css.
Avoid global resets, positioning changes on Cargo elements, and selectors based
on nth-child or gallery order.
