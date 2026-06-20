export type ProjectStatus = "live" | "coming-soon" | "placeholder";

export interface Project {
  title: string;
  eyebrow: string;
  description: string;
  websiteHref?: string;
  githubHref?: string;
  status: ProjectStatus;
  ctaLabel: string;
  tags: string[];
}

interface AboutHighlight {
  title: string;
  description: string;
}

interface NavigationItem {
  label: string;
  href: `#${string}`;
}

export interface Skill {
  name: string;
  icon: string;
  url?: string;
}

export interface Social {
  platform: "github" | "email" | "linkedin";
  label: string;
  value: string;
  url: string;
  icon: string;
}

export type Language = "de" | "en" | "ar";

export interface SeoContent {
  title: string;
  description: string;
  keywords: string[];
  imageAlt: string;
}

export interface PortfolioContent {
  navigation: NavigationItem[];
  profile: {
    initials: string;
    name: string;
    greeting: string;
    headline: string;
    heroLines: string[];
    heroPrefix: string;
    location: string;
    lead: string;
    about: string[];
    closing: string;
  };
  aboutHighlights: AboutHighlight[];
  projects: Project[];
  skills: Skill[];
  ui: {
    languageLabel: string;
    languageOptions: Record<Language, string>;
    viewGitHub: string;
    portfolioNavigation: string;
    openNavigationMenu: string;
    connectCta: string;
    projectsCta: string;
    addPhoto: string;
    aboutBadge: string;
    aboutTitle: string;
    projectsBadge: string;
    projectsTitle: string;
    projectsDescription: string;
    seeAllGitHub: string;
    statusLabels: Record<ProjectStatus, string>;
    visitWebsite: string;
    viewOnGitHub: string;
    contactBadge: string;
    contactTitle: string;
    contactDescription: string;
    contactEmailTitle: string;
    contactGithubTitle: string;
    contactLocationTitle: string;
    formTitle: string;
    formDescription: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    messageLabel: string;
    messagePlaceholder: string;
    sendMessage: string;
    sending: string;
    directEmailHint: string;
    sentMessage: string;
    redirectedMessage: string;
    errorMessage: string;
    invalidMessage: string;
    sendingMessage: string;
    nameError: (length: number) => string;
    emailRequiredError: string;
    emailInvalidError: string;
    messageError: (length: number) => string;
    mailSubject: (name: string) => string;
    mailBody: (name: string, email: string, message: string) => string;
  };
}

export const links = {
  siteUrl: "https://yamanwarda.dev",
  github: "https://github.com/InfiniteWorld123",
  email: "yamanwarda06@gmail.com",
  formEndpoint: "/api/contact",
};

export const seoContent: Record<Language, SeoContent> = {
  de: {
    title: "Yaman Warda | Autodidaktischer Full-Stack-Entwickler in Erfurt",
    description:
      "Portfolio von Yaman Warda, einem autodidaktischen Full-Stack-Entwickler aus Erfurt mit Fokus auf React, TypeScript, Node.js, PostgreSQL und moderne Webanwendungen.",
    keywords: [
      "Yaman Warda",
      "Full-Stack-Entwickler",
      "autodidaktischer Entwickler",
      "React Entwickler Erfurt",
      "TypeScript Entwickler",
      "Node.js Entwickler",
      "Portfolio",
    ],
    imageAlt: "Yaman Warda, autodidaktischer Full-Stack-Entwickler aus Erfurt",
  },
  en: {
    title: "Yaman Warda | Self-Taught Full-Stack Developer in Germany",
    description:
      "Portfolio of Yaman Warda, a self-taught full-stack developer in Germany building clean React, TypeScript, Node.js, PostgreSQL, and product-focused web applications.",
    keywords: [
      "Yaman Warda",
      "self-taught developer",
      "full-stack developer",
      "React developer",
      "TypeScript developer",
      "Node.js developer",
      "portfolio",
    ],
    imageAlt: "Yaman Warda, self-taught full-stack developer in Germany",
  },
  ar: {
    title: "Yaman Warda | مطوّر ويب شامل تعلّم ذاتياً",
    description:
      "ملف أعمال يمان وردة، مطوّر ويب شامل تعلّم ذاتياً في ألمانيا ويبني تطبيقات حديثة باستخدام React و TypeScript و Node.js و PostgreSQL.",
    keywords: [
      "Yaman Warda",
      "يمان وردة",
      "مطوّر ويب شامل",
      "مطوّر تعلّم ذاتياً",
      "React",
      "TypeScript",
      "Node.js",
      "Portfolio",
    ],
    imageAlt: "يمان وردة، مطوّر ويب شامل تعلّم ذاتياً في ألمانيا",
  },
};

export const defaultSeo = seoContent.de;
export const seoImagePath = "/images/hero-portrait.png";
export const seoImageUrl = `${links.siteUrl}${seoImagePath}`;

export const socials: Social[] = [
  {
    platform: "github",
    label: "GitHub",
    value: "InfiniteWorld123",
    url: "https://github.com/InfiniteWorld123",
    icon: "github",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    value: "Yaman Warda",
    url: "https://linkedin.com/in/yaman-warda",
    icon: "linkedin",
  },
];

export const portfolioContent: Record<Language, PortfolioContent> = {
  de: {
    navigation: [
      { label: "Start", href: "#home" },
      { label: "Über mich", href: "#about" },
      { label: "Projekte", href: "#projects" },
      { label: "Kontakt", href: "#contact" },
    ],
    profile: {
      initials: "YW",
      name: "Yaman Warda",
      greeting: "Hi, ich bin Yaman Warda.",
      headline: "Autodidaktischer Full-Stack-Entwickler",
      heroLines: ["FULL-STACK", "ENTWICKLER"],
      heroPrefix: "Autodidaktisch",
      location: "Erfurt, Deutschland",
      lead: "Ich entwickle Full-Stack-Webanwendungen mit klaren Oberflächen, soliden Backend-Grundlagen und praktischer Produktlogik. Ich konzentriere mich darauf, Dinge wirklich zu verstehen und Ideen in echte, nutzbare Software zu verwandeln.",
      about: [
        "Ich bin ein autodidaktischer Full-Stack-Entwickler und baue praktische Webanwendungen mit klaren Interfaces und einer stabilen Backend-Basis.",
        "Meine stärkste Arbeit liegt in React, TypeScript, Node.js, PostgreSQL und modernen Tools wie TanStack und Hono. Ich entwickle gerne echte Produktsysteme: Authentifizierung, Dashboards, Datenbankmodelle, Zahlungen und User Workflows.",
      ],
      closing:
        "Mir ist wichtig, tief zu lernen, echte Projekte zu veröffentlichen und mich durch Feedback weiterzuentwickeln. Außerhalb der Programmierung hilft mir Sport, diszipliniert und konstant zu bleiben. Genauso gehe ich auch an Entwicklung heran.",
    },
    aboutHighlights: [
      {
        title: "Grundlagen zuerst",
        description:
          "Ich möchte die Kernideen hinter Tools verstehen, damit ich sicher bauen kann und nicht nur Tutorials nacharbeite.",
      },
      {
        title: "Produktdenken",
        description:
          "Ich baue gerne vollständige Abläufe: Auth, Dashboards, Datenmodelle, Zahlungen und die kleinen Details, die eine App echt wirken lassen.",
      },
      {
        title: "Lernen durch Shipping",
        description:
          "Am meisten lerne ich, wenn ich echte Projekte baue, Ideen teste und sie verbessere, bis sie nützlich und sauber wirken.",
      },
    ],
    projects: [
      {
        title: "Tech Store",
        eyebrow: "Ausgewähltes Projekt",
        description:
          "Eine Full-Stack-E-Commerce-Anwendung mit Authentifizierung, Produktverwaltung, Warenkorb-Logik, Stripe Checkout, Bestellungen, Bewertungen und Admin-Dashboard.",
        websiteHref: "https://tech-store.yamanwarda.dev",
        githubHref: "https://github.com/InfiniteWorld123/tech-store",
        status: "live",
        ctaLabel: "GitHub öffnen",
        tags: ["E-Commerce", "Full-Stack"],
      },
      {
        title: "SkillForge",
        eyebrow: "Nächstes Projekt",
        description:
          "Eine moderne Lernplattform, auf der Lehrende Kurse veröffentlichen und Lernende mit Lektionen, Quizzen und Fortschrittsverfolgung arbeiten.",
        status: "coming-soon",
        ctaLabel: "Kommt bald",
        tags: ["LMS", "Full-Stack"],
      },
    ],
    skills: [
      { name: "React", icon: "react", url: "https://react.dev" },
      { name: "TypeScript", icon: "typescript", url: "https://www.typescriptlang.org" },
      { name: "Node.js", icon: "nodejs", url: "https://nodejs.org" },
      { name: "PostgreSQL", icon: "postgresql", url: "https://www.postgresql.org" },
      { name: "TanStack Start", icon: "tanstack", url: "https://tanstack.com/start" },
      { name: "Hono.js", icon: "hono", url: "https://hono.dev" },
      { name: "Tailwind CSS", icon: "tailwind", url: "https://tailwindcss.com" },
    ],
    ui: {
      languageLabel: "Sprache",
      languageOptions: { de: "Deutsch", en: "English", ar: "العربية" },
      viewGitHub: "GitHub ansehen",
      portfolioNavigation: "Portfolio-Navigation",
      openNavigationMenu: "Navigationsmenü öffnen",
      connectCta: "Kontakt aufnehmen",
      projectsCta: "Projekte ansehen",
      addPhoto: "Foto hier einfügen",
      aboutBadge: "Über mich",
      aboutTitle: "Einfach an der Oberfläche, solide darunter.",
      projectsBadge: "Projekte",
      projectsTitle: "Ausgewählte Builds, bewusst fokussiert.",
      projectsDescription:
        "Ein kleines Portfolio wirkt stärker, wenn jedes Projekt einen klaren Grund hat, hier zu sein. Deshalb bleibt dieser Bereich bewusst kurz.",
      seeAllGitHub: "Alles auf GitHub ansehen",
      statusLabels: { live: "Live", "coming-soon": "Bald", placeholder: "Reserviert" },
      visitWebsite: "Website besuchen",
      viewOnGitHub: "Auf GitHub ansehen",
      contactBadge: "Kontakt",
      contactTitle: "Lass uns sprechen, wenn die Arbeit passt.",
      contactDescription:
        "Ich konzentriere mich darauf, meinen eigenen Weg aufzubauen, und bin offen für Zusammenarbeit, wenn die Verbindung stimmt.",
      contactEmailTitle: "E-Mail",
      contactGithubTitle: "GitHub",
      contactLocationTitle: "Standort",
      formTitle: "Nachricht senden",
      formDescription: "Sende eine Nachricht direkt an mein Postfach.",
      nameLabel: "Vollständiger Name",
      namePlaceholder: "Dein Name",
      emailLabel: "E-Mail",
      emailPlaceholder: "name@example.com",
      messageLabel: "Nachricht",
      messagePlaceholder: "Erzähl mir kurz, worum es geht.",
      sendMessage: "Nachricht senden",
      sending: "Wird gesendet...",
      directEmailHint: "Du kannst mir auch direkt eine E-Mail schreiben, wenn das einfacher ist.",
      sentMessage: "Nachricht erfolgreich gesendet.",
      redirectedMessage: "Die E-Mail-App sollte sich mit der vorbereiteten Nachricht öffnen.",
      errorMessage: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
      invalidMessage: "Bitte korrigiere die markierten Felder oben.",
      sendingMessage: "Deine Nachricht wird gesendet...",
      nameError: (length) => `Der Name muss mindestens 2 Zeichen lang sein. Eingegeben: ${length}.`,
      emailRequiredError: "E-Mail ist erforderlich. Beispiel: name@example.com.",
      emailInvalidError: "Bitte gib eine gültige E-Mail-Adresse ein. Beispiel: name@example.com.",
      messageError: (length) => `Die Nachricht muss mindestens 10 Zeichen lang sein. Eingegeben: ${length}.`,
      mailSubject: (name) => `Portfolio-Anfrage von ${name}`,
      mailBody: (name, email, message) => `Name: ${name}\nE-Mail: ${email}\n\n${message}`,
    },
  },
  en: {
    navigation: [
      { label: "Home", href: "#home" },
      { label: "About", href: "#about" },
      { label: "Projects", href: "#projects" },
      { label: "Contact", href: "#contact" },
    ],
    profile: {
      initials: "YW",
      name: "Yaman Warda",
      greeting: "Hi, I'm Yaman Warda.",
      headline: "Self-taught Full-Stack Developer",
      heroLines: ["FULL-STACK", "DEVELOPER"],
      heroPrefix: "Self-taught",
      location: "Erfurt, Germany",
      lead: "I build full-stack web applications with clean interfaces, strong backend foundations, and practical product logic. I focus on understanding how things work, then turning ideas into real, usable software.",
      about: [
        "I'm a self-taught full-stack developer focused on building practical web applications with clean interfaces and solid backend foundations.",
        "My strongest work is in React, TypeScript, Node.js, PostgreSQL, and modern tools like TanStack and Hono. I enjoy turning real product ideas into working systems: authentication, dashboards, database models, payments, and user workflows.",
      ],
      closing:
        "I care about learning deeply, shipping real projects, and improving through feedback. Outside of programming, sport helps me stay disciplined and consistent, which is also how I approach development.",
    },
    aboutHighlights: [
      {
        title: "Foundation First",
        description:
          "I care about understanding the core ideas behind tools, so I can build with confidence instead of only following tutorials.",
      },
      {
        title: "Product Thinking",
        description:
          "I like building complete flows: auth, dashboards, data models, payments, and the small details that make an app feel real.",
      },
      {
        title: "Learning by Shipping",
        description:
          "My best progress comes from building real projects, testing ideas, and improving them until they feel useful and polished.",
      },
    ],
    projects: [
      {
        title: "Tech Store",
        eyebrow: "Featured build",
        description:
          "A full-stack e-commerce application with authentication, product management, cart logic, Stripe checkout, orders, reviews, and an admin dashboard.",
        websiteHref: "https://tech-store.yamanwarda.dev",
        githubHref: "https://github.com/InfiniteWorld123/tech-store",
        status: "live",
        ctaLabel: "Open GitHub",
        tags: ["E-commerce", "Full-Stack"],
      },
      {
        title: "SkillForge",
        eyebrow: "Next build",
        description:
          "A modern learning platform where instructors publish courses and students learn through lessons, quizzes, and progress tracking.",
        status: "coming-soon",
        ctaLabel: "Coming Soon",
        tags: ["LMS", "Full-Stack"],
      },
    ],
    skills: [
      { name: "React", icon: "react", url: "https://react.dev" },
      { name: "TypeScript", icon: "typescript", url: "https://www.typescriptlang.org" },
      { name: "Node.js", icon: "nodejs", url: "https://nodejs.org" },
      { name: "PostgreSQL", icon: "postgresql", url: "https://www.postgresql.org" },
      { name: "TanStack Start", icon: "tanstack", url: "https://tanstack.com/start" },
      { name: "Hono.js", icon: "hono", url: "https://hono.dev" },
      { name: "Tailwind CSS", icon: "tailwind", url: "https://tailwindcss.com" },
    ],
    ui: {
      languageLabel: "Language",
      languageOptions: { de: "Deutsch", en: "English", ar: "العربية" },
      viewGitHub: "View GitHub",
      portfolioNavigation: "Portfolio navigation",
      openNavigationMenu: "Open navigation menu",
      connectCta: "Let's Connect",
      projectsCta: "See Projects",
      addPhoto: "Add your photo here",
      aboutBadge: "About",
      aboutTitle: "Simple on the surface, solid underneath.",
      projectsBadge: "Projects",
      projectsTitle: "Selected builds, kept intentionally focused.",
      projectsDescription:
        "A small portfolio reads better when every project has a reason to be here, so this section stays short on purpose.",
      seeAllGitHub: "See all on GitHub",
      statusLabels: { live: "Live", "coming-soon": "Soon", placeholder: "Reserved" },
      visitWebsite: "Visit Website",
      viewOnGitHub: "View on GitHub",
      contactBadge: "Contact",
      contactTitle: "Let's talk if the work feels right.",
      contactDescription:
        "I'm focused on building my own direction and open to collaborating when the connection is real.",
      contactEmailTitle: "Email",
      contactGithubTitle: "GitHub",
      contactLocationTitle: "Location",
      formTitle: "Send a message",
      formDescription: "Send a message directly to my inbox.",
      nameLabel: "Full name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "name@example.com",
      messageLabel: "Message",
      messagePlaceholder: "Tell me a little about what you have in mind.",
      sendMessage: "Send message",
      sending: "Sending...",
      directEmailHint: "You can also email me directly if that's easier.",
      sentMessage: "Message sent successfully.",
      redirectedMessage: "Email app should open with message prefilled.",
      errorMessage: "Something went wrong. Please try again.",
      invalidMessage: "Please fix the highlighted fields above.",
      sendingMessage: "Sending your message...",
      nameError: (length) => `Name must be at least 2 characters. You entered ${length}.`,
      emailRequiredError: "Email is required. Example: name@example.com.",
      emailInvalidError: "Please enter a valid email address. Example: name@example.com.",
      messageError: (length) => `Message must be at least 10 characters. You entered ${length}.`,
      mailSubject: (name) => `Portfolio inquiry from ${name}`,
      mailBody: (name, email, message) => `Name: ${name}\nEmail: ${email}\n\n${message}`,
    },
  },
  ar: {
    navigation: [
      { label: "الرئيسية", href: "#home" },
      { label: "من أنا", href: "#about" },
      { label: "المشاريع", href: "#projects" },
      { label: "تواصل", href: "#contact" },
    ],
    profile: {
      initials: "YW",
      name: "Yaman Warda",
      greeting: "مرحباً، أنا يمان وردة.",
      headline: "مطوّر شامل تعلّم ذاتياً",
      heroLines: ["", "مطوّر"],
      heroPrefix: "تعلّم ذاتياً",
      location: "إرفورت، ألمانيا",
      lead: "أبني تطبيقات ويب شاملة بواجهات واضحة، وأساس خلفي قوي، ومنطق منتج عملي. أركز على فهم طريقة عمل الأشياء بعمق، ثم تحويل الأفكار إلى برامج حقيقية قابلة للاستخدام.",
      about: [
        "أنا مطوّر شامل تعلّمت ذاتياً، وأركز على بناء تطبيقات ويب عملية بواجهات نظيفة وأساس خلفي متين.",
        "أقوى عملي حالياً في React و TypeScript و Node.js و PostgreSQL وأدوات حديثة مثل TanStack و Hono. أحب تحويل أفكار المنتجات الحقيقية إلى أنظمة تعمل: تسجيل دخول، لوحات تحكم، نماذج قواعد بيانات، مدفوعات، وتجارب مستخدم كاملة.",
      ],
      closing:
        "أهتم بالتعلّم العميق، ونشر مشاريع حقيقية، والتطور من خلال الملاحظات. خارج البرمجة، يساعدني الرياضة على الانضباط والاستمرارية، وهذا أيضاً أسلوبي في التطوير.",
    },
    aboutHighlights: [
      {
        title: "الأساس أولاً",
        description:
          "أهتم بفهم الأفكار الأساسية خلف الأدوات، حتى أبني بثقة بدلاً من اتباع الدروس فقط.",
      },
      {
        title: "تفكير المنتج",
        description:
          "أحب بناء تدفقات كاملة: تسجيل دخول، لوحات تحكم، نماذج بيانات، مدفوعات، والتفاصيل الصغيرة التي تجعل التطبيق يبدو حقيقياً.",
      },
      {
        title: "التعلّم بالبناء",
        description:
          "أفضل تقدمي يأتي من بناء مشاريع حقيقية، اختبار الأفكار، وتحسينها حتى تصبح مفيدة ومصقولة.",
      },
    ],
    projects: [
      {
        title: "Tech Store",
        eyebrow: "مشروع مميز",
        description:
          "تطبيق تجارة إلكترونية شامل مع تسجيل دخول، إدارة منتجات، منطق سلة، Stripe Checkout، طلبات، تقييمات، ولوحة تحكم للمسؤول.",
        websiteHref: "https://tech-store.yamanwarda.dev",
        githubHref: "https://github.com/InfiniteWorld123/tech-store",
        status: "live",
        ctaLabel: "فتح GitHub",
        tags: ["تجارة إلكترونية", "تطوير شامل"],
      },
      {
        title: "SkillForge",
        eyebrow: "المشروع القادم",
        description:
          "منصة تعليم حديثة يستطيع فيها المدرسون نشر الدورات، ويتعلم فيها الطلاب من خلال الدروس والاختبارات وتتبع التقدم.",
        status: "coming-soon",
        ctaLabel: "قريباً",
        tags: ["LMS", "تطوير شامل"],
      },
    ],
    skills: [
      { name: "React", icon: "react", url: "https://react.dev" },
      { name: "TypeScript", icon: "typescript", url: "https://www.typescriptlang.org" },
      { name: "Node.js", icon: "nodejs", url: "https://nodejs.org" },
      { name: "PostgreSQL", icon: "postgresql", url: "https://www.postgresql.org" },
      { name: "TanStack Start", icon: "tanstack", url: "https://tanstack.com/start" },
      { name: "Hono.js", icon: "hono", url: "https://hono.dev" },
      { name: "Tailwind CSS", icon: "tailwind", url: "https://tailwindcss.com" },
    ],
    ui: {
      languageLabel: "اللغة",
      languageOptions: { de: "Deutsch", en: "English", ar: "العربية" },
      viewGitHub: "عرض GitHub",
      portfolioNavigation: "تنقل ملف الأعمال",
      openNavigationMenu: "فتح قائمة التنقل",
      connectCta: "تواصل معي",
      projectsCta: "عرض المشاريع",
      addPhoto: "أضف صورتك هنا",
      aboutBadge: "من أنا",
      aboutTitle: "بسيط في الواجهة، قوي في الأساس.",
      projectsBadge: "المشاريع",
      projectsTitle: "مشاريع مختارة بتركيز واضح.",
      projectsDescription:
        "ملف الأعمال الصغير يكون أقوى عندما يكون لكل مشروع سبب واضح لوجوده هنا، لذلك يبقى هذا القسم مختصراً عن قصد.",
      seeAllGitHub: "عرض الكل على GitHub",
      statusLabels: { live: "مباشر", "coming-soon": "قريباً", placeholder: "محجوز" },
      visitWebsite: "زيارة الموقع",
      viewOnGitHub: "عرض على GitHub",
      contactBadge: "تواصل",
      contactTitle: "لنتحدث إذا كان العمل مناسباً.",
      contactDescription:
        "أركز على بناء طريقي الخاص، ومنفتح على التعاون عندما تكون الفكرة والاتصال مناسبين.",
      contactEmailTitle: "البريد الإلكتروني",
      contactGithubTitle: "GitHub",
      contactLocationTitle: "الموقع",
      formTitle: "إرسال رسالة",
      formDescription: "أرسل رسالة مباشرة إلى بريدي.",
      nameLabel: "الاسم الكامل",
      namePlaceholder: "اسمك",
      emailLabel: "البريد الإلكتروني",
      emailPlaceholder: "name@example.com",
      messageLabel: "الرسالة",
      messagePlaceholder: "أخبرني باختصار عمّا تفكر به.",
      sendMessage: "إرسال الرسالة",
      sending: "جارٍ الإرسال...",
      directEmailHint: "يمكنك أيضاً مراسلتي مباشرة عبر البريد إذا كان ذلك أسهل.",
      sentMessage: "تم إرسال الرسالة بنجاح.",
      redirectedMessage: "يجب أن يفتح تطبيق البريد مع رسالة جاهزة.",
      errorMessage: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
      invalidMessage: "يرجى تصحيح الحقول المحددة أعلاه.",
      sendingMessage: "جارٍ إرسال رسالتك...",
      nameError: (length) => `يجب أن يكون الاسم حرفين على الأقل. عدد الأحرف المدخلة: ${length}.`,
      emailRequiredError: "البريد الإلكتروني مطلوب. مثال: name@example.com.",
      emailInvalidError: "يرجى إدخال بريد إلكتروني صالح. مثال: name@example.com.",
      messageError: (length) => `يجب أن تكون الرسالة 10 أحرف على الأقل. عدد الأحرف المدخلة: ${length}.`,
      mailSubject: (name) => `استفسار من ملف الأعمال من ${name}`,
      mailBody: (name, email, message) => `الاسم: ${name}\nالبريد الإلكتروني: ${email}\n\n${message}`,
    },
  },
};

export const defaultLanguage: Language = "de";
export const navigation = portfolioContent[defaultLanguage].navigation;
export const profile = portfolioContent[defaultLanguage].profile;
export const aboutHighlights = portfolioContent[defaultLanguage].aboutHighlights;
export const projects = portfolioContent[defaultLanguage].projects;
export const skills = portfolioContent[defaultLanguage].skills;
