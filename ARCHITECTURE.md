# MathPress — قرارات البنية

## مبادئ ثابتة
1. مصدر المعادلة (LaTeX) يبقى هو الحقيقة الأساسية وقابلًا للتحرير، ولا يُحوَّل إلى صورة.
2. نموذج المستند (JSON من TipTap داخل غلاف MathPress v3) مستقل عن الواجهة وعن محرك الطباعة.
3. لا تُرفع المستندات إلى خادم.
4. فشل الحفظ يجب أن يكون ظاهرًا، مع تشجيع المستخدم على التصدير الاحتياطي.
5. أي تغيير غير متوافق على صيغة `.mathdoc` يرفع `schemaVersion` مع دالة ترقية في `document.ts` واختبار لها.

## نموذج المستند (v3)
`{ format, schemaVersion: 3, id, title, page{orientation, marginsMm}, headerText, footerText, showPageNumbers, content: TipTap JSON, updatedAt }`
عقد مخصصة: `mathInline` و`mathBlock` (الخاصية `latex`)، `pageBreak`، وصورة بخاصية `width`، وخاصية `dir` على الفقرات.
عقد إضافية: `graph` (الخاصية `spec`)، و`columns`/`column`. مستندات v1 وv2 تُرقّى عند القراءة.

## تقسيم الصفحات
- الورقة مستند متصل واحد؛ كل كتلة من المستوى الأعلى بلا هوامش خارجية (التباعد بـ padding) ليكون القياس دقيقًا.
- `Pagination.ts` يقيس ارتفاع الكتل (`getBoundingClientRect`) ويستدعي `computeBreaks` (منطق صرف في `paginate.ts`) ثم يحقن عناصر زخرفة (Decoration widgets) تمثل: فراغ نهاية الصفحة + التذييل + فجوة بصرية + هامش الصفحة التالية.
- في الطباعة تُخفى الفجوة ويُفرض فاصل صفحة بعد كل تذييل، ويُعاد التكبير إلى 100%. تُحسب قرارات إبقاء الفقرة مع التالية وبدء صفحة قبلها عند قياس الكتل.
- قيد معروف: لا تقسيم داخل الفقرة أو الجدول.

## معادلات
MathLive داخل NodeView يدوي (بلا React). الخطوط تُضمَّن عبر `mathlive/fonts.css` مع `fontsDirectory = null`.

## PWA
الصفحة الرئيسية: الشبكة أولًا؛ الملفات المجزأة والخطوط: المخزن أولًا. يتغير اسم المخزن مع بصمة البناء، وتُحذف مخازن البنى الأقدم لنطاق التطبيق عند التفعيل.

## إضافات فرع 0.5

- تحمل الفقرات مراجع الأنماط وخصائص التنسيق المباشر في TipTap. يحفظ المستند تعريفات الأنماط المعدلة وبداية الترقيم كحقول اختيارية في صيغة 3. تُطبّق قواعد النمط خارج علامات النص اليدوية.
- نتائج البحث زخارف مؤقتة. استبدال النص معاملة قابلة للتراجع. تعديل LaTeX يتم في محرر المعادلة.
- تُكتب لقطات الحفظ في IndexedDB بترتيبها بما فيها اللقطة المعلقة عند الانتقال. فتح ملف MathPress ينشئ نسخة مستقلة بعد التحقق من بنية المستند. عند تحديث سجل v1 أو v2 في المكتبة يُكتب السجل الأصلي والنسخة المرقّاة في معاملة واحدة.
- يتحقق مستورد Word من أحجام الأجزاء أثناء فك الضغط ويحافظ على تحويل Office Math. معرّف تخزين PWA مشتق من بصمة ناتج Vite، مستقل عن IndexedDB.

## العمل المتبقي

يتطلب الإصدار المستقر تقسيم الفقرات والقوائم والجداول الطويلة داخل الكتلة، واستمرار الترقيم وتكرار رؤوس الجداول، والتحقق من أثر ذلك على المؤشر والتراجع. يحتاج الاسترداد بعد توقف التطبيق ومراجعة TipTap واختبار الأجهزة الفعلية إلى تحقق إضافي.

## Page layout after v0.6.0

TipTap remains the single document and selection. Editor pages use measured top-level blocks and non-document widgets with explicit page starts. `pageLayoutModel.ts` supplies source addresses and range utilities. The print renderer fragments a cloned tree, recording source ranges independently of the editing widgets. Split paragraphs report boundary offsets. Tables and lists currently report their containing block. No page data is written into MathDoc or history.

The editor layout remains estimated when a block spans multiple pages. A block measured taller than a page contributes to the estimate without creating a safe cursor boundary inside that block. Print can split text by line boundaries, list items and eligible table row groups. Editing widgets cannot safely split live tables, atom node views or MathLive content merely by copying those positions. A future prototype should prove stable mapping for touch selection, IME composition, table spans and undo before switching editing to an intra-block layout.

The page navigator uses explicit editor addresses and lightweight geometry thumbnails, updated only for visible thumbnails. A shared image URL paints physical editor pages without serializing one image layer per page. The existing print background pipeline is unchanged. The editor caches measurements and word counts for unchanged top-level nodes. JSON snapshots still follow TipTap updates so asynchronous saves, backup exports and tab closure retain their current guarantees.

## Alpha.2 live-layout lab

Load `/#live-layout-lab` directly. It is a lazy entry outside Studio's persistent editor. The laboratory mounts one TipTap state with the existing MathLive, graph, table and educational extensions. It accepts a disposable MathDoc as an in-memory source. The visible paginated output is inert DOM derived from that source, uses the alpha.1 range model and the production print fragmenter, and never writes to the source, history, autosave or IndexedDB. The checkbox unmounts the projection and cancels its scheduled work.

Typing still occurs in one continuous source. The prototype does not map a caret inside a paragraph, table, or MathLive host onto multiple editable page fragments. That architectural gate remains closed. Browser fragmentation or a source-to-fragment selection map should be tested with actual iPad selection, IME, node views and table spans before changing the daily editor.

The projection debounces edits and observes source bounds and late graph insertion. Each pass rebuilds the read-only pages. It intentionally exposes pagination time and source ranges for profiling. Incremental fragment invalidation and viewport-limited rendering are prerequisites for using it on long documents during editing.
