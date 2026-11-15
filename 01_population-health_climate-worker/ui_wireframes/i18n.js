/* Worker-facing strings for the languages most used on UAE construction sites.
   Translations here are drafts for the prototype: production copy needs native-speaker
   review (spec §1.5: "reviewed translation"). Write "→" for "next / forward"; it is
   mirrored automatically in right-to-left layouts. */

const LANGS = [
  // code, endonym, English name, direction, status
  ['en', 'English', 'English', 'ltr', 'ready'],
  ['ar', 'العربية', 'Arabic', 'rtl', 'ready'],
  ['ur', 'اردو', 'Urdu', 'rtl', 'ready'],
  ['hi', 'हिन्दी', 'Hindi', 'ltr', 'ready'],
  ['ml', 'മലയാളം', 'Malayalam', 'ltr', 'ready'],
  ['bn', 'বাংলা', 'Bengali', 'ltr', 'ready'],
  ['tl', 'Tagalog', 'Tagalog', 'ltr', 'ready'],
  ['ta', 'தமிழ்', 'Tamil', 'ltr', 'planned'],
  ['ne', 'नेपाली', 'Nepali', 'ltr', 'planned'],
  ['ps', 'پښتو', 'Pashto', 'rtl', 'planned'],
];
const LANG = Object.fromEntries(LANGS.map(([c, n, e, d, st]) => [c, { c, n, e, d, st }]));

/* Preferred language per worker (from the roster), used by the kiosk greeting. */
const PREF_LANG = { rana: 'hi', yusuf: 'ur', dana: 'tl', bilal: 'ml', leila: 'ar', zaid: 'ar', mariam: 'ml', samir: 'bn', c02: 'ne', c03: 'ta', c04: 'bn' };

const STR = {
  en: {
    app: 'Health Reporting', 'tab.now': 'Now', 'tab.plan': 'My plan', 'tab.check': 'Check in', 'tab.me': 'Me',
    'lang.choose': 'Choose your language', 'lang.hint': 'Tap your language. You can change it any time.', 'lang.soon': 'Coming soon',
    'p1.title': 'Welcome', 'c.checkins': 'Check-ins', 'c.checkins.s': 'Tell us how you feel', 'c.hr': 'Heart rate', 'c.skin': 'Skin temperature', 'c.wear': 'From the wearable',
    'c.checkins.d': 'Your answers go to you and occupational health only.', 'c.wear.d': 'Used on this phone to warn you early. Not sent to your supervisor.',
    'p1.sees': 'What your supervisor sees: only “needs rest now”. Never your answers or body data.', readaloud: 'Read aloud', 'p1.choices': 'Your choices', on: 'On', off: 'Off',
    'p1.alerts': 'Alerts and the stop-work notice work even if everything is off.', 'p1.later': 'You can change these any time in Me → My data.', 'p1.save': 'Save my choices', next: 'Next',
    'p2.title': 'Now', online: 'Online', nonet: 'No network', 'p2.status': 'Your status', 'p2.inrec': 'In recovery', shelterA: 'Shelter A', 'p2.heat': 'Heat now', 'p2.heatq': 'Heavy work stopped',
    'p2.next': 'Next', 'p2.nextv': 'Work 08:11', workshop: 'Workshop', 'p2.msgs': 'Messages', 'p2.water': 'Drink water', 'p2.water.d': 'One cup now. Next reminder 08:19.', reminder: 'Reminder',
    stopwork: 'Stop-work', 'p2.stop.d': 'Heavy work has stopped. Go to Shelter A.', 'p2.ci': 'Shelter A check-in', 'p2.ci.d': 'Checked in 08:04. Your rest time has started.',
    'p2.plan': 'Your plan for this hour', 'p2.plan.d': 'Workshop 08:11–08:26, then rest.', 'p2.computed': 'Status and heat come from the site rules.', unwell: 'I feel unwell',
    'p2.offline': 'No network. Warnings come from the rules on this phone. Check-ins will send later.', 'p2.waiting': '2 check-ins waiting to send',
    'p2.huda': 'Message from Huda', 'p2.hudaT': 'Cold water is available in Shelter A. Don’t rush.', 'p2.mt': 'Machine translation', 'p2.empty': 'You’re not on a shift today. When your supervisor adds you to a crew, your plan appears here.',
    'alert.stop': 'Heavy work has stopped. Go to Shelter A now. Drink water. Tell your supervisor if you feel unwell.',
    'alert.em': 'Help is coming. Stay with someone and do not walk alone. Your supervisor has been told to call 998.',
    'alert.fixed': 'Fixed safety instruction · reviewed translation', 'alert.local': 'From the rules on this phone', play: 'Play aloud', 'alert.go': 'OK — Shelter A', 'alert.with': 'I’m with someone',
    'pic.stop': 'Stop', 'pic.shelter': 'Shelter', 'pic.water': 'Water', 'pic.help': 'Help', 'pic.stay': 'Stay',
    'p4.title': 'Check in', 'p4.hold': 'Hold and speak', 'p4.listen': 'Listening… let go to send', 'p4.water': 'I need water', 'p4.ok': 'I’m OK', 'p4.type': 'Type instead', 'p4.typeph': 'How do you feel?', send: 'Send',
    'p4.conv': 'Conversation', 'p4.hint': 'Hold the button and say how you feel, or tap an answer.', 'p4.sys': 'Your supervisor has been asked to help you rest now. They see the action, not your words.',
    'p4.q': 'Are you confused, have you vomited, or have you stopped sweating?', no: 'No', 'p4.yes': 'Yes, one of these', 'p4.you': 'You', 'p4.vn': 'transcribed and translated · audio not kept', 'p4.fixedq': 'Fixed question · reviewed translation',
    'p4.understood': 'What we understood', 'p4.unwell': 'Feeling unwell · 08:18', 'p4.noflags': 'No red flags.', 'p4.fix': 'Fix this', 'p4.retry': 'Discard and try again', 'p4.send': 'Send to my supervisor', 'p4.sent': 'Sent 08:18',
    'p4.rule': '⚙ Rule · the escalation itself is not AI', 'p4.offline': 'No network. Your check-in is saved and will send when the network returns. If you feel very unwell, tell your supervisor now.',
    'ai.agent': 'Worker Aid Agent', 'ai.conf': 'Confidence', 'ai.Medium': 'Medium', 'ai.why': 'Why this?',
    'p5.title': 'My plan', 'p5.now': 'Now', 'p5.until': 'until 08:26', 'p5.nextrest': 'Next rest', 'p5.worktoday': 'Work this hour', 'p5.30': '30 min', work: 'Work', rest: 'Rest',
    'p5.prep': 'Workshop preparation', 'p5.rec': 'Cooled recovery', 'p5.hour': 'This hour', 'p5.later': 'Later today', 'p5.midday': '12:30–15:00 · no outdoor work (MoHRE)', 'p5.own': 'Only your own times are shown.',
    'p5.start': 'Start my rest', 'p5.startnote': 'Appears 2 minutes before each rest and checks you in.', 'p5.upd': 'Updated 08:18 · Huda', 'p5.resting': 'Resting since 08:26',
    'p6.title': 'Check in · Shelter A', 'p6.hold': 'Hold near the Shelter A sign', 'p6.qr': 'or scan the QR code', 'p6.cta': 'Check in at Shelter A', 'p6.done': 'Checked in · 08:04', 'p6.last': 'Your last check-ins', 'p6.back': 'Back to Now',
    'p8.title': 'My data', 'p8.shared': 'Shared with supervisor', 'p8.actions': 'Actions only', 'p8.consent': 'Consent', 'p8.download': 'Download my data', 'p8.delete': 'Withdraw consent and delete my check-ins',
    'p8.deletebody': 'Your supervisor will still get heat alerts for your crew.', 'p8.stored': 'Stored check-ins', 'p8.kept': 'kept 30 days', 'p8.who': 'Who opened my records', 'p8.nurse': 'Occupational health nurse',
    'p8.wear': 'Wearable', 'p8.notpaired': 'Not paired', 'p8.pair': 'Pair a wearable to get early warnings on this phone.', 'p8.agreed': 'You agreed {date}. Withdraw any time.', 'p8.none': 'None.',
    hold: 'Press and hold to confirm', cancel: 'Cancel', 'kiosk.tap': 'Tap your badge', 'kiosk.checked': 'Checked in',
    'acct.title': 'My photo', 'acct.upload': 'Add my photo', 'acct.replace': 'Replace my photo', 'acct.remove': 'Remove my photo', 'acct.useissued': 'Use issued photo',
    'acct.yours': 'This is the photo you added.', 'acct.issued': 'This is the photo issued with your account. You can replace it.', 'acct.none': 'No photo yet. Your initials are shown.',
    'acct.saved': 'Photo updated. Your crew sees it next to your name.',
    'acct.note': 'JPEG, PNG or WebP. Drop a photo on the circle, or take one with the phone camera. Head and shoulders, face visible.',
    'acct.where': 'Where your photo appears', 'acct.where.row': 'Next to your name in crew lists, tasks, messages and records.',
    'acct.private': 'Only you can change your photo. It is never used to recognise you automatically.',
  },
  ar: {
    app: 'الإبلاغ الصحي', 'tab.now': 'الآن', 'tab.plan': 'خطتي', 'tab.check': 'تسجيل الحالة', 'tab.me': 'أنا',
    'lang.choose': 'اختر لغتك', 'lang.hint': 'اضغط على لغتك. يمكنك تغييرها في أي وقت.', 'lang.soon': 'قريبًا',
    'p1.title': 'مرحبًا', 'c.checkins': 'تسجيل الحالة', 'c.checkins.s': 'أخبرنا كيف تشعر', 'c.hr': 'نبض القلب', 'c.skin': 'حرارة الجلد', 'c.wear': 'من الجهاز القابل للارتداء',
    'c.checkins.d': 'إجاباتك تصل إليك وإلى الصحة المهنية فقط.', 'c.wear.d': 'تُستخدم على هذا الهاتف لتحذيرك مبكرًا. لا تُرسل إلى مشرفك.',
    'p1.sees': 'ما يراه مشرفك: فقط «يحتاج إلى راحة الآن». لا يرى إجاباتك أو بيانات جسمك أبدًا.', readaloud: 'استمع', 'p1.choices': 'اختياراتك', on: 'مفعّل', off: 'متوقف',
    'p1.alerts': 'التنبيهات وإشعار إيقاف العمل تعمل حتى لو أوقفت كل شيء.', 'p1.later': 'يمكنك تغيير هذه الاختيارات في أي وقت من «أنا» → «بياناتي».', 'p1.save': 'احفظ اختياراتي', next: 'التالي',
    'p2.title': 'الآن', online: 'متصل', nonet: 'لا توجد شبكة', 'p2.status': 'حالتك', 'p2.inrec': 'في الاستراحة', shelterA: 'الملجأ A', 'p2.heat': 'الحرارة الآن', 'p2.heatq': 'توقف العمل الثقيل',
    'p2.next': 'التالي', 'p2.nextv': 'عمل 08:11', workshop: 'الورشة', 'p2.msgs': 'الرسائل', 'p2.water': 'اشرب الماء', 'p2.water.d': 'كوب واحد الآن. التذكير التالي 08:19.', reminder: 'تذكير',
    stopwork: 'إيقاف العمل', 'p2.stop.d': 'توقف العمل الثقيل. اذهب إلى الملجأ A.', 'p2.ci': 'تسجيل الدخول في الملجأ A', 'p2.ci.d': 'سُجّل الدخول 08:04. بدأ وقت راحتك.',
    'p2.plan': 'خطتك لهذه الساعة', 'p2.plan.d': 'الورشة 08:11–08:26، ثم راحة.', 'p2.computed': 'الحالة والحرارة محسوبة من قواعد الموقع.', unwell: 'أشعر بتوعك',
    'p2.offline': 'لا توجد شبكة. التحذيرات تأتي من القواعد على هذا الهاتف. سيُرسل تسجيلك لاحقًا.', 'p2.waiting': 'تسجيلان بانتظار الإرسال',
    'p2.huda': 'رسالة من هدى', 'p2.hudaT': 'الماء البارد متوفر في الملجأ A. لا تستعجلوا.', 'p2.mt': 'ترجمة آلية',
    'alert.stop': 'توقف العمل الثقيل. اذهب إلى الملجأ A الآن. اشرب الماء. أخبر مشرفك إذا شعرت بتوعك.',
    'alert.em': 'المساعدة قادمة. ابقَ مع شخص ما ولا تمشِ وحدك. تم إبلاغ مشرفك للاتصال بالرقم 998.',
    'alert.fixed': 'تعليمات سلامة ثابتة · ترجمة مُراجَعة', 'alert.local': 'من القواعد على هذا الهاتف', play: 'تشغيل الصوت', 'alert.go': 'حسنًا — إلى الملجأ A', 'alert.with': 'أنا مع شخص ما',
    'pic.stop': 'توقف', 'pic.shelter': 'ملجأ', 'pic.water': 'ماء', 'pic.help': 'مساعدة', 'pic.stay': 'ابقَ',
    'p4.title': 'تسجيل الحالة', 'p4.hold': 'اضغط مطولًا وتحدث', 'p4.listen': 'أستمع… ارفع إصبعك للإرسال', 'p4.water': 'أحتاج إلى ماء', 'p4.ok': 'أنا بخير', 'p4.type': 'اكتب بدلًا من ذلك', 'p4.typeph': 'كيف تشعر؟', send: 'إرسال',
    'p4.conv': 'المحادثة', 'p4.hint': 'اضغط مطولًا على الزر وقل كيف تشعر، أو اختر إجابة.', 'p4.sys': 'طُلب من مشرفك مساعدتك على الراحة الآن. يرى الإجراء فقط، لا كلماتك.',
    'p4.q': 'هل تشعر بالارتباك، أو تقيأت، أو توقفت عن التعرق؟', no: 'لا', 'p4.yes': 'نعم، واحد منها', 'p4.you': 'أنت', 'p4.vn': 'تم النسخ والترجمة · لا يُحفظ الصوت', 'p4.fixedq': 'سؤال ثابت · ترجمة مُراجَعة',
    'p4.understood': 'ما فهمناه', 'p4.unwell': 'أشعر بتوعك · 08:18', 'p4.noflags': 'لا توجد علامات خطر.', 'p4.fix': 'صحّح هذا', 'p4.retry': 'احذف وحاول مرة أخرى', 'p4.send': 'أرسل إلى مشرفي', 'p4.sent': 'أُرسل 08:18',
    'p4.rule': '⚙ قاعدة · التصعيد نفسه ليس ذكاءً اصطناعيًا', 'p4.offline': 'لا توجد شبكة. حُفظ تسجيلك وسيُرسل عند عودة الشبكة. إذا شعرت بتعب شديد، أخبر مشرفك الآن.',
    'ai.agent': 'مساعد العامل', 'ai.conf': 'الثقة', 'ai.Medium': 'متوسطة', 'ai.why': 'لماذا هذا؟',
    'p5.title': 'خطتي', 'p5.now': 'الآن', 'p5.until': 'حتى 08:26', 'p5.nextrest': 'الراحة التالية', 'p5.worktoday': 'العمل في هذه الساعة', 'p5.30': '30 دقيقة', work: 'عمل', rest: 'راحة',
    'p5.prep': 'تجهيز الورشة', 'p5.rec': 'استراحة مبرّدة', 'p5.hour': 'هذه الساعة', 'p5.later': 'لاحقًا اليوم', 'p5.midday': '12:30–15:00 · لا عمل في الخارج (وزارة الموارد البشرية)', 'p5.own': 'تظهر أوقاتك أنت فقط.',
    'p5.start': 'ابدأ راحتي', 'p5.startnote': 'يظهر قبل كل راحة بدقيقتين ويسجّل دخولك.', 'p5.upd': 'تم التحديث 08:18 · هدى', 'p5.resting': 'في الراحة منذ 08:26',
    'p6.title': 'تسجيل الدخول · الملجأ A', 'p6.hold': 'قرّب هاتفك من لافتة الملجأ A', 'p6.qr': 'أو امسح رمز QR', 'p6.cta': 'سجّل الدخول في الملجأ A', 'p6.done': 'تم تسجيل الدخول · 08:04', 'p6.last': 'آخر تسجيلاتك', 'p6.back': 'العودة إلى الآن',
    'p8.title': 'بياناتي', 'p8.shared': 'ما يُشارك مع المشرف', 'p8.actions': 'الإجراءات فقط', 'p8.consent': 'الموافقة', 'p8.download': 'نزّل بياناتي', 'p8.delete': 'اسحب الموافقة واحذف تسجيلاتي',
    'p8.deletebody': 'سيستمر مشرفك في تلقي تنبيهات الحرارة لفريقك.', 'p8.stored': 'تسجيلات الحالة المحفوظة', 'p8.kept': 'تُحفظ 30 يومًا', 'p8.who': 'من فتح سجلاتي', 'p8.nurse': 'ممرضة الصحة المهنية',
    'p8.wear': 'الجهاز القابل للارتداء', 'p8.notpaired': 'غير مقترن', 'p8.pair': 'اقرن جهازًا قابلًا للارتداء لتصلك تحذيرات مبكرة على هذا الهاتف.', 'p8.agreed': 'وافقت في {date}. يمكنك السحب في أي وقت.', 'p8.none': 'لا شيء.',
    hold: 'اضغط مطولًا للتأكيد', cancel: 'إلغاء', 'kiosk.tap': 'المس بطاقتك', 'kiosk.checked': 'تم تسجيل الدخول',
  },
  ur: {
    app: 'صحت کی رپورٹ', 'tab.now': 'ابھی', 'tab.plan': 'میرا پلان', 'tab.check': 'حال بتائیں', 'tab.me': 'میں',
    'lang.choose': 'اپنی زبان چنیں', 'lang.hint': 'اپنی زبان پر ٹیپ کریں۔ آپ اسے کبھی بھی بدل سکتے ہیں۔', 'lang.soon': 'جلد آ رہا ہے',
    'p1.title': 'خوش آمدید', 'c.checkins': 'حال بتانا', 'c.checkins.s': 'بتائیں آپ کیسا محسوس کر رہے ہیں', 'c.hr': 'دل کی دھڑکن', 'c.skin': 'جلد کا درجہ حرارت', 'c.wear': 'پہننے والے آلے سے',
    'c.checkins.d': 'آپ کے جواب صرف آپ اور پیشہ ورانہ صحت کی ٹیم کو ملتے ہیں۔', 'c.wear.d': 'اس فون پر آپ کو جلد خبردار کرنے کے لیے۔ آپ کے سپروائزر کو نہیں بھیجا جاتا۔',
    'p1.sees': 'آپ کا سپروائزر صرف “ابھی آرام چاہیے” دیکھتا ہے۔ آپ کے جواب یا جسم کا ڈیٹا کبھی نہیں۔', readaloud: 'سنیں', 'p1.choices': 'آپ کی پسند', on: 'آن', off: 'بند',
    'p1.alerts': 'سب کچھ بند ہونے پر بھی انتباہات اور کام روکنے کا نوٹس ملتا رہے گا۔', 'p1.later': 'آپ انہیں کبھی بھی میں → میرا ڈیٹا میں بدل سکتے ہیں۔', 'p1.save': 'میری پسند محفوظ کریں', next: 'آگے',
    'p2.title': 'ابھی', online: 'آن لائن', nonet: 'نیٹ ورک نہیں', 'p2.status': 'آپ کی حالت', 'p2.inrec': 'آرام میں', shelterA: 'شیلٹر A', 'p2.heat': 'ابھی گرمی', 'p2.heatq': 'بھاری کام بند',
    'p2.next': 'اگلا', 'p2.nextv': 'کام 08:11', workshop: 'ورکشاپ', 'p2.msgs': 'پیغامات', 'p2.water': 'پانی پئیں', 'p2.water.d': 'ابھی ایک کپ۔ اگلی یاد دہانی 08:19 پر۔', reminder: 'یاد دہانی',
    stopwork: 'کام بند', 'p2.stop.d': 'بھاری کام بند ہو گیا ہے۔ شیلٹر A جائیں۔', 'p2.ci': 'شیلٹر A میں چیک اِن', 'p2.ci.d': '08:04 پر چیک اِن ہوا۔ آپ کے آرام کا وقت شروع ہو گیا ہے۔',
    'p2.plan': 'اس گھنٹے کا آپ کا پلان', 'p2.plan.d': 'ورکشاپ 08:11–08:26، پھر آرام۔', 'p2.computed': 'حالت اور گرمی سائٹ کے قواعد سے طے ہوتی ہے۔', unwell: 'میری طبیعت ٹھیک نہیں',
    'p2.offline': 'نیٹ ورک نہیں ہے۔ انتباہات اس فون کے قواعد سے آ رہے ہیں۔ حال بعد میں بھیجا جائے گا۔', 'p2.waiting': '2 حال بھیجے جانے باقی',
    'p2.huda': 'ہدیٰ کا پیغام', 'p2.hudaT': 'شیلٹر A میں ٹھنڈا پانی موجود ہے۔ جلدی نہ کریں۔', 'p2.mt': 'مشینی ترجمہ',
    'alert.stop': 'بھاری کام بند ہو گیا ہے۔ ابھی شیلٹر A جائیں۔ پانی پئیں۔ طبیعت خراب ہو تو اپنے سپروائزر کو بتائیں۔',
    'alert.em': 'مدد آ رہی ہے۔ کسی کے ساتھ رہیں اور اکیلے نہ چلیں۔ آپ کے سپروائزر کو 998 پر کال کرنے کا کہا گیا ہے۔',
    'alert.fixed': 'طے شدہ حفاظتی ہدایت · جانچا ہوا ترجمہ', 'alert.local': 'اس فون کے قواعد سے', play: 'سنیں', 'alert.go': 'ٹھیک ہے — شیلٹر A', 'alert.with': 'میں کسی کے ساتھ ہوں',
    'pic.stop': 'رکیں', 'pic.shelter': 'شیلٹر', 'pic.water': 'پانی', 'pic.help': 'مدد', 'pic.stay': 'ساتھ رہیں',
    'p4.title': 'حال بتائیں', 'p4.hold': 'دبا کر رکھیں اور بولیں', 'p4.listen': 'سن رہے ہیں… بھیجنے کے لیے چھوڑیں', 'p4.water': 'مجھے پانی چاہیے', 'p4.ok': 'میں ٹھیک ہوں', 'p4.type': 'لکھ کر بتائیں', 'p4.typeph': 'آپ کیسا محسوس کر رہے ہیں؟', send: 'بھیجیں',
    'p4.conv': 'بات چیت', 'p4.hint': 'بٹن دبا کر رکھیں اور بتائیں کیسا لگ رہا ہے، یا کوئی جواب چنیں۔', 'p4.sys': 'آپ کے سپروائزر سے کہا گیا ہے کہ آپ کو ابھی آرام دلائیں۔ وہ صرف یہ قدم دیکھتے ہیں، آپ کے الفاظ نہیں۔',
    'p4.q': 'کیا آپ کو الجھن ہو رہی ہے، قے ہوئی ہے، یا پسینہ آنا بند ہو گیا ہے؟', no: 'نہیں', 'p4.yes': 'ہاں، ان میں سے کوئی', 'p4.you': 'آپ', 'p4.vn': 'لکھا اور ترجمہ کیا گیا · آواز محفوظ نہیں ہوتی', 'p4.fixedq': 'طے شدہ سوال · جانچا ہوا ترجمہ',
    'p4.understood': 'ہم نے کیا سمجھا', 'p4.unwell': 'طبیعت ٹھیک نہیں · 08:18', 'p4.noflags': 'کوئی خطرے کی علامت نہیں۔', 'p4.fix': 'اسے درست کریں', 'p4.retry': 'ہٹائیں اور دوبارہ کوشش کریں', 'p4.send': 'میرے سپروائزر کو بھیجیں', 'p4.sent': '08:18 پر بھیجا گیا',
    'p4.rule': '⚙ قاعدہ · یہ قدم AI نہیں، قاعدے سے ہے', 'p4.offline': 'نیٹ ورک نہیں۔ آپ کا حال محفوظ ہے اور نیٹ ورک آنے پر بھیجا جائے گا۔ اگر طبیعت بہت خراب ہو تو ابھی اپنے سپروائزر کو بتائیں۔',
    'ai.agent': 'ورکر معاون', 'ai.conf': 'اعتماد', 'ai.Medium': 'درمیانہ', 'ai.why': 'ایسا کیوں؟',
    'p5.title': 'میرا پلان', 'p5.now': 'ابھی', 'p5.until': '08:26 تک', 'p5.nextrest': 'اگلا آرام', 'p5.worktoday': 'اس گھنٹے کام', 'p5.30': '30 منٹ', work: 'کام', rest: 'آرام',
    'p5.prep': 'ورکشاپ کی تیاری', 'p5.rec': 'ٹھنڈی جگہ میں آرام', 'p5.hour': 'یہ گھنٹہ', 'p5.later': 'آج بعد میں', 'p5.midday': '12:30–15:00 · باہر کام نہیں (MoHRE)', 'p5.own': 'صرف آپ کا وقت دکھایا گیا ہے۔',
    'p5.start': 'میرا آرام شروع کریں', 'p5.startnote': 'ہر آرام سے 2 منٹ پہلے نظر آتا ہے اور آپ کا چیک اِن کرتا ہے۔', 'p5.upd': 'اپ ڈیٹ 08:18 · ہدیٰ', 'p5.resting': '08:26 سے آرام میں',
    'p6.title': 'چیک اِن · شیلٹر A', 'p6.hold': 'فون کو شیلٹر A کے بورڈ کے پاس رکھیں', 'p6.qr': 'یا QR کوڈ اسکین کریں', 'p6.cta': 'شیلٹر A میں چیک اِن کریں', 'p6.done': 'چیک اِن ہو گیا · 08:04', 'p6.last': 'آپ کے پچھلے چیک اِن', 'p6.back': 'ابھی پر واپس',
    'p8.title': 'میرا ڈیٹا', 'p8.shared': 'سپروائزر کے ساتھ شیئر', 'p8.actions': 'صرف ضروری قدم', 'p8.consent': 'رضامندی', 'p8.download': 'میرا ڈیٹا ڈاؤن لوڈ کریں', 'p8.delete': 'رضامندی واپس لیں اور میرے حال مٹائیں',
    'p8.deletebody': 'آپ کے سپروائزر کو آپ کی ٹیم کے لیے گرمی کے انتباہات ملتے رہیں گے۔', 'p8.stored': 'محفوظ حال', 'p8.kept': '30 دن رکھے جاتے ہیں', 'p8.who': 'میرے ریکارڈ کس نے کھولے', 'p8.nurse': 'پیشہ ورانہ صحت کی نرس',
    'p8.wear': 'پہننے والا آلہ', 'p8.notpaired': 'جڑا نہیں', 'p8.pair': 'اس فون پر جلد انتباہ پانے کے لیے آلہ جوڑیں۔', 'p8.agreed': 'آپ نے {date} کو رضامندی دی۔ کبھی بھی واپس لے سکتے ہیں۔', 'p8.none': 'کچھ نہیں۔',
    hold: 'تصدیق کے لیے دبا کر رکھیں', cancel: 'منسوخ کریں', 'kiosk.tap': 'اپنا بیج ٹیپ کریں', 'kiosk.checked': 'چیک اِن ہو گیا',
  },
  hi: {
    app: 'स्वास्थ्य रिपोर्टिंग', 'tab.now': 'अभी', 'tab.plan': 'मेरी योजना', 'tab.check': 'हाल बताएँ', 'tab.me': 'मैं',
    'lang.choose': 'अपनी भाषा चुनें', 'lang.hint': 'अपनी भाषा पर टैप करें। आप इसे कभी भी बदल सकते हैं।', 'lang.soon': 'जल्द आ रहा है',
    'p1.title': 'स्वागत है', 'c.checkins': 'हाल बताना', 'c.checkins.s': 'बताएँ आप कैसा महसूस कर रहे हैं', 'c.hr': 'दिल की धड़कन', 'c.skin': 'त्वचा का तापमान', 'c.wear': 'पहनने वाले डिवाइस से',
    'c.checkins.d': 'आपके जवाब सिर्फ़ आपको और व्यावसायिक स्वास्थ्य टीम को मिलते हैं।', 'c.wear.d': 'इस फ़ोन पर आपको जल्दी चेतावनी देने के लिए। आपके सुपरवाइज़र को नहीं भेजा जाता।',
    'p1.sees': 'आपका सुपरवाइज़र सिर्फ़ “अभी आराम चाहिए” देखता है। आपके जवाब या शरीर का डेटा कभी नहीं।', readaloud: 'सुनें', 'p1.choices': 'आपकी पसंद', on: 'चालू', off: 'बंद',
    'p1.alerts': 'सब कुछ बंद होने पर भी चेतावनियाँ और काम रोकने की सूचना मिलती रहेगी।', 'p1.later': 'आप इन्हें कभी भी मैं → मेरा डेटा में बदल सकते हैं।', 'p1.save': 'मेरी पसंद सेव करें', next: 'आगे',
    'p2.title': 'अभी', online: 'ऑनलाइन', nonet: 'नेटवर्क नहीं', 'p2.status': 'आपकी स्थिति', 'p2.inrec': 'आराम में', shelterA: 'शेल्टर A', 'p2.heat': 'अभी गर्मी', 'p2.heatq': 'भारी काम बंद',
    'p2.next': 'अगला', 'p2.nextv': 'काम 08:11', workshop: 'वर्कशॉप', 'p2.msgs': 'संदेश', 'p2.water': 'पानी पिएँ', 'p2.water.d': 'अभी एक कप। अगली याद 08:19 पर।', reminder: 'याद',
    stopwork: 'काम बंद', 'p2.stop.d': 'भारी काम बंद हो गया है। शेल्टर A जाएँ।', 'p2.ci': 'शेल्टर A में चेक-इन', 'p2.ci.d': '08:04 पर चेक-इन हुआ। आपका आराम का समय शुरू हो गया है।',
    'p2.plan': 'इस घंटे की आपकी योजना', 'p2.plan.d': 'वर्कशॉप 08:11–08:26, फिर आराम।', 'p2.computed': 'स्थिति और गर्मी साइट के नियमों से तय होती है।', unwell: 'मेरी तबीयत ठीक नहीं है',
    'p2.offline': 'नेटवर्क नहीं है। चेतावनियाँ इस फ़ोन के नियमों से आ रही हैं। हाल बाद में भेजा जाएगा।', 'p2.waiting': '2 हाल भेजे जाने बाकी',
    'p2.huda': 'हुदा का संदेश', 'p2.hudaT': 'शेल्टर A में ठंडा पानी है। जल्दबाज़ी न करें।', 'p2.mt': 'मशीन अनुवाद',
    'alert.stop': 'भारी काम बंद हो गया है। अभी शेल्टर A जाएँ। पानी पिएँ। तबीयत ठीक न लगे तो अपने सुपरवाइज़र को बताएँ।',
    'alert.em': 'मदद आ रही है। किसी के साथ रहें और अकेले न चलें। आपके सुपरवाइज़र को 998 पर कॉल करने को कहा गया है।',
    'alert.fixed': 'तय सुरक्षा निर्देश · जाँचा गया अनुवाद', 'alert.local': 'इस फ़ोन के नियमों से', play: 'सुनें', 'alert.go': 'ठीक है — शेल्टर A', 'alert.with': 'मैं किसी के साथ हूँ',
    'pic.stop': 'रुकें', 'pic.shelter': 'शेल्टर', 'pic.water': 'पानी', 'pic.help': 'मदद', 'pic.stay': 'साथ रहें',
    'p4.title': 'हाल बताएँ', 'p4.hold': 'दबाकर रखें और बोलें', 'p4.listen': 'सुन रहे हैं… भेजने के लिए छोड़ें', 'p4.water': 'मुझे पानी चाहिए', 'p4.ok': 'मैं ठीक हूँ', 'p4.type': 'लिखकर बताएँ', 'p4.typeph': 'आप कैसा महसूस कर रहे हैं?', send: 'भेजें',
    'p4.conv': 'बातचीत', 'p4.hint': 'बटन दबाकर रखें और बताएँ कैसा लग रहा है, या कोई जवाब चुनें।', 'p4.sys': 'आपके सुपरवाइज़र से कहा गया है कि आपको अभी आराम दिलाएँ। वे सिर्फ़ यह कदम देखते हैं, आपके शब्द नहीं।',
    'p4.q': 'क्या आपको उलझन हो रही है, उल्टी हुई है, या पसीना आना बंद हो गया है?', no: 'नहीं', 'p4.yes': 'हाँ, इनमें से कोई', 'p4.you': 'आप', 'p4.vn': 'लिखा और अनुवाद किया गया · आवाज़ सेव नहीं होती', 'p4.fixedq': 'तय सवाल · जाँचा गया अनुवाद',
    'p4.understood': 'हमने क्या समझा', 'p4.unwell': 'तबीयत ठीक नहीं · 08:18', 'p4.noflags': 'कोई ख़तरे का संकेत नहीं।', 'p4.fix': 'इसे ठीक करें', 'p4.retry': 'हटाएँ और फिर से कोशिश करें', 'p4.send': 'मेरे सुपरवाइज़र को भेजें', 'p4.sent': '08:18 पर भेजा गया',
    'p4.rule': '⚙ नियम · यह कदम AI नहीं, नियम से है', 'p4.offline': 'नेटवर्क नहीं है। आपका हाल सेव है और नेटवर्क आने पर भेजा जाएगा। बहुत तबीयत ख़राब हो तो अभी अपने सुपरवाइज़र को बताएँ।',
    'ai.agent': 'वर्कर सहायक', 'ai.conf': 'भरोसा', 'ai.Medium': 'मध्यम', 'ai.why': 'ऐसा क्यों?',
    'p5.title': 'मेरी योजना', 'p5.now': 'अभी', 'p5.until': '08:26 तक', 'p5.nextrest': 'अगला आराम', 'p5.worktoday': 'इस घंटे काम', 'p5.30': '30 मिनट', work: 'काम', rest: 'आराम',
    'p5.prep': 'वर्कशॉप तैयारी', 'p5.rec': 'ठंडी जगह में आराम', 'p5.hour': 'यह घंटा', 'p5.later': 'आज बाद में', 'p5.midday': '12:30–15:00 · बाहर काम नहीं (MoHRE)', 'p5.own': 'सिर्फ़ आपका समय दिखाया गया है।',
    'p5.start': 'मेरा आराम शुरू करें', 'p5.startnote': 'हर आराम से 2 मिनट पहले दिखता है और आपका चेक-इन करता है।', 'p5.upd': 'अपडेट 08:18 · हुदा', 'p5.resting': '08:26 से आराम में',
    'p6.title': 'चेक-इन · शेल्टर A', 'p6.hold': 'फ़ोन को शेल्टर A के बोर्ड के पास रखें', 'p6.qr': 'या QR कोड स्कैन करें', 'p6.cta': 'शेल्टर A में चेक-इन करें', 'p6.done': 'चेक-इन हो गया · 08:04', 'p6.last': 'आपके पिछले चेक-इन', 'p6.back': 'अभी पर वापस',
    'p8.title': 'मेरा डेटा', 'p8.shared': 'सुपरवाइज़र के साथ साझा', 'p8.actions': 'सिर्फ़ ज़रूरी कदम', 'p8.consent': 'सहमति', 'p8.download': 'मेरा डेटा डाउनलोड करें', 'p8.delete': 'सहमति वापस लें और मेरे हाल मिटाएँ',
    'p8.deletebody': 'आपके सुपरवाइज़र को आपकी टीम के लिए गर्मी की चेतावनियाँ मिलती रहेंगी।', 'p8.stored': 'सेव किए गए हाल', 'p8.kept': '30 दिन रखे जाते हैं', 'p8.who': 'मेरे रिकॉर्ड किसने खोले', 'p8.nurse': 'व्यावसायिक स्वास्थ्य नर्स',
    'p8.wear': 'पहनने वाला डिवाइस', 'p8.notpaired': 'जुड़ा नहीं', 'p8.pair': 'इस फ़ोन पर जल्दी चेतावनी पाने के लिए डिवाइस जोड़ें।', 'p8.agreed': 'आपने {date} को सहमति दी। कभी भी वापस ले सकते हैं।', 'p8.none': 'कुछ नहीं।',
    hold: 'पक्का करने के लिए दबाकर रखें', cancel: 'रद्द करें', 'kiosk.tap': 'अपना बैज टैप करें', 'kiosk.checked': 'चेक-इन हो गया',
  },
  ml: {
    app: 'ആരോഗ്യ റിപ്പോർട്ടിംഗ്', 'tab.now': 'ഇപ്പോൾ', 'tab.plan': 'എന്റെ പ്ലാൻ', 'tab.check': 'അവസ്ഥ അറിയിക്കുക', 'tab.me': 'ഞാൻ',
    'lang.choose': 'നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക', 'lang.hint': 'നിങ്ങളുടെ ഭാഷയിൽ ടാപ്പ് ചെയ്യുക. എപ്പോൾ വേണമെങ്കിലും മാറ്റാം.', 'lang.soon': 'ഉടൻ വരുന്നു',
    'p1.title': 'സ്വാഗതം', 'c.checkins': 'അവസ്ഥ അറിയിക്കൽ', 'c.checkins.s': 'നിങ്ങൾക്ക് എങ്ങനെയുണ്ടെന്ന് പറയൂ', 'c.hr': 'ഹൃദയമിടിപ്പ്', 'c.skin': 'ചർമ്മത്തിന്റെ താപനില', 'c.wear': 'ധരിക്കാവുന്ന ഉപകരണത്തിൽ നിന്ന്',
    'c.checkins.d': 'നിങ്ങളുടെ മറുപടികൾ നിങ്ങൾക്കും ഒക്യുപേഷണൽ ഹെൽത്ത് ടീമിനും മാത്രം.', 'c.wear.d': 'നേരത്തെ മുന്നറിയിപ്പ് നൽകാൻ ഈ ഫോണിൽ ഉപയോഗിക്കുന്നു. സൂപ്പർവൈസർക്ക് അയയ്ക്കില്ല.',
    'p1.sees': 'നിങ്ങളുടെ സൂപ്പർവൈസർ കാണുന്നത് “ഇപ്പോൾ വിശ്രമം വേണം” എന്ന് മാത്രം. നിങ്ങളുടെ മറുപടികളോ ശരീര വിവരങ്ങളോ ഒരിക്കലും കാണില്ല.', readaloud: 'കേൾക്കുക', 'p1.choices': 'നിങ്ങളുടെ തിരഞ്ഞെടുപ്പുകൾ', on: 'ഓൺ', off: 'ഓഫ്',
    'p1.alerts': 'എല്ലാം ഓഫ് ആണെങ്കിലും മുന്നറിയിപ്പുകളും ജോലി നിർത്തൽ അറിയിപ്പും ലഭിക്കും.', 'p1.later': 'ഞാൻ → എന്റെ ഡാറ്റ എന്നതിൽ എപ്പോൾ വേണമെങ്കിലും മാറ്റാം.', 'p1.save': 'എന്റെ തിരഞ്ഞെടുപ്പുകൾ സേവ് ചെയ്യുക', next: 'അടുത്തത്',
    'p2.title': 'ഇപ്പോൾ', online: 'ഓൺലൈൻ', nonet: 'നെറ്റ്‌വർക്ക് ഇല്ല', 'p2.status': 'നിങ്ങളുടെ നില', 'p2.inrec': 'വിശ്രമത്തിൽ', shelterA: 'ഷെൽട്ടർ A', 'p2.heat': 'ഇപ്പോഴത്തെ ചൂട്', 'p2.heatq': 'കഠിന ജോലി നിർത്തി',
    'p2.next': 'അടുത്തത്', 'p2.nextv': 'ജോലി 08:11', workshop: 'വർക്ക്‌ഷോപ്പ്', 'p2.msgs': 'സന്ദേശങ്ങൾ', 'p2.water': 'വെള്ളം കുടിക്കുക', 'p2.water.d': 'ഇപ്പോൾ ഒരു കപ്പ്. അടുത്ത ഓർമ്മപ്പെടുത്തൽ 08:19-ന്.', reminder: 'ഓർമ്മപ്പെടുത്തൽ',
    stopwork: 'ജോലി നിർത്തൽ', 'p2.stop.d': 'കഠിന ജോലി നിർത്തി. ഷെൽട്ടർ A-യിലേക്ക് പോകുക.', 'p2.ci': 'ഷെൽട്ടർ A ചെക്ക്-ഇൻ', 'p2.ci.d': '08:04-ന് ചെക്ക്-ഇൻ ചെയ്തു. നിങ്ങളുടെ വിശ്രമ സമയം തുടങ്ങി.',
    'p2.plan': 'ഈ മണിക്കൂറിലെ നിങ്ങളുടെ പ്ലാൻ', 'p2.plan.d': 'വർക്ക്‌ഷോപ്പ് 08:11–08:26, പിന്നെ വിശ്രമം.', 'p2.computed': 'നിലയും ചൂടും സൈറ്റ് നിയമങ്ങളിൽ നിന്നാണ്.', unwell: 'എനിക്ക് സുഖമില്ല',
    'p2.offline': 'നെറ്റ്‌വർക്ക് ഇല്ല. മുന്നറിയിപ്പുകൾ ഈ ഫോണിലെ നിയമങ്ങളിൽ നിന്നാണ്. അവസ്ഥ പിന്നീട് അയയ്ക്കും.', 'p2.waiting': '2 എണ്ണം അയയ്ക്കാൻ ബാക്കി',
    'p2.huda': 'ഹുദയുടെ സന്ദേശം', 'p2.hudaT': 'ഷെൽട്ടർ A-യിൽ തണുത്ത വെള്ളമുണ്ട്. തിരക്ക് കൂട്ടേണ്ട.', 'p2.mt': 'യന്ത്ര വിവർത്തനം',
    'alert.stop': 'കഠിന ജോലി നിർത്തി. ഇപ്പോൾ ഷെൽട്ടർ A-യിലേക്ക് പോകുക. വെള്ളം കുടിക്കുക. സുഖമില്ലെങ്കിൽ സൂപ്പർവൈസറോട് പറയുക.',
    'alert.em': 'സഹായം വരുന്നു. ആരുടെയെങ്കിലും കൂടെ നിൽക്കുക, തനിച്ച് നടക്കരുത്. 998-ൽ വിളിക്കാൻ നിങ്ങളുടെ സൂപ്പർവൈസറോട് പറഞ്ഞിട്ടുണ്ട്.',
    'alert.fixed': 'നിശ്ചിത സുരക്ഷാ നിർദ്ദേശം · പരിശോധിച്ച വിവർത്തനം', 'alert.local': 'ഈ ഫോണിലെ നിയമങ്ങളിൽ നിന്ന്', play: 'കേൾക്കുക', 'alert.go': 'ശരി — ഷെൽട്ടർ A', 'alert.with': 'ഞാൻ ഒരാളുടെ കൂടെയുണ്ട്',
    'pic.stop': 'നിർത്തുക', 'pic.shelter': 'ഷെൽട്ടർ', 'pic.water': 'വെള്ളം', 'pic.help': 'സഹായം', 'pic.stay': 'കൂടെ നിൽക്കുക',
    'p4.title': 'അവസ്ഥ അറിയിക്കുക', 'p4.hold': 'അമർത്തിപ്പിടിച്ച് സംസാരിക്കുക', 'p4.listen': 'കേൾക്കുന്നു… അയയ്ക്കാൻ വിടുക', 'p4.water': 'എനിക്ക് വെള്ളം വേണം', 'p4.ok': 'എനിക്ക് കുഴപ്പമില്ല', 'p4.type': 'പകരം ടൈപ്പ് ചെയ്യുക', 'p4.typeph': 'നിങ്ങൾക്ക് എങ്ങനെയുണ്ട്?', send: 'അയയ്ക്കുക',
    'p4.conv': 'സംഭാഷണം', 'p4.hint': 'ബട്ടൺ അമർത്തിപ്പിടിച്ച് എങ്ങനെയുണ്ടെന്ന് പറയുക, അല്ലെങ്കിൽ ഒരു മറുപടി തിരഞ്ഞെടുക്കുക.', 'p4.sys': 'ഇപ്പോൾ വിശ്രമിക്കാൻ സഹായിക്കാൻ നിങ്ങളുടെ സൂപ്പർവൈസറോട് ആവശ്യപ്പെട്ടു. അവർ നടപടി മാത്രം കാണും, നിങ്ങളുടെ വാക്കുകളല്ല.',
    'p4.q': 'നിങ്ങൾക്ക് ആശയക്കുഴപ്പമുണ്ടോ, ഛർദ്ദിച്ചോ, അല്ലെങ്കിൽ വിയർക്കുന്നത് നിന്നോ?', no: 'ഇല്ല', 'p4.yes': 'ഉണ്ട്, ഇതിൽ ഒന്ന്', 'p4.you': 'നിങ്ങൾ', 'p4.vn': 'എഴുതി, വിവർത്തനം ചെയ്തു · ശബ്ദം സൂക്ഷിക്കില്ല', 'p4.fixedq': 'നിശ്ചിത ചോദ്യം · പരിശോധിച്ച വിവർത്തനം',
    'p4.understood': 'ഞങ്ങൾ മനസ്സിലാക്കിയത്', 'p4.unwell': 'സുഖമില്ല · 08:18', 'p4.noflags': 'അപകട സൂചനകളില്ല.', 'p4.fix': 'ഇത് തിരുത്തുക', 'p4.retry': 'ഒഴിവാക്കി വീണ്ടും ശ്രമിക്കുക', 'p4.send': 'എന്റെ സൂപ്പർവൈസർക്ക് അയയ്ക്കുക', 'p4.sent': '08:18-ന് അയച്ചു',
    'p4.rule': '⚙ നിയമം · ഈ നടപടി AI അല്ല', 'ai.agent': 'വർക്കർ സഹായി', 'ai.conf': 'വിശ്വാസ്യത', 'ai.Medium': 'ഇടത്തരം', 'ai.why': 'എന്തുകൊണ്ട് ഇത്?',
    'p5.title': 'എന്റെ പ്ലാൻ', 'p5.now': 'ഇപ്പോൾ', 'p5.until': '08:26 വരെ', 'p5.nextrest': 'അടുത്ത വിശ്രമം', 'p5.worktoday': 'ഈ മണിക്കൂറിൽ ജോലി', 'p5.30': '30 മിനിറ്റ്', work: 'ജോലി', rest: 'വിശ്രമം',
    'p5.prep': 'വർക്ക്‌ഷോപ്പ് തയ്യാറെടുപ്പ്', 'p5.rec': 'തണുപ്പിച്ച സ്ഥലത്ത് വിശ്രമം', 'p5.hour': 'ഈ മണിക്കൂർ', 'p5.later': 'ഇന്ന് പിന്നീട്', 'p5.midday': '12:30–15:00 · പുറത്ത് ജോലിയില്ല (MoHRE)', 'p5.own': 'നിങ്ങളുടെ സമയം മാത്രമേ കാണിക്കുന്നുള്ളൂ.',
    'p5.start': 'എന്റെ വിശ്രമം തുടങ്ങുക', 'p5.startnote': 'ഓരോ വിശ്രമത്തിനും 2 മിനിറ്റ് മുമ്പ് കാണിക്കും, നിങ്ങളെ ചെക്ക്-ഇൻ ചെയ്യും.', 'p5.upd': 'പുതുക്കിയത് 08:18 · ഹുദ',
    'p6.title': 'ചെക്ക്-ഇൻ · ഷെൽട്ടർ A', 'p6.hold': 'ഫോൺ ഷെൽട്ടർ A ബോർഡിനടുത്ത് പിടിക്കുക', 'p6.qr': 'അല്ലെങ്കിൽ QR കോഡ് സ്കാൻ ചെയ്യുക', 'p6.cta': 'ഷെൽട്ടർ A-യിൽ ചെക്ക്-ഇൻ ചെയ്യുക', 'p6.done': 'ചെക്ക്-ഇൻ ചെയ്തു · 08:04',
    'p8.title': 'എന്റെ ഡാറ്റ', hold: 'ഉറപ്പാക്കാൻ അമർത്തിപ്പിടിക്കുക', cancel: 'റദ്ദാക്കുക', 'kiosk.tap': 'നിങ്ങളുടെ ബാഡ്ജ് ടാപ്പ് ചെയ്യുക', 'kiosk.checked': 'ചെക്ക്-ഇൻ ചെയ്തു',
  },
  bn: {
    app: 'স্বাস্থ্য রিপোর্টিং', 'tab.now': 'এখন', 'tab.plan': 'আমার পরিকল্পনা', 'tab.check': 'অবস্থা জানান', 'tab.me': 'আমি',
    'lang.choose': 'আপনার ভাষা বেছে নিন', 'lang.hint': 'আপনার ভাষায় ট্যাপ করুন। যেকোনো সময় বদলাতে পারবেন।', 'lang.soon': 'শীঘ্রই আসছে',
    'p1.title': 'স্বাগতম', 'c.checkins': 'অবস্থা জানানো', 'c.checkins.s': 'আপনি কেমন বোধ করছেন জানান', 'c.hr': 'হৃদস্পন্দন', 'c.skin': 'ত্বকের তাপমাত্রা', 'c.wear': 'পরিধেয় যন্ত্র থেকে',
    'c.checkins.d': 'আপনার উত্তর শুধু আপনি এবং পেশাগত স্বাস্থ্য দল পায়।', 'c.wear.d': 'আগে থেকে সতর্ক করতে এই ফোনে ব্যবহার হয়। সুপারভাইজারকে পাঠানো হয় না।',
    'p1.sees': 'আপনার সুপারভাইজার শুধু দেখেন “এখন বিশ্রাম দরকার”। আপনার উত্তর বা শরীরের তথ্য কখনো নয়।', readaloud: 'শুনুন', 'p1.choices': 'আপনার পছন্দ', on: 'চালু', off: 'বন্ধ',
    'p1.alerts': 'সব বন্ধ থাকলেও সতর্কবার্তা ও কাজ বন্ধের নোটিশ আসবে।', 'p1.later': 'আমি → আমার তথ্য থেকে যেকোনো সময় বদলাতে পারবেন।', 'p1.save': 'আমার পছন্দ সেভ করুন', next: 'পরবর্তী',
    'p2.title': 'এখন', online: 'অনলাইন', nonet: 'নেটওয়ার্ক নেই', 'p2.status': 'আপনার অবস্থা', 'p2.inrec': 'বিশ্রামে', shelterA: 'শেল্টার A', 'p2.heat': 'এখনকার গরম', 'p2.heatq': 'ভারী কাজ বন্ধ',
    'p2.next': 'পরবর্তী', 'p2.nextv': 'কাজ 08:11', workshop: 'ওয়ার্কশপ', 'p2.msgs': 'বার্তা', 'p2.water': 'পানি পান করুন', 'p2.water.d': 'এখন এক কাপ। পরের মনে করানো 08:19-এ।', reminder: 'মনে করানো',
    stopwork: 'কাজ বন্ধ', 'p2.stop.d': 'ভারী কাজ বন্ধ হয়েছে। শেল্টার A-তে যান।', 'p2.ci': 'শেল্টার A চেক-ইন', 'p2.ci.d': '08:04-এ চেক-ইন হয়েছে। আপনার বিশ্রামের সময় শুরু হয়েছে।',
    'p2.plan': 'এই ঘণ্টার আপনার পরিকল্পনা', 'p2.plan.d': 'ওয়ার্কশপ 08:11–08:26, তারপর বিশ্রাম।', 'p2.computed': 'অবস্থা ও গরম সাইটের নিয়ম থেকে হিসাব করা।', unwell: 'আমার শরীর ভালো লাগছে না',
    'p2.offline': 'নেটওয়ার্ক নেই। সতর্কবার্তা এই ফোনের নিয়ম থেকে আসছে। অবস্থা পরে পাঠানো হবে।', 'p2.waiting': '2টি পাঠানো বাকি',
    'p2.huda': 'হুদার বার্তা', 'p2.hudaT': 'শেল্টার A-তে ঠান্ডা পানি আছে। তাড়াহুড়া করবেন না।', 'p2.mt': 'যন্ত্র অনুবাদ',
    'alert.stop': 'ভারী কাজ বন্ধ হয়েছে। এখনই শেল্টার A-তে যান। পানি পান করুন। শরীর খারাপ লাগলে সুপারভাইজারকে জানান।',
    'alert.em': 'সাহায্য আসছে। কারো সাথে থাকুন, একা হাঁটবেন না। আপনার সুপারভাইজারকে 998-এ ফোন করতে বলা হয়েছে।',
    'alert.fixed': 'নির্ধারিত নিরাপত্তা নির্দেশ · যাচাই করা অনুবাদ', 'alert.local': 'এই ফোনের নিয়ম থেকে', play: 'শুনুন', 'alert.go': 'ঠিক আছে — শেল্টার A', 'alert.with': 'আমি কারো সাথে আছি',
    'pic.stop': 'থামুন', 'pic.shelter': 'শেল্টার', 'pic.water': 'পানি', 'pic.help': 'সাহায্য', 'pic.stay': 'সাথে থাকুন',
    'p4.title': 'অবস্থা জানান', 'p4.hold': 'চেপে ধরে বলুন', 'p4.listen': 'শুনছি… পাঠাতে ছেড়ে দিন', 'p4.water': 'আমার পানি দরকার', 'p4.ok': 'আমি ঠিক আছি', 'p4.type': 'লিখে জানান', 'p4.typeph': 'আপনি কেমন বোধ করছেন?', send: 'পাঠান',
    'p4.conv': 'কথোপকথন', 'p4.hint': 'বোতাম চেপে ধরে বলুন কেমন লাগছে, বা একটি উত্তর বেছে নিন।', 'p4.sys': 'আপনার সুপারভাইজারকে এখনই আপনাকে বিশ্রাম দিতে বলা হয়েছে। তিনি শুধু পদক্ষেপ দেখেন, আপনার কথা নয়।',
    'p4.q': 'আপনার কি বিভ্রান্ত লাগছে, বমি হয়েছে, বা ঘাম বন্ধ হয়ে গেছে?', no: 'না', 'p4.yes': 'হ্যাঁ, এর একটি', 'p4.you': 'আপনি', 'p4.vn': 'লেখা ও অনুবাদ করা হয়েছে · কণ্ঠ রাখা হয় না', 'p4.fixedq': 'নির্ধারিত প্রশ্ন · যাচাই করা অনুবাদ',
    'p4.understood': 'আমরা যা বুঝেছি', 'p4.unwell': 'শরীর ভালো নেই · 08:18', 'p4.noflags': 'বিপদের কোনো লক্ষণ নেই।', 'p4.fix': 'এটি ঠিক করুন', 'p4.retry': 'বাদ দিয়ে আবার চেষ্টা করুন', 'p4.send': 'আমার সুপারভাইজারকে পাঠান', 'p4.sent': '08:18-এ পাঠানো হয়েছে',
    'p4.rule': '⚙ নিয়ম · এই পদক্ষেপ AI নয়', 'ai.agent': 'কর্মী সহায়ক', 'ai.conf': 'আস্থা', 'ai.Medium': 'মাঝারি', 'ai.why': 'কেন এটি?',
    'p5.title': 'আমার পরিকল্পনা', 'p5.now': 'এখন', 'p5.until': '08:26 পর্যন্ত', 'p5.nextrest': 'পরের বিশ্রাম', 'p5.worktoday': 'এই ঘণ্টায় কাজ', 'p5.30': '30 মিনিট', work: 'কাজ', rest: 'বিশ্রাম',
    'p5.prep': 'ওয়ার্কশপ প্রস্তুতি', 'p5.rec': 'ঠান্ডা জায়গায় বিশ্রাম', 'p5.hour': 'এই ঘণ্টা', 'p5.later': 'আজ পরে', 'p5.midday': '12:30–15:00 · বাইরে কাজ নয় (MoHRE)', 'p5.own': 'শুধু আপনার সময় দেখানো হয়েছে।',
    'p5.start': 'আমার বিশ্রাম শুরু করুন', 'p5.startnote': 'প্রতিটি বিশ্রামের 2 মিনিট আগে দেখায় এবং আপনাকে চেক-ইন করে।', 'p5.upd': 'হালনাগাদ 08:18 · হুদা',
    'p6.title': 'চেক-ইন · শেল্টার A', 'p6.hold': 'ফোনটি শেল্টার A বোর্ডের কাছে ধরুন', 'p6.qr': 'অথবা QR কোড স্ক্যান করুন', 'p6.cta': 'শেল্টার A-তে চেক-ইন করুন', 'p6.done': 'চেক-ইন হয়েছে · 08:04',
    'p8.title': 'আমার তথ্য', hold: 'নিশ্চিত করতে চেপে ধরুন', cancel: 'বাতিল', 'kiosk.tap': 'আপনার ব্যাজ ট্যাপ করুন', 'kiosk.checked': 'চেক-ইন হয়েছে',
  },
  tl: {
    app: 'Ulat Pangkalusugan', 'tab.now': 'Ngayon', 'tab.plan': 'Plano ko', 'tab.check': 'Mag-check in', 'tab.me': 'Ako',
    'lang.choose': 'Piliin ang iyong wika', 'lang.hint': 'I-tap ang iyong wika. Puwede mo itong palitan anumang oras.', 'lang.soon': 'Malapit na',
    'p1.title': 'Maligayang pagdating', 'c.checkins': 'Mga check-in', 'c.checkins.s': 'Sabihin kung ano ang pakiramdam mo', 'c.hr': 'Tibok ng puso', 'c.skin': 'Temperatura ng balat', 'c.wear': 'Mula sa wearable',
    'c.checkins.d': 'Ikaw at ang occupational health lang ang makakakita ng mga sagot mo.', 'c.wear.d': 'Ginagamit sa teleponong ito para maagang bigyan ka ng babala. Hindi ipinapadala sa supervisor mo.',
    'p1.sees': 'Ang nakikita lang ng supervisor mo: “kailangang magpahinga ngayon”. Hindi kailanman ang mga sagot mo o datos ng katawan mo.', readaloud: 'Pakinggan', 'p1.choices': 'Mga pinili mo', on: 'Bukas', off: 'Sarado',
    'p1.alerts': 'Gagana pa rin ang mga alerto at ang abiso ng pagtigil sa trabaho kahit naka-off ang lahat.', 'p1.later': 'Puwede mo itong palitan anumang oras sa Ako → Aking datos.', 'p1.save': 'I-save ang mga pinili ko', next: 'Susunod',
    'p2.title': 'Ngayon', online: 'Online', nonet: 'Walang network', 'p2.status': 'Ang status mo', 'p2.inrec': 'Nagpapahinga', shelterA: 'Shelter A', 'p2.heat': 'Init ngayon', 'p2.heatq': 'Itinigil ang mabigat na trabaho',
    'p2.next': 'Susunod', 'p2.nextv': 'Trabaho 08:11', workshop: 'Workshop', 'p2.msgs': 'Mga mensahe', 'p2.water': 'Uminom ng tubig', 'p2.water.d': 'Isang tasa ngayon. Susunod na paalala 08:19.', reminder: 'Paalala',
    stopwork: 'Itigil ang trabaho', 'p2.stop.d': 'Itinigil ang mabigat na trabaho. Pumunta sa Shelter A.', 'p2.ci': 'Check-in sa Shelter A', 'p2.ci.d': 'Naka-check in 08:04. Nagsimula na ang oras ng pahinga mo.',
    'p2.plan': 'Plano mo ngayong oras', 'p2.plan.d': 'Workshop 08:11–08:26, tapos pahinga.', 'p2.computed': 'Ang status at init ay mula sa mga patakaran ng site.', unwell: 'Masama ang pakiramdam ko',
    'p2.offline': 'Walang network. Ang mga babala ay mula sa mga patakaran sa teleponong ito. Ipapadala mamaya ang check-in.', 'p2.waiting': '2 check-in ang naghihintay ipadala',
    'p2.huda': 'Mensahe mula kay Huda', 'p2.hudaT': 'May malamig na tubig sa Shelter A. Huwag magmadali.', 'p2.mt': 'Makinang salin',
    'alert.stop': 'Itinigil na ang mabigat na trabaho. Pumunta na sa Shelter A ngayon. Uminom ng tubig. Sabihan ang supervisor mo kung masama ang pakiramdam mo.',
    'alert.em': 'Paparating na ang tulong. Manatili kasama ang isang tao at huwag maglakad nang mag-isa. Sinabihan na ang supervisor mo na tumawag sa 998.',
    'alert.fixed': 'Nakatakdang tagubilin sa kaligtasan · nirepasong salin', 'alert.local': 'Mula sa mga patakaran sa teleponong ito', play: 'Pakinggan', 'alert.go': 'Sige — Shelter A', 'alert.with': 'May kasama ako',
    'pic.stop': 'Tigil', 'pic.shelter': 'Shelter', 'pic.water': 'Tubig', 'pic.help': 'Tulong', 'pic.stay': 'Manatili',
    'p4.title': 'Mag-check in', 'p4.hold': 'Pindutin nang matagal at magsalita', 'p4.listen': 'Nakikinig… bitawan para ipadala', 'p4.water': 'Kailangan ko ng tubig', 'p4.ok': 'Okay lang ako', 'p4.type': 'Mag-type na lang', 'p4.typeph': 'Ano ang pakiramdam mo?', send: 'Ipadala',
    'p4.conv': 'Usapan', 'p4.hint': 'Pindutin nang matagal ang button at sabihin ang pakiramdam mo, o pumili ng sagot.', 'p4.sys': 'Hiniling sa supervisor mo na tulungan kang magpahinga ngayon. Ang aksyon lang ang nakikita nila, hindi ang mga salita mo.',
    'p4.q': 'Nalilito ka ba, nagsuka, o tumigil ang pagpapawis mo?', no: 'Hindi', 'p4.yes': 'Oo, isa sa mga ito', 'p4.you': 'Ikaw', 'p4.vn': 'Na-transcribe at naisalin · hindi itinatago ang audio', 'p4.fixedq': 'Nakatakdang tanong · nirepasong salin',
    'p4.understood': 'Ang naintindihan namin', 'p4.unwell': 'Masama ang pakiramdam · 08:18', 'p4.noflags': 'Walang palatandaan ng panganib.', 'p4.fix': 'Ayusin ito', 'p4.retry': 'Burahin at subukan ulit', 'p4.send': 'Ipadala sa supervisor ko', 'p4.sent': 'Naipadala 08:18',
    'p4.rule': '⚙ Patakaran · hindi AI ang aksyong ito', 'ai.agent': 'Katulong ng Manggagawa', 'ai.conf': 'Kumpiyansa', 'ai.Medium': 'Katamtaman', 'ai.why': 'Bakit ito?',
    'p5.title': 'Plano ko', 'p5.now': 'Ngayon', 'p5.until': 'hanggang 08:26', 'p5.nextrest': 'Susunod na pahinga', 'p5.worktoday': 'Trabaho ngayong oras', 'p5.30': '30 min', work: 'Trabaho', rest: 'Pahinga',
    'p5.prep': 'Paghahanda sa workshop', 'p5.rec': 'Pahinga sa malamig na lugar', 'p5.hour': 'Ngayong oras', 'p5.later': 'Mamaya', 'p5.midday': '12:30–15:00 · walang trabaho sa labas (MoHRE)', 'p5.own': 'Ang sarili mong oras lang ang ipinapakita.',
    'p5.start': 'Simulan ang pahinga ko', 'p5.startnote': 'Lalabas 2 minuto bago ang bawat pahinga at ichi-check in ka.', 'p5.upd': 'Na-update 08:18 · Huda',
    'p6.title': 'Check in · Shelter A', 'p6.hold': 'Ilapit ang telepono sa karatula ng Shelter A', 'p6.qr': 'o i-scan ang QR code', 'p6.cta': 'Mag-check in sa Shelter A', 'p6.done': 'Naka-check in · 08:04',
    'p8.title': 'Aking datos', hold: 'Pindutin nang matagal para kumpirmahin', cancel: 'Kanselahin', 'kiosk.tap': 'I-tap ang badge mo', 'kiosk.checked': 'Naka-check in',
  },
};

function curLang() { return App.f.lang || 'en'; }
/* t(): HTML-safe string for the current worker language. Missing keys fall back to English
   and are marked lang="en" so the right font and direction apply, and QA can spot them. */
function t(key, vars, lang) {
  const L = lang || curLang();
  let v = STR[L] && STR[L][key];
  let fb = false;
  if (v == null) { v = STR.en[key] != null ? STR.en[key] : key; fb = L !== 'en'; }
  if (vars) Object.entries(vars).forEach(([k, x]) => { v = v.replace('{' + k + '}', x); });
  return fb ? `<span class="fallback" lang="en" dir="ltr">${v}</span>` : v;
}
/* tt(): plain text for attributes (aria-label, placeholder). */
function tt(key, lang) { const L = lang || curLang(); return (STR[L] && STR[L][key]) || STR.en[key] || key; }
function inLang(key, lang) { const m = LANG[lang]; return `<span lang="${lang}" dir="${m ? m.d : 'ltr'}">${t(key, null, lang)}</span>`; }
/* Dates via Intl with Western digits (latn), as used across UAE signage and government apps. */
function fmtDate(d, lang) {
  const loc = { en: 'en-AE', ar: 'ar-AE', ur: 'ur-PK', hi: 'hi-IN', ml: 'ml-IN', bn: 'bn-BD', tl: 'fil-PH' }[lang || curLang()] || 'en-AE';
  try { return new Intl.DateTimeFormat(loc + '-u-nu-latn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); } catch (e) { return d.toISOString(); }
}
/* SMS sizing: GSM-7 allows 160 characters per message; any Arabic or Indic character forces
   UCS-2, which allows only 70 (67 per part when split). */
function smsInfo(text) {
  const gsm = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå_ÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
  const n = [...text].length;
  const one = gsm ? 160 : 70, part = gsm ? 153 : 67;
  return { enc: gsm ? 'GSM-7' : 'Unicode (UCS-2)', n, one, parts: n <= one ? 1 : Math.ceil(n / part) };
}

/* Remaining keys (empty state, offline, plan and data screens). */
Object.assign(STR.ar, { 'p2.empty': 'ليس لديك وردية اليوم. عندما يضيفك مشرفك إلى فريق، ستظهر خطتك هنا.' });
Object.assign(STR.ur, { 'p2.empty': 'آج آپ کی شفٹ نہیں ہے۔ جب آپ کا سپروائزر آپ کو ٹیم میں شامل کرے گا، آپ کا پلان یہاں نظر آئے گا۔' });
Object.assign(STR.hi, { 'p2.empty': 'आज आपकी शिफ़्ट नहीं है। जब आपका सुपरवाइज़र आपको टीम में जोड़ेगा, आपकी योजना यहाँ दिखेगी।' });
Object.assign(STR.ml, {
  'p2.empty': 'ഇന്ന് നിങ്ങൾക്ക് ഷിഫ്റ്റ് ഇല്ല. സൂപ്പർവൈസർ നിങ്ങളെ ഒരു ടീമിൽ ചേർക്കുമ്പോൾ പ്ലാൻ ഇവിടെ കാണാം.',
  'p4.offline': 'നെറ്റ്‌വർക്ക് ഇല്ല. നിങ്ങളുടെ അവസ്ഥ സേവ് ചെയ്തു, നെറ്റ്‌വർക്ക് വന്നാൽ അയയ്ക്കും. വളരെ സുഖമില്ലെങ്കിൽ ഇപ്പോൾ തന്നെ സൂപ്പർവൈസറോട് പറയുക.',
  'p5.resting': '08:26 മുതൽ വിശ്രമത്തിൽ', 'p6.last': 'നിങ്ങളുടെ അവസാന ചെക്ക്-ഇന്നുകൾ', 'p6.back': 'ഇപ്പോൾ എന്നതിലേക്ക് മടങ്ങുക',
  'p8.shared': 'സൂപ്പർവൈസറുമായി പങ്കിടുന്നത്', 'p8.actions': 'നടപടികൾ മാത്രം', 'p8.consent': 'സമ്മതം', 'p8.download': 'എന്റെ ഡാറ്റ ഡൗൺലോഡ് ചെയ്യുക',
  'p8.delete': 'സമ്മതം പിൻവലിച്ച് എന്റെ ചെക്ക്-ഇന്നുകൾ മായ്ക്കുക', 'p8.deletebody': 'നിങ്ങളുടെ ടീമിനുള്ള ചൂട് മുന്നറിയിപ്പുകൾ സൂപ്പർവൈസർക്ക് തുടർന്നും ലഭിക്കും.',
  'p8.stored': 'സൂക്ഷിച്ച ചെക്ക്-ഇന്നുകൾ', 'p8.kept': '30 ദിവസം സൂക്ഷിക്കും', 'p8.who': 'എന്റെ രേഖകൾ ആരൊക്കെ തുറന്നു', 'p8.nurse': 'ഒക്യുപേഷണൽ ഹെൽത്ത് നഴ്സ്',
  'p8.wear': 'ധരിക്കാവുന്ന ഉപകരണം', 'p8.notpaired': 'ബന്ധിപ്പിച്ചിട്ടില്ല', 'p8.pair': 'ഈ ഫോണിൽ നേരത്തെ മുന്നറിയിപ്പ് ലഭിക്കാൻ ഉപകരണം ബന്ധിപ്പിക്കുക.',
  'p8.agreed': '{date}-ന് നിങ്ങൾ സമ്മതിച്ചു. എപ്പോൾ വേണമെങ്കിലും പിൻവലിക്കാം.', 'p8.none': 'ഒന്നുമില്ല.',
});
Object.assign(STR.bn, {
  'p2.empty': 'আজ আপনার শিফট নেই। সুপারভাইজার আপনাকে দলে যোগ করলে আপনার পরিকল্পনা এখানে দেখাবে।',
  'p4.offline': 'নেটওয়ার্ক নেই। আপনার অবস্থা সেভ হয়েছে, নেটওয়ার্ক এলে পাঠানো হবে। খুব খারাপ লাগলে এখনই সুপারভাইজারকে জানান।',
  'p5.resting': '08:26 থেকে বিশ্রামে', 'p6.last': 'আপনার শেষ চেক-ইন', 'p6.back': 'এখন-এ ফিরে যান',
  'p8.shared': 'সুপারভাইজারের সাথে শেয়ার', 'p8.actions': 'শুধু পদক্ষেপ', 'p8.consent': 'সম্মতি', 'p8.download': 'আমার তথ্য ডাউনলোড করুন',
  'p8.delete': 'সম্মতি তুলে নিন এবং আমার চেক-ইন মুছুন', 'p8.deletebody': 'আপনার দলের জন্য গরমের সতর্কবার্তা সুপারভাইজার পেতে থাকবেন।',
  'p8.stored': 'সংরক্ষিত চেক-ইন', 'p8.kept': '30 দিন রাখা হয়', 'p8.who': 'আমার রেকর্ড কে খুলেছে', 'p8.nurse': 'পেশাগত স্বাস্থ্য নার্স',
  'p8.wear': 'পরিধেয় যন্ত্র', 'p8.notpaired': 'যুক্ত নয়', 'p8.pair': 'এই ফোনে আগাম সতর্কবার্তা পেতে একটি যন্ত্র যুক্ত করুন।',
  'p8.agreed': 'আপনি {date}-এ সম্মতি দিয়েছেন। যেকোনো সময় তুলে নিতে পারেন।', 'p8.none': 'কিছু নেই।',
});
Object.assign(STR.tl, {
  'p2.empty': 'Wala kang shift ngayon. Kapag isinama ka ng supervisor mo sa isang crew, lalabas dito ang plano mo.',
  'p4.offline': 'Walang network. Naka-save ang check-in mo at ipapadala pagbalik ng network. Kung napakasama ng pakiramdam mo, sabihan na ang supervisor mo ngayon.',
  'p5.resting': 'Nagpapahinga mula 08:26', 'p6.last': 'Mga huling check-in mo', 'p6.back': 'Bumalik sa Ngayon',
  'p8.shared': 'Ibinabahagi sa supervisor', 'p8.actions': 'Mga aksyon lang', 'p8.consent': 'Pahintulot', 'p8.download': 'I-download ang datos ko',
  'p8.delete': 'Bawiin ang pahintulot at burahin ang mga check-in ko', 'p8.deletebody': 'Patuloy pa ring makakatanggap ang supervisor mo ng mga alerto sa init para sa crew mo.',
  'p8.stored': 'Mga naka-save na check-in', 'p8.kept': 'itinatago nang 30 araw', 'p8.who': 'Sino ang nagbukas ng mga record ko', 'p8.nurse': 'Nars ng occupational health',
  'p8.wear': 'Wearable', 'p8.notpaired': 'Hindi naka-pair', 'p8.pair': 'Mag-pair ng wearable para makatanggap ng maagang babala sa teleponong ito.',
  'p8.agreed': 'Pumayag ka noong {date}. Puwede mong bawiin anumang oras.', 'p8.none': 'Wala.',
});
