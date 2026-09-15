import type { SiteContent } from './types'

export const en: SiteContent = {
  shell: {
    nav: [
      { label: 'Services', to: '/$lang/services' },
      { label: 'Work', to: '/$lang/work' },
      { label: 'Blog', to: '/$lang/blog' },
      { label: 'About', to: '/$lang/about' },
      { label: 'Contact', to: '/$lang/contact' },
    ],
    cta: 'Book a call',
    menu: { open: 'Open menu', close: 'Close menu', navigation: 'Main navigation' },
    language: { label: 'Language', names: { de: 'Deutsch', en: 'English', ar: 'العربية' } },
    theme: { light: 'Light theme', dark: 'Dark theme', system: 'System theme', label: 'Theme' },
    footer: {
      tagline: 'Websites, online stores, and custom software for small businesses.',
      location: 'Erfurt, Germany',
      email: 'Email',
      links: 'Pages',
      builtWith: 'This website and the admin behind it are self-built.',
      more: [
        { label: 'FAQ', to: '/$lang/faq' },
        { label: 'Stack', to: '/$lang/stack' },
      ],
      legal: [
        { label: 'Impressum', to: '/$lang/impressum' },
        { label: 'Privacy', to: '/$lang/datenschutz' },
      ],
    },
  },

  home: {
    meta: {
      title: 'Yaman Warda · Web and software developer from Erfurt',
      description:
        'Yaman Warda plans and builds websites, online stores, and custom software — from Erfurt and remotely, in German, English, or Arabic.',
    },
    hero: {
      eyebrow: 'Independent web and software developer from Erfurt',
      greeting: 'Hi, I’m Yaman Warda.',
      prefix: 'Websites · Online stores · Software',
      typed: ['WEB', 'SHOP', 'SOFTWARE'],
      staticLine: 'DEVELOPER',
      headline: 'Your direct partner for digital projects.',
      sub: 'I listen, plan clearly, and build something you can genuinely use.',
      cta: 'Book a call',
      secondary: 'Write a message',
      availability: 'At home in Erfurt · working with you remotely',
    },
    story: {
  "eyebrow": "Understand",
  "title": "An idea becomes something that works.",
  "sub": "A small look at how a thought becomes a digital tool for your everyday work.",
  "steps": [
    {
      "label": "Understand",
      "title": "What should become easier?",
      "body": "We look at your workflow: who sends the request, what information is missing, and what needs to happen next?"
    },
    {
      "label": "Shape",
      "title": "The idea takes shape.",
      "body": "Requirements become clear paths and early screens. You see how your product will work before we build it."
    },
    {
      "label": "Build",
      "title": "Everything comes together.",
      "body": "Interface, logic, and data become one system. We test the real workflow together before it goes live."
    }
  ],
  "demo": {
    "caption": "Workflow illustration · not a client project",
    "project": "Requests & appointments",
    "notes": [
      "Requests in one place",
      "A clear appointment schedule",
      "Always know the next step"
    ],
    "navigation": [
      "Overview",
      "Requests",
      "Appointments"
    ],
    "request": "New request",
    "appointment": "Choose an appointment",
    "confirmed": "Appointment confirmed",
    "action": "View request"
  }
},
    services: {
      eyebrow: 'Services',
      title: 'What I can build for you.',
      sub: 'A clear digital home for your business, an online store ready to launch, or a system shaped around the way you work.',
      cards: {
        websites: 'One clear place online where people understand what you do and how to reach you.',
        shopify: 'An online store ready to launch — and ready for you to run afterwards.',
        software:
          'A digital solution that fits your workflow instead of forcing you into someone else’s process.',
      },
      more: 'See details',
    },
    work: {
      eyebrow: 'Work',
      title: 'What I’ve built.',
      sub: 'These are my own projects, not client work. I show them so you can see how I turn an idea into a complete, working product.',
      all: 'All projects',
    },
    process: {
      eyebrow: 'Working together',
      title: 'How an idea becomes a working project.',
      sub: 'You know your business and your goal. I take care of planning and technical delivery, with clear moments where you help guide the direction.',
      steps: [
        {
          title: 'Tell me what you want to achieve.',
          body: 'An unfinished idea is enough. We talk about your goal, what is difficult today, and what should work better.',
        },
        {
          title: 'We define the right scope.',
          body: 'I sort out what the first version truly needs. For a clear scope, you receive a written proposal; for complex workflows, we first define the most useful starting point.',
        },
        {
          title: 'I build — you see the important steps.',
          body: 'I lead the technical delivery. You see the direction early and give feedback at agreed checkpoints.',
        },
        {
          title: 'You launch — and know who to ask.',
          body: 'After handover, you still have a clear point of contact. I fix defects within the agreed scope and post-launch period, and we can keep building when the next step is right.',
        },
      ],
    },
    fit: {
      eyebrow: 'Fit',
      title: 'Who this is for',
      forTitle: 'A good fit if you',
      forItems: [
        'run a new business and need a credible presence.',
        'have a local business whose customers come through Google and referrals, and want one clear place for all the information.',
        'have a website that no longer reflects the level you work at today.',
        'want to sell online and need a store you can run yourself afterwards.',
        'want to move a process that lives in emails and spreadsheets into a system.',
      ],
      notForTitle: 'A poor fit if you',
      notForItems: [
        'are looking for guaranteed Google rankings or revenue promises. I do not make them.',
        'need a marketing agency. I build, I do not market.',
        'are only looking for the cheapest option.',
      ],
      honesty:
        'If your existing website is fast, works on a phone, and does its job, I will tell you. Then you do not need me right now.',
    },
    about: {
      eyebrow: 'About',
      title: 'One developer, one point of contact.',
      body: 'I am Yaman Warda, an independent web and software developer from Erfurt. I plan and build websites, online stores, and custom web applications.',
      link: 'More about me',
    },
    cta: {
      title: 'Tell me about your idea.',
      body: 'You do not need a finished plan. Tell me what you want to build or make easier, and we will find the right next step.',
      button: 'Request a call',
      alt: 'Or email me directly',
    },
  },

  services: {
    meta: {
      title: 'Services · Websites, online stores, custom software',
      description:
        'Websites from €990, online stores from €2,490, and custom software from €2,990. Together, we work out the right first step for your project.',
    },
    eyebrow: 'Services',
    title: 'The right digital solution for your project.',
    intro:
      'You do not need to know which technology you need. Tell me what you want to show, sell, or make easier — then we will find the right way forward.',
    from: 'from',
    items: {
      websites: {
        name: 'Websites',
        short: 'A clear, professional place where people understand what you do and how to reach you.',
        promise:
          'I plan and build a website that presents your business clearly and makes the next step easy for visitors — from the first structure through to launch.',
        audienceTitle: 'A good fit if you',
        audience: [
          'want to launch a new business with a professional presence.',
          'run a local business and want all essential information in one clear place.',
          'have an existing website that no longer reflects your current standard.',
          'need a clear place for enquiries, contact, or simple bookings.',
        ],
        includesTitle: 'This can include',
        includes: [
          'a clear page structure and the technical build.',
          'a presentation that works reliably on mobile and desktop.',
          'contact, enquiry, or simple booking options.',
          'support to organise your content and publish the site.',
        ],
        priceTitle: 'Starting price',
        price: 'from €990',
        priceNote:
          'The starting price fits a small, clearly defined website project. We will assess page scope, bespoke design, additional languages, and functionality together before you receive a written proposal.',
      },
      shopify: {
        name: 'Online stores',
        short: 'An online store you can launch with — and run yourself afterwards.',
        promise:
          'I build a clear online store with a solid foundation for products, the buying journey, and handover. When Shopify suits your project, it is usually the right foundation.',
        audienceTitle: 'A good fit if you',
        audience: [
          'want to sell your products online for the first time.',
          'want to organise or improve an existing store more clearly.',
          'need a store you can manage yourself after handover.',
          'need a suitable setup for products, variants, payment, and shipping.',
        ],
        includesTitle: 'This can include',
        includes: [
          'the right store foundation and a presence that fits your brand.',
          'product structure, navigation, and the essential store pages.',
          'technical payment and shipping setup based on your requirements.',
          'a joint handover so you can run the store confidently afterwards.',
        ],
        priceTitle: 'Starting price',
        price: 'from €2,490',
        priceNote:
          'The starting price applies to a manageable new store with prepared product data. We review scope, data preparation, languages, migration, and integrations before the proposal. You pay Shopify, domain, app, and payment fees directly to the relevant providers.',
      },
      software: {
        name: 'Custom software',
        short: 'A digital tool that fits the way you work — instead of forcing you into someone else’s process.',
        promise:
          'I plan and build the smallest useful web application for your workflow: for example, an internal tool, booking system, client area, or first product version.',
        audienceTitle: 'A good fit if you',
        audience: [
          'have a process that is currently stuck in emails, spreadsheets, or manual work.',
          'want to bring data, tasks, or enquiries together in one reliable place.',
          'need an internal tool for yourself or your team.',
          'want to test a first real version of a digital product.',
        ],
        includesTitle: 'This can include',
        includes: [
          'a web application with exactly the features the first version needs.',
          'interface, logic, and data storage within the agreed scope.',
          'roles, an admin area, notifications, or an integration where they are genuinely needed.',
          'a technical foundation that can be developed further deliberately later.',
        ],
        priceTitle: 'Starting price',
        price: 'from €2,990',
        priceNote:
          'The starting price represents a small, clearly bounded software project. If several roles, integrations, payments, or a complex workflow are involved, I first need time to work out the right starting point. You will then receive a written proposal for the agreed scope.',
      },
    },
    shared: {
      title: 'What applies to every project',
      items: [
        {
          title: 'Clarity before implementation',
          body: 'Before we begin, we put in writing what the first version should do — and what it should not.',
        },
        {
          title: 'A price for the right scope',
          body: 'The prices on this page are starting points. I will give you the final price after I understand your project and review the scope.',
        },
        {
          title: 'Your accounts stay yours',
          body: 'Your domain, store, hosting, and other important accounts are held in your name.',
        },
        {
          title: 'A clear path after launch',
          body: 'I correct defects within the agreed scope during the agreed period. For operations, maintenance, or the next improvement, we can make an arrangement that fits.',
        },
      ],
      faqLink: 'Questions about process, pricing, and handover',
    },
    cta: {
      title: 'Not sure what you need yet?',
      body: 'That is completely fine. Briefly tell me what you want to show, sell, or make easier — I will help you identify the right first step.',
      button: 'Request a call',
    },
  },

  about: {
    meta: {
      title: 'About · Yaman Warda, web and software developer from Erfurt',
      description:
        'Yaman Warda is an independent web and software developer from Erfurt. He plans and builds websites, online stores, and custom web applications.',
    },
    eyebrow: 'About',
    title: 'Web and software developer. Your technical partner.',
    intro:
      'I am Yaman Warda, an independent web and software developer from Erfurt. I plan and build websites, online stores, and custom web applications — and take responsibility for the technical side of your project.',
    story: {
      title: 'How I look at projects',
      chapters: [
        {
          title: 'Technology needs a purpose',
          paragraphs: [
            'I am not interested in making an interface merely look good. Technology is useful when it helps a business present itself clearly, sell products, or make a workflow simpler and more reliable.',
          ],
        },
        {
          title: 'The whole thing needs to hold together',
          paragraphs: [
            'A website needs a clear presence and next step. A store needs products, a buying journey, and a useful handover. Software needs a workflow that still works tomorrow. That is why I think beyond individual pages and consider the system behind them.',
          ],
        },
        {
          title: 'Clarity is part of the work',
          paragraphs: [
            'Before I build anything, I want to understand what is genuinely needed. That lets us define the first version sensibly, explain it clearly, and develop it further deliberately later.',
          ],
        },
      ],
    },
    method: {
      title: 'How I work',
      items: [
        {
          title: 'Understand first, then build',
          body: 'I first look at your goal, your current workflow, and what is not working well. Then we decide what the first version actually needs.',
        },
        {
          title: 'Start usefully small',
          body: 'The first version should carry the core reliably. Everything else is added when there is a real reason for it.',
        },
        {
          title: 'Take responsibility for the technical side',
          body: 'I plan, build, and check the technical foundation within the agreed scope. You do not need to know every tool, but you should be able to understand the important decisions.',
        },
        {
          title: 'Recommend honestly',
          body: 'If a simple solution is enough or an existing tool fits better, I will say so openly. Not every problem needs custom software.',
        },
      ],
    },
    expect: {
      title: 'What working with me means',
      intro:
        'You work directly with the developer who understands and builds your project. That keeps communication, responsibility, and decisions in one place.',
      items: [
        {
          title: 'You talk to the person building it',
          body: 'I am your point of contact from the first assessment through handover. There is no handoff from a sales conversation to an unfamiliar development team.',
        },
        {
          title: 'A clear shared framework',
          body: 'Before implementation begins, we record what we are building, which decisions remain open, and how we will review progress together.',
        },
        {
          title: 'Important steps stay visible',
          body: 'You see the direction and agreed checkpoints before anything substantial becomes final. That keeps feedback useful and decisions understandable.',
        },
        {
          title: 'The handover is part of the job',
          body: 'Important accounts are held in your name. At the agreed finish, you should know what you can take over and when we can work together again on the next step.',
        },
      ],
    },
    platform: {
      title: 'This website is a project of my own',
      body: 'It is not a site builder or a bought template. I am developing it myself as a long-term platform for my work — from the public site to the tools taking shape behind it over time.',
      link: 'The technical side',
    },
    portraitAlt: 'Yaman Warda',
    cta: {
      title: 'Let us talk about your project.',
      body: 'You do not need a finished plan. Tell me what you want to build or make easier — then we will find the right first step.',
      button: 'Request a call',
      alt: 'Write me an email',
    },
  },

  work: {
    meta: {
      title: 'Work · Projects by Yaman Warda',
      description:
        'My own projects that show how I build: an online store with Stripe, a blogging platform, and a real-estate management system in progress.',
    },
    eyebrow: 'Work',
    title: 'Projects that show how I build.',
    intro:
      'Selected personal projects that make visible how I take products and systems from an idea to a working application.',
    status: { live: 'Live', building: 'In progress' },
    visit: 'Open website',
    source: 'Source code',
    detailLabel: 'View project',
    previous: "Previous projects",
    next: "Next projects",
    loadMore: "Load more projects",
    empty: "New projects will appear here.",
    shown: "{visible} of {total} projects",
    back: 'All projects',
    detail: {
      problem: 'Starting point',
      approach: 'What I built',
      shows: 'What the project shows',
      features: 'Features',
      stack: 'Technology',
    },
    items: {
      'tech-store': {
        name: 'Tech Store',
        kind: 'Online store',
        summary:
          'A complete online store with accounts, product management, cart, Stripe payment, orders, reviews, and an admin area.',
        problem:
          'A store is the hardest test for a web system: accounts, money, stock, and order status have to agree, or the operator loses money or trust.',
        approach:
          'I built the whole purchase path: a catalogue of 500 products across ten categories, narrowed by search and by filters for category, colour, storage, memory, and screen size, then the cart, the Stripe checkout, and the order view for customer and operator alike. It also carries the pages a German store owes its customers — right of withdrawal, returns, shipping — because a store you cannot legally sell from is not finished.',
        shows:
          'That I can carry a purchase from a filtered catalogue through payment to an order both sides can follow, and that I know what a German store has to answer for beyond the checkout button.',
        features: [
          'Registration, login, and customer account',
          'Product management with variants',
          'Search, filters, and sorting across the catalogue',
          'Cart and Stripe checkout',
          'Orders with status',
          'Withdrawal, returns, and shipping pages',
          'Reviews',
          'Admin dashboard',
        ],
      },
      inknest: {
        name: 'InkNest',
        kind: 'Blogging platform',
        summary:
          'A platform for writing and publishing with an editor, image uploads, comments, reactions, and notifications.',
        problem:
          'Publishing content sounds simple until the editor, images, comments, and notifications have to work together.',
        approach:
          'I built a rich-text editor with image uploads, comment threads, reactions, and notifications, all behind accounts. The discover page searches everything published and narrows it by category, by any of 25 tags, by sort order, and by page size, so a growing archive stays findable.',
        shows:
          'That I can build the half of a product that is content rather than transactions — writing, publishing, discussion, and finding things again — which is what portals, blogs, and internal knowledge bases actually run on.',
        features: [
          'Accounts and profiles',
          'Rich-text editor',
          'Image uploads',
          'Search, tags, and filtered discovery',
          'Comments and reactions',
          'Notifications',
        ],
      },
      'prime-estate': {
        name: 'Prime Estate',
        kind: 'Real-estate management system',
        summary:
          'A system for property providers: listings, enquiries, bookings, and a blog in one admin.',
        problem:
          'Property providers work with listings, prospects, viewing appointments, and content, often spread across several tools.',
        approach:
          'The system brings listing management, enquiry handling, bookings, and a blog into one application with one admin. It is in progress and the foundation for the architecture of this website.',
        shows:
          'How I structure a business system with several areas so that one operator can run it alone.',
        features: [
          'Listing management',
          'Enquiries and prospects',
          'Bookings',
          'Blog',
          'Admin area',
        ],
      },
    },
  },

  blog: {
    meta: {
      title: 'Blog · Yaman Warda',
      description:
        'Notes on building websites, online stores, and custom software: what search engines actually reward, what a small business should spend money on, and what I learned building my own platform.',
    },
    eyebrow: 'Blog',
    title: 'What I learn while building.',
    intro:
      'Short pieces on the questions clients keep asking me — about search, about cost, about what is worth building and what is not. Written in German, English, and Arabic.',
    empty: 'The first article is on its way.',
    allTags: 'All topics',
    readingTime: '{minutes} min read',
    readArticle: 'Read the article',
    loadMore: 'Load more articles',
    back: 'All articles',
    aboutProject: 'This article is about {project}.',
    seeProject: 'See the project',
    shown: '{visible} of {total} articles',
    feed: 'RSS feed',
    home: {
      eyebrow: 'Writing',
      title: 'What I learn while building.',
      sub: 'Short pieces on search, cost, and what is worth building.',
      all: 'All articles',
    },
  },

  contact: {
    meta: {
      title: 'Contact · Tell me about your project',
      description:
        'Describe your project briefly. You do not need a finished plan to start a conversation.',
    },
    eyebrow: 'Contact',
    title: 'Tell me about your project.',
    intro:
      'A few details help me understand the context. An unfinished idea is enough to work out the right next step.',
    form: {
      name: 'Name',
      email: 'Email',
      company: 'Company',
      companyOptional: 'optional',
      phone: 'Phone',
      phoneOptional: 'optional',
      projectType: 'What is it about? (optional)',
      projectTypes: [
        { value: 'unsure', label: 'Not sure yet' },
        { value: 'website', label: 'Website' },
        { value: 'shop', label: 'Online store' },
        { value: 'software', label: 'Custom web application or software' },
      ],
      budget: 'Budget range (optional)',
      budgets: [
        { value: 'unsure', label: 'Not sure yet' },
        { value: 'lt1500', label: 'up to €1,500' },
        { value: '1500-3000', label: '€1,500 to €3,000' },
        { value: '3000-6000', label: '€3,000 to €6,000' },
        { value: 'gt6000', label: 'over €6,000' },
      ],
      timeline: 'When would you roughly like your project to be ready?',
      timelineHint: 'A rough estimate is enough.',
      timelines: [
        { value: 'unsure', label: 'Not sure yet' },
        { value: 'weeks', label: 'In the next few weeks' },
        { value: '1-3', label: 'In 1 to 3 months' },
        { value: 'later', label: 'Later — I am still exploring' },
      ],
      message: 'Your project',
      messageHint: 'A few sentences about your goal are enough. If you already have something, you can mention it.',
      attachment: 'Attachment',
      attachmentHint: 'Optional: a PDF or image that helps explain the context (up to 5 MB)',
      attachmentChoose: 'Choose file',
      attachmentEmpty: 'No file chosen',
      attachmentRemove: 'Remove',
      submit: 'Send request',
      sending: 'Sending …',
      sent: {
        title: 'Thank you, the request is in.',
        body: 'I will review your request and reply through the contact method you prefer.',
      },
      error: 'That did not work. Please try again or email me directly.',
      errors: {
        name: 'Please enter your name.',
        email: 'Please enter a valid email address.',
        message: 'Please describe your project briefly.',
        attachment: 'Please choose a PDF, PNG or JPG file up to 5 MB.',
      },
    },
    aside: {
      title: 'Prefer to write directly?',
      body: 'An email is enough — even if it is about a collaboration or another question rather than a project.',
      emailLabel: 'Email',
      locationLabel: 'Location',
      location: 'Erfurt, Germany · remote, with clients in Germany and beyond',
      languagesLabel: 'Languages',
      languages: 'German, English, Arabic',
    },
  },

  faq: {
    meta: {
      title: 'FAQ · Questions about process, price, and handover',
      description:
        'Answers about starting a project, price ranges, working together, handover, and the technical groundwork for visibility.',
    },
    eyebrow: 'FAQ',
    title: 'Common questions, answered clearly.',
    intro:
      'Here are the most important answers about a project. If something is still open for your situation, we will clarify it in conversation.',
    groups: [
      {
        title: 'Before we start',
        items: [
          {
            question: 'How does a project actually start?',
            answer:
              'You describe your goal and what makes it difficult today. You do not need a finished plan. We work out whether and what makes sense; once the scope is clear, you receive a written proposal.',
          },
          {
            question: 'Which of the three services do I need?',
            answer:
              'It follows the goal, not the size. People need to understand your offer: a website. You want to sell products: an online store. A process depends on emails, files, and manual steps: custom software. If you are unsure, simply describe the goal.',
          },
          {
            question: 'Do I already need texts, images, or a domain?',
            answer:
              'No. It helps to know what you already have, such as a domain, text, photos, product data, or an existing site. If something is missing, we name what is needed for the agreed scope.',
          },
          {
            question: 'Do you work with clients outside Germany?',
            answer:
              'Yes. I work remotely from Erfurt in German, English, or Arabic. We simply agree on a suitable time for conversations.',
          },
        ],
      },
      {
        title: 'Scope and price',
        items: [
          {
            question: 'Why does every price say "from"?',
            answer:
              'The starting price is the smallest clear scope that makes sense for that service. The final proposal follows your real scope and records what will be built, what is outside it, and what it costs.',
          },
          {
            question: 'Who owns the accounts, and are there other costs?',
            answer:
              'Important accounts such as a domain, hosting, or shop accounts are created in your name when your project needs them. Third-party costs — for example a domain, hosting, apps, or payment providers — are explained up front and paid directly to those providers.',
          },
        ],
      },
      {
        title: 'During and after the project',
        items: [
          {
            question: 'How do delivery, handover, and the time after work?',
            answer:
              'The timeline follows the agreed scope. You review important directions early, before everything depends on them. If the goal changes later, we clarify the effort and price first. Handover includes the agreed access and what you need to use the result. Further development or operations can be agreed separately.',
          },
          {
            question: 'Do you do marketing or SEO?',
            answer:
              'I build the technical groundwork for speed, clear structure, mobile use, and discoverability. I do not promise campaigns, rankings, or revenue — marketing remains its own job.',
          },
        ],
      },
    ],
  },

  stack: {
    meta: {
      title: 'Stack · Technologies Yaman Warda works with',
      description:
        'A short overview of the technologies Yaman Warda uses to build web applications and their technical foundation.',
    },
    eyebrow: 'Stack',
    title: 'Technologies I work with.',
    intro:
      'A short technical overview. The right technology follows the project — not every job needs the same stack.',
    platform: {
      title: 'My technical foundation',
      body: 'This platform is my own technical project. I develop the public website and its foundation myself, and I am extending the administrative tools step by step inside the same platform.',
      layers: [
        { label: 'Frontend', value: 'TypeScript, React, TanStack Start' },
        { label: 'Backend and API', value: 'TypeScript, Elysia' },
        { label: 'Data', value: 'PostgreSQL, pg, parameterised SQL' },
        { label: 'Development and operations', value: 'Docker' },
      ],
    },
    built: {
      title: 'See it in practice',
      body: 'The projects show how I use this foundation for different products — from an online store and publishing platform to a business system in progress.',
      link: 'See the projects',
    },
    links: {
      title: 'Find more',
      email: 'Email me',
    },
  },

  legal: {
    impressum: {
      meta: {
        title: 'Impressum · Yaman Warda',
        description: 'Provider identification under § 5 DDG for yamanwarda.de.',
      },
      eyebrow: 'Impressum',
      title: 'Impressum',
      intro:
        'Provider identification under § 5 DDG. German law governs this page, and the German version is the binding one.',
      sections: [
        {
          title: 'Provider',
          lines: [
            'Mhd Yaman Warda',
            'Warschauer Str. 9',
            '99089 Erfurt',
            'Thuringia, Germany',
          ],
        },
        {
          title: 'Contact',
          lines: ['Email: info@yamanwarda.de'],
        },
        {
          title: 'Responsible for content under § 18 (2) MStV',
          lines: ['Mhd Yaman Warda', 'Warschauer Str. 9', '99089 Erfurt'],
        },
        {
          title: 'Consumer dispute resolution',
          body: 'I am neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.',
        },
        {
          title: 'Liability for content',
          body: 'As a service provider I am responsible for my own content on these pages under general law. I am not obliged to monitor transmitted or stored third-party information, or to investigate circumstances that indicate unlawful activity. Obligations to remove or block the use of information under general law remain unaffected. Liability in this respect begins only from the point at which a concrete infringement becomes known. If I become aware of such infringements, I will remove the content promptly.',
        },
        {
          title: 'Liability for links',
          body: 'This site contains links to external websites over whose content I have no influence. The respective provider or operator is always responsible for the content of linked pages. Those pages were checked for possible legal violations at the time of linking, and no unlawful content was apparent. Permanent monitoring of linked content without concrete evidence of an infringement is not reasonable. If I become aware of infringements, I will remove such links promptly.',
        },
        {
          title: 'Copyright',
          body: 'The content and works created by me on these pages are subject to German copyright law. Reproduction, adaptation, distribution, and any kind of exploitation beyond the limits of copyright require my written consent. Downloads and copies of this page are permitted for private, non-commercial use only.',
        },
      ],
      updated: 'Last updated: 10 September 2026',
    },
    privacy: {
      meta: {
        title: 'Privacy · Yaman Warda',
        description:
          'What yamanwarda.de processes: server logs, forms, security checks, and strictly necessary cookies. No tracking, no advertising.',
      },
      eyebrow: 'Privacy',
      title: 'Privacy policy',
      intro:
        'This site collects as little as it can. There are no analytics tools, no advertising networks, and no cross-site tracking. What is actually processed is listed here in full. The German version is the binding one. This version is a technical draft, not legal advice or a legal guarantee.',
      sections: [
        {
          title: 'Controller',
          lines: [
            'Mhd Yaman Warda',
            'Warschauer Str. 9',
            '99089 Erfurt, Germany',
            'Email: info@yamanwarda.de',
          ],
        },
        {
          title: 'Hosting and server logs',
          body: 'This site is delivered through Cloudflare Workers and Cloudflare’s network. When you open a page, Cloudflare processes technically necessary connection and security data, in particular your IP address, date and time, the requested path, transferred data volume, and browser information. The legal basis is Art. 6 (1) (f) GDPR: my legitimate interest in secure, fast, and reliable delivery. Processing on my behalf is governed by the data-protection terms agreed with Cloudflare.',
        },
        {
          title: 'Protection against automated abuse (Cloudflare Turnstile)',
          body: 'I use Cloudflare Turnstile when someone signs in to the administration area or submits the contact or booking form. It processes technical signals such as IP address, browser and device information, and the result of the security check to distinguish people from automated attacks. The result is verified on the server and is not used for advertising. The legal basis is Art. 6 (1) (f) GDPR: my legitimate interest in protecting accounts, forms, and stored data against abuse.',
        },
        {
          title: 'Contact form and email',
          body: 'If you use the contact form, the following are processed: your name, email address, optionally company and phone number, your answers on preferred channel, project type, budget and timeline, your project description, and an optional file (PDF, PNG, or JPG, up to 5 MB). These are delivered to me as an email; I use the service Resend to send it. The legal basis is Art. 6 (1) (b) GDPR for steps prior to a contract, otherwise Art. 6 (1) (f) GDPR. I keep your enquiry for as long as handling it requires and delete it afterwards, unless a statutory retention period applies.',
        },
        {
          title: 'Cookies',
          body: 'The public site uses only technically necessary settings, such as the selected language. The private administration area additionally uses necessary session cookies for sign-in. These cookies are not used for advertising or cross-site tracking. The legal basis is § 25 (2) no. 2 TDDDG and Art. 6 (1) (f) GDPR. A consent banner is not provided for these necessary functions.',
        },
        {
          title: 'What does not happen',
          body: 'There is no web analytics, no statistics software, no advertising or retargeting pixels, no fonts embedded from third-party servers, and no social media plugins. No profiles are built and no automated decision-making takes place.',
        },
        {
          title: 'Your rights',
          lines: [
            'Access to the data held about you (Art. 15 GDPR)',
            'Rectification of inaccurate data (Art. 16 GDPR)',
            'Erasure (Art. 17 GDPR)',
            'Restriction of processing (Art. 18 GDPR)',
            'Data portability (Art. 20 GDPR)',
            'Objection to processing (Art. 21 GDPR)',
            'Complaint to a supervisory authority (Art. 77 GDPR)',
          ],
        },
        {
          title: 'Supervisory authority',
          body: 'Thüringer Landesbeauftragter für den Datenschutz und die Informationsfreiheit (TLfDI), Häßlerstraße 8, 99096 Erfurt. You may also contact the supervisory authority where you live.',
        },
        {
          title: 'Changes',
          body: 'If what this site processes changes, this policy changes with it. The date below tells you when it was last revised.',
        },
      ],
      updated: 'Last updated: 13 September 2026',
    },
  },

  notFound: {
    title: 'This page does not exist.',
    body: 'The link is old or mistyped.',
    link: 'Go to the start page',
  },
}
