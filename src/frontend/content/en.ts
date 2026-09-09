import type { SiteContent } from './types'

export const en: SiteContent = {
  shell: {
    nav: [
      { label: 'Services', to: '/$lang/services' },
      { label: 'Work', to: '/$lang/work' },
      { label: 'About', to: '/$lang/about' },
      { label: 'Contact', to: '/$lang/contact' },
    ],
    cta: 'Request a call',
    menu: { open: 'Open menu', close: 'Close menu', navigation: 'Main navigation' },
    language: { label: 'Language', names: { de: 'Deutsch', en: 'English', ar: 'العربية' } },
    theme: { light: 'Light theme', dark: 'Dark theme', system: 'System theme', label: 'Theme' },
    footer: {
      tagline: 'Websites, online stores, and custom software for small businesses.',
      location: 'Erfurt, Germany',
      email: 'Email',
      links: 'Pages',
      builtWith: 'This website and the admin behind it are self-built.',
    },
  },

  home: {
    meta: {
      title: 'Yaman Warda · Websites, online stores, and custom software from Erfurt',
      description:
        'Websites, online stores, and custom software for small businesses — planned and developed directly by Yaman Warda in Erfurt.',
    },
    hero: {
      eyebrow: 'Independent web and software developer from Erfurt',
      greeting: 'Hi, I am Yaman Warda.',
      prefix: 'Websites · Online stores · Software',
      typed: ['WEB', 'SHOP', 'SOFTWARE'],
      staticLine: 'DEVELOPER',
      headline: "Your idea. Built together.",
      sub: "Your direct technical partner for custom software and websites. From the first conversation to the finished product — thoughtfully built around your business.",
      cta: 'Request a call',
      secondary: 'See my work',
      availability: 'Available for new projects',
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
      title: 'What I build',
      sub: 'Three paths, depending on whether you need to be seen, sell online, or digitise a workflow.',
      more: 'See details',
    },
    work: {
      eyebrow: 'Work',
      title: "Projects from my workspace",
      sub: 'My own projects, shown because they demonstrate how I build. Client case studies follow once they are live.',
      all: 'All projects',
    },
    process: {
      eyebrow: 'Process',
      title: 'How a project runs',
      sub: 'Four steps, no surprises. You always know where the project stands and what it costs.',
      steps: [
        {
          title: 'Conversation',
          body: 'We clarify what you need, what you already have, and what the project should do. Free, with no sales pressure.',
        },
        {
          title: 'Fixed-price proposal',
          body: 'You get a written proposal: what is included, what is not, and what it costs. No open ends.',
        },
        {
          title: 'Build with checkpoints',
          body: 'You see the design direction before everything is built, and you give feedback in two rounds.',
        },
        {
          title: 'Launch and 30 days of bug fixing',
          body: 'After launch I stay on it: bugs within the agreed scope are fixed for 30 days. Operations and further development on request.',
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
      body: 'I am Yaman Warda, a developer in Erfurt. I taught myself to program and have been building complete systems ever since: interface, backend, database, operations. This website, including the admin behind it, is self-built.',
      link: 'More about me',
    },
    cta: {
      title: 'Tell me about your project.',
      body: 'Write a few lines about what you have in mind. You get an honest assessment, even if it says: you do not need this.',
      button: 'Request a call',
      alt: 'Or email directly',
    },
  },

  services: {
    meta: {
      title: 'Services · Websites, online stores, custom software',
      description:
        'Websites from €990, online stores — usually with Shopify — from €2,490, and custom software from €2,990. Scope, fit, and pricing in detail.',
    },
    eyebrow: 'Services',
    title: 'Three services. Three different outcomes.',
    intro:
      'Website, store, or software is decided by the goal, not the size: present your business, sell products, or run a process. Scope and complexity then set the price within the service.',
    from: 'from',
    items: {
      websites: {
        name: 'Websites',
        short: 'A fast, clear website that explains your business and leads visitors to a call, an enquiry, or a booking.',
        promise:
          'You get a professional, fast website that explains your business, presents information clearly, and makes it easy for visitors to take the next step. Design, publishing, and hosting are handled for you.',
        audienceTitle: 'Who it is for',
        audience: [
          'A new business that needs an official presence.',
          'A local business that gets customers through referrals, Google, or social media and needs one clear place for its information.',
          'A business with an outdated website that no longer reflects its current level.',
          'Anyone who wants a distinct visual presence beyond template builders.',
        ],
        includesTitle: 'What is included',
        includes: [
          'From a one-page website to a custom-designed company site.',
          'Structure and content sorted together so visitors find what they need quickly.',
          'Mobile, loading speed, and forms set up properly.',
          'Domain, email, and publishing configured.',
          'Two feedback rounds and 30 days of bug fixing after launch.',
          'Optionally: hosting and operations as a monthly service.',
        ],
        priceTitle: 'What it costs',
        price: 'from €990',
        priceNote:
          'The entry price covers a one-page website built on a proven design system. More pages, custom design, languages, and features raise the price. A custom-designed site starts at €1,990. Also available as a monthly instalment with ownership transferring to you.',
        boundaryTitle: 'What I do not promise',
        boundary:
          'No guaranteed number of customers, no guaranteed Google ranking. I guarantee the agreed scope, the technical quality, and a clear process.',
      },
      shopify: {
        name: 'Online stores',
        short: 'A store handed over ready to sell, which you run yourself afterwards.',
        promise:
          'I build a clear, operational online store — usually with Shopify: the foundation, the buying experience, and the handover, not just an installed theme.',
        audienceTitle: 'Who it is for',
        audience: [
          'A business launching its first store with clear products and data.',
          'A small or medium brand that wants a store it can manage after handover.',
          'An existing store that needs reorganising or migrating to Shopify.',
          'A business that needs a customised Shopify storefront or a manageable set of integrations.',
        ],
        includesTitle: 'What is included',
        includes: [
          'Shopify setup and a suitable theme adapted to your brand.',
          'Navigation, collections, and the essential store pages.',
          'Payment, shipping, and tax configured technically according to your decisions.',
          'Product templates and variants, with up to ten products as a starting catalogue.',
          'Domain, essential analytics, and a test order.',
          'Training, handover, and 30 days of bug fixing.',
        ],
        priceTitle: 'What it costs',
        price: 'from €2,490',
        priceNote:
          'The entry price covers a new, manageable store with ready data and a standard theme. Data preparation, design depth, languages, migration, and integrations are added as clearly named items. Shopify subscription, domain, apps, and payment fees are paid directly to the providers.',
        boundaryTitle: 'What I do not promise',
        boundary:
          'No revenue or conversion promises, no legal or tax advice. Legal texts come from you or a provider for that.',
      },
      software: {
        name: 'Custom software',
        short: 'Booking systems, internal tools, client portals, dashboards: the smallest version that truly carries your process.',
        promise:
          'I understand the process you want to improve and build the smallest web application that supports it clearly: interface, backend, database, and deployment sized to the agreed scope.',
        audienceTitle: 'Who it is for',
        audience: [
          'A business whose processes currently live in files, emails, and manual steps.',
          'A business that needs bookings, a client portal, or an internal dashboard.',
          'Founders who want to test a first real version of a subscription or SaaS product.',
          'A business that no off-the-shelf software fits, or that needs two tools connected.',
        ],
        includesTitle: 'What can be included',
        includes: [
          'Login and permissions, admin dashboard, payments or subscriptions.',
          'Email and notifications, uploads, search and filters.',
          'Reports, exports, APIs, and webhooks.',
          'Only what the first version needs. Nothing because it sounds good.',
        ],
        priceTitle: 'What it costs',
        price: 'from €2,990',
        priceNote:
          'The entry price is the smallest project that makes sense under this service: narrow, clear, testable. Systems with several roles, payments, and integrations sit well above it. The final price follows a first review of the scope. Usual payment: 40 / 30 / 30 percent at start, checkpoint, and acceptance.',
        boundaryTitle: 'What I do not promise',
        boundary:
          'No assurance that the system brings revenue or saves a specific amount. I guarantee a clear scope and the agreed technical quality. I do not modify third-party systems I cannot safely inspect and test.',
      },
    },
    shared: {
      title: 'What applies to all three',
      items: [
        {
          title: 'Fixed scope before the start',
          body: 'Nothing starts before it is written down what will be delivered and what will not. Changes to the goal are estimated before they are built.',
        },
        {
          title: 'Bugs are not new features',
          body: 'If something does not work as agreed, that is a bug and it is fixed for 30 days after launch. New pages, roles, or integrations are new work.',
        },
        {
          title: 'Your data, your accounts',
          body: 'Domain, Shopify, and hosting accounts are in your name. After full payment you receive the agreed deliverable and the usage rights.',
        },
        {
          title: 'Prices are entry points',
          body: '"From" means a small, clearly defined scope. Whether net or gross is stated in the proposal, depending on the tax situation at the time.',
        },
      ],
    },
    cta: {
      title: 'Not sure which service fits?',
      body: 'That is normal. Describe what you want to achieve and I will tell you what you need. Or that you do not need it.',
      button: 'Request a call',
    },
  },

  about: {
    meta: {
      title: 'About · Yaman Warda, developer in Erfurt',
      description:
        'Self-taught, fully built: who is behind the websites, stores, and systems, how I work, and why I built this platform myself.',
    },
    eyebrow: 'About',
    title: 'I build things that someone then uses every day.',
    intro:
      'I am Yaman Warda, a developer in Erfurt. I work alone, directly with you, and build complete systems rather than isolated parts.',
    story: {
      title: 'How I got here',
      paragraphs: [
        'I taught myself to program. Not with tutorials you type along to, but with real projects that had to be published and then received feedback.',
        'Along the way I noticed what I most like to build: not single screens, but whole flows. Sign-in, data model, payments, dashboards, and the small details that make software feel real.',
        'Today I build exactly that for small businesses: websites, stores, and systems that have to work in everyday use after handover.',
      ],
    },
    method: {
      title: 'How I work',
      items: [
        {
          title: 'Understand first, then build',
          body: 'I want to know how your process works today and where it gets stuck before I propose a solution.',
        },
        {
          title: 'Start small, deliver cleanly',
          body: 'The first version contains what carries the core. Extensions come when they are needed, not because they are possible.',
        },
        {
          title: 'Fundamentals over tricks',
          body: 'I build with tools I understand, so I can find bugs and explain to you what is happening.',
        },
        {
          title: 'Honest, even when it costs revenue',
          body: 'If your website is good enough or an off-the-shelf tool is enough, I will say so.',
        },
      ],
    },
    platform: {
      title: 'This website is an example',
      body: 'You are looking at a system I built entirely myself: the public site in three languages and, behind it, an admin for enquiries, content, clients, and invoices. No site builder, no third-party CMS. That is the kind of work I offer.',
    },
    portraitAlt: 'Yaman Warda',
    cta: {
      title: 'Let us talk about your project.',
      body: 'Tell me what you are working on. You get an honest assessment back — including when the answer is that you need something else.',
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
      'These are my own projects, not client work. I show them because they make visible how completely I build. Client case studies follow once they are live.',
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
          'I built the entire purchase path, from the product catalogue through the cart to payment with Stripe and the order overview for customer and operator. The admin area manages products, orders, and reviews.',
        shows:
          'That I can build a complete purchase process with payment, permissions, and administration end to end, not just the storefront.',
        features: [
          'Registration, login, and customer account',
          'Product management with variants',
          'Cart and Stripe checkout',
          'Orders with status',
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
          'I built a rich-text editor with image uploads, comment threads, reactions, and a notification system, all behind an account system.',
        shows:
          'That I can build content and community features of the kind portals, blogs, and internal knowledge bases need.',
        features: [
          'Accounts and profiles',
          'Rich-text editor',
          'Image uploads',
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

  contact: {
    meta: {
      title: 'Contact · Request a call',
      description:
        'Describe your project briefly. You get an honest assessment of whether and how I can help.',
    },
    eyebrow: 'Contact',
    title: 'Tell me about your project.',
    intro:
      'A few questions up front, so our conversation does not start from zero. I reply with an honest assessment.',
    form: {
      name: 'Name',
      email: 'Email',
      company: 'Company',
      companyOptional: 'optional',
      phone: 'Phone',
      phoneOptional: 'optional',
      preferred: 'How should I reach you?',
      preferredOptions: [
        { value: 'email', label: 'Email' },
        { value: 'call', label: 'Call' },
        { value: 'whatsapp', label: 'WhatsApp' },
      ],
      projectType: 'What is it about?',
      projectTypes: [
        { value: 'website', label: 'Website' },
        { value: 'shopify', label: 'Online store' },
        { value: 'software', label: 'Custom software' },
        { value: 'unsure', label: 'Not sure yet' },
      ],
      budget: 'Budget range',
      budgets: [
        { value: 'lt1500', label: 'up to €1,500' },
        { value: '1500-3000', label: '€1,500 to €3,000' },
        { value: '3000-6000', label: '€3,000 to €6,000' },
        { value: 'gt6000', label: 'over €6,000' },
        { value: 'open', label: 'Still open' },
      ],
      timeline: 'Timeline',
      timelines: [
        { value: 'asap', label: 'As soon as possible' },
        { value: '1-3', label: 'In the next 1 to 3 months' },
        { value: 'later', label: 'Later, I am exploring' },
      ],
      message: 'Your project',
      messageHint: 'What should be built? What do you already have: a domain, texts, an old site?',
      attachment: 'Attachment',
      attachmentHint: 'PDF, PNG or JPG, up to 5 MB',
      attachmentChoose: 'Choose file',
      attachmentEmpty: 'No file chosen',
      attachmentRemove: 'Remove',
      submit: 'Send request',
      sending: 'Sending …',
      sent: {
        title: 'Thank you, the request is in.',
        body: 'I will reply by email. If it is urgent, write to me directly.',
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
      body: 'An email is enough. A booking system for calls is coming to this page.',
      emailLabel: 'Email',
      locationLabel: 'Location',
      location: 'Erfurt, Germany · working across Germany, remote',
    },
  },

  notFound: {
    title: 'This page does not exist.',
    body: 'The link is old or mistyped.',
    link: 'Go to the start page',
  },
}
