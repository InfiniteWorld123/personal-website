import type { SiteContent } from './types'

export const de: SiteContent = {
  shell: {
    nav: [
      { label: 'Leistungen', to: '/$lang/services' },
      { label: 'Arbeiten', to: '/$lang/work' },
      { label: 'Über mich', to: '/$lang/about' },
      { label: 'Kontakt', to: '/$lang/contact' },
    ],
    cta: 'Gespräch anfragen',
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
    },
  },

  home: {
    meta: {
      title: 'Yaman Warda · Websites, Online-Shops und individuelle Software aus Erfurt',
      description:
        'Websites, Online-Shops und individuelle Software für kleine Unternehmen — direkt geplant und entwickelt von Yaman Warda in Erfurt.',
    },
    hero: {
      eyebrow: 'Selbstständiger Web- und Softwareentwickler aus Erfurt',
      greeting: 'Hi, ich bin Yaman Warda.',
      prefix: 'Websites · Online-Shops · Software',
      typed: ['WEB-', 'SHOP-', 'SOFTWARE-'],
      staticLine: 'ENTWICKLER',
      headline: "Deine Idee. Gemeinsam umgesetzt.",
      sub: "Ich bin dein direkter Ansprechpartner für individuelle Software und Websites. Vom ersten Gespräch bis zum fertigen Produkt — auf Deutsch, Englisch oder Arabisch.",
      cta: 'Gespräch anfragen',
      secondary: 'Projekte ansehen',
      availability: 'Verfügbar für neue Projekte',
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
      title: 'Was ich baue',
      sub: 'Drei Wege, je nachdem ob du sichtbar werden, online verkaufen oder einen eigenen Ablauf digitalisieren willst.',
      more: 'Details ansehen',
    },
    work: {
      eyebrow: 'Arbeiten',
      title: "Projekte aus meiner Werkstatt",
      sub: 'Eigene Projekte, die zeigen, wie ich baue. Fallstudien mit Kundenprojekten folgen, sobald sie live sind.',
      all: 'Alle Projekte',
    },
    process: {
      eyebrow: 'Ablauf',
      title: 'So läuft ein Projekt',
      sub: 'Vier Schritte, keine Überraschungen. Du weißt jederzeit, wo das Projekt steht und was es kostet.',
      steps: [
        {
          title: 'Gespräch',
          body: 'Wir klären, was du brauchst, was du schon hast und was das Projekt leisten soll. Kostenlos und ohne Verkaufsdruck.',
        },
        {
          title: 'Angebot mit festem Preis',
          body: 'Du bekommst ein schriftliches Angebot: was drin ist, was nicht und was es kostet. Keine offenen Enden.',
        },
        {
          title: 'Umsetzung mit Zwischenständen',
          body: 'Du siehst die Designrichtung, bevor das Ganze gebaut wird, und gibst in zwei Runden Feedback.',
        },
        {
          title: 'Launch und 30 Tage Fehlerbehebung',
          body: 'Nach dem Start bleibe ich dran: Fehler im vereinbarten Umfang behebe ich 30 Tage lang. Betrieb und Weiterentwicklung auf Wunsch.',
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
      body: 'Ich bin Yaman Warda. 2015 kam ich aus Syrien, 2021 habe ich mir das Programmieren beigebracht, und von Erfurt aus baue ich komplette Systeme: Oberfläche, Backend, Datenbank, Betrieb. Diese Website und die Verwaltung dahinter sind eines davon.',
      link: 'Mehr über mich',
    },
    cta: {
      title: 'Erzähl mir von deinem Vorhaben.',
      body: 'Schreib kurz, worum es geht. Du bekommst eine ehrliche Einschätzung, auch wenn sie lautet: Das brauchst du gerade nicht.',
      button: 'Gespräch anfragen',
      alt: 'Oder direkt per E-Mail',
    },
  },

  services: {
    meta: {
      title: 'Leistungen · Websites, Online-Shops, individuelle Software',
      description:
        'Websites ab 990 €, Online-Shops — meistens mit Shopify — ab 2.490 €, individuelle Software ab 2.990 €. Umfang, Passung und Preise im Detail.',
    },
    eyebrow: 'Leistungen',
    title: 'Drei Leistungen. Drei verschiedene Ergebnisse.',
    intro:
      'Ob Website, Shop oder Software entscheidet nicht die Größe, sondern das Ziel: dein Unternehmen zeigen, Produkte verkaufen oder einen Ablauf betreiben. Umfang und Komplexität bestimmen dann den Preis innerhalb der Leistung.',
    from: 'ab',
    items: {
      websites: {
        name: 'Websites',
        short: 'Eine schnelle, klare Website, die dein Unternehmen erklärt und Besucher zum Anruf, zur Anfrage oder zur Buchung führt.',
        promise:
          'Du bekommst eine professionelle, schnelle Website, die dein Unternehmen erklärt, Informationen klar zeigt und es Besuchern leicht macht, den nächsten Schritt zu gehen. Design, Veröffentlichung und Hosting nehme ich dir ab.',
        audienceTitle: 'Für wen',
        audience: [
          'Ein neues Unternehmen, das einen offiziellen Auftritt braucht.',
          'Ein lokaler Betrieb, der Kunden über Empfehlungen, Google oder Social Media bekommt und einen klaren Ort für alle Informationen braucht.',
          'Ein Unternehmen mit einer veralteten Website, die das heutige Niveau nicht mehr zeigt.',
          'Wer einen eigenen visuellen Auftritt will, der über Baukasten-Seiten hinausgeht.',
        ],
        includesTitle: 'Was drin ist',
        includes: [
          'Einseiten-Website bis hin zum individuell gestalteten Firmenauftritt.',
          'Struktur und Inhalt gemeinsam sortiert, damit Besucher schnell finden, was sie suchen.',
          'Handy, Ladezeit und Formulare sauber eingestellt.',
          'Domain, E-Mail und Veröffentlichung eingerichtet.',
          'Zwei Feedback-Runden und 30 Tage Fehlerbehebung nach dem Start.',
          'Auf Wunsch: Betrieb und Hosting als monatliche Betreuung.',
        ],
        priceTitle: 'Was es kostet',
        price: 'ab 990 €',
        priceNote:
          'Der Einstiegspreis gilt für eine Einseiten-Website auf Basis eines erprobten Designsystems. Mehr Seiten, eigenes Design, Sprachen und Funktionen erhöhen den Preis. Ein individuell gestalteter Auftritt beginnt bei 1.990 €. Auf Wunsch auch als monatliche Rate mit Übergang in dein Eigentum.',
        boundaryTitle: 'Was ich nicht verspreche',
        boundary:
          'Keine garantierte Anzahl an Kunden, keine garantierte Google-Platzierung. Ich garantiere den vereinbarten Umfang, die technische Qualität und einen klaren Ablauf.',
      },
      shopify: {
        name: 'Online-Shops',
        short: 'Ein Shop, der verkaufsbereit übergeben wird und den du danach selbst führen kannst.',
        promise:
          'Ich baue einen klaren, betriebsbereiten Online-Shop — meistens mit Shopify: Grundstruktur, Kauferlebnis und Übergabe, nicht nur ein installiertes Theme.',
        audienceTitle: 'Für wen',
        audience: [
          'Ein Unternehmen, das seinen ersten Shop mit klaren Produkten und Daten starten will.',
          'Eine kleine oder mittlere Marke, die einen Shop will, den sie nach der Übergabe selbst verwaltet.',
          'Ein bestehender Shop, der neu geordnet oder zu Shopify umgezogen werden soll.',
          'Ein Unternehmen, das eine angepasste Shopify-Oberfläche oder überschaubare Integrationen braucht.',
        ],
        includesTitle: 'Was drin ist',
        includes: [
          'Shopify-Einrichtung und ein passendes Theme, angepasst an deine Marke.',
          'Navigation, Kollektionen und die wichtigen Shop-Seiten.',
          'Zahlung, Versand und Steuern technisch eingerichtet nach deinen Vorgaben.',
          'Produktvorlagen und Varianten, mit bis zu zehn Produkten als Startbestand.',
          'Domain, notwendige Analytics und eine Testbestellung.',
          'Einweisung, Übergabe und 30 Tage Fehlerbehebung.',
        ],
        priceTitle: 'Was es kostet',
        price: 'ab 2.490 €',
        priceNote:
          'Der Einstiegspreis gilt für einen neuen, überschaubaren Shop mit fertigen Daten und einem Standard-Theme. Datenaufbereitung, Designtiefe, Sprachen, Umzug und Integrationen kommen als klar benannte Posten dazu. Shopify-Abo, Domain, Apps und Zahlungsgebühren zahlst du direkt an die Anbieter.',
        boundaryTitle: 'Was ich nicht verspreche',
        boundary:
          'Keine Umsatz- oder Conversion-Versprechen, keine Rechts- oder Steuerberatung. Rechtstexte kommen von dir oder einem Anbieter dafür.',
      },
      software: {
        name: 'Individuelle Software',
        short: 'Buchungssysteme, interne Tools, Kundenportale, Dashboards: die kleinste Version, die deinen Ablauf wirklich trägt.',
        promise:
          'Ich verstehe den Ablauf, den du verbessern willst, und baue die kleinste Web-Anwendung, die ihn klar abbildet: Oberfläche, Backend, Datenbank und Betrieb passend zum vereinbarten Umfang.',
        audienceTitle: 'Für wen',
        audience: [
          'Ein Unternehmen, dessen Abläufe heute in Dateien, E-Mails und Handarbeit stecken.',
          'Ein Betrieb, der Buchungen, ein Kundenportal oder ein internes Dashboard braucht.',
          'Gründer, die eine erste echte Version eines Abo- oder SaaS-Produkts testen wollen.',
          'Ein Unternehmen, für das keine Standard-Software passt oder das zwei Werkzeuge verbinden muss.',
        ],
        includesTitle: 'Was drin sein kann',
        includes: [
          'Login und Rechte, Admin-Dashboard, Zahlungen oder Abos.',
          'E-Mails und Benachrichtigungen, Uploads, Suche und Filter.',
          'Berichte, Exporte, Schnittstellen und Webhooks.',
          'Nur was die erste Version braucht. Nichts, weil es gut klingt.',
        ],
        priceTitle: 'Was es kostet',
        price: 'ab 2.990 €',
        priceNote:
          'Der Einstiegspreis ist das kleinste Projekt, das unter dieser Leistung sinnvoll ist: eng, klar, testbar. Systeme mit mehreren Rollen, Zahlungen und Integrationen liegen deutlich darüber. Der endgültige Preis folgt nach einer ersten Prüfung des Umfangs. Übliche Zahlung: 40 / 30 / 30 Prozent an Start, Zwischenstand und Abnahme.',
        boundaryTitle: 'Was ich nicht verspreche',
        boundary:
          'Keine Zusage, dass das System Umsatz bringt oder einen bestimmten Betrag spart. Ich garantiere einen klaren Umfang und die vereinbarte technische Qualität. Fremde Systeme, die ich nicht sicher prüfen und testen kann, ändere ich nicht.',
      },
    },
    shared: {
      title: 'Was für alle drei gilt',
      items: [
        {
          title: 'Fester Umfang vor dem Start',
          body: 'Es geht nicht los, bevor schriftlich steht, was geliefert wird und was nicht. Änderungen am Ziel werden geschätzt, bevor sie gebaut werden.',
        },
        {
          title: 'Fehler sind keine neuen Funktionen',
          body: 'Wenn etwas nicht wie vereinbart funktioniert, ist das ein Fehler und wird 30 Tage nach dem Start behoben. Neue Seiten, Rollen oder Integrationen sind neue Arbeit.',
        },
        {
          title: 'Deine Daten, deine Konten',
          body: 'Domain, Shopify und Hosting-Konten laufen auf deinen Namen. Nach vollständiger Zahlung bekommst du den vereinbarten Stand und die Nutzungsrechte.',
        },
        {
          title: 'Preise sind Einstiege',
          body: '„ab" heißt: ein kleiner, klar umrissener Umfang. Ob netto oder brutto steht im Angebot, je nach steuerlicher Situation zum Zeitpunkt des Angebots.',
        },
      ],
      faqLink: 'Mehr Fragen zu Ablauf, Preisen und Eigentum',
    },
    cta: {
      title: 'Nicht sicher, welche Leistung passt?',
      body: 'Das ist normal. Beschreib, was du erreichen willst, und ich sage dir, was du brauchst. Oder dass du es nicht brauchst.',
      button: 'Gespräch anfragen',
    },
  },

  about: {
    meta: {
      title: 'Über mich · Yaman Warda, Entwickler in Erfurt',
      description:
        'Syrer, seit 2015 in Deutschland, seit 2021 Autodidakt. Warum ich angefangen habe, wie ich nach Erfurt kam, warum ich ganze Systeme baue und was du von einer Person erwarten kannst.',
    },
    eyebrow: 'Über mich',
    title: 'Ich baue Dinge, die danach jemand täglich benutzt.',
    intro:
      'Ich bin Yaman Warda. 2015 bin ich aus Syrien nach Deutschland gekommen, 2021 habe ich mir das Programmieren selbst beigebracht, und heute baue ich von Erfurt aus Websites, Shops und Business-Systeme — remote, auf Deutsch, Englisch oder Arabisch.',
    story: {
      title: 'Wie ich hierher gekommen bin',
      chapters: [
        {
          title: 'Warum ich angefangen habe',
          paragraphs: [
            'Nicht, weil ich als Kind Computer geliebt hätte. Ich habe 2021 angefangen, weil Programmieren die breiteste Tür war, die ich sehen konnte: eine Fähigkeit, die bezahlt wird, die mitreist, mit der ich für mich selbst oder für andere arbeiten kann und die mir niemand wieder wegnimmt.',
            'Es gab einen kleineren Grund, und der ist weniger seriös. Es fühlte sich gut an, schnell auf der Tastatur zu sein — schnell zu tippen und zu sehen, wie etwas entsteht. Ich tue nicht so, als wäre das nicht dabei gewesen.',
            'Beide Gründe haben gereicht.',
          ],
        },
        {
          title: 'Wie ich in Erfurt gelandet bin',
          paragraphs: [
            'Ich bin Syrer. Seit 2015 bin ich in Deutschland.',
            'Erfurt habe ich mir nicht ausgesucht. Mein Vater hat hier einen Platz bekommen, und dorthin ist die Familie gegangen. Das ist keine Geschichte darüber, die richtige Stadt zu finden. Es ist die gewöhnliche Version, in der man irgendwo ankommt und den Ort dann zu seinem macht.',
            'Also habe ich Deutsch gelernt, und ein paar Jahre später das Programmieren auf Englisch, also in einer dritten Sprache. Wahrscheinlich ist das der Grund, warum mir Klarheit so wichtig ist. Ich habe lange auf der anderen Seite von Sätzen gestanden, denen ich nicht folgen konnte.',
          ],
        },
        {
          title: 'Warum ganze Systeme und nicht Bildschirme',
          paragraphs: [
            'Das Erste, was ich je ins Internet gestellt habe, war ein Onlineshop. Kein Tutorial-Ergebnis, sondern ein echter, mit Katalog, Warenkorb und Kasse, veröffentlicht dort, wo Freunde und Familie ihn öffnen und mir sagen konnten, was kaputt ist. Das haben sie getan.',
            'Ich habe mehr Projekte gelöscht als behalten. Die, die geblieben sind, haben mir jedes Mal dasselbe beigebracht: der interessante Teil ist nie der Bildschirm. Es ist das, was dahinter liegt — die Anmeldung, das Datenmodell, die Zahlung, die Bestellung, die morgen immer noch stimmen muss.',
            'Deshalb baue ich auch auf TanStack Start statt auf Next.js. Es ist kein magisches Framework. Ich sehe, was es tut, der Router ist das beste Stück daran, und das Ökosystem ist durchgehend TypeScript. Ich verstehe meine Werkzeuge lieber, als dass ich von ihnen beeindruckt bin.',
          ],
        },
      ],
    },
    method: {
      title: 'Wie ich arbeite',
      items: [
        {
          title: 'Erst verstehen, dann bauen',
          body: 'Ich will wissen, wie dein Ablauf heute funktioniert und wo er aufhört zu funktionieren, bevor ich irgendetwas vorschlage. Das meiste, was ich im ersten Gespräch höre, ist das Symptom. Die Ursache taucht meistens im zweiten auf.',
        },
        {
          title: 'Klein anfangen',
          body: 'Die erste Version trägt den Kern. Alles andere wartet, bis es wirklich gebraucht wird.',
        },
        {
          title: 'Werkzeuge, die ich verstehe',
          body: 'Ich baue mit Dingen, die ich um Mitternacht debuggen und dir am nächsten Morgen erklären kann. Das schließt eine Menge cleverer Entscheidungen aus, mit Absicht.',
        },
        {
          title: 'Ehrlich, auch wenn es mich den Auftrag kostet',
          body: 'Wenn deine Website schon in Ordnung ist oder ein Werkzeug für dreißig Euro im Monat reicht, sage ich das, bevor du mir irgendetwas bezahlst.',
        },
      ],
    },
    expect: {
      title: 'Was du von mir erwarten kannst',
      intro:
        'Mit einer Person zu arbeiten ist nicht dasselbe wie mit einer Agentur. Hier ist die ehrliche Fassung des Unterschieds.',
      items: [
        {
          title: 'Du sprichst mit dem, der es baut',
          body: 'Kein Account Manager, keine Übergabe von einem Vertriebler an einen Entwickler, den du nie triffst. Wer deine E-Mail beantwortet, schreibt auch den Code.',
        },
        {
          title: 'Eine Antwort innerhalb eines Werktags',
          body: 'Nicht immer die vollständige. Manchmal ist es "das muss ich mir richtig ansehen, ich melde mich morgen." Aber du sitzt nicht da und fragst dich, ob die Nachricht angekommen ist.',
        },
        {
          title: 'Du siehst es, bevor es fertig ist',
          body: 'Die gestalterische Richtung kommt an einem Zwischenstand, solange eine Änderung noch billig ist, und danach zwei Feedbackrunden. Nichts Großes wird auf einer Richtung gebaut, die du nicht gesehen hast.',
        },
        {
          title: 'Die Übergabe gehört zur Arbeit',
          body: 'Zugänge auf deinen Namen, 30 Tage Fehlerbehebung nach dem Launch, und bei Shops eine Einweisung, damit du ihn selbst führen kannst. Ich versuche nicht, dich von mir abhängig zu machen.',
        },
      ],
    },
    platform: {
      title: 'Diese Website ist das Beispiel',
      body: 'Du liest sie gerade. Die öffentlichen Seiten in drei Sprachen, die API, die PostgreSQL-Datenbank und die Verwaltung dahinter für Anfragen, Inhalte, Kunden und Rechnungen sind eine Anwendung, die ich geschrieben habe und betreibe. Kein Baukasten, kein fremdes CMS, kein gekauftes Template.',
      link: 'Die technische Fassung',
    },
    portraitAlt: 'Yaman Warda',
    cta: {
      title: 'Lass uns über dein Vorhaben sprechen.',
      body: 'Erzähl mir, woran du arbeitest. Du bekommst eine ehrliche Einschätzung zurück — auch dann, wenn die Antwort ist, dass du etwas anderes brauchst.',
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
      'Das sind eigene Projekte, keine Kundenarbeiten. Ich zeige sie, weil man daran sehen kann, wie vollständig ich baue. Fallstudien mit Kunden folgen, sobald sie live sind.',
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

  contact: {
    meta: {
      title: 'Kontakt · Gespräch anfragen',
      description:
        'Beschreib kurz dein Vorhaben. Du bekommst eine ehrliche Einschätzung, ob und wie ich helfen kann.',
    },
    eyebrow: 'Kontakt',
    title: 'Erzähl mir von deinem Vorhaben.',
    intro:
      'Ein paar Fragen vorab, damit unser Gespräch nicht bei null anfängt. Ich melde mich mit einer ehrlichen Einschätzung.',
    form: {
      name: 'Name',
      email: 'E-Mail',
      company: 'Unternehmen',
      companyOptional: 'optional',
      phone: 'Telefon',
      phoneOptional: 'optional',
      preferred: 'Wie erreiche ich dich am liebsten?',
      preferredOptions: [
        { value: 'email', label: 'E-Mail' },
        { value: 'call', label: 'Anruf' },
        { value: 'whatsapp', label: 'WhatsApp' },
      ],
      projectType: 'Worum geht es?',
      projectTypes: [
        { value: 'website', label: 'Website' },
        { value: 'shopify', label: 'Onlineshop' },
        { value: 'software', label: 'Individuelle Software' },
        { value: 'unsure', label: 'Noch unklar' },
      ],
      budget: 'Budgetrahmen',
      budgets: [
        { value: 'lt1500', label: 'bis 1.500 €' },
        { value: '1500-3000', label: '1.500 bis 3.000 €' },
        { value: '3000-6000', label: '3.000 bis 6.000 €' },
        { value: 'gt6000', label: 'über 6.000 €' },
        { value: 'open', label: 'Noch offen' },
      ],
      timeline: 'Zeitrahmen',
      timelines: [
        { value: 'asap', label: 'So bald wie möglich' },
        { value: '1-3', label: 'In den nächsten 1 bis 3 Monaten' },
        { value: 'later', label: 'Später, ich orientiere mich' },
      ],
      message: 'Dein Vorhaben',
      messageHint: 'Was soll entstehen? Was hast du schon: Domain, Texte, einen alten Auftritt?',
      attachment: 'Anhang',
      attachmentHint: 'PDF, PNG oder JPG, bis 5 MB',
      attachmentChoose: 'Datei wählen',
      attachmentEmpty: 'Keine Datei gewählt',
      attachmentRemove: 'Entfernen',
      submit: 'Anfrage senden',
      sending: 'Wird gesendet …',
      sent: {
        title: 'Danke, die Anfrage ist da.',
        body: 'Ich melde mich per E-Mail. Falls es eilt, schreib mir direkt.',
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
      body: 'Eine E-Mail reicht. Schreib ein paar Zeilen zu dem, was du vorhast.',
      emailLabel: 'E-Mail',
      locationLabel: 'Standort',
      location: 'Erfurt, Deutschland · remote, mit Kunden in Deutschland und darüber hinaus',
      languagesLabel: 'Sprachen',
      languages: 'Deutsch, Englisch, Arabisch',
    },
  },

  faq: {
    meta: {
      title: 'FAQ · Wie ein Projekt mit mir abläuft',
      description:
        'Umfang, Preise, Eigentum, Feedbackrunden und was nach dem Launch passiert — die Fragen, die vor jedem Projekt kommen, offen beantwortet.',
    },
    eyebrow: 'FAQ',
    title: 'Die Fragen, die vor einem Ja kommen.',
    intro:
      'Jemanden zu beauftragen, den du nie getroffen hast, ist ein Sprung. Das hier sind die Fragen, die mir gestellt werden, und ein paar, die selten gestellt werden, aber wichtig sind. Fehlt deine, schreib mir, dann steht sie hier.',
    groups: [
      {
        title: 'Bevor es losgeht',
        items: [
          {
            question: 'Wie startet ein Projekt konkret?',
            answer:
              'Mit einem Gespräch, kostenlos und ohne Verkaufsdruck. Du beschreibst, was du brauchst und was schon da ist. Wenn ich helfen kann, bekommst du ein schriftliches Angebot: was enthalten ist, was nicht, und was es kostet. Vorher wird nichts gebaut.',
          },
          {
            question: 'Welche der drei Leistungen brauche ich?',
            answer:
              'Das entscheidet das Ziel, nicht die Größe. Sollen Leute dich finden und verstehen, was du machst, ist das eine Website. Verkaufst du Produkte, ist das ein Online-Shop. Läuft ein Ablauf in deinem Betrieb über E-Mails, Dateien und Handarbeit, ist das individuelle Software. Wenn du unsicher bist, beschreib das Ziel, und ich sage es dir.',
          },
          {
            question: 'Was brauchst du von mir?',
            answer:
              'Was dein Betrieb macht, wer deine Kunden sind, und was danach leichter sein soll. Praktisch: ob du schon Domain, Texte, Fotos oder eine alte Seite hast. Wenn nichts davon existiert, ist das normal, das ordnen wir gemeinsam.',
          },
          {
            question: 'Arbeitest du auch mit Kunden außerhalb Deutschlands?',
            answer:
              'Ja. Ich sitze in Erfurt und arbeite remote, auf Deutsch, Englisch oder Arabisch. Die Preise sind überall dieselben in Euro. Was sich ändert, ist die Zeitzone, auf die wir uns für Gespräche einigen.',
          },
        ],
      },
      {
        title: 'Geld und Eigentum',
        items: [
          {
            question: 'Warum steht bei jedem Preis "ab"?',
            answer:
              'Weil der Einstiegspreis der kleinste Umfang ist, der bei dieser Leistung noch sinnvoll ist. Eine Seite mit fünf Unterseiten und eine mit zwölf in vier Sprachen sind nicht dieselbe Arbeit. Die endgültige Zahl kommt, nachdem ich geprüft habe, was du wirklich brauchst, und sie steht schriftlich fest, bevor etwas beginnt.',
          },
          {
            question: 'Wie wird bezahlt?',
            answer:
              'In der Regel in Teilen, die an den Fortschritt gebunden sind statt an Kalenderdaten — zum Start, am vereinbarten Zwischenstand und bei der Abnahme. Die genaue Aufteilung steht in deinem Angebot. Websites gibt es auch in monatlichen Raten, wobei das Eigentum an dich übergeht.',
          },
          {
            question: 'Wem gehört das Ergebnis?',
            answer:
              'Dir. Domain, Shopify und Hosting laufen von Anfang an auf deinen Namen, nicht auf meinen. Nach vollständiger Zahlung bekommst du das vereinbarte Ergebnis und die Nutzungsrechte daran.',
          },
          {
            question: 'Gibt es Kosten, die nicht an dich gehen?',
            answer:
              'Ja, und die sollst du jetzt hören: Shopify-Abo, Domain, kostenpflichtige Apps und die Gebühren der Zahlungsanbieter gehen direkt an diese Anbieter. Ich schlage nichts drauf und verkaufe sie nicht weiter. Hosting und laufender Betrieb sind bei mir optional als Monatsleistung buchbar.',
          },
        ],
      },
      {
        title: 'Zusammenarbeit',
        items: [
          {
            question: 'Was, wenn mir das Design nicht gefällt?',
            answer:
              'Du siehst die gestalterische Richtung, bevor alles darauf aufgebaut wird — genau an dem Punkt, an dem eine Änderung billig ist. Zwei Feedbackrunden sind enthalten. Wenn die Richtung falsch ist, ändern wir sie dort und nicht am Ende.',
          },
          {
            question: 'Wie lange dauert ein Projekt?',
            answer:
              'Der Zeitplan steht in deinem Angebot, weil er vom Umfang abhängt. Der ehrliche Teil: Was den Termin am stärksten verschiebt, ist nicht mein Tempo, sondern wie schnell Texte, Fotos, Produktdaten und Entscheidungen von deiner Seite zurückkommen.',
          },
          {
            question: 'Kann ich unterwegs meine Meinung ändern?',
            answer:
              'Ja, und es wird geschätzt, bevor es gebaut wird. Eine Änderung am Ziel ist neue Arbeit mit eigenem Preis, schriftlich vereinbart. Das ist keine Strafe, sondern das, was die ursprüngliche Zahl ehrlich hält.',
          },
        ],
      },
      {
        title: 'Nach dem Launch',
        items: [
          {
            question: 'Was passiert, wenn es online ist?',
            answer:
              'Fehler innerhalb des vereinbarten Umfangs werden 30 Tage nach dem Launch kostenlos behoben. Bei Shops kommen Einweisung und Übergabe dazu, damit du den Laden selbst führen kannst. Laufender Betrieb und Weiterentwicklung gibt es auf Wunsch, nicht automatisch.',
          },
          {
            question: 'Was ist ein Fehler und was ist neue Arbeit?',
            answer:
              'Wenn etwas nicht das tut, was wir vereinbart haben, ist das ein Fehler, und ich behebe ihn. Eine neue Seite, eine neue Rolle, eine neue Schnittstelle oder eine neue Idee ist neue Arbeit. Ich sage dir immer, wofür ich es halte, und warum.',
          },
          {
            question: 'Machst du auch Marketing oder SEO?',
            answer:
              'Nein. Ich baue, ich vermarkte nicht. Die technische Grundlage wird sauber gemacht — Geschwindigkeit, Struktur, Mobil, Metadaten — aber ich schalte keine Kampagnen und verspreche weder Rankings noch Umsatz. Wenn du das brauchst, brauchst du eine Agentur, und ich sage es dir auch so.',
          },
          {
            question: 'Was, wenn du später nicht mehr da bist?',
            answer:
              'Deine Zugänge laufen auf deinen Namen, und ich baue mit gewöhnlichen, verbreiteten Werkzeugen statt mit etwas, das nur ich pflegen kann. Ein anderer Entwickler kann übernehmen. Das ist eine bewusste Entscheidung: Arbeit, die du nicht verlassen kannst, gehört dir nicht wirklich.',
          },
        ],
      },
    ],
  },

  stack: {
    meta: {
      title: 'Stack · Wie Yaman Warda baut',
      description:
        'Für Unternehmen, die mich technisch einschätzen wollen: die Architektur hinter dieser Plattform, vier Entscheidungen und ihr Preis, und die Systeme, die ich ausgeliefert habe.',
    },
    eyebrow: 'Stack',
    title: 'Die technische Fassung.',
    intro:
      'Diese Seite ist für Unternehmen, nicht für Kunden. Keine Pakete, keine Preise — die Architektur, die Entscheidungen, die ich gegen eine plausible Alternative getroffen habe, und was jede davon gekostet hat. Ich programmiere seit 2021, habe es mir selbst beigebracht und arbeite allein über den gesamten Stack.',
    platform: {
      title: 'Du stehst auf dem Beispiel',
      body: 'Diese Seite ist kein Portfolio fremder Arbeit. Die öffentlichen Seiten in drei Sprachen, die API, die Datenbank und die Verwaltung dahinter sind eine Anwendung, die ich geschrieben habe und betreibe. Kein Baukasten, kein fremdes CMS, nirgends.',
      layers: [
        { label: 'Framework', value: 'TanStack Start, React 19, dateibasierte Routen' },
        { label: 'API', value: 'Elysia unter /api, Eden Treaty als typisierter Client' },
        { label: 'Daten', value: 'PostgreSQL über pg, rohes parametrisiertes SQL, kein ORM' },
        { label: 'Validierung', value: 'Valibot an der Grenze, geteilt zwischen Client und Server' },
        { label: 'State und Formulare', value: 'React Query für Serverdaten, TanStack Form für Eingaben' },
        { label: 'Motion', value: 'CSS mit IntersectionObserver und Pointer-Events, ohne Bibliothek' },
        { label: 'Hosting', value: 'Hetzner in Deutschland, Coolify, PostgreSQL im Docker auf demselben Host' },
      ],
    },
    decisions: {
      title: 'Vier Entscheidungen und ihr Preis',
      intro:
        'Jede davon wurde gegen etwas Vernünftiges getroffen. Die interessante Hälfte ist nicht, wofür ich mich entschieden habe, sondern was die Entscheidung gekostet hat — also steht das auch hier.',
      items: [
        {
          title: 'Rohes parametrisiertes SQL statt ORM',
          body: 'Eine Anwendung, eine Datenbank, ein Betreiber. Ein ORM schöbe eine Mapping-Schicht und einen Migrationsdialekt zwischen mich und eine Abfrage, die ich ohnehin lesen kann. In dieser Größe sind das bewegliche Teile ohne Gewinn.',
          costLabel: 'Was es kostet',
          cost: 'Mehr Tipparbeit und keine geschenkten Schema-Refactorings. Ich schreibe die Migrationen von Hand und halte die Abfragen nah an den Tabellen.',
        },
        {
          title: 'Eigene Verwaltung statt fremdem CMS',
          body: 'Anfragen, Seitentexte, Kunden und Rechnungen liegen in einem System mit einem Inhaltsmodell, nicht aufgeteilt zwischen einem Anbieter und einer Datenbank. Dass die Plattform vollständig selbst gebaut ist, ist außerdem der Punkt des Portfolios.',
          costLabel: 'Was es kostet',
          cost: 'Ich baue den Editor selbst, statt einen zu installieren. Bis er fertig ist, liegen die Texte in typisierten Dateien — ehrlich statt bequem.',
        },
        {
          title: 'Ein deutscher Server, den ich selbst administriere',
          body: 'Kundendaten, Leads und Rechnungen liegen auf einer Hetzner-Maschine in Deutschland, was die DSGVO-Geschichte kurz macht. Cron und Hintergrundjobs laufen nativ, und die Datenbank ist lokal, also gibt es kein Serverless-Pooling-Problem.',
          costLabel: 'Was es kostet',
          cost: 'Backups und Sicherheitsupdates gehören mir. Snapshots, ein nächtlicher pg_dump, unattended upgrades und ein Restore, den ich tatsächlich getestet habe — nicht einer, von dem ich annehme, dass er funktioniert.',
        },
        {
          title: 'Eine Motion-Schicht ohne Animationsbibliothek',
          body: 'Der erste Versuch lief mit GSAP, ScrollTrigger und Lenis. Er stürzte bei jeder clientseitigen Navigation weg von der Startseite ab und animierte Abschnitte, die niemand freigegeben hatte. Ich habe ihn gelöscht und alles neu gebaut, auf CSS-Transitions, IntersectionObserver, ResizeObserver und Pointer-Events.',
          costLabel: 'Was es gekostet hat',
          cost: 'Eine weggeworfene Arbeitswoche und Easing-Kurven, die ich jetzt von Hand schreibe. Dafür liefert die Seite gar keine Animations-Laufzeit aus, und bei Navigation bricht nichts.',
        },
      ],
    },
    built: {
      title: 'Was ich ausgeliefert habe',
      body: 'Einen Onlineshop mit gefiltertem 500-Produkte-Katalog, Stripe-Checkout, Bestellungen und den Pflichtseiten, die ein deutscher Shop braucht. Eine Schreibplattform mit Editor, Uploads, Kommentaren, Reaktionen und Benachrichtigungen. Ein Immobilien-Verwaltungssystem, noch im Bau, auf dessen Architektur diese Seite läuft.',
      link: 'Projekte ansehen',
    },
    links: {
      title: 'Wenn du sprechen willst',
      email: 'Schreib mir eine E-Mail',
    },
  },

  notFound: {
    title: 'Diese Seite gibt es nicht.',
    body: 'Der Link ist alt oder vertippt.',
    link: 'Zur Startseite',
  },
}
