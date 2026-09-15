import type { SiteContent } from './types'

export const de: SiteContent = {
  shell: {
    nav: [
      { label: 'Leistungen', to: '/$lang/services' },
      { label: 'Arbeiten', to: '/$lang/work' },
      { label: 'Blog', to: '/$lang/blog' },
      { label: 'Über mich', to: '/$lang/about' },
      { label: 'Kontakt', to: '/$lang/contact' },
    ],
    cta: 'Termin buchen',
    menu: { open: 'Menü öffnen', close: 'Menü schließen', navigation: 'Hauptnavigation' },
    language: { label: 'Sprache', names: { de: 'Deutsch', en: 'English', ar: 'العربية' } },
    theme: { light: 'Helles Design', dark: 'Dunkles Design', system: 'Systemdesign', label: 'Design' },
    footer: {
      tagline: 'Websites, Online-Shops und individuelle Software für kleine Unternehmen.',
      location: 'Erfurt, Deutschland',
      email: 'E-Mail',
      links: 'Seiten',
      builtWith: 'Diese Website und die Verwaltung dahinter sind selbst gebaut.',
      more: [
        { label: 'FAQ', to: '/$lang/faq' },
        { label: 'Stack', to: '/$lang/stack' },
      ],
      legal: [
        { label: 'Impressum', to: '/$lang/impressum' },
        { label: 'Datenschutz', to: '/$lang/datenschutz' },
      ],
    },
  },

  home: {
    meta: {
      title: 'Yaman Warda · Web- und Softwareentwickler aus Erfurt',
      description:
        'Yaman Warda plant und entwickelt Websites, Online-Shops und individuelle Software — aus Erfurt und remote, auf Deutsch, Englisch oder Arabisch.',
    },
    hero: {
      eyebrow: 'Selbstständiger Web- und Softwareentwickler aus Erfurt',
      greeting: 'Hi, ich bin Yaman Warda.',
      prefix: 'Websites · Online-Shops · Software',
      typed: ['WEB-', 'SHOP-', 'SOFTWARE-'],
      staticLine: 'ENTWICKLER',
      headline: 'Dein direkter Partner für digitale Projekte.',
      sub: 'Ich höre zu, plane klar und baue etwas, das du wirklich nutzen kannst.',
      cta: 'Termin buchen',
      secondary: 'Nachricht schreiben',
      availability: 'In Erfurt zu Hause · remote für dich',
    },
    story: {
  "eyebrow": "Verstehen",
  "title": "Aus einer Idee wird etwas, das funktioniert.",
  "sub": "So entsteht aus einem Gedanken ein digitales Werkzeug für deinen Alltag.",
  "steps": [
    {
      "label": "Verstehen",
      "title": "Was soll einfacher werden?",
      "body": "Wir schauen auf deinen Ablauf: Wer stellt die Anfrage, welche Informationen fehlen, und was passiert danach?"
    },
    {
      "label": "Ordnen",
      "title": "Die Idee bekommt eine Form.",
      "body": "Aus den Anforderungen werden klare Wege und erste Ansichten. Du siehst früh, wie dein Produkt funktionieren wird."
    },
    {
      "label": "Umsetzen",
      "title": "Jetzt greift alles ineinander.",
      "body": "Oberfläche, Logik und Daten werden ein System. Gemeinsam prüfen wir die Abläufe, bevor es live geht."
    }
  ],
  "demo": {
    "caption": "Illustration des Ablaufs · kein Kundenprojekt",
    "project": "Anfragen & Termine",
    "notes": [
      "Anfragen an einem Ort",
      "Termine übersichtlich planen",
      "Den nächsten Schritt kennen"
    ],
    "navigation": [
      "Übersicht",
      "Anfragen",
      "Termine"
    ],
    "request": "Neue Anfrage",
    "appointment": "Termin auswählen",
    "confirmed": "Termin bestätigt",
    "action": "Anfrage ansehen"
  }
},
    services: {
      eyebrow: 'Leistungen',
      title: 'Was ich für dich bauen kann.',
      sub: 'Einen klaren Ort für dein Geschäft, einen Online-Shop für den Start oder ein System, das zu deinem Ablauf passt.',
      cards: {
        websites:
          'Ein klarer Ort im Internet, an dem Menschen verstehen, was du machst und wie sie dich erreichen.',
        shopify: 'Ein Online-Shop, der bereit ist zu starten — und den du danach selbst führen kannst.',
        software:
          'Eine digitale Lösung, die zu deinem Ablauf passt, statt dich in einen fremden Prozess zu zwingen.',
      },
      more: 'Details ansehen',
    },
    work: {
      eyebrow: 'Arbeiten',
      title: 'Was ich gebaut habe.',
      sub: 'Das sind eigene Projekte, keine Kundenarbeiten. Ich zeige sie, damit du sehen kannst, wie ich eine Idee in ein vollständiges, funktionierendes Produkt verwandle.',
      all: 'Alle Projekte',
    },
    process: {
      eyebrow: 'Zusammenarbeit',
      title: 'So wird aus deiner Idee ein funktionierendes Projekt.',
      sub: 'Du kennst dein Geschäft und dein Ziel. Ich übernehme Planung und technische Umsetzung — mit klaren Punkten, an denen du den Weg mitbestimmst.',
      steps: [
        {
          title: 'Erzähl mir, was du erreichen willst.',
          body: 'Eine unfertige Idee reicht. Wir sprechen über dein Ziel, was heute nicht gut läuft und was besser werden soll.',
        },
        {
          title: 'Wir klären den richtigen Umfang.',
          body: 'Ich sortiere, was die erste Version wirklich braucht. Für einen klaren Umfang bekommst du ein schriftliches Angebot; bei komplexen Abläufen klären wir zunächst den sinnvollsten Einstieg.',
        },
        {
          title: 'Ich baue — du siehst die wichtigen Schritte.',
          body: 'Ich führe die technische Umsetzung. Du siehst die Richtung früh und gibst an den vereinbarten Punkten Feedback.',
        },
        {
          title: 'Du startest — und weißt, wen du fragen kannst.',
          body: 'Nach der Übergabe bleibt klar, wer dein Ansprechpartner ist. Fehler im vereinbarten Umfang behebe ich innerhalb der vereinbarten Frist; für die nächsten Schritte können wir weiterarbeiten.',
        },
      ],
    },
    fit: {
      eyebrow: 'Passung',
      title: 'Für wen das passt',
      forTitle: 'Gut passt es, wenn du',
      forItems: [
        'ein neues Unternehmen führen und einen seriösen Auftritt brauchen.',
        'einen lokalen Betrieb haben, dessen Kunden über Google und Empfehlungen kommen, und einen klaren Ort für alle Informationen wollen.',
        'eine Website haben, die dein heutiges Niveau nicht mehr zeigt.',
        'online verkaufen wollen und einen Shop brauchen, den du danach selbst führen kannst.',
        'einen Ablauf, der heute in E-Mails und Tabellen lebt, in ein System bringen wollen.',
      ],
      notForTitle: 'Weniger gut passt es, wenn du',
      notForItems: [
        'garantierte Google-Platzierungen oder Umsatzversprechen suchen. Die gebe ich nicht.',
        'eine Marketing-Agentur brauchen. Ich baue, ich vermarkte nicht.',
        'nur den günstigsten Anbieter suchen.',
      ],
      honesty:
        'Wenn deine bestehende Website schnell ist, auf dem Handy funktioniert und ihren Zweck erfüllt, sage ich dir das. Dann brauchst du mich gerade nicht.',
    },
    about: {
      eyebrow: 'Über mich',
      title: 'Ein Entwickler, ein Ansprechpartner.',
      body: 'Ich bin Yaman Warda, selbstständiger Web- und Softwareentwickler aus Erfurt. Ich plane und entwickle Websites, Online-Shops und individuelle Web-Anwendungen.',
      link: 'Mehr über mich',
    },
    cta: {
      title: 'Erzähl mir von deiner Idee.',
      body: 'Du brauchst keinen fertigen Plan. Schreib mir, was du aufbauen oder einfacher machen willst — dann finden wir heraus, was der richtige nächste Schritt ist.',
      button: 'Gespräch anfragen',
      alt: 'Oder schreib mir direkt',
    },
  },

  services: {
    meta: {
      title: 'Leistungen · Websites, Online-Shops, individuelle Software',
      description:
        'Websites ab 990 €, Online-Shops ab 2.490 € und individuelle Software ab 2.990 €. Gemeinsam klären wir, was für dein Vorhaben der richtige erste Schritt ist.',
    },
    eyebrow: 'Leistungen',
    title: 'Die richtige digitale Lösung für dein Vorhaben.',
    intro:
      'Du musst nicht wissen, welche Technik du brauchst. Erzähl mir, was du zeigen, verkaufen oder einfacher machen willst — dann finden wir den passenden Weg.',
    from: 'ab',
    items: {
      websites: {
        name: 'Websites',
        short: 'Ein klarer, professioneller Ort, an dem Menschen verstehen, was du machst und wie sie dich erreichen.',
        promise:
          'Ich plane und entwickle eine Website, die dein Unternehmen verständlich zeigt und Besuchern den nächsten Schritt leicht macht — von der ersten Struktur bis zur Veröffentlichung.',
        audienceTitle: 'Passt, wenn du',
        audience: [
          'ein neues Unternehmen mit einem seriösen Auftritt starten willst.',
          'einen lokalen Betrieb führst und alle wichtigen Informationen an einem klaren Ort zeigen möchtest.',
          'eine bestehende Website hast, die dein heutiges Niveau nicht mehr zeigt.',
          'eine klare Anlaufstelle für Anfragen, Kontakt oder eine einfache Buchung brauchst.',
        ],
        includesTitle: 'Das kann dazugehören',
        includes: [
          'eine klare Seitenstruktur und die technische Umsetzung.',
          'eine Darstellung, die auf Handy und Desktop zuverlässig funktioniert.',
          'Kontakt, Anfragen oder eine einfache Buchungsmöglichkeit.',
          'Unterstützung beim Sortieren deiner Inhalte und bei der Veröffentlichung.',
        ],
        priceTitle: 'Startpreis',
        price: 'ab 990 €',
        priceNote:
          'Der Startpreis passt zu einem kleinen, klaren Website-Projekt. Seitenumfang, eigene Gestaltung, zusätzliche Sprachen und Funktionen ordnen wir gemeinsam ein, bevor du ein schriftliches Angebot bekommst.',
      },
      shopify: {
        name: 'Online-Shops',
        short: 'Ein Online-Shop, mit dem du starten kannst — und den du danach selbst führen kannst.',
        promise:
          'Ich baue einen klaren Online-Shop mit einer guten Grundlage für Produkte, Kaufablauf und Übergabe. Wenn Shopify zu deinem Vorhaben passt, ist es meist die richtige Basis.',
        audienceTitle: 'Passt, wenn du',
        audience: [
          'deine Produkte erstmals online verkaufen willst.',
          'einen bestehenden Shop klarer ordnen oder weiterentwickeln möchtest.',
          'einen Shop brauchst, den du nach der Übergabe selbst verwalten kannst.',
          'eine passende Lösung für Produkte, Varianten, Zahlung und Versand brauchst.',
        ],
        includesTitle: 'Das kann dazugehören',
        includes: [
          'die passende Shop-Grundlage und ein Auftritt, der zu deiner Marke passt.',
          'Produktstruktur, Navigation und die wichtigen Shop-Seiten.',
          'die technische Einrichtung von Zahlung und Versand nach deinen Vorgaben.',
          'eine gemeinsame Übergabe, damit du den Shop danach sicher führen kannst.',
        ],
        priceTitle: 'Startpreis',
        price: 'ab 2.490 €',
        priceNote:
          'Der Startpreis gilt für einen überschaubaren neuen Shop mit vorbereiteten Produktdaten. Umfang, Datenaufbereitung, Sprachen, Umzug und Integrationen prüfen wir vor dem Angebot. Shopify, Domain, Apps und Zahlungsgebühren bezahlst du direkt an die jeweiligen Anbieter.',
      },
      software: {
        name: 'Individuelle Software',
        short: 'Ein digitales Werkzeug, das zu deinem Ablauf passt — statt dich in einen fremden Prozess zu zwingen.',
        promise:
          'Ich plane und entwickle die kleinste sinnvolle Web-Anwendung für deinen Ablauf: zum Beispiel ein internes Werkzeug, ein Buchungssystem, ein Kundenbereich oder eine erste Produktversion.',
        audienceTitle: 'Passt, wenn du',
        audience: [
          'einen Ablauf hast, der heute in E-Mails, Tabellen oder Handarbeit stecken bleibt.',
          'Daten, Aufgaben oder Anfragen an einem zuverlässigen Ort bündeln willst.',
          'ein internes Werkzeug für dich oder dein Team brauchst.',
          'eine erste echte Version eines digitalen Produkts prüfen möchtest.',
        ],
        includesTitle: 'Das kann dazugehören',
        includes: [
          'eine Web-Anwendung mit genau den Funktionen, die die erste Version braucht.',
          'Oberfläche, Logik und Datenhaltung im vereinbarten Umfang.',
          'Rollen, einen Admin-Bereich, Benachrichtigungen oder eine Schnittstelle, wenn sie wirklich nötig sind.',
          'eine technische Grundlage, die sich später gezielt weiterentwickeln lässt.',
        ],
        priceTitle: 'Startpreis',
        price: 'ab 2.990 €',
        priceNote:
          'Der Startpreis steht für ein kleines, klar abgegrenztes Software-Projekt. Bei mehreren Rollen, Integrationen, Zahlungen oder einem komplexen Ablauf brauche ich zuerst Zeit, um den richtigen Einstieg zu klären. Danach erhältst du ein schriftliches Angebot für den vereinbarten Umfang.',
      },
    },
    shared: {
      title: 'Was für jedes Projekt gilt',
      items: [
        {
          title: 'Erst Klarheit, dann Umsetzung',
          body: 'Bevor es losgeht, halten wir schriftlich fest, was die erste Version leisten soll — und was nicht.',
        },
        {
          title: 'Ein Preis für den passenden Umfang',
          body: 'Die Preise auf dieser Seite sind Startpunkte. Den endgültigen Preis nenne ich dir, nachdem ich dein Vorhaben verstanden und den Umfang geprüft habe.',
        },
        {
          title: 'Deine Konten bleiben deine',
          body: 'Domain, Shop-, Hosting- und andere wichtige Zugänge laufen auf deinen Namen.',
        },
        {
          title: 'Nach dem Launch geht es klar weiter',
          body: 'Fehler im vereinbarten Umfang korrigiere ich innerhalb der vereinbarten Frist. Für Betrieb, Pflege oder die nächste Verbesserung können wir eine passende Vereinbarung treffen.',
        },
      ],
      faqLink: 'Fragen zu Ablauf, Preisen und Übergabe',
    },
    cta: {
      title: 'Noch nicht sicher, was du brauchst?',
      body: 'Das ist in Ordnung. Beschreib mir kurz, was du zeigen, verkaufen oder einfacher machen willst — ich helfe dir, den richtigen ersten Schritt einzuordnen.',
      button: 'Gespräch anfragen',
    },
  },

  about: {
    meta: {
      title: 'Über mich · Yaman Warda, Web- und Softwareentwickler aus Erfurt',
      description:
        'Yaman Warda ist selbstständiger Web- und Softwareentwickler aus Erfurt. Er plant und entwickelt Websites, Online-Shops und individuelle Web-Anwendungen.',
    },
    eyebrow: 'Über mich',
    title: 'Web- und Softwareentwickler. Dein technischer Partner.',
    intro:
      'Ich bin Yaman Warda, selbstständiger Web- und Softwareentwickler aus Erfurt. Ich plane und entwickle Websites, Online-Shops und individuelle Web-Anwendungen — und übernehme dabei die technische Seite deines Projekts.',
    story: {
      title: 'Wie ich auf Projekte schaue',
      chapters: [
        {
          title: 'Technik braucht einen Zweck',
          paragraphs: [
            'Mich interessiert nicht, eine Oberfläche nur schön aussehen zu lassen. Technik ist dann gut, wenn sie einem Unternehmen hilft, sich klar zu zeigen, Produkte zu verkaufen oder einen Ablauf einfacher und verlässlicher zu machen.',
          ],
        },
        {
          title: 'Das Ganze muss zusammenpassen',
          paragraphs: [
            'Bei einer Website geht es um einen klaren Auftritt und den nächsten Schritt. Bei einem Shop um Produkte, Kaufablauf und Übergabe. Bei Software um einen Ablauf, der auch morgen noch trägt. Deshalb denke ich nicht nur an einzelne Seiten, sondern an das System dahinter.',
          ],
        },
        {
          title: 'Klarheit gehört zur Arbeit',
          paragraphs: [
            'Bevor ich etwas baue, will ich verstehen, was wirklich gebraucht wird. Dann lässt sich die erste Version sinnvoll begrenzen, klar erklären und später gezielt weiterentwickeln.',
          ],
        },
      ],
    },
    method: {
      title: 'So arbeite ich',
      items: [
        {
          title: 'Erst verstehen, dann bauen',
          body: 'Ich schaue zuerst auf dein Ziel, deinen heutigen Ablauf und das, was nicht gut funktioniert. Erst dann entscheide ich mit dir, was die erste Version wirklich braucht.',
        },
        {
          title: 'Sinnvoll klein anfangen',
          body: 'Die erste Version soll den Kern zuverlässig tragen. Alles Weitere kommt dazu, wenn es einen echten Grund dafür gibt.',
        },
        {
          title: 'Die technische Seite übernehmen',
          body: 'Ich plane, baue und prüfe die technische Grundlage im vereinbarten Umfang. Du musst nicht jedes Werkzeug kennen, aber du sollst die wichtigen Entscheidungen verstehen können.',
        },
        {
          title: 'Ehrlich empfehlen',
          body: 'Wenn eine einfache Lösung ausreicht oder ein bestehendes Werkzeug besser passt, sage ich das offen. Nicht jedes Problem braucht individuelle Software.',
        },
      ],
    },
    expect: {
      title: 'Was die Zusammenarbeit mit mir bedeutet',
      intro:
        'Du arbeitest direkt mit dem Entwickler, der dein Projekt versteht und baut. Das hält Kommunikation, Verantwortung und Entscheidungen an einem Ort.',
      items: [
        {
          title: 'Du sprichst mit dem, der es baut',
          body: 'Ich bin dein Ansprechpartner von der ersten Einordnung bis zur Übergabe. Es gibt keine Übergabe von einem Vertriebsgespräch an ein unbekanntes Entwicklungsteam.',
        },
        {
          title: 'Ein klarer gemeinsamer Rahmen',
          body: 'Bevor die Umsetzung beginnt, halten wir fest, was gebaut wird, welche Entscheidungen noch offen sind und wie wir den Fortschritt gemeinsam prüfen.',
        },
        {
          title: 'Wichtige Schritte bleiben sichtbar',
          body: 'Du siehst die Richtung und die vereinbarten Zwischenstände, bevor etwas Großes endgültig wird. So bleiben Rückmeldungen sinnvoll und Entscheidungen nachvollziehbar.',
        },
        {
          title: 'Die Übergabe gehört zur Arbeit',
          body: 'Wichtige Zugänge liegen auf deinem Namen. Nach dem vereinbarten Abschluss sollst du wissen, was du übernehmen kannst und wann wir für den nächsten Schritt wieder zusammenarbeiten.',
        },
      ],
    },
    platform: {
      title: 'Diese Website ist ein eigenes Projekt',
      body: 'Sie ist kein Baukasten und kein gekauftes Template. Ich entwickle sie selbst als langfristige Plattform für meine Arbeit — vom öffentlichen Auftritt bis zu den Werkzeugen, die im Hintergrund nach und nach entstehen.',
      link: 'Zur technischen Seite',
    },
    portraitAlt: 'Yaman Warda',
    cta: {
      title: 'Lass uns über dein Vorhaben sprechen.',
      body: 'Du brauchst keinen fertigen Plan. Erzähl mir, was du aufbauen oder einfacher machen willst — dann finden wir den passenden ersten Schritt.',
      button: 'Gespräch anfragen',
      alt: 'Schreib mir eine E-Mail',
    },
  },

  work: {
    meta: {
      title: 'Arbeiten · Projekte von Yaman Warda',
      description:
        'Eigene Projekte, die zeigen, wie ich baue: ein Onlineshop mit Stripe, eine Blogging-Plattform und ein Immobilien-Verwaltungssystem im Bau.',
    },
    eyebrow: 'Arbeiten',
    title: 'Projekte, die zeigen, wie ich baue.',
    intro:
      'Ausgewählte eigene Projekte, an denen sichtbar wird, wie ich Produkte und Systeme von der Idee bis zur funktionierenden Anwendung baue.',
    status: { live: 'Live', building: 'Im Bau' },
    visit: 'Website öffnen',
    source: 'Quellcode',
    detailLabel: 'Projekt ansehen',
    previous: "Vorherige Projekte",
    next: "Weitere Projekte",
    loadMore: "Mehr Projekte laden",
    empty: "Neue Projekte folgen hier.",
    shown: "{visible} von {total} Projekten",
    back: 'Alle Projekte',
    detail: {
      problem: 'Ausgangslage',
      approach: 'Was ich gebaut habe',
      shows: 'Was das Projekt zeigt',
      features: 'Funktionen',
      stack: 'Technik',
    },
    items: {
      'tech-store': {
        name: 'Tech Store',
        kind: 'Onlineshop',
        summary:
          'Ein vollständiger Onlineshop mit Konto, Produktverwaltung, Warenkorb, Stripe-Bezahlung, Bestellungen, Bewertungen und Admin-Bereich.',
        problem:
          'Ein Shop ist der härteste Test für ein Web-System: Konten, Geld, Lagerbestand und Bestellstatus müssen zusammen stimmen, sonst verliert der Betreiber Geld oder Vertrauen.',
        approach:
          'Ich habe den gesamten Kaufweg gebaut: einen Katalog mit 500 Produkten in zehn Kategorien, eingegrenzt über Suche und Filter für Kategorie, Farbe, Speicher, Arbeitsspeicher und Bildschirmgröße, dann Warenkorb, Stripe-Checkout und die Bestellübersicht für Kunde und Betreiber. Dazu die Seiten, die ein deutscher Shop seinen Kunden schuldet — Widerruf, Rücksendung, Versand — denn ein Shop, aus dem man rechtlich nicht verkaufen darf, ist nicht fertig.',
        shows:
          'Dass ich einen Kauf vom gefilterten Katalog über die Zahlung bis zur Bestellung tragen kann, die beide Seiten verfolgen können — und dass ich weiß, wofür ein deutscher Shop jenseits des Kaufen-Buttons geradestehen muss.',
        features: [
          'Registrierung, Login und Kundenkonto',
          'Produktverwaltung mit Varianten',
          'Suche, Filter und Sortierung im Katalog',
          'Warenkorb und Stripe Checkout',
          'Bestellungen mit Status',
          'Widerruf-, Rücksende- und Versandseiten',
          'Bewertungen',
          'Admin-Dashboard',
        ],
      },
      inknest: {
        name: 'InkNest',
        kind: 'Blogging-Plattform',
        summary:
          'Eine Plattform zum Schreiben und Veröffentlichen mit Editor, Bild-Uploads, Kommentaren, Reaktionen und Benachrichtigungen.',
        problem:
          'Inhalte zu veröffentlichen klingt einfach, bis Editor, Bilder, Kommentare und Benachrichtigungen zusammenspielen müssen.',
        approach:
          'Ich habe einen Rich-Text-Editor mit Bild-Uploads, Kommentar-Threads, Reaktionen und Benachrichtigungen gebaut, alles hinter einem Konto-System. Die Entdecken-Seite durchsucht alles Veröffentlichte und grenzt es nach Kategorie, nach einem von 25 Schlagwörtern, nach Sortierung und nach Seitengröße ein, damit ein wachsendes Archiv auffindbar bleibt.',
        shows:
          'Dass ich die Hälfte eines Produkts bauen kann, die aus Inhalten statt aus Transaktionen besteht — schreiben, veröffentlichen, diskutieren und Dinge wiederfinden — also genau das, worauf Portale, Blogs und interne Wissensdatenbanken laufen.',
        features: [
          'Konto und Profile',
          'Rich-Text-Editor',
          'Bild-Uploads',
          'Suche, Schlagwörter und gefiltertes Entdecken',
          'Kommentare und Reaktionen',
          'Benachrichtigungen',
        ],
      },
      'prime-estate': {
        name: 'Prime Estate',
        kind: 'Verwaltungssystem für Immobilien',
        summary:
          'Ein System für Immobilienanbieter: Objekte, Anfragen, Buchungen und ein Blog in einer Verwaltung.',
        problem:
          'Immobilienanbieter arbeiten mit Objekten, Interessenten, Besichtigungsterminen und Inhalten, oft verteilt auf mehrere Werkzeuge.',
        approach:
          'Das System bringt Objektverwaltung, Anfragen-Management, Buchungen und ein Blog in eine Anwendung mit einer Verwaltung. Es ist im Bau und die Grundlage für die Architektur dieser Website.',
        shows:
          'Wie ich ein Geschäftssystem mit mehreren Bereichen strukturiere, damit es ein Betreiber allein bedienen kann.',
        features: [
          'Objektverwaltung',
          'Anfragen und Interessenten',
          'Buchungen',
          'Blog',
          'Admin-Verwaltung',
        ],
      },
    },
  },

  blog: {
    meta: {
      title: 'Blog · Yaman Warda',
      description:
        'Notizen zum Bauen von Websites, Online-Shops und individueller Software: was Suchmaschinen wirklich belohnen, wofür ein kleines Unternehmen Geld ausgeben sollte, und was ich beim Bau meiner eigenen Plattform gelernt habe.',
    },
    eyebrow: 'Blog',
    title: 'Was ich beim Bauen lerne.',
    intro:
      'Kurze Texte zu den Fragen, die Kunden mir immer wieder stellen — zu Suche, zu Kosten, dazu, was sich zu bauen lohnt und was nicht. Auf Deutsch, Englisch und Arabisch.',
    empty: 'Der erste Artikel ist unterwegs.',
    allTags: 'Alle Themen',
    readingTime: '{minutes} Min. Lesezeit',
    readArticle: 'Artikel lesen',
    loadMore: 'Mehr Artikel laden',
    back: 'Alle Artikel',
    aboutProject: 'Dieser Artikel handelt von {project}.',
    seeProject: 'Zum Projekt',
    shown: '{visible} von {total} Artikeln',
    feed: 'RSS-Feed',
    home: {
      eyebrow: 'Geschrieben',
      title: 'Was ich beim Bauen lerne.',
      sub: 'Kurze Texte zu Suche, Kosten und dem, was sich zu bauen lohnt.',
      all: 'Alle Artikel',
    },
  },

  contact: {
    meta: {
      title: 'Kontakt · Erzähl mir von deinem Projekt',
      description:
        'Beschreib kurz dein Vorhaben. Ein fertiger Plan ist nicht nötig, um ins Gespräch zu kommen.',
    },
    eyebrow: 'Kontakt',
    title: 'Erzähl mir von deinem Vorhaben.',
    intro:
      'Ein paar Angaben helfen mir beim Einordnen. Eine unfertige Idee reicht völlig aus, um den passenden nächsten Schritt zu klären.',
    form: {
      name: 'Name',
      email: 'E-Mail',
      company: 'Unternehmen',
      companyOptional: 'optional',
      phone: 'Telefon',
      phoneOptional: 'optional',
      projectType: 'Worum geht es? (optional)',
      projectTypes: [
        { value: 'unsure', label: 'Noch nicht sicher' },
        { value: 'website', label: 'Website' },
        { value: 'shop', label: 'Online-Shop' },
        { value: 'software', label: 'Individuelle Web-Anwendung oder Software' },
      ],
      budget: 'Budgetrahmen (optional)',
      budgets: [
        { value: 'unsure', label: 'Noch nicht sicher' },
        { value: 'lt1500', label: 'bis 1.500 €' },
        { value: '1500-3000', label: '1.500 bis 3.000 €' },
        { value: '3000-6000', label: '3.000 bis 6.000 €' },
        { value: 'gt6000', label: 'über 6.000 €' },
      ],
      timeline: 'Wann soll dein Projekt ungefähr bereit sein?',
      timelineHint: 'Eine grobe Einschätzung reicht.',
      timelines: [
        { value: 'unsure', label: 'Noch nicht sicher' },
        { value: 'weeks', label: 'In den nächsten Wochen' },
        { value: '1-3', label: 'In 1 bis 3 Monaten' },
        { value: 'later', label: 'Später — ich erkunde noch' },
      ],
      message: 'Dein Vorhaben',
      messageHint: 'Ein paar Sätze zu deinem Ziel reichen. Wenn du schon etwas hast, kannst du es gern erwähnen.',
      attachment: 'Anhang',
      attachmentHint: 'Optional: ein PDF oder Bild, das beim Einordnen hilft (bis 5 MB)',
      attachmentChoose: 'Datei wählen',
      attachmentEmpty: 'Keine Datei gewählt',
      attachmentRemove: 'Entfernen',
      submit: 'Anfrage senden',
      sending: 'Wird gesendet …',
      sent: {
        title: 'Danke, die Anfrage ist da.',
        body: 'Ich prüfe dein Anliegen und melde mich über den Weg, den du bevorzugst.',
      },
      error: 'Das hat nicht geklappt. Bitte versuch es noch einmal oder schreib mir direkt per E-Mail.',
      errors: {
        name: 'Bitte gib deinen Namen an.',
        email: 'Bitte gib eine gültige E-Mail-Adresse an.',
        message: 'Bitte beschreib kurz dein Vorhaben.',
        attachment: 'Bitte wähl eine PDF-, PNG- oder JPG-Datei bis 5 MB.',
      },
    },
    aside: {
      title: 'Lieber direkt?',
      body: 'Eine E-Mail reicht — auch wenn es nicht um ein Projekt geht, sondern um eine Zusammenarbeit oder eine andere Frage.',
      emailLabel: 'E-Mail',
      locationLabel: 'Standort',
      location: 'Erfurt, Deutschland · remote, mit Kunden in Deutschland und darüber hinaus',
      languagesLabel: 'Sprachen',
      languages: 'Deutsch, Englisch, Arabisch',
    },
  },

  faq: {
    meta: {
      title: 'FAQ · Fragen zu Ablauf, Preis und Übergabe',
      description:
        'Antworten zu Projektstart, Preisrahmen, Zusammenarbeit, Übergabe und der technischen Grundlage für Sichtbarkeit.',
    },
    eyebrow: 'FAQ',
    title: 'Häufige Fragen, klar beantwortet.',
    intro:
      'Hier findest du die wichtigsten Antworten zu einem Projekt. Wenn etwas für dein Vorhaben noch offen ist, klären wir es im Gespräch.',
    groups: [
      {
        title: 'Vor dem Start',
        items: [
          {
            question: 'Wie startet ein Projekt konkret?',
            answer:
              'Du beschreibst dein Ziel und was es heute schwierig macht. Ein fertiger Plan ist nicht nötig. Wir klären, ob und was sinnvoll passt; bei klarem Umfang erhältst du anschließend ein schriftliches Angebot.',
          },
          {
            question: 'Welche der drei Leistungen brauche ich?',
            answer:
              'Das entscheidet das Ziel, nicht die Größe. Menschen sollen dein Angebot verstehen: Website. Du willst Produkte verkaufen: Online-Shop. Ein Ablauf hängt an E-Mails, Dateien und Handarbeit: individuelle Software. Wenn du unsicher bist, beschreib einfach das Ziel.',
          },
          {
            question: 'Muss ich Texte, Bilder oder eine Domain schon haben?',
            answer:
              'Nein. Hilfreich ist, was du schon hast: etwa eine Domain, Texte, Fotos, Produktdaten oder eine bestehende Seite. Wenn noch etwas fehlt, halten wir fest, was für den vereinbarten Umfang gebraucht wird.',
          },
          {
            question: 'Arbeitest du auch mit Kunden außerhalb Deutschlands?',
            answer:
              'Ja. Ich arbeite von Erfurt aus remote auf Deutsch, Englisch oder Arabisch. Für Gespräche stimmen wir uns einfach auf eine passende Zeit ab.',
          },
        ],
      },
      {
        title: 'Umfang und Preis',
        items: [
          {
            question: 'Warum steht bei jedem Preis "ab"?',
            answer:
              'Der Startpreis ist der kleinste klare Umfang, der für diese Leistung sinnvoll ist. Das endgültige Angebot entsteht erst aus deinem tatsächlichen Umfang und hält fest, was gebaut wird, was nicht dazugehört und was es kostet.',
          },
          {
            question: 'Wem gehören Zugänge und gibt es weitere Kosten?',
            answer:
              'Wichtige Zugänge wie Domain, Hosting oder Shop-Konten werden, wenn sie für dein Projekt nötig sind, auf deinen Namen angelegt. Kosten von Drittanbietern — etwa Domain, Hosting, Apps oder Zahlungsanbieter — werden vorab transparent eingeordnet und gehen direkt an diese Anbieter.',
          },
        ],
      },
      {
        title: 'Während und nach dem Projekt',
        items: [
          {
            question: 'Wie läuft Umsetzung, Übergabe und die Zeit danach ab?',
            answer:
              'Der Zeitplan richtet sich nach dem vereinbarten Umfang. Wichtige Richtungen prüfst du früh, bevor alles darauf aufbaut. Wenn sich das Ziel später verändert, klären wir Aufwand und Preis zuerst. Zur Übergabe gehören die vereinbarten Zugänge und alles, was du brauchst, um das Ergebnis zu nutzen. Weiterentwicklung oder Betrieb können wir separat vereinbaren.',
          },
          {
            question: 'Machst du auch Marketing oder SEO?',
            answer:
              'Ich baue die technische Grundlage für Geschwindigkeit, klare Struktur, mobile Nutzung und gute Auffindbarkeit. Kampagnen, Rankings oder Umsatz verspreche ich nicht — Marketing bleibt eine eigene Aufgabe.',
          },
        ],
      },
    ],
  },

  stack: {
    meta: {
      title: 'Stack · Technologien, mit denen Yaman Warda arbeitet',
      description:
        'Ein kurzer Überblick über die Technologien, mit denen Yaman Warda Web-Anwendungen und ihre technische Grundlage baut.',
    },
    eyebrow: 'Stack',
    title: 'Technologien, mit denen ich arbeite.',
    intro:
      'Ein kurzer technischer Überblick. Die passende Technik richtet sich nach dem Projekt — nicht jedes Vorhaben braucht denselben Stack.',
    platform: {
      title: 'Meine technische Grundlage',
      body: 'Diese Plattform ist mein eigenes technisches Projekt. Die öffentliche Website und ihre Grundlage entwickle ich selbst; die Verwaltungswerkzeuge erweitere ich Schritt für Schritt innerhalb derselben Plattform.',
      layers: [
        { label: 'Frontend', value: 'TypeScript, React, TanStack Start' },
        { label: 'Backend und API', value: 'TypeScript, Elysia' },
        { label: 'Daten', value: 'PostgreSQL, pg, parametrisiertes SQL' },
        { label: 'Entwicklung und Betrieb', value: 'Docker' },
      ],
    },
    built: {
      title: 'In der Praxis ansehen',
      body: 'Die Projekte zeigen, wie ich diese Grundlage für unterschiedliche Produkte einsetze — vom Online-Shop über eine Publishing-Plattform bis zu einem Geschäftssystem im Bau.',
      link: 'Projekte ansehen',
    },
    links: {
      title: 'Mehr finden',
      email: 'Schreib mir eine E-Mail',
    },
  },

  legal: {
    impressum: {
      meta: {
        title: 'Impressum · Yaman Warda',
        description: 'Anbieterkennzeichnung nach § 5 DDG für yamanwarda.de.',
      },
      eyebrow: 'Impressum',
      title: 'Impressum',
      intro: 'Angaben gemäß § 5 DDG.',
      sections: [
        {
          title: 'Anbieter',
          lines: [
            'Mhd Yaman Warda',
            'Warschauer Str. 9',
            '99089 Erfurt',
            'Thüringen, Deutschland',
          ],
        },
        {
          title: 'Kontakt',
          lines: ['E-Mail: info@yamanwarda.de'],
        },
        {
          title: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
          lines: ['Mhd Yaman Warda', 'Warschauer Str. 9', '99089 Erfurt'],
        },
        {
          title: 'Verbraucherstreitbeilegung',
          body: 'Ich bin nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
        },
        {
          title: 'Haftung für Inhalte',
          body: 'Als Diensteanbieter bin ich für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Ich bin jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben davon unberührt. Eine diesbezügliche Haftung ist erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen entferne ich diese Inhalte umgehend.',
        },
        {
          title: 'Haftung für Links',
          body: 'Dieses Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen Einfluss habe. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren nicht erkennbar. Eine dauerhafte inhaltliche Kontrolle ohne konkrete Anhaltspunkte einer Rechtsverletzung ist nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen entferne ich solche Links umgehend.',
        },
        {
          title: 'Urheberrecht',
          body: 'Die von mir erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen meiner schriftlichen Zustimmung. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.',
        },
      ],
      updated: 'Stand: 10. September 2026',
    },
    privacy: {
      meta: {
        title: 'Datenschutzerklärung · Yaman Warda',
        description:
          'Welche Daten yamanwarda.de verarbeitet: Server-Logs, Formulare, Sicherheitsprüfungen und technisch notwendige Cookies. Kein Tracking, keine Werbung.',
      },
      eyebrow: 'Datenschutz',
      title: 'Datenschutzerklärung',
      intro:
        'Diese Website erhebt so wenig wie möglich. Es gibt keine Analyse-Tools, keine Werbenetzwerke und kein Tracking über Seiten hinweg. Was tatsächlich verarbeitet wird, steht hier vollständig. Diese Fassung ist ein technischer Entwurf und keine Rechtsberatung oder rechtliche Garantie.',
      sections: [
        {
          title: 'Verantwortlicher',
          lines: [
            'Mhd Yaman Warda',
            'Warschauer Str. 9',
            '99089 Erfurt, Deutschland',
            'E-Mail: info@yamanwarda.de',
          ],
        },
        {
          title: 'Server-Logs beim Hosting',
          body: 'Diese Website wird über Cloudflare Workers und das Netzwerk von Cloudflare ausgeliefert. Beim Aufruf einer Seite verarbeitet Cloudflare technisch notwendige Verbindungs- und Sicherheitsdaten, insbesondere IP-Adresse, Datum und Uhrzeit, aufgerufenen Pfad, übertragene Datenmenge und Browserinformationen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: mein berechtigtes Interesse an einer sicheren, schnellen und zuverlässigen Auslieferung. Für die Verarbeitung im Auftrag gelten die mit Cloudflare vereinbarten Datenschutzbedingungen.',
        },
        {
          title: 'Schutz vor automatisiertem Missbrauch (Cloudflare Turnstile)',
          body: 'Beim Anmelden in die Verwaltung sowie beim Absenden des Kontakt- oder Buchungsformulars nutze ich Cloudflare Turnstile. Der Dienst verarbeitet technische Signale wie IP-Adresse, Browser- und Geräteinformationen sowie das Ergebnis der Sicherheitsprüfung, um Menschen von automatisierten Angriffen zu unterscheiden. Das Prüfergebnis wird serverseitig kontrolliert; es wird nicht für Werbung eingesetzt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: mein berechtigtes Interesse, Konten, Formulare und gespeicherte Daten vor Missbrauch zu schützen.',
        },
        {
          title: 'Kontaktformular und E-Mail',
          body: 'Wenn du das Kontaktformular nutzt, werden Name, E-Mail-Adresse, optional Firma und Telefonnummer, deine Angaben zu Kanal, Projektart, Budget und Zeitrahmen, dein Projekttext sowie eine optionale Datei (PDF, PNG oder JPG, bis 5 MB) verarbeitet. Diese Angaben werden als E-Mail an mich zugestellt; für den Versand nutze ich den Dienst Resend. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Anbahnung eines Vertrags, sonst Art. 6 Abs. 1 lit. f DSGVO. Ich speichere deine Anfrage, solange sie für die Bearbeitung nötig ist, und lösche sie danach, sofern keine gesetzliche Aufbewahrungspflicht besteht.',
        },
        {
          title: 'Cookies',
          body: 'Die öffentliche Website setzt nur technisch notwendige Einstellungen, etwa für die gewählte Sprache. Im nicht öffentlichen Verwaltungsbereich werden zusätzlich notwendige Sitzungs-Cookies für die Anmeldung verwendet. Diese Cookies dienen weder Werbung noch seitenübergreifendem Tracking. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG sowie Art. 6 Abs. 1 lit. f DSGVO. Ein Einwilligungsbanner ist für diese notwendigen Funktionen nicht vorgesehen.',
        },
        {
          title: 'Was nicht passiert',
          body: 'Es gibt keine Webanalyse, keine Statistik-Software, keine Werbe- oder Retargeting-Pixel, keine eingebetteten Schriften von fremden Servern und keine Social-Media-Plugins. Es werden keine Profile gebildet und es findet keine automatisierte Entscheidungsfindung statt.',
        },
        {
          title: 'Deine Rechte',
          lines: [
            'Auskunft über die zu deiner Person gespeicherten Daten (Art. 15 DSGVO)',
            'Berichtigung unrichtiger Daten (Art. 16 DSGVO)',
            'Löschung (Art. 17 DSGVO)',
            'Einschränkung der Verarbeitung (Art. 18 DSGVO)',
            'Datenübertragbarkeit (Art. 20 DSGVO)',
            'Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)',
            'Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)',
          ],
        },
        {
          title: 'Zuständige Aufsichtsbehörde',
          body: 'Thüringer Landesbeauftragter für den Datenschutz und die Informationsfreiheit (TLfDI), Häßlerstraße 8, 99096 Erfurt. Du kannst dich auch an die Aufsichtsbehörde deines Wohnorts wenden.',
        },
        {
          title: 'Änderungen',
          body: 'Ändert sich, was diese Website verarbeitet, ändert sich auch diese Erklärung. Das Datum unten sagt dir, wann sie zuletzt angepasst wurde.',
        },
      ],
      updated: 'Stand: 13. September 2026',
    },
  },

  notFound: {
    title: 'Diese Seite gibt es nicht.',
    body: 'Der Link ist alt oder vertippt.',
    link: 'Zur Startseite',
  },
}
