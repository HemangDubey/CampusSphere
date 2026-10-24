// One-off generator for the four static information pages (about, contact, privacy, terms).
// The generated HTML is committed; this script is kept only so the pages stay consistent.
const fs = require('fs');
const path = require('path');

const pages = {
  about: {
    title: 'About', label: 'About CampusSphere', heading: 'A smarter way<br><em>to campus</em>',
    body: `<p>CampusSphere is a student project built for a Front End Design and Testing course. It brings a student dashboard, campus events, a travel explorer, campus resources, a demonstration healthcare section, a demonstration checkout, interactive event labs and an AI Assistant into one app.</p>
      <p>Much of the content is <strong>sample or demonstration data</strong> and is labelled that way where you see it. CampusSphere is not connected to any university system and does not show official campus information.</p>`
  },
  contact: {
    title: 'Contact', label: 'Contact', heading: 'Get in<br><em>touch</em>',
    body: `<p>CampusSphere is a coursework project and does not run a support desk. No email address or phone number is published here because none has been set up.</p>
      <p>For questions about the project, please contact the course instructor or the student team who submitted it. For anything about your real campus services, use your institution's official channels.</p>`
  },
  privacy: {
    title: 'Privacy', label: 'Privacy', heading: 'Your data,<br><em>plainly</em>',
    body: `<p>This page describes how this demonstration app handles data. It is not legal advice and has not been reviewed by a lawyer.</p>
      <ul><li><strong>Account data:</strong> your name, email and a salted password hash are stored in the project's database. Passwords are never stored in plain text.</li>
      <li><strong>Session:</strong> signing in sets an HTTP-only cookie that identifies your session. Signing out ends the session on the server.</li>
      <li><strong>Records you create:</strong> event and course registrations, saved destinations and demonstration appointment requests are linked to your account and visible only to you (employee records are visible to administrators only).</li>
      <li><strong>Checkout demo:</strong> no card details are collected and nothing is stored.</li>
      <li><strong>AI Assistant:</strong> the messages you send are passed through the server to an AI service to generate a reply. Do not share sensitive personal information in the chat.</li>
      <li><strong>Voice:</strong> dictation and read-aloud use your browser's built-in features. CampusSphere does not record or store audio, but your browser may process dictation audio with its own speech service.</li>
      <li><strong>Labs:</strong> keystrokes and mouse movements in the labs stay in your browser.</li></ul>`
  },
  terms: {
    title: 'Terms', label: 'Terms', heading: 'Terms of<br><em>use</em>',
    body: `<p>CampusSphere is a student coursework project provided as is, for demonstration only.</p>
      <ul><li>Listings, prices, doctors, hospitals and events are sample data and must not be relied on.</li>
      <li>Healthcare features are not a medical service and no real appointment is booked. In an emergency, contact local emergency services.</li>
      <li>The checkout is a demonstration: no real payment is made and no transaction is created.</li>
      <li>The AI Assistant can be wrong and has no access to official campus data. Verify important information with your institution.</li>
      <li>Please do not enter real sensitive personal data into this demonstration.</li></ul>`
  }
};

for (const [slug, p] of Object.entries(pages)) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${p.title} | CampusSphere</title>
  <meta name="theme-color" content="#fdf8f3">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/campus.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="nav" data-nav></header>
  <main id="main" class="page">
    <div class="container info">
      <span class="label label--accent">${p.label}</span>
      <h1 class="display page__title">${p.heading}</h1>
      <div class="info__body">
      ${p.body}
      </div>
    </div>
  </main>
  <footer class="footer" data-footer></footer>
  <script type="module" src="/js/layout-only.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.resolve(__dirname, `../../frontend/pages/${slug}.html`), html);
}
console.log('written', Object.keys(pages).join(', '));
