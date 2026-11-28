# Creative Studio preview

Open **القوالب** to choose a lesson, conics booklet, exam, cover or formula sheet. The derivatives
lesson has five manual A4 pages with editable equations and JSXGraph illustrations.
The gallery can also save the current content and design as a reusable local
template. Saving a template is separate from exporting a MathDoc backup.

Use **التصميم والصناديق** to choose a document design or insert an educational
block. With the caret inside a block, its properties can change the type, title,
colors, padding and corner radius, hide the title, duplicate the block or remove it.
The content remains a normal TipTap subtree. MathLive and the dollar input rules
work inside it.

## Compatibility

MathDoc 4 protects documents that contain an `educationBlock` or a
`creativeDesign` field. The design is a known preset ID at the document level.
The education block holds ordinary block nodes and validated rendering attributes.
The gallery stores reusable user templates locally. Existing MathDoc 3 and 4
continue to use the current import and IndexedDB paths.

Print keeps short boxes together where they fit. A long box can be split between
child blocks, repeating the label. Splitting an individual oversized child inside
a box, nested page breaks inside a box, the complete template catalogue, custom
design and block-presets libraries, the original asset store and advanced graphics
remain open. The preview does not establish eligibility to merge or publish.

## Verification and continuation

Run `npm test`, `npm run build` and `node creative.e2e.cjs chromium` against a
local preview. The integrated lesson verifies automatic mathematics in a box,
changing design and title, MathDoc export, reopening from IndexedDB, live vector
rendering and A4 output. The Pages workflow also runs the WebKit variant.

The rc.2 recovery point is the tree of `cb9913c`. The manual iPad and 15% performance
gates established there still apply. Continue by measuring long-box fragmentation
and finishing reusable styles before introducing an independent asset-store migration.

## Preview.2 media compatibility

MathDoc 5 identifies documents that use editable shapes, new image properties, IndexedDB image references, or A3/A5. Export resolves local image references into portable data URLs. Import validates the document before replacing the open document. PNG, JPEG, WebP, and sanitized SVG are accepted, with a 20 MiB limit per asset and a 32 MiB limit per MathDoc backup. Images already embedded in a MathDoc 3 or 4 document are preserved as supplied.

The image library uses a separate database so the document database does not require a schema migration. Assets remain available after deletion from a page to preserve historical references. Automatic asset cleanup, lightweight preview derivatives, arbitrary crop rectangles, editable shape vertices, grouping, and advanced spatial construction are pending.


## Reusable educational boxes

Open **التصميم والصناديق → مكتبة أنماط الصناديق** to preview all 23 built-in box types. Select a box in the document to save its type, colors, padding, corner radius, and title visibility as a reusable local style. Applying a style keeps the target's title and content. Removing a style from the library leaves existing boxes intact. The library is local to the browser and can be exported and imported as JSON. Imports add separate entries. Applied attributes travel with each MathDoc.
