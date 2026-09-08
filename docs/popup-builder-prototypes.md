# Popup builder interaction prototypes

Open **Попап-банери → Новий конструктор · прототипи**. The standalone workspace uses the existing authentication and `popup_banners` tool access guard.

- `/tools/popup-banners/prototypes/product`: sample product selection, ordering, three compositions, price/badge visibility, manual or timed rotation, and simulated CTA actions.
- `/tools/popup-banners/prototypes/lead-form`: six field types, required fields, order and row widths, validation, submitting and success states, and a sample coupon.

Both editors support selecting individual text elements and images on the canvas, contextual properties, independent desktop/mobile dimensions and typography, shared colors, undo/redo, local draft persistence and JSON export. On small screens, use the Structure / Canvas / Properties tabs. Expanded preview keeps device controls and an exit button; Escape returns to the editor.

## Element editing and canvas navigation

Click a heading, paragraph, product badge, title, variant, old/current price, cover text, reward text, coupon or button to select it directly. Nested selection targets only the clicked element. The structure panel also exposes empty or hidden text elements. Text size, weight, color, line height, letter spacing, alignment and italics are independent for each element and device; styles can be reset without changing content. Product text styles apply across the collection, while content and image URLs belong to the currently displayed demo product.

Product images have contain/cover fitting, height per device, background and corner radius. Only HTTP(S) image URLs are rendered; partial URL input remains in the saved draft without discarding other edits. An empty URL restores the sample artwork.

The editing artboard has 32 px of space around the banner. The camera supports 10–300% zoom, presets, plus/minus controls and Fit to center the full banner. Ctrl/Cmd + wheel or a two-finger pinch zooms around the pointer/gesture. Wheel/trackpad movement pans; Shift + wheel pans horizontally. Drag the background, hold Space while dragging, use the middle mouse button or enable the move tool. Panning is bounded so the banner cannot be lost in an infinite workspace. With the canvas focused, +/− zoom, 0 fits, 1 uses 100%, and arrows pan. Typing in properties is unaffected. Navigation does not enter draft undo history.

Existing version-1 drafts restore with default settings for newly introduced properties. Both text overrides and styles participate in undo/redo, local persistence and JSON export.

## Prototype boundaries

These are interaction prototypes, not campaign editors. They use their own React canvas and sample catalog; they do not call campaign, contact, checkout or publishing APIs. Form values stay in component memory and are never persisted. The sample coupon is not a real shop promotion. Display rules are documented in the layout but do not delay the editing canvas.

Layout drafts are validated before restoration and stored under a versioned, user-specific localStorage key for each prototype. Persistence failures are visible in the header. Export format `mt-popup-builder-prototype/v1` describes a layout and is not a campaign API request. Restoring the example is undoable.

Before production adoption, implement the approved design properties in the campaign validation, serialization, API/client contracts and storefront runtime together; preserve existing campaign data and test desktop and mobile storefronts separately. This prototype does not change the current banner renderer or publication behavior.

## Verification

`tests/e2e/popup-prototypes.spec.ts` covers canvas editing, undo/redo, device settings, reload persistence, product selection and navigation, local form submission, and mobile panel/fullscreen navigation. It also covers individual text edits and device styles, bounded pan, pointer-anchored zoom, fit and fullscreen controls. It checks that prototype interactions do not write to popup APIs. Draft compatibility and per-product content isolation are covered by text-elements.test.ts.
