# Minimal homepage anchor edits

In the Cargo homepage HTML, keep all contents and existing attributes.
Do not add wrappers or move columns. Add only these attributes:

1. Find the right-aligned div containing the introductory description
   (currently “Daniel is a Creative Director for Animated films…”).
   Change its opening tag from:
   ```html
   <div style="text-align: right">
   ```
   to:
   ```html
   <div style="text-align: right" data-dan-line-anchor="intro">
   ```
2. Find the existing Back to Top link. Change its opening tag from:
   ```html
   <a href="#" rel="home-page">
   ```
   to:
   ```html
   <a href="#" rel="home-page" data-dan-line-anchor="back-to-top">
   ```

Publish the homepage. Reload the published site and Cargo editor after deployment
so the stable loader refreshes. No change to the one-time loader snippet is needed.

The intro marker is required: an unmarked introduction produces no guessed line.
The footer also supports its existing rel="home-page" + href="#" as a semantic
fallback; it never matches visible text. Move the marked text elements normally
in Cargo and retain their data attributes when replacing their HTML.

Line 1 follows the description's right edge plus half the scribble width;
its starting height comes from the existing .projects-scribble dotlottie-wc.
Line 2 sits half a text-line height to the left of the footer link and ends
at the link's vertical center. These are relative offsets, not fixed x coordinates.
