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
      more: [{ label: 'FAQ', to: '/$lang/faq' }],
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
      faqLink: 'More on process, pricing, and ownership',
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
      body: 'An email is enough. Write a few lines about what you have in mind.',
      emailLabel: 'Email',
      locationLabel: 'Location',
      location: 'Erfurt, Germany · remote, with clients in Germany and beyond',
      languagesLabel: 'Languages',
      languages: 'German, English, Arabic',
    },
  },

  faq: {
    meta: {
      title: 'FAQ · How a project with me works',
      description:
        'Scope, prices, ownership, feedback rounds, and what happens after launch — the questions that come up before every project, answered in the open.',
    },
    eyebrow: 'FAQ',
    title: 'The questions that come before a yes.',
    intro:
      'Hiring a developer you have never met is a leap. These are the things people ask me, and a few they do not ask but should. If your question is not here, write to me and it will be.',
    groups: [
      {
        title: 'Before we start',
        items: [
          {
            question: 'How does a project actually start?',
            answer:
              'With a conversation, free and with no sales pressure. You describe what you need and what you already have. If I can help, you get a written proposal: what is included, what is not, and what it costs. Nothing is built before that is agreed.',
          },
          {
            question: 'Which of the three services do I need?',
            answer:
              'It follows the goal, not the size. If people need to find you and understand what you do, that is a website. If you sell products, that is an online store. If a process in your business runs on emails, files, and manual steps, that is custom software. If you are unsure, describe the goal and I will tell you.',
          },
          {
            question: 'What do you need from me?',
            answer:
              'What your business does, who your customers are, and what should be easier afterwards. Practically: whether you already have a domain, texts, photos, or an old site. If you have none of it, that is normal and we sort it together.',
          },
          {
            question: 'Do you work with clients outside Germany?',
            answer:
              'Yes. I am based in Erfurt and work remotely, in German, English, or Arabic. Prices are the same in euros wherever you are. What changes is the time zone we agree on for calls.',
          },
        ],
      },
      {
        title: 'Money and ownership',
        items: [
          {
            question: 'Why does every price say "from"?',
            answer:
              'Because the entry price is the smallest scope that still makes sense for that service. A five-page site and a twelve-page site in four languages are not the same job. The final number comes after I have reviewed what you actually need, and it is written down before anything starts.',
          },
          {
            question: 'How is payment split?',
            answer:
              'Usually in parts tied to progress rather than dates — at the start, at the agreed checkpoint, and on acceptance. The exact split is named in your proposal. Websites are also available as a monthly instalment, with ownership transferring to you.',
          },
          {
            question: 'Who owns the result?',
            answer:
              'You do. Domain, Shopify, and hosting accounts are set up in your name from the start, not mine. After full payment you receive the agreed deliverable and the usage rights to it.',
          },
          {
            question: 'Are there costs that do not go to you?',
            answer:
              'Yes, and I would rather you hear them now: a Shopify subscription, the domain, any paid apps, and payment processing fees go directly to those providers. I do not mark them up or resell them. Hosting and ongoing operations are available from me as an optional monthly service.',
          },
        ],
      },
      {
        title: 'Working together',
        items: [
          {
            question: 'What if I do not like the design?',
            answer:
              'You see the design direction before everything is built on top of it, which is the point at which changing it is cheap. Two feedback rounds are included. If the direction is wrong, we change it there rather than at the end.',
          },
          {
            question: 'How long does a project take?',
            answer:
              'The schedule is named in your proposal, because it depends on the scope. The honest part: the variable that moves it most is not my speed, it is how quickly texts, photos, product data, and decisions come back from your side.',
          },
          {
            question: 'Can I change my mind halfway through?',
            answer:
              'Yes, and it gets estimated before it gets built. A change to the goal is new work with its own price, agreed in writing. That is not a penalty — it is what keeps the original number honest.',
          },
        ],
      },
      {
        title: 'After launch',
        items: [
          {
            question: 'What happens once it is live?',
            answer:
              'Bugs inside the agreed scope are fixed for 30 days after launch, at no extra cost. For stores you also get training and a handover so you can run it yourself. Ongoing operations and further development are available on request, not assumed.',
          },
          {
            question: 'What counts as a bug and what counts as new work?',
            answer:
              'If something does not do what we agreed it would do, that is a bug and I fix it. A new page, a new role, a new integration, or a new idea is new work. I will always tell you which one I think it is, and why.',
          },
          {
            question: 'Do you do marketing or SEO?',
            answer:
              'No. I build, I do not market. The technical groundwork is done properly — speed, structure, mobile, metadata — but I do not run campaigns and I do not promise rankings or revenue. If that is what you need, you need an agency, and I will say so.',
          },
          {
            question: 'What if you are not around later?',
            answer:
              'Your accounts are in your name, and I build with ordinary, widely used tools rather than anything only I can maintain. Another developer can pick the project up. That is a deliberate choice: work you cannot leave is not work you own.',
          },
        ],
      },
    ],
  },

  notFound: {
    title: 'This page does not exist.',
    body: 'The link is old or mistyped.',
    link: 'Go to the start page',
  },
}
