# Popup builder interaction prototypes

Open **Попап-банери → Новий конструктор · прототипи**. The standalone workspace uses the existing authentication and `popup_banners` tool access guard.

- `/tools/popup-banners/prototypes/product`: sample product selection, ordering, three compositions, price/badge visibility, manual or timed rotation, and simulated CTA actions.
- `/tools/popup-banners/prototypes/lead-form`: six field types, required fields, order and row widths, validation, submitting and success states, and a sample coupon.

Both editors support selecting blocks on the canvas, contextual properties, independent desktop/mobile dimensions and typography, shared colors, undo/redo, local draft persistence and JSON export. On small screens, use the Structure / Canvas / Properties tabs. Expanded preview keeps device controls and an exit button; Escape returns to the editor.

## Prototype boundaries

These are interaction prototypes, not campaign editors. They use their own React canvas and sample catalog; they do not call campaign, contact, checkout or publishing APIs. Form values stay in component memory and are never persisted. The sample coupon is not a real shop promotion. Display rules are documented in the layout but do not delay the editing canvas.

Layout drafts are validated before restoration and stored under a versioned, user-specific localStorage key for each prototype. Persistence failures are visible in the header. Export format `mt-popup-builder-prototype/v1` describes a layout and is not a campaign API request. Restoring the example is undoable.

Before production adoption, implement the approved design properties in the campaign validation, serialization, API/client contracts and storefront runtime together; preserve existing campaign data and test desktop and mobile storefronts separately. This prototype does not change the current banner renderer or publication behavior.

## Verification

`tests/e2e/popup-prototypes.spec.ts` covers canvas editing, undo/redo, device settings, reload persistence, product selection and navigation, local form submission, and mobile panel/fullscreen navigation. It checks that prototype interactions do not write to popup APIs.
