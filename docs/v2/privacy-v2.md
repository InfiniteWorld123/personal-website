# Privacy page for V2 — draft for the owner's approval

Status: **approved by the owner on 24 Sep 2026; built behind the switch** — the privacy page shows this wording as soon as any public module reads Backend2 (`src/frontend/content/privacy-v2.ts`), and today's wording until then. The current privacy
page (`legal.privacy` in `src/frontend/content/{de,en,ar}.ts`) stays until the
owner approves this text; it then goes live together with the first public
step that needs it. This is a technical description of what the software
does, written plainly — **not legal advice**. Before real visitors' data is
processed by V2, a qualified person should read it.

## What changes compared with today's page, and why

| Section | Today | V2 | Why |
|---|---|---|---|
| Where data is stored | not stated | Neon database in Frankfurt (EU); files in Cloudflare R2 | V2 keeps messages, bookings, comments and chats in its own database |
| Contact form | project type, budget, timeline; PDF/PNG/JPG up to 5 MB; delivered by email | no project type or budget; PDF, images, video, Office up to 10 MB; kept in my own mailbox system | approved Contact changes (Inbox spec) |
| Booking | only Turnstile mentioned | what a booking stores, emails, the private change link, video calls | the page never described bookings |
| Website assistant | **not mentioned at all** | answers from the website only, no external AI; conversations are saved and read by me | V2 saves and reads conversations; visitors must be told |
| Blog comments and likes | not mentioned | what a comment stores, that it is public at once; likes are anonymous | new public comments |
| Browser storage | "only technically necessary" | also: the chat's conversation handle for this tab, and which articles you liked | stated precisely |
| No analytics | unchanged | unchanged | still true: PostHog stays off |

The Legal page is locked in the Content editor; these words go live through a
reviewed release, not a Dashboard edit.

---

## Deutsch (verbindliche Fassung)

**Einleitung (ersetzt die heutige):**
Diese Website erhebt so wenig wie möglich. Es gibt keine Analyse-Tools, keine Werbenetzwerke und kein Tracking über Seiten hinweg. Was tatsächlich verarbeitet wird, steht hier vollständig. Diese Fassung ist ein technischer Entwurf und keine Rechtsberatung.

**Speicherort (neu):**
Anfragen, Buchungen, Kommentare und Gespräche mit dem Website-Assistenten speichere ich in einer Datenbank des Anbieters Neon (Rechenzentrum Frankfurt am Main, EU). Dateien, die du mir schickst, liegen verschlüsselt im Speicher Cloudflare R2. Beide Anbieter verarbeiten die Daten nur in meinem Auftrag.

**Kontaktformular und E-Mail (ersetzt die heutige Fassung):**
Wenn du das Kontaktformular nutzt, werden Name, E-Mail-Adresse, optional Firma und Telefonnummer, dein Text sowie optional eine Datei (PDF, Bild, Video oder Word/Excel/PowerPoint, bis 10 MB) verarbeitet. Deine Nachricht landet in meinem eigenen Postfachsystem, wo nur ich sie lese und beantworte; E-Mails versende ich über den Dienst Resend. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Anbahnung eines Vertrags, sonst Art. 6 Abs. 1 lit. f DSGVO. Ich lösche deine Anfrage, wenn sie nicht mehr gebraucht wird und keine gesetzliche Aufbewahrungspflicht besteht, oder früher auf deinen Wunsch.

**Terminbuchung und Videogespräche (neu):**
Wenn du einen Termin buchst, speichere ich Name, E-Mail-Adresse, bei einem Telefonat deine Telefonnummer, optional Firma, Thema, Budgetrahmen und Notiz, die gewählte Zeit, Gesprächsart und deine Zeitzone. Du bekommst eine Bestätigung und eine Erinnerung per E-Mail (über Resend) mit einem privaten Link, über den du den Termin ändern oder absagen kannst. Videogespräche laufen direkt auf dieser Website über Cloudflare Realtime; sie werden nicht aufgezeichnet, und der Chat im Gespräch wird nicht gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.

**Website-Assistent (neu):**
Der Assistent beantwortet Fragen automatisch und nur mit dem, was auf dieser Website veröffentlicht ist; es wird dafür kein externer KI-Dienst genutzt. Deine Fragen und die Antworten werden gespeichert, und ich lese sie, um die Website zu verbessern. Deine IP-Adresse wird dabei nicht gespeichert; zum Schutz vor Missbrauch wird nur kurzzeitig ein nicht rückrechenbarer Schlüssel daraus gebildet. Bitte gib im Chat keine persönlichen Daten ein. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: mein berechtigtes Interesse, Fragen schnell zu beantworten und die Website zu verbessern. Du kannst jederzeit verlangen, dass ich dein Gespräch lösche.

**Kommentare und „Gefällt mir" im Blog (neu):**
Wenn du einen Kommentar schreibst, werden der angegebene Name, dein Text und der Zeitpunkt gespeichert und sofort unter dem Artikel veröffentlicht. Zum Schutz vor Missbrauch wird kurzzeitig ein nicht rückrechenbarer Schlüssel aus deiner IP-Adresse gebildet. „Gefällt mir" wird anonym gezählt; dein Browser merkt sich lokal, welche Artikel du markiert hast. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Auf Wunsch lösche ich deinen Kommentar.

**Schutz vor automatisiertem Missbrauch (angepasst):**
Beim Absenden des Kontakt- oder Buchungsformulars nutze ich Cloudflare Turnstile … (Rest wie heute).

**Cookies und Speicher im Browser (ersetzt die heutige Fassung):**
Die öffentliche Website setzt nur technisch notwendige Einstellungen, etwa für Sprache und Farbschema. Zusätzlich speichert dein Browser lokal, für diesen Tab, die Kennung deines Gesprächs mit dem Assistenten und, dauerhaft, welche Artikel du mit „Gefällt mir" markiert hast. Nichts davon dient Werbung oder seitenübergreifendem Tracking. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG sowie Art. 6 Abs. 1 lit. f DSGVO.

„Was nicht passiert", „Deine Rechte", „Aufsichtsbehörde" und „Änderungen" bleiben wie heute.

---

## English

**Where data is stored (new):** Enquiries, bookings, comments and conversations with the website assistant are stored in a database run by Neon (data centre in Frankfurt, EU). Files you send me are stored encrypted in Cloudflare R2. Both providers process the data only on my behalf.

**Contact form and email (replaces today's):** When you use the contact form, your name, email address, optionally company and phone number, your message and optionally one file (PDF, image, video or Word/Excel/PowerPoint, up to 10 MB) are processed. Your message arrives in my own mailbox system, where only I read and answer it; I send emails through Resend. Legal basis: Art. 6(1)(b) GDPR for steps before a contract, otherwise Art. 6(1)(f) GDPR. I delete your enquiry when it is no longer needed and no legal retention duty applies, or earlier if you ask.

**Booking and video calls (new):** When you book, I store your name, email address, your phone number for a phone call, optionally company, topic, budget range and note, the chosen time, the way of meeting and your time zone. You receive a confirmation and a reminder by email (via Resend) with a private link to change or cancel. Video calls run on this website through Cloudflare Realtime; they are not recorded and the in-call chat is not stored. Legal basis: Art. 6(1)(b) GDPR.

**Website assistant (new):** The assistant answers automatically and only from what is published on this website; no external AI service is used. Your questions and its answers are saved, and I read them to improve the website. Your IP address is not stored; to prevent abuse, a one-way key derived from it is kept briefly. Please do not enter personal information in the chat. Legal basis: Art. 6(1)(f) GDPR, my legitimate interest in answering questions quickly and improving the website. You can ask me to delete your conversation at any time.

**Blog comments and likes (new):** When you comment, the name you give, your text and the time are stored and published under the article at once. To prevent abuse, a one-way key derived from your IP address is kept briefly. Likes are counted anonymously; your browser remembers locally which articles you liked. Legal basis: Art. 6(1)(f) GDPR. I delete your comment on request.

**Cookies and browser storage (replaces today's):** The public website stores only technically necessary settings such as language and colour scheme. Your browser also keeps, for this tab, the handle of your conversation with the assistant, and permanently which articles you liked. None of this is used for advertising or cross-site tracking. Legal basis: § 25(2) no. 2 TDDDG and Art. 6(1)(f) GDPR.

---

## العربية

**مكان حفظ البيانات (جديد):** أحفظ الطلبات والحجوزات والتعليقات والمحادثات مع مساعد الموقع في قاعدة بيانات لدى شركة Neon (مركز بيانات في فرانكفورت، داخل الاتحاد الأوروبي). والملفات التي ترسلها لي تُحفظ مشفّرة في خدمة Cloudflare R2. تعالج الشركتان البيانات نيابةً عني فقط.

**نموذج التواصل والبريد (يحلّ محل النص الحالي):** عند استخدام نموذج التواصل تُعالَج بيانات الاسم والبريد الإلكتروني، واختيارياً الشركة ورقم الهاتف، ونص رسالتك، واختيارياً ملف واحد (PDF أو صورة أو فيديو أو Word/Excel/PowerPoint حتى 10 ميغابايت). تصل رسالتك إلى نظام البريد الخاص بي، حيث أقرؤها وأرد عليها بنفسي، وأرسل الرسائل عبر خدمة Resend. الأساس القانوني: المادة 6 (1) (ب) من اللائحة العامة لحماية البيانات للتمهيد لعقد، وإلا المادة 6 (1) (و). أحذف طلبك عندما لا يعود ضرورياً ولا يوجد التزام قانوني بحفظه، أو قبل ذلك إن طلبت.

**حجز المواعيد ومكالمات الفيديو (جديد):** عند الحجز أحفظ الاسم والبريد الإلكتروني، ورقم الهاتف في حال المكالمة الهاتفية، واختيارياً الشركة والموضوع ونطاق الميزانية والملاحظة، إضافة إلى الوقت المختار وطريقة اللقاء ومنطقتك الزمنية. يصلك تأكيد وتذكير بالبريد (عبر Resend) مع رابط خاص لتغيير الموعد أو إلغائه. تجري مكالمات الفيديو على هذا الموقع مباشرة عبر Cloudflare Realtime، ولا تُسجَّل، ولا تُحفظ الدردشة أثناء المكالمة. الأساس القانوني: المادة 6 (1) (ب).

**مساعد الموقع (جديد):** يجيب المساعد تلقائياً وفقط مما هو منشور على هذا الموقع، دون استخدام أي خدمة ذكاء اصطناعي خارجية. تُحفظ أسئلتك والأجوبة، وأقرؤها لتحسين الموقع. لا يُحفظ عنوان IP الخاص بك، وللحماية من الإساءة يُحتفظ لفترة قصيرة بمفتاح لا يمكن إرجاعه إلى العنوان. يُرجى عدم كتابة معلومات شخصية في المحادثة. الأساس القانوني: المادة 6 (1) (و)، أي مصلحتي المشروعة في الإجابة السريعة وتحسين الموقع. يمكنك أن تطلب حذف محادثتك في أي وقت.

**التعليقات والإعجابات في المدونة (جديد):** عند كتابة تعليق يُحفظ الاسم الذي تكتبه ونص التعليق ووقته، ويُنشر تحت المقال فوراً. وللحماية من الإساءة يُحتفظ لفترة قصيرة بمفتاح لا يمكن إرجاعه إلى عنوان IP. تُعدّ الإعجابات دون معرفة هويتك، ويتذكر متصفحك محلياً المقالات التي أعجبتك. الأساس القانوني: المادة 6 (1) (و). أحذف تعليقك إن طلبت.

**ملفات تعريف الارتباط والتخزين في المتصفح (يحلّ محل النص الحالي):** يحفظ الموقع العام الإعدادات الضرورية تقنياً فقط، مثل اللغة ونمط الألوان. ويحفظ متصفحك أيضاً، لهذا التبويب فقط، رمز محادثتك مع المساعد، وبشكل دائم المقالات التي أعجبتك. لا يُستخدم شيء من ذلك للإعلانات أو للتتبع بين المواقع. الأساس القانوني: الفقرة 25 (2) رقم 2 من قانون TDDDG والمادة 6 (1) (و).
