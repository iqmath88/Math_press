# سجل تغييرات MathPress

## v0.7.0-rc.1 — Professional Publishing Studio

- Reuse portable templates and identities across installations.
- Preserve the selected image when inserting a geometric shape beside it.
- Guard the MathLive-to-text focus handoff and expand the visual acceptance samples.

- Store image bytes in IndexedDB while retaining access to older Blob records.
- Use compact raster previews during editing where available and restore originals for print and MathDoc backups.
- Add individual crop edges and persist reusable document palettes and fonts.
- Add SVG measurement lines and editable names to selected basic shapes.

## v0.7.0-preview.4 — Professional Publishing Studio

- Add eight publication frames, per-section typography, editable example numbers and reorderable solved-example sections.
- Add a derivatives chapter cover and worked solution. Add editable practice and focused review templates.
- Preserve new publication attributes in MathDoc 5 and omit neutral attributes from exports of older boxes.
- Exercise the visible file chooser on WebKit using a temporary on-disk image.

## v0.7.0-preview.3 — Glass Creative Studio

- Coalesce editor pagination observation on the next frame and preserve measurement caches through selection-only transactions.
- Hold the file chooser selection until image storage completes.
- Add a light and dark workspace palette and a persistent low-effects setting.
- Insert an editable solved-example box with dedicated solution and result sections.

## v0.7.0-preview.2 — Creative Studio

- Keep inserted raster originals in IndexedDB and embed them in portable MathDoc backups.
- Add editable SVG shapes and image controls for physical width, rotation, opacity, caption, and symmetric clipping.
- Add A3 and A5 to the existing page and print settings.
- Use MathDoc 5 for new media attributes, editable SVG shapes, and non-A4 paper. MathDoc 3 and 4 remain readable.

## v0.7.0-preview.1 — Creative Studio

- Add editable educational blocks, scoped formatting controls and document design presets.
- Add five editable templates, reusable local templates and a five-page derivatives sample.
- Protect Creative Studio properties in MathDoc 4 and keep the existing print engine.

## v0.6.1-rc.2

- Edit existing equations visually in place with MathLive, with explicit acceptance and cancellation.
- Commit an accepted equation as one history operation and preserve draft isolation in print and saved documents.
- Keep the optional advanced LaTeX source editor.

## v0.6.1-rc.1

- Skip delimiter searches for complete currency input and reuse unchanged block serialization and word counts.
- Extend the browser tests to headings, lists, tables, educational content and malformed input.

## v0.6.1-beta.1

- Convert completed LaTeX delimiters during typing and paste using the existing MathLive nodes.
- Keep the written source as a separate undo step and preserve the editor focus after conversion.
- Recover from late MathLive focus after returning to text.
- Add an editor preference and delimiter hint. Real iPad verification is pending.

## v0.6.0 — MathPress Studio

- Consolidate Studio, direct MathLive authoring, aligned solutions, structured exams, the refreshed workspace and A4 print improvements.
- Preserve educational metadata in MathDoc 4 and refuse imports that would discard protected values.
- Validate IndexedDB upgrades, offline use, browser compatibility and PDF output before deployment.
- Older builds may refuse protected MathDoc 4 files. Retain old MathDoc 3 originals and see RC-ACCEPTANCE.md for recovery and rollback.

## v0.6.0-rc.1

- Reject protected MathDoc imports that would lose unsupported content or properties.
- Cancel MathLive listeners and pending focus callbacks when equation views are removed.
- Improve dismissible panels and touch controls for release validation.

## v0.6.0-beta.1

- Introduce the Studio workspace, separate light and dark chrome, document properties, and editing-to-print navigation.
- Insert configurable examination outlines as one undoable edit and navigate questions and branches from the keyboard.
- Write MathDoc 4 for structured content that older builds would silently flatten. Existing compatible documents retain MathDoc 3.

## v0.6.0-alpha.2

- Add structured solution steps, relation columns, and editable MathLive fields for each side. Tab moves between relation fields; Escape returns to Arabic explanation text.
- Add examination lists with Arabic branches, numeric subbranches, multiple-choice lists, and marks.
- Extend the educational template menu with theorem, warning, homework, and reusable custom headings with independent color and optional numbering.
- MathDoc remains schema 3. Educational metadata uses optional paragraph and list attributes. Readers from earlier releases may discard these attributes when saving.
- Physical iPad and Windows verification is pending.

## v0.6.0-alpha.1

- أضيف الإدراج المباشر للمعادلات والبنى الرياضية مع الانتقال إلى الخانة الأولى، ولوحة للبحث والرموز الأخيرة والمفضّلة. يحتفظ التطبيق بمحرر مصدر LaTeX.
- أضيف أمر مستند فارغ مع إبقاء قوالب الإدراج التعليمية.
- يُلغى طلب التركيز المؤجل بمجرد دخول المعادلة، حتى لا يستعيد MathLive التركيز بعد العودة إلى النص أو أثناء التراجع والإعادة.

## v0.5.1

- ينتقل التركيز بين الفقرة والمعادلة بحسب اتجاه النص. يعيد `Escape` وزر «العودة إلى النص» المؤشر بعد المعادلة. يظهر زر المصدر خارج سطح النقر والتحرير، وتُوسَّع مساحة اللمس من دون تغيير حجم المعادلة المطبوعة.
- تنقل المعاينة الفقرة القابلة للاحتواء كاملة عند تفعيل «إبقاء الأسطر معًا». وعند تقسيم فقرة طويلة، تحمي أول وآخر سطرين عندما تتسع لهما الورقة.
- توسعت اختبارات Chromium وWebKit لتغطية المؤشر ومعاينة الطباعة في أبعاد iPad، كما يغطي مسار الترقية مستندات IndexedDB والعمل دون اتصال من v0.5.0.
- يبقى اختبار Safari على iPad فعلي مطلوبًا، خصوصًا لوحة الرياضيات باللمس ونافذة حفظ PDF الأصلية. قد تستدعي الأسطر أو الكتل الأطول من الورقة تقسيمًا استثنائيًا أو تنبيه المعاينة.

## v0.5.0

- أنماط تعليمية محفوظة مع المستند، وإدارة مجموعات الأنماط، وقوالب إدراج وترقيم.
- بحث واستبدال قابل للتراجع، وتنسيق مباشر للفقرات، وتكبير وتنقل.
- معاينة للطباعة، وخيارات الخلفيات والترقيم، وقوالب رياضية وتحرير للمعادلات.
- حدود لاستيراد الملفات وفك ضغط Word، والتحقق من بنية ملفات .mathdoc. فتح الملف ينشئ نسخة تحرير مستقلة. تحفظ ترقية المستندات المحلية القديمة نسخة أصلية قابلة للتصدير.
- عند تثبيت Service Worker يُعاد جلب الملفات ذات الأسماء الثابتة حتى يطابق HTML ملفات JavaScript وCSS في الكاش الجديد.
- تقسّم المعاينة الفقرات والجداول وقوائم خطوات الحل وتكرر رؤوس الجداول.
- تتجنّب المعاينة الصفحات الفارغة الناتجة عن الفواصل اليدوية الزائدة، وتحافظ على ترتيب الصفوف المدمجة عند تقسيم الجدول، وعلى ترقيم خطوات الحل المتتابعة ومعادلاتها السطرية.
- صُححت مواضع اللمس على iPad، وعُزلت معرّفات الرسوم في نسخة الطباعة، واستُبعدت فواصل المؤشر الداخلية من فحص صور الطباعة.
- يختبر مسار النشر البناء والتحرير والطباعة وChromium وWebKit وترقية IndexedDB قبل نشر GitHub Pages. تحقّق اختبار الترقية من استرجاع النص والمعادلات وتحميل ملفات JavaScript وCSS دون اتصال.

### القيود المعروفة

- تعرض شاشة التحرير فواصل تقديرية على مستوى الكتل. يُحسب التقسيم التفصيلي للفقرات والجداول في معاينة الطباعة.
- تعرض المعاينة تحذيرًا للكتل التي تتجاوز ارتفاع صفحة A4 ويتعذّر تقسيمها، مثل مجموعة صفوف مدمجة كبيرة. راجع ملف PDF الناتج عند ظهور التحذير.
- تعتمد خيارات حفظ PDF ونطاق الصفحات والخلفية على نافذة الطباعة في نظام التشغيل. تغطي الاختبارات الآلية محاكاة iPad، وأُقرّ اختبار Safari اليدوي على الجهاز قبل الدمج.

## 0.8.0-alpha.5 — preview checkpoint

- Added print diagnostics and kept in-bounds sheet footers inside fixed print
  page boxes. The print action waits for the images in the preview itself.
- Clarified unset media properties and enabled resolution checks for auto-sized images.
- Added a short A4 regression with Arabic text, MathLive equations and an uploaded
  bitmap. Native Apple print reproduction and the full performance gate remain open.

- Added contextual image and shape controls with an on-page width handle. Drag
  release creates one reversible edit without changing the original media.

## 0.8.0-alpha.6 — PDF feasibility checkpoint

- Added build identification to the application version dialog.
- Added an isolated PDF feasibility harness and CI samples. Arabic text
  extraction is still an open acceptance gate for independent export.

## 0.8.0-alpha.7 — Print Edition proof and compact toolbar

- Added an isolated vector PDF probe with HarfBuzz shaping and Unicode BiDi.
- Moved the design tools entry into the quick ribbon and compacted the
  tablet landscape header.
- Added lighter editor-only styling for educational boxes.

## 0.8.0-alpha.8 — experimental PDF download

- Added an on-demand raster export dialog in print preview. It creates a PDF
  Blob from paginated MathDoc, with range, resolution, download and sharing.
- Loaded static MathLive styles with the app for offline preview rendering.

## 0.8.0-alpha.9 — print resolution checkpoint

- Defaulted independent PDF to 300 DPI and exposed five physical resolutions.
- Added cropped and rotated image rendering and explicit memory safeguards.
- Brought range, ink mode, page furniture and watermark settings into export.

## 0.8.0-alpha.10 — معاينة التصدير المجزأ

- أضيف رسم مجزأ للدقات العالية مع تداخل عند الحواف وقص داخل PDF.
- يعاد استخدام Canvas صغير مع تقدم وإلغاء على مستوى الأجزاء.

## 0.8.0-alpha.11 — كتالوج الصناديق الأكاديمية

- أضيفت علامات مميزة للأنواع التعليمية الـ23 وثلاث عينات PDF من مسار التصدير المستقل.
- ثُبّت اتجاه الأعداد في الرسم وأُزيحت أسماء رؤوس الأشكال عن النقاط.
- قُلّل عمل تجهيز المعادلات والأنماط المكرر أثناء التصدير وأُضيف قياس مراحله.

## 0.8.0-alpha.12 — قياس استقرار المحرر

- دمج زيارات DOM الخاصة بقياس الصفحات ومراقبة أحجامها.
- أضيف فحص لهوية MathLive والتراجع في مستند من 100 صفحة.
- قُسّمت قراءة بكسلات التدرج الرمادي إلى شرائح لتقليل الذاكرة المؤقتة.
