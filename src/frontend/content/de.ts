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
      tagline: 'Websites, Shopify-Shops und individuelle Software für kleine Unternehmen.',
      location: 'Erfurt, Deutschland',
      email: 'E-Mail',
      links: 'Seiten',
      builtWith: 'Diese Website und die Verwaltung dahinter sind selbst gebaut.',
    },
  },

  home: {
    meta: {
      title: 'Yaman Warda · Websites, Shopify-Shops und individuelle Software aus Erfurt',
      description:
        'Ich baue die Systeme, mit denen kleine Unternehmen täglich arbeiten: Websites ab 990 €, Shopify Onlineshops ab 2.490 €, individuelle Software ab 2.990 €. Fester Preis, ein Ansprechpartner.',
    },
    hero: {
      eyebrow: 'Webentwickler in Erfurt · für kleine Unternehmen in ganz Deutschland',
      greeting: 'Hi, ich bin Yaman Warda.',
      prefix: 'Websites · Shopify · Software',
      typed: ['WEB-', 'SHOP-', 'SOFTWARE-'],
      staticLine: 'ENTWICKLER',
      headline:
        'Websites, Shopify-Shops und maßgeschneiderte Systeme — gebaut, betreut, weiterentwickelt.',
      sub: 'Für kleine Unternehmen, die einen technischen Partner brauchen und keinen Lieferanten. Fester Preis, klarer Umfang, ein Ansprechpartner: ich.',
      cta: 'Gespräch anfragen',
      secondary: 'Leistungen ansehen',
    },
    services: {
      eyebrow: 'Leistungen',
      title: 'Was ich baue',
      sub: 'Drei Leistungen, drei verschiedene Ergebnisse. Der Preis ist ein Einstieg für einen kleinen, klar umrissenen Umfang.',
      from: 'ab',
      more: 'Details ansehen',
    },
    work: {
      eyebrow: 'Arbeiten',
      title: 'Ausgewählte Projekte',
      sub: 'Eigene Projekte, die zeigen, wie ich baue. Fallstudien mit Kundenprojekten folgen, sobald sie live sind.',
      all: 'Alle Projekte',
    },
    process: {
      eyebrow: 'Ablauf',
      title: 'So läuft ein Projekt',
      sub: 'Vier Schritte, keine Überraschungen. Sie wissen jederzeit, wo das Projekt steht und was es kostet.',
      steps: [
        {
          title: 'Gespräch',
          body: 'Wir klären, was Sie brauchen, was Sie schon haben und was das Projekt leisten soll. Kostenlos und ohne Verkaufsdruck.',
        },
        {
          title: 'Angebot mit festem Preis',
          body: 'Sie bekommen ein schriftliches Angebot: was drin ist, was nicht, was es kostet. Keine offenen Enden.',
        },
        {
          title: 'Umsetzung mit Zwischenständen',
          body: 'Sie sehen die Designrichtung, bevor das Ganze gebaut wird, und geben in zwei Runden Feedback.',
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
      forTitle: 'Gut passt es, wenn Sie',
      forItems: [
        'ein neues Unternehmen führen und einen seriösen Auftritt brauchen.',
        'einen lokalen Betrieb haben, dessen Kunden über Google und Empfehlungen kommen, und einen klaren Ort für alle Informationen wollen.',
        'eine Website haben, die Ihr heutiges Niveau nicht mehr zeigt.',
        'online verkaufen wollen und einen Shop brauchen, den Sie danach selbst führen können.',
        'einen Ablauf, der heute in E-Mails und Tabellen lebt, in ein System bringen wollen.',
      ],
      notForTitle: 'Weniger gut passt es, wenn Sie',
      notForItems: [
        'garantierte Google-Platzierungen oder Umsatzversprechen suchen. Die gebe ich nicht.',
        'eine Marketing-Agentur brauchen. Ich baue, ich vermarkte nicht.',
        'nur den günstigsten Anbieter suchen.',
      ],
      honesty:
        'Wenn Ihre bestehende Website schnell ist, auf dem Handy funktioniert und ihren Zweck erfüllt, sage ich Ihnen das. Dann brauchen Sie mich gerade nicht.',
    },
    about: {
      eyebrow: 'Über mich',
      title: 'Ein Entwickler, ein Ansprechpartner.',
      body: 'Ich bin Yaman Warda, Entwickler in Erfurt. Ich habe mir das Programmieren selbst beigebracht und baue seitdem komplette Systeme: Oberfläche, Backend, Datenbank, Betrieb. Diese Website samt der Verwaltung dahinter ist selbst gebaut.',
      link: 'Mehr über mich',
    },
    cta: {
      title: 'Erzählen Sie mir von Ihrem Vorhaben.',
      body: 'Schreiben Sie kurz, worum es geht. Sie bekommen eine ehrliche Einschätzung, auch wenn sie lautet: Das brauchen Sie nicht.',
      button: 'Gespräch anfragen',
      alt: 'Oder direkt per E-Mail',
    },
  },

  services: {
    meta: {
      title: 'Leistungen · Websites, Shopify Onlineshops, Individuelle Software',
      description:
        'Websites ab 990 €, Shopify Onlineshops ab 2.490 €, individuelle Software ab 2.990 €. Was drin ist, für wen es passt und was der Preis bedeutet.',
    },
    eyebrow: 'Leistungen',
    title: 'Drei Leistungen. Drei verschiedene Ergebnisse.',
    intro:
      'Ob Website, Shop oder Software entscheidet nicht die Größe, sondern das Ziel: Ihr Unternehmen zeigen, Produkte verkaufen oder einen Ablauf betreiben. Umfang und Komplexität bestimmen dann den Preis innerhalb der Leistung.',
    from: 'ab',
    items: {
      websites: {
        name: 'Websites',
        short: 'Eine schnelle, klare Website, die Ihr Unternehmen erklärt und Besucher zum Anruf, zur Anfrage oder zur Buchung führt.',
        promise:
          'Sie bekommen eine professionelle, schnelle Website, die Ihr Unternehmen erklärt, Informationen klar zeigt und es Besuchern leicht macht, den nächsten Schritt zu gehen. Design, Veröffentlichung und Hosting nehme ich Ihnen ab.',
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
          'Der Einstiegspreis gilt für eine Einseiten-Website auf Basis eines erprobten Designsystems. Mehr Seiten, eigenes Design, Sprachen und Funktionen erhöhen den Preis. Ein individuell gestalteter Auftritt beginnt bei 1.990 €. Auf Wunsch auch als monatliche Rate mit Übergang in Ihr Eigentum.',
        boundaryTitle: 'Was ich nicht verspreche',
        boundary:
          'Keine garantierte Anzahl an Kunden, keine garantierte Google-Platzierung. Ich garantiere den vereinbarten Umfang, die technische Qualität und einen klaren Ablauf.',
      },
      shopify: {
        name: 'Shopify Onlineshops',
        short: 'Ein Shop, der verkaufsbereit übergeben wird und den Sie danach selbst führen.',
        promise:
          'Ich baue einen klaren, betriebsbereiten Shop auf Shopify: Grundstruktur, Kauferlebnis und Übergabe, nicht nur ein installiertes Theme.',
        audienceTitle: 'Für wen',
        audience: [
          'Ein Unternehmen, das seinen ersten Shop mit klaren Produkten und Daten starten will.',
          'Eine kleine oder mittlere Marke, die einen Shop will, den sie nach der Übergabe selbst verwaltet.',
          'Ein bestehender Shop, der neu geordnet oder zu Shopify umgezogen werden soll.',
          'Ein Unternehmen, das eine angepasste Shopify-Oberfläche oder überschaubare Integrationen braucht.',
        ],
        includesTitle: 'Was drin ist',
        includes: [
          'Shopify-Einrichtung und ein passendes Theme, angepasst an Ihre Marke.',
          'Navigation, Kollektionen und die wichtigen Shop-Seiten.',
          'Zahlung, Versand und Steuern technisch eingerichtet nach Ihren Vorgaben.',
          'Produktvorlagen und Varianten, mit bis zu zehn Produkten als Startbestand.',
          'Domain, notwendige Analytics und eine Testbestellung.',
          'Einweisung, Übergabe und 30 Tage Fehlerbehebung.',
        ],
        priceTitle: 'Was es kostet',
        price: 'ab 2.490 €',
        priceNote:
          'Der Einstiegspreis gilt für einen neuen, überschaubaren Shop mit fertigen Daten und einem Standard-Theme. Datenaufbereitung, Designtiefe, Sprachen, Umzug und Integrationen kommen als klar benannte Posten dazu. Shopify-Abo, Domain, Apps und Zahlungsgebühren zahlen Sie direkt an die Anbieter.',
        boundaryTitle: 'Was ich nicht verspreche',
        boundary:
          'Keine Umsatz- oder Conversion-Versprechen, keine Rechts- oder Steuerberatung. Rechtstexte kommen von Ihnen oder einem Anbieter dafür.',
      },
      software: {
        name: 'Individuelle Software',
        short: 'Buchungssysteme, interne Tools, Kundenportale, Dashboards: die kleinste Version, die Ihren Ablauf wirklich trägt.',
        promise:
          'Ich verstehe den Ablauf, den Sie verbessern wollen, und baue die kleinste Web-Anwendung, die ihn klar abbildet: Oberfläche, Backend, Datenbank und Betrieb passend zum vereinbarten Umfang.',
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
          title: 'Ihre Daten, Ihre Konten',
          body: 'Domain, Shopify, Hosting-Konten laufen auf Ihren Namen. Nach vollständiger Zahlung bekommen Sie den vereinbarten Stand und die Nutzungsrechte.',
        },
        {
          title: 'Preise sind Einstiege',
          body: '„ab" heißt: ein kleiner, klar umrissener Umfang. Ob netto oder brutto steht im Angebot, je nach steuerlicher Situation zum Zeitpunkt des Angebots.',
        },
      ],
    },
    cta: {
      title: 'Nicht sicher, welche Leistung passt?',
      body: 'Das ist normal. Beschreiben Sie, was Sie erreichen wollen, und ich sage Ihnen, was Sie brauchen. Oder dass Sie es nicht brauchen.',
      button: 'Gespräch anfragen',
    },
  },

  about: {
    meta: {
      title: 'Über mich · Yaman Warda, Entwickler in Erfurt',
      description:
        'Selbst beigebracht, komplett gebaut: Wer hinter den Websites, Shops und Systemen steht, wie ich arbeite und warum ich diese Plattform selbst gebaut habe.',
    },
    eyebrow: 'Über mich',
    title: 'Ich baue Dinge, die danach jemand täglich benutzt.',
    intro:
      'Ich bin Yaman Warda, Entwickler in Erfurt. Ich arbeite allein, direkt mit Ihnen, und baue vollständige Systeme statt einzelner Teile.',
    story: {
      title: 'Wie ich hierher gekommen bin',
      paragraphs: [
        'Ich habe mir das Programmieren selbst beigebracht. Nicht mit Tutorials, die man nachtippt, sondern mit echten Projekten, die veröffentlicht werden mussten und dann Feedback bekommen haben.',
        'Dabei ist mir aufgefallen, was ich am liebsten baue: keine einzelnen Bildschirme, sondern ganze Abläufe. Anmeldung, Datenmodell, Zahlungen, Dashboards und die kleinen Details, die eine Software echt wirken lassen.',
        'Heute baue ich genau das für kleine Unternehmen: Websites, Shops und Systeme, die nach der Übergabe im Alltag funktionieren müssen.',
      ],
    },
    method: {
      title: 'Wie ich arbeite',
      items: [
        {
          title: 'Erst verstehen, dann bauen',
          body: 'Ich will wissen, wie Ihr Ablauf heute funktioniert und wo er hakt, bevor ich eine Lösung vorschlage.',
        },
        {
          title: 'Klein anfangen, sauber liefern',
          body: 'Die erste Version enthält, was den Kern trägt. Erweiterungen kommen, wenn sie gebraucht werden, nicht weil sie möglich sind.',
        },
        {
          title: 'Grundlagen statt Tricks',
          body: 'Ich baue mit Werkzeugen, die ich verstehe, damit ich Fehler finden und Ihnen erklären kann, was passiert.',
        },
        {
          title: 'Ehrlich, auch wenn es Umsatz kostet',
          body: 'Wenn Ihre Website gut genug ist oder ein fertiges Werkzeug reicht, sage ich das.',
        },
      ],
    },
    platform: {
      title: 'Diese Website ist ein Beispiel',
      body: 'Sie sehen gerade ein System, das ich komplett selbst gebaut habe: die öffentliche Seite in drei Sprachen und dahinter eine Verwaltung für Anfragen, Inhalte, Kunden und Rechnungen. Kein Baukasten, kein fremdes CMS. Das ist die Art Arbeit, die ich anbiete.',
    },
    portraitAlt: 'Yaman Warda',
    cta: { title: 'Lassen Sie uns über Ihr Projekt sprechen.', button: 'Gespräch anfragen' },
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
          'Ich habe den gesamten Kaufweg gebaut, vom Produktkatalog über den Warenkorb bis zur Zahlung mit Stripe und der Bestellübersicht für Kunde und Betreiber. Der Admin-Bereich verwaltet Produkte, Bestellungen und Bewertungen.',
        shows:
          'Dass ich einen kompletten Kaufprozess mit Zahlung, Rechten und Verwaltung durchgängig bauen kann, nicht nur die Schaufensterseite.',
        features: [
          'Registrierung, Login und Kundenkonto',
          'Produktverwaltung mit Varianten',
          'Warenkorb und Stripe Checkout',
          'Bestellungen mit Status',
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
          'Ich habe einen Rich-Text-Editor mit Bild-Uploads, Kommentar-Threads, Reaktionen und ein Benachrichtigungssystem gebaut, alles hinter einem Konto-System.',
        shows:
          'Dass ich Inhalts- und Community-Funktionen bauen kann, wie sie in Portalen, Blogs und internen Wissensdatenbanken gebraucht werden.',
        features: [
          'Konto und Profile',
          'Rich-Text-Editor',
          'Bild-Uploads',
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
        'Beschreiben Sie kurz Ihr Vorhaben. Sie bekommen eine ehrliche Einschätzung, ob und wie ich helfen kann.',
    },
    eyebrow: 'Kontakt',
    title: 'Erzählen Sie mir von Ihrem Vorhaben.',
    intro:
      'Ein paar Fragen vorab, damit unser Gespräch nicht bei null anfängt. Ich melde mich mit einer ehrlichen Einschätzung.',
    form: {
      name: 'Name',
      email: 'E-Mail',
      company: 'Unternehmen',
      companyOptional: 'optional',
      projectType: 'Worum geht es?',
      projectTypes: [
        { value: 'website', label: 'Website' },
        { value: 'shopify', label: 'Shopify Onlineshop' },
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
      message: 'Ihr Vorhaben',
      messageHint: 'Was soll entstehen? Was haben Sie schon: Domain, Texte, einen alten Auftritt?',
      submit: 'Anfrage senden',
      sending: 'Wird gesendet …',
      sent: {
        title: 'Danke, die Anfrage ist da.',
        body: 'Ich melde mich per E-Mail. Falls es eilt, schreiben Sie mir direkt.',
      },
      error: 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal oder schreiben Sie mir direkt per E-Mail.',
      errors: {
        name: 'Bitte geben Sie Ihren Namen an.',
        email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.',
        message: 'Bitte beschreiben Sie kurz Ihr Vorhaben.',
      },
    },
    aside: {
      title: 'Lieber direkt?',
      body: 'Eine E-Mail reicht. Ein Termin-Buchungssystem folgt auf dieser Seite.',
      emailLabel: 'E-Mail',
      locationLabel: 'Standort',
      location: 'Erfurt, Deutschland · Arbeit für ganz Deutschland, Remote',
    },
  },

  notFound: {
    title: 'Diese Seite gibt es nicht.',
    body: 'Der Link ist alt oder vertippt.',
    link: 'Zur Startseite',
  },
}
