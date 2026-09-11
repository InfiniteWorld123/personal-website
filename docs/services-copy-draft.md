# Services page copy draft

Status: **Accepted editorial master — not yet implemented**

This is the exact content source for `/services`. It implements C14 in
`content-decisions.md`. The German version is the editorial master; English
and Arabic are natural adaptations, not word-for-word translations.

## Implementation boundary

- Keep the existing visual system, components, links, motion, and CSS.
- Keep the existing sequence: header → three service sections → shared rules →
  final CTA.
- Render the service sections locally in this order:
  `websites`, `shopify`, `software`. Do not change the global `serviceOrder`,
  because home-page hero pills use it.
- Remove the rendered per-service `boundaryTitle` / `boundary` block. These
  fields and their `ServiceCopy` type entries are no longer part of the public
  services-page contract.
- Do not add a technology stack section. Shopify may be named only in the
  online-shop detail below.
- Prices remain the existing canonical values in `servicePrices`; do not make
  separate, hard-coded prices or alter pricing logic.

---

## German (`de`)

### Page

```text
meta.title: Leistungen · Websites, Online-Shops und individuelle Software
meta.description: Websites ab 990 €, Online-Shops ab 2.490 € und individuelle Software ab 2.990 €. Gemeinsam klären wir, was für dein Vorhaben der richtige erste Schritt ist.
eyebrow: Leistungen
title: Die richtige digitale Lösung für dein Vorhaben.
intro: Du musst nicht wissen, welche Technik du brauchst. Erzähl mir, was du zeigen, verkaufen oder einfacher machen willst — dann finden wir den passenden Weg.
from: ab
```

### Websites

```text
name: Websites
short: Ein klarer, professioneller Ort, an dem Menschen verstehen, was du machst und wie sie dich erreichen.
promise: Ich plane und entwickle eine Website, die dein Unternehmen verständlich zeigt und Besuchern den nächsten Schritt leicht macht — von der ersten Struktur bis zur Veröffentlichung.
audienceTitle: Passt, wenn du
audience:
  - ein neues Unternehmen mit einem seriösen Auftritt starten willst.
  - einen lokalen Betrieb führst und alle wichtigen Informationen an einem klaren Ort zeigen möchtest.
  - eine bestehende Website hast, die dein heutiges Niveau nicht mehr zeigt.
  - eine klare Anlaufstelle für Anfragen, Kontakt oder eine einfache Buchung brauchst.
includesTitle: Das kann dazugehören
includes:
  - eine klare Seitenstruktur und die technische Umsetzung.
  - eine Darstellung, die auf Handy und Desktop zuverlässig funktioniert.
  - Kontakt, Anfragen oder eine einfache Buchungsmöglichkeit.
  - Unterstützung beim Sortieren deiner Inhalte und bei der Veröffentlichung.
priceTitle: Startpreis
price: ab 990 €
priceNote: Der Startpreis passt zu einem kleinen, klaren Website-Projekt. Seitenumfang, eigene Gestaltung, zusätzliche Sprachen und Funktionen ordnen wir gemeinsam ein, bevor du ein schriftliches Angebot bekommst.
```

### Online-Shops

```text
name: Online-Shops
short: Ein Online-Shop, mit dem du starten kannst — und den du danach selbst führen kannst.
promise: Ich baue einen klaren Online-Shop mit einer guten Grundlage für Produkte, Kaufablauf und Übergabe. Wenn Shopify zu deinem Vorhaben passt, ist es meist die richtige Basis.
audienceTitle: Passt, wenn du
audience:
  - deine Produkte erstmals online verkaufen willst.
  - einen bestehenden Shop klarer ordnen oder weiterentwickeln möchtest.
  - einen Shop brauchst, den du nach der Übergabe selbst verwalten kannst.
  - eine passende Lösung für Produkte, Varianten, Zahlung und Versand brauchst.
includesTitle: Das kann dazugehören
includes:
  - die passende Shop-Grundlage und ein Auftritt, der zu deiner Marke passt.
  - Produktstruktur, Navigation und die wichtigen Shop-Seiten.
  - die technische Einrichtung von Zahlung und Versand nach deinen Vorgaben.
  - eine gemeinsame Übergabe, damit du den Shop danach sicher führen kannst.
priceTitle: Startpreis
price: ab 2.490 €
priceNote: Der Startpreis gilt für einen überschaubaren neuen Shop mit vorbereiteten Produktdaten. Umfang, Datenaufbereitung, Sprachen, Umzug und Integrationen prüfen wir vor dem Angebot. Shopify, Domain, Apps und Zahlungsgebühren bezahlst du direkt an die jeweiligen Anbieter.
```

### Individuelle Software

```text
name: Individuelle Software
short: Ein digitales Werkzeug, das zu deinem Ablauf passt — statt dich in einen fremden Prozess zu zwingen.
promise: Ich plane und entwickle die kleinste sinnvolle Web-Anwendung für deinen Ablauf: zum Beispiel ein internes Werkzeug, ein Buchungssystem, ein Kundenbereich oder eine erste Produktversion.
audienceTitle: Passt, wenn du
audience:
  - einen Ablauf hast, der heute in E-Mails, Tabellen oder Handarbeit stecken bleibt.
  - Daten, Aufgaben oder Anfragen an einem zuverlässigen Ort bündeln willst.
  - ein internes Werkzeug für dich oder dein Team brauchst.
  - eine erste echte Version eines digitalen Produkts prüfen möchtest.
includesTitle: Das kann dazugehören
includes:
  - eine Web-Anwendung mit genau den Funktionen, die die erste Version braucht.
  - Oberfläche, Logik und Datenhaltung im vereinbarten Umfang.
  - Rollen, einen Admin-Bereich, Benachrichtigungen oder eine Schnittstelle, wenn sie wirklich nötig sind.
  - eine technische Grundlage, die sich später gezielt weiterentwickeln lässt.
priceTitle: Startpreis
price: ab 2.990 €
priceNote: Der Startpreis steht für ein kleines, klar abgegrenztes Software-Projekt. Bei mehreren Rollen, Integrationen, Zahlungen oder einem komplexen Ablauf brauche ich zuerst Zeit, um den richtigen Einstieg zu klären. Danach erhältst du ein schriftliches Angebot für den vereinbarten Umfang.
```

### Shared rules and CTA

```text
shared.title: Was für jedes Projekt gilt
shared.items:
  - title: Erst Klarheit, dann Umsetzung
    body: Bevor es losgeht, halten wir schriftlich fest, was die erste Version leisten soll — und was nicht.
  - title: Ein Preis für den passenden Umfang
    body: Die Preise auf dieser Seite sind Startpunkte. Den endgültigen Preis nenne ich dir, nachdem ich dein Vorhaben verstanden und den Umfang geprüft habe.
  - title: Deine Konten bleiben deine
    body: Domain, Shop-, Hosting- und andere wichtige Zugänge laufen auf deinen Namen.
  - title: Nach dem Launch geht es klar weiter
    body: Fehler im vereinbarten Umfang korrigiere ich innerhalb der vereinbarten Frist. Für Betrieb, Pflege oder die nächste Verbesserung können wir eine passende Vereinbarung treffen.
shared.faqLink: Fragen zu Ablauf, Preisen und Übergabe
cta.title: Noch nicht sicher, was du brauchst?
cta.body: Das ist in Ordnung. Beschreib mir kurz, was du zeigen, verkaufen oder einfacher machen willst — ich helfe dir, den richtigen ersten Schritt einzuordnen.
cta.button: Gespräch anfragen
```

---

## English (`en`)

### Page

```text
meta.title: Services · Websites, online stores, and custom software
meta.description: Websites from €990, online stores from €2,490, and custom software from €2,990. Together, we work out the right first step for your project.
eyebrow: Services
title: The right digital solution for your project.
intro: You do not need to know which technology you need. Tell me what you want to show, sell, or make easier — then we will find the right way forward.
from: from
```

### Websites

```text
name: Websites
short: A clear, professional place where people understand what you do and how to reach you.
promise: I plan and build a website that presents your business clearly and makes the next step easy for visitors — from the first structure through to launch.
audienceTitle: A good fit if you
audience:
  - want to launch a new business with a professional presence.
  - run a local business and want all essential information in one clear place.
  - have an existing website that no longer reflects your current standard.
  - need a clear place for enquiries, contact, or simple bookings.
includesTitle: This can include
includes:
  - a clear page structure and the technical build.
  - a presentation that works reliably on mobile and desktop.
  - contact, enquiry, or simple booking options.
  - support to organise your content and publish the site.
priceTitle: Starting price
price: from €990
priceNote: The starting price fits a small, clearly defined website project. We will assess page scope, bespoke design, additional languages, and functionality together before you receive a written proposal.
```

### Online stores

```text
name: Online stores
short: An online store you can launch with — and run yourself afterwards.
promise: I build a clear online store with a solid foundation for products, the buying journey, and handover. When Shopify suits your project, it is usually the right foundation.
audienceTitle: A good fit if you
audience:
  - want to sell your products online for the first time.
  - want to organise or improve an existing store more clearly.
  - need a store you can manage yourself after handover.
  - need a suitable setup for products, variants, payment, and shipping.
includesTitle: This can include
includes:
  - the right store foundation and a presence that fits your brand.
  - product structure, navigation, and the essential store pages.
  - technical payment and shipping setup based on your requirements.
  - a joint handover so you can run the store confidently afterwards.
priceTitle: Starting price
price: from €2,490
priceNote: The starting price applies to a manageable new store with prepared product data. We review scope, data preparation, languages, migration, and integrations before the proposal. You pay Shopify, domain, app, and payment fees directly to the relevant providers.
```

### Custom software

```text
name: Custom software
short: A digital tool that fits the way you work — instead of forcing you into someone else’s process.
promise: I plan and build the smallest useful web application for your workflow: for example, an internal tool, booking system, client area, or first product version.
audienceTitle: A good fit if you
audience:
  - have a process that is currently stuck in emails, spreadsheets, or manual work.
  - want to bring data, tasks, or enquiries together in one reliable place.
  - need an internal tool for yourself or your team.
  - want to test a first real version of a digital product.
includesTitle: This can include
includes:
  - a web application with exactly the features the first version needs.
  - interface, logic, and data storage within the agreed scope.
  - roles, an admin area, notifications, or an integration where they are genuinely needed.
  - a technical foundation that can be developed further deliberately later.
priceTitle: Starting price
price: from €2,990
priceNote: The starting price represents a small, clearly bounded software project. If several roles, integrations, payments, or a complex workflow are involved, I first need time to work out the right starting point. You will then receive a written proposal for the agreed scope.
```

### Shared rules and CTA

```text
shared.title: What applies to every project
shared.items:
  - title: Clarity before implementation
    body: Before we begin, we put in writing what the first version should do — and what it should not.
  - title: A price for the right scope
    body: The prices on this page are starting points. I will give you the final price after I understand your project and review the scope.
  - title: Your accounts stay yours
    body: Your domain, store, hosting, and other important accounts are held in your name.
  - title: A clear path after launch
    body: I correct defects within the agreed scope during the agreed period. For operations, maintenance, or the next improvement, we can make an arrangement that fits.
shared.faqLink: Questions about process, pricing, and handover
cta.title: Not sure what you need yet?
cta.body: That is completely fine. Briefly tell me what you want to show, sell, or make easier — I will help you identify the right first step.
cta.button: Request a call
```

---

## Arabic (`ar`)

### Page

```text
meta.title: الخدمات · مواقع، متاجر إلكترونية، وبرمجيات مخصّصة
meta.description: مواقع من 990 €، ومتاجر إلكترونية من 2.490 €، وبرمجيات مخصّصة من 2.990 €. نحدّد معًا ما هي الخطوة الأولى المناسبة لمشروعك.
eyebrow: الخدمات
title: الحل الرقمي المناسب لمشروعك.
intro: لا تحتاج إلى معرفة التقنية التي تحتاجها. أخبرني بما تريد عرضه أو بيعه أو جعله أسهل — ثم نحدّد الطريق المناسب.
from: من
```

### Websites

```text
name: المواقع
short: مكان واضح واحترافي يفهم فيه الناس ما الذي تفعله وكيف يمكنهم الوصول إليك.
promise: أخطّط وأبني موقعًا يعرّف بشركتك بوضوح ويجعل الخطوة التالية سهلة للزائر — من البنية الأولى حتى النشر.
audienceTitle: يناسبك إذا كنت
audience:
  - تريد إطلاق شركة جديدة بحضور احترافي.
  - تدير نشاطًا محليًا وتريد جمع المعلومات المهمة كلها في مكان واضح.
  - تملك موقعًا قديمًا لم يعد يعكس مستواك الحالي.
  - تحتاج إلى نقطة واضحة للتواصل أو الاستفسارات أو حجز بسيط.
includesTitle: يمكن أن يشمل
includes:
  - بنية صفحات واضحة والتنفيذ التقني.
  - عرضًا يعمل بثبات على الهاتف والكمبيوتر.
  - خيارات للتواصل أو الاستفسار أو حجز بسيط.
  - مساعدة في ترتيب المحتوى ونشر الموقع.
priceTitle: سعر البداية
price: من 990 €
priceNote: يناسب سعر البداية مشروع موقع صغيرًا وواضحًا. نحدّد معًا حجم الصفحات، والتصميم الخاص، واللغات الإضافية، والوظائف قبل أن تحصل على عرض مكتوب.
```

### Online shops

```text
name: المتاجر الإلكترونية
short: متجر إلكتروني تستطيع الانطلاق به — ثم إدارته بنفسك بعد التسليم.
promise: أبني متجرًا إلكترونيًا واضحًا بأساس جيد للمنتجات، ومسار الشراء، والتسليم. عندما تكون Shopify مناسبة لمشروعك، تكون غالبًا هي الأساس المناسب.
audienceTitle: يناسبك إذا كنت
audience:
  - تريد بيع منتجاتك على الإنترنت للمرة الأولى.
  - تريد ترتيب متجرك الحالي بشكل أوضح أو تطويره.
  - تحتاج إلى متجر تستطيع إدارته بنفسك بعد التسليم.
  - تحتاج إلى إعداد مناسب للمنتجات والخيارات والدفع والشحن.
includesTitle: يمكن أن يشمل
includes:
  - الأساس المناسب للمتجر وحضورًا ينسجم مع علامتك.
  - بنية المنتجات والتنقّل وصفحات المتجر المهمة.
  - الإعداد التقني للدفع والشحن وفق متطلباتك.
  - تسليمًا مشتركًا كي تستطيع إدارة المتجر بثقة بعد ذلك.
priceTitle: سعر البداية
price: من 2.490 €
priceNote: ينطبق سعر البداية على متجر جديد محدود الحجم مع بيانات منتجات جاهزة. نراجع الحجم وتجهيز البيانات واللغات والنقل والتكاملات قبل العرض. تدفع رسوم Shopify والنطاق والتطبيقات والدفع مباشرةً إلى مزوّديها.
```

### Custom software

```text
name: برمجيات مخصّصة
short: أداة رقمية تناسب طريقة عملك بدل أن تجبرك على عملية لا تشبهك.
promise: أخطّط وأبني أصغر تطبيق ويب مفيد لسير عملك: مثل أداة داخلية، أو نظام حجوزات، أو منطقة مخصّصة للعملاء، أو نسخة أولى من منتج رقمي.
audienceTitle: يناسبك إذا كنت
audience:
  - لديك عملية ما زالت عالقة بين البريد الإلكتروني والجداول والعمل اليدوي.
  - تريد جمع البيانات أو المهام أو الاستفسارات في مكان موثوق واحد.
  - تحتاج إلى أداة داخلية لك أو لفريقك.
  - تريد اختبار نسخة أولى حقيقية من منتج رقمي.
includesTitle: يمكن أن يشمل
includes:
  - تطبيق ويب فيه بالضبط الوظائف التي تحتاجها النسخة الأولى.
  - الواجهة والمنطق وتخزين البيانات ضمن النطاق المتفق عليه.
  - صلاحيات، أو لوحة إدارة، أو إشعارات، أو تكامل عندما تكون مطلوبة فعلًا.
  - أساسًا تقنيًا يمكن تطويره لاحقًا بشكل مدروس.
priceTitle: سعر البداية
price: من 2.990 €
priceNote: يمثّل سعر البداية مشروع برمجيات صغيرًا ومحدودًا بوضوح. عندما توجد صلاحيات متعددة أو تكاملات أو دفعات أو عملية معقدة، أحتاج أولًا إلى وقت لتحديد البداية الصحيحة. بعدها تحصل على عرض مكتوب بالنطاق المتفق عليه.
```

### Shared rules and CTA

```text
shared.title: ما ينطبق على كل مشروع
shared.items:
  - title: الوضوح قبل التنفيذ
    body: قبل أن نبدأ، نثبت كتابيًا ما الذي يجب أن تنجزه النسخة الأولى — وما الذي لا يدخل فيها.
  - title: سعر للنطاق المناسب
    body: الأسعار في هذه الصفحة هي نقاط بداية. أعطيك السعر النهائي بعد أن أفهم مشروعك وأراجع نطاقه.
  - title: حساباتك تبقى لك
    body: النطاق وحسابات المتجر والاستضافة وأي حسابات مهمة أخرى تكون باسمك.
  - title: طريق واضح بعد الإطلاق
    body: أصلح الأخطاء ضمن النطاق المتفق عليه وخلال المدة المتفق عليها. وللتشغيل أو الصيانة أو التحسين التالي يمكننا الاتفاق على صيغة مناسبة.
shared.faqLink: أسئلة عن العملية والأسعار والتسليم
cta.title: لست متأكدًا بعد مما تحتاجه؟
cta.body: لا مشكلة. صف لي باختصار ما الذي تريد عرضه أو بيعه أو جعله أسهل — وسأساعدك في تحديد الخطوة الأولى المناسبة.
cta.button: اطلب مكالمة
```

## Acceptance checks for implementation

1. `/de/services`, `/en/services`, and `/ar/services` use the master copy
   above and show the local order Websites → Online-Shops → Custom Software.
2. The per-service "what I do not promise" / equivalent block is absent from
   the DOM and `ServiceCopy` no longer exposes fields solely used by it.
3. No CSS, layout, icon, route, link, motion, or pricing-logic change is made.
4. The page remains readable in RTL and with reduced motion. Run typecheck,
   tests, build, and a local browser check at desktop and 375px widths.
