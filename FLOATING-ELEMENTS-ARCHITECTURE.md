# Floating elements architecture

The editable document remains one TipTap tree. An inline object is a node in that tree. A float has a stable object ID, an anchor (paragraph ID or page ID), physical dimensions and offsets, wrap mode, and a stack position. The persisted source is the anchor and its requested geometry. Page placements are derived. Loading never writes derived positions back to MathDoc.

| Wrap mode | Layout |
| --- | --- |
| Inline | The normal line box includes the element |
| Square | Each line excludes the intersecting rectangle |
| Tight | Each line excludes the contour; the prototype currently uses a rectangular fallback |
| Top and bottom | Intersecting lines advance below the object |
| Behind text | Paint below content; no obstacle |
| In front of text | Paint above content; no obstacle |

Use millimetres for saved size and offset, convert using the sheet scale, and keep coordinates physical. RTL consumes usable spans from right to left. Pointer and Pencil gestures update a temporary overlay, with keyboard/touch controls as alternatives. One validated ProseMirror transaction commits a drag or resize and creates one undo step. Cancelling a gesture leaves the transaction history intact.

A paragraph anchor follows the paragraph when pagination changes. A page anchor is resolved against its section and logical page assignment. Orphaned anchors must be made explicit in recovery, with the object retained. Float constraints apply in deterministic order, with a stable ID as the tie-breaker. An oversized object must produce a visible overflow report. The print renderer and editor consume the same size, obstacles and placement output. A versioned future MathDoc extension must be rejected by older readers if it cannot be represented losslessly.

The earlier direct editor experiments showed unstable focus, caret and selection across reflow, coupled with costly full re-pagination. Avoid moving or cloning editable ProseMirror and MathLive nodes. Keep layout outside editing transactions except for the final geometry edit. Use the existing printable clone pipeline and check text and math ranges around boundaries. Measure updates near the beginning, middle and end of long documents, with and without manual breaks.

The isolated prototype in `experiments/floatingLayout.ts` tests rectangle exclusion and deterministic stacking. It has no editor, serialization, pointer handling, or PDF integration. Before integration, require repeated cross-engine focus and history passes, text/print boundary parity for Arabic and equations, touch checks, and performance within the agreed 15% budget.
