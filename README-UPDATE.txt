MathPress — إصلاح النشر للإصدار المصدر 0.3.3
هذه حزمة تصحيح فقط، وليست تطبيقاً مستقلاً. لا تحذف ملفات المستودع الأخرى.
1. ارفع index.html وmain.tsx وvite.config.ts وsw.js وmanifest.webmanifest إلى جذر Math_press مع الاستبدال.
2. أنشئ ملف .github/workflows/deploy.yml من واجهة GitHub (Add file > Create new file)، وانسخ إليه محتوى deploy.yml المرفق. لا ترفعه إلى الجذر.
3. من Settings > Pages > Source اختر GitHub Actions.
4. افتح Actions ثم شغّل Build and deploy MathPress عبر Run workflow إذا لزم.
5. لا تعتبر النشر ناجحاً إلا بعد نجاح الاختبارات والبناء والنشر. ثم افتح رابط التطبيق.
6. لا تمسح بيانات الموقع أو IndexedDB: المستندات محفوظة هناك. صدّر النسخ الاحتياطية إن أمكن.
ملاحظات: لم تُجرَ اختبارات npm أو المتصفح هنا بسبب عدم إمكانية تنزيل الاعتماديات. هذه حزمة إصلاح نقطة الدخول والمسار والكاش فقط. لا تعالج محرك الصفحات أو استيراد Word أو طابور الحفظ. لم يتغير رقم package.json حتى لا يتعارض مع package-lock.json.
