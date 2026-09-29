import type { IndustriesCopy } from './types'

/**
 * The industry landing pages under `/webdesign-erfurt`, word for word from the
 * owner's brief (`branchenseiten.md`, 29 Sep 2026). German is the only
 * published language: English and Arabic start from this same text and stay
 * `noindex` until the owner has translated them in the Dashboard.
 *
 * The hub's description and intro, the section labels and the call to action
 * were not in the brief and are written in its voice.
 */
export const industriesDe: IndustriesCopy = {
  hub: {
    meta: {
      title: 'Webdesign Erfurt · Websites für lokale Betriebe | Yaman Warda',
      description:
        'Webdesign aus Erfurt für Cafés, Restaurants, Friseure, Praxen und Handwerksbetriebe – schnelle, mobile Websites mit festen Paketpreisen.',
    },
    eyebrow: 'Webdesign Erfurt',
    title: 'Webdesign in Erfurt – für Betriebe, die gefunden werden wollen',
    intro:
      'Deine Kunden suchen dich bei Google, bevor sie anrufen oder vorbeikommen. Ich baue schnelle Websites für Erfurter Betriebe, mit festen Paketpreisen und persönlich vor Ort. Wähle deine Branche und sieh, was deine Kunden auf deiner Website suchen.',
    cardsTitle: 'Websites nach Branche',
    cardLink: 'Mehr erfahren',
  },
  faqTitle: 'Häufige Fragen',
  servicesLink: 'Alle Pakete und Preise ansehen',
  cta: {
    title: 'Kostenloses Erstgespräch',
    body: 'Such dir eine Zeit aus. Wir gehen dein Vorhaben durch, und danach weißt du, welches Paket zu deinem Betrieb passt.',
    button: 'Kostenloses Erstgespräch',
  },
  pages: {
    cafes: {
      meta: {
        title: 'Website für Cafés & Restaurants in Erfurt | Yaman Warda',
        description:
          'Speisekarte, Öffnungszeiten, Anfahrt und Reservierung auf einen Blick – Websites für Cafés und Restaurants in Erfurt mit festen Paketpreisen.',
      },
      card: {
        title: 'Cafés & Restaurants',
        body: 'Speisekarte, Öffnungszeiten, Anfahrt und Reservierung auf einen Blick.',
      },
      title: 'Website für dein Café oder Restaurant in Erfurt',
      intro:
        'Wer abends in Erfurt essen gehen will, sucht bei Google – „Café Domplatz“, „Restaurant Krämerbrücke“, „Frühstück Erfurt“. Wenn dort nur ein altes Foto und keine Speisekarte auftaucht, geht der Gast zum Nachbarn. Ich baue dir eine schnelle Website, auf der Gäste in Sekunden finden, was sie suchen.',
      needs: {
        title: 'Was Gäste auf deiner Website suchen',
        items: [
          'Speisekarte – aktuell und auf dem Handy lesbar (kein PDF zum Zoomen)',
          'Öffnungszeiten, Adresse und Anfahrt mit Google Maps',
          'Tisch reservieren oder direkt per WhatsApp anfragen',
          'Fotos von Speisen und Räumen',
          'Hinweise zu vegan, glutenfrei, Allergenen',
        ],
      },
      packages: {
        title: 'Welches Paket passt?',
        body: 'Für ein Café reicht oft „Gefunden werden“ (Onepager). Für Restaurants mit Speisekarte, Galerie und Google-Bewertungen empfehle ich „Vertrauen gewinnen“ – inklusive Einrichtung deines Google-Unternehmensprofils und Bewertungs-Kit mit QR-Karte für den Tisch.',
      },
      local: {
        title: 'Warum lokal?',
        body: 'Ich sitze in Erfurt, komme zum Fotografieren vorbei und kenne die Suchbegriffe, mit denen Gäste hier suchen.',
      },
      faq: [
        {
          question: 'Kann ich die Speisekarte selbst ändern?',
          answer: 'Kleine Änderungen übernehme ich im Monatspaket; auf Wunsch baue ich dir eine selbst editierbare Karte.',
        },
        {
          question: 'Brauche ich Online-Reservierung?',
          answer: 'Nicht immer. Ein WhatsApp-Button reicht vielen Cafés; Reservierungstools binde ich im Paket „Termine füllen“ ein.',
        },
        {
          question: 'Wie lange dauert es?',
          answer: 'Ein Onepager ist meist in 1–2 Wochen online.',
        },
      ],
    },
    hairdressers: {
      meta: {
        title: 'Website für Friseure & Barbershops in Erfurt | Yaman Warda',
        description:
          'Online-Termine, Preisliste und Bewertungen – Websites für Friseure und Barbershops in Erfurt. Feste Preise, persönlich aus Erfurt.',
      },
      card: {
        title: 'Friseure & Barbershops',
        body: 'Online-Termine, Preisliste und Bewertungen – feste Preise, persönlich aus Erfurt.',
      },
      title: 'Website für deinen Friseursalon oder Barbershop in Erfurt',
      intro:
        'Deine Kunden wollen drei Dinge wissen: Was kostet es, wann hast du Zeit und sind andere zufrieden? Eine gute Website beantwortet das, bevor jemand anruft – und füllt deinen Kalender, während du schneidest.',
      needs: {
        title: 'Was rein gehört',
        items: [
          'Online-Terminbuchung (z. B. Cal.com, Treatwell, Planity oder dein bestehendes System)',
          'Preisliste für Damen, Herren, Bart, Färben',
          'Vorher-/Nachher-Galerie und Instagram-Verlinkung',
          'Google-Bewertungen direkt auf der Seite',
          'WhatsApp-Button für kurzfristige Fragen',
        ],
      },
      packages: {
        title: 'Welches Paket passt?',
        body: '„Termine füllen“ ist für Salons gemacht: 7 Seiten inklusive Einbindung deines Buchungstools und News-Bereich für Aktionen. Kleine Barbershops starten gut mit „Vertrauen gewinnen“.',
      },
      faq: [
        {
          question: 'Ich habe schon ein Buchungstool – geht das?',
          answer: 'Ja, ich binde dein bestehendes System ein.',
        },
        {
          question: 'Kann die Seite auch Arabisch/Türkisch/Englisch?',
          answer: 'Ja, mehrsprachige Seiten sind möglich.',
        },
        {
          question: 'Wer kümmert sich nach dem Launch?',
          answer:
            'Auf Wunsch übernehme ich Hosting, Pflege und dein Google-Profil im Monatspaket – Details auf der Leistungsseite.',
        },
      ],
    },
    practices: {
      meta: {
        title: 'Website für Praxen & Therapeuten in Erfurt | Yaman Warda',
        description:
          'Seriöse, barrierearme Praxis-Websites in Erfurt: Sprechzeiten, Leistungen, Team und Online-Termine – DSGVO-konform und mobil.',
      },
      card: {
        title: 'Arztpraxen & Therapeuten',
        body: 'Sprechzeiten, Leistungen, Team und Online-Termine – DSGVO-konform und mobil.',
      },
      title: 'Website für deine Praxis in Erfurt',
      intro:
        'Patientinnen und Patienten suchen heute zuerst online: Sprechzeiten, Anfahrt, Leistungen, ob neue Patienten aufgenommen werden. Eine klare Praxis-Website spart deinem Team jeden Tag Telefonate.',
      needs: {
        title: 'Was eine Praxis-Website braucht',
        items: [
          'Sprechzeiten, Urlaubs- und Vertretungshinweise',
          'Leistungen verständlich erklärt',
          'Team-Seite mit Fotos',
          'Online-Termin oder Rezept-/Überweisungsanfrage',
          'Impressum und Datenschutz nach Heilberufe-Vorgaben, SSL, kein unnötiges Tracking',
          'Gut lesbar auch für ältere Menschen (Schriftgröße, Kontrast)',
        ],
      },
      packages: {
        title: 'Welches Paket passt?',
        body: '„Vertrauen gewinnen“ für Praxen ohne Online-Termine, „Termine füllen“ für Physio, Ergotherapie, Heilpraktiker und Coaching mit Buchung.',
      },
      faq: [
        {
          question: 'Ist die Seite DSGVO-konform?',
          answer: 'Ja: Hosting in der EU, Cookie-Hinweis nur wo nötig, keine Formulardaten bei Dritten.',
        },
        {
          question: 'Hilfst du bei den Texten?',
          answer: 'Ja; medizinische Inhalte stimmst du ab.',
        },
      ],
    },
    trades: {
      meta: {
        title: 'Website für Handwerker in Erfurt & Thüringen | Yaman Warda',
        description:
          'Mehr Anfragen aus der Region: Websites für Handwerksbetriebe in Erfurt und Thüringen – Leistungen, Referenzen, Einzugsgebiet und Anfrageformular.',
      },
      card: {
        title: 'Handwerk',
        body: 'Mehr Anfragen aus der Region: Leistungen, Referenzen, Einzugsgebiet und Anfrageformular.',
      },
      title: 'Website für deinen Handwerksbetrieb in Erfurt und Umgebung',
      intro:
        '„Elektriker Erfurt“, „Maler Weimar“, „Fliesenleger in der Nähe“ – so suchen deine Kunden. Wer dann eine übersichtliche Seite mit Leistungen, Fotos von echten Baustellen und einem einfachen Anfrageformular findet, ruft an.',
      needs: {
        title: 'Was Kunden sehen wollen',
        items: [
          'Leistungen mit Fotos eurer Arbeiten',
          'Einzugsgebiet (Erfurt, Weimar, Gotha, Arnstadt …)',
          'Anfrageformular mit Foto-Upload',
          'Meisterbrief, Zertifikate, Innung',
          'Stellenangebote / Azubi-Seite',
        ],
      },
      packages: {
        title: 'Welches Paket passt?',
        body: '„Gefunden werden“ für kleine Betriebe, „Vertrauen gewinnen“ wenn Referenzen, Galerie und Google-Bewertungen dazukommen sollen.',
      },
      faq: [
        {
          question: 'Ich habe keine Zeit für Texte.',
          answer: 'Kurzes Gespräch reicht, die Texte schreibe ich.',
        },
        {
          question: 'Hilft die Seite auch bei der Azubi-Suche?',
          answer: 'Ja, eine eigene Karriere-Seite ist schnell ergänzt.',
        },
      ],
    },
  },
}
