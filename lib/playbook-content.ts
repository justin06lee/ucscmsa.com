// The Playbook's starting content: general task categories, each with plain
// numbered steps. Facts come from the fact-checked guides (2026-10). Admins
// edit the live copy in the database; this is only what a fresh database is
// seeded with. College funding contacts live only in the live database.

export type SeedStep = {
  title: string;
  body: string;
  whenNote?: string;
  leadDays: number | null;
  formLabel?: string;
  formUrl?: string;
};
export type SeedCategory = { slug: string; name: string; summary: string; steps: SeedStep[] };

export const EVENT_PROPOSAL_URL =
  "https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=649e3cb3-3650-479f-a4b9-bf1ae2d7e7de&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2";
export const PURCHASE_REQUEST_URL =
  "https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=72406750-4802-4826-a97f-81bf1b2b6dca&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2";

const proposalForm = { formLabel: "Event Proposal form", formUrl: EVENT_PROPOSAL_URL };

export const PLAYBOOK_SEED: SeedCategory[] = [
  {
    slug: "event-proposal",
    name: "Event proposal",
    summary: "Every event starts here. File it before anything else.",
    steps: [
      {
        title: "File the Event Proposal",
        leadDays: 7,
        ...proposalForm,
        body: [
          "Every event needs an Event Proposal before you book a room, order food or post a flyer. Your Authorized Representative files it.",
          "How early depends on the size of the event:",
          "- Small (up to 50 people, under $700): 5 business days before",
          "- Medium (up to 100 people, under $1,400): 2 weeks before",
          "- Large (up to 250 people): 6 weeks before",
          "- Major (more than 250 people, or open to the public): 8 weeks before",
          "Say in the proposal if you'll serve food. Students can't sign contracts.",
        ].join("\n"),
      },
      {
        title: "Meet an advisor",
        // The planner stretches this with the event's size, like the proposal.
        leadDays: 7,
        body: [
          "- Small events (up to 50 people): a Peer Advisor drop-in is enough.",
          "- Medium, large and major events: book a SOMeCA advisor meeting.",
          "Fundraisers need a meeting with a Peer Advisor and/or SOMeCA advisor.",
          "Selling food at a fundraiser? It must be store-bought and pre-packaged, and it needs a food permit through your advisor.",
          "Planning a prize drawing? Raffles are illegal. Free-entry drawings are OK.",
        ].join("\n"),
      },
      {
        title: "Ask for a tent or AV equipment",
        whenNote: "Only if you need a tent, mics or a projector",
        leadDays: 14,
        formLabel: "Tent request form",
        formUrl: "https://forms.gle/LWTZSTPW5xryuFXc7",
        body: [
          "Tent: fill in the tent request form.",
          "AV equipment (mics, speakers, projector): reserve it with Learning Technologies at least 2 weeks ahead: https://its.ucsc.edu/av-checkout",
        ].join("\n"),
      },
      {
        title: "Going off campus? Talk to your advisor",
        whenNote: "Only if the event is off campus",
        leadDays: 35,
        body: [
          "UCSC has no official off-campus events. Talk it through with your advisor before you plan anything.",
          'If members go somewhere off campus anyway, every post about it must say: "This is not a UCSC-sponsored activity." Students can\'t sign contracts.',
        ].join("\n"),
      },
      {
        title: "Get a food permit",
        whenNote: "Only if you serve, give away or sell food",
        leadDays: 14,
        formLabel: "EH&S food safety",
        formUrl: "https://ehs.ucsc.edu/industrial-hygiene/food-safety/",
        body: [
          "Any food at the event needs a food permit, even a free giveaway. Ask your SOMeCA advisor and EH&S at least 2 weeks ahead.",
          "Someone serving the food needs the yearly food safety training.",
          "Food you sell must be store-bought and pre-packaged. Nothing from home kitchens.",
        ].join("\n"),
      },
      {
        title: "Paying a speaker or performer? Start the paperwork",
        whenNote: "Only if you pay a speaker or performer",
        leadDays: 21,
        body: [
          "Speakers and performers are paid by purchase order before the event, never in cash. An event with one counts as at least medium size.",
          "First time UCSC pays them? They need a 204 Payee Setup first. It takes about 10 business days.",
          "Then send the services Purchase Request at least 10 business days ahead (see Purchase orders & receipts).",
        ].join("\n"),
      },
      {
        title: "Fundraiser? Meet an advisor about it",
        whenNote: "Only for a fundraiser",
        leadDays: 7,
        body: [
          "Fundraisers need a meeting with a Peer Advisor and/or SOMeCA advisor.",
          "Food you sell must be store-bought and pre-packaged, and it needs a food permit. Raffles are illegal; free-entry drawings are OK.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "reserve-a-room",
    name: "Reserve a room",
    summary: "Book a space on campus for your event or meeting.",
    steps: [
      {
        title: "File the Event Proposal first",
        leadDays: 21,
        ...proposalForm,
        body: "Rooms are booked for approved events, so file the Event Proposal and send the room request the same week, about 3 weeks out.",
      },
      {
        title: "Pick a space",
        leadDays: 21,
        formLabel: "Spaces directory",
        formUrl: "https://spaces.ucsc.edu/spaces-directory/",
        body: [
          "Look up rooms, how many people they hold, and who books each one.",
          "Just a small meeting? A library study room is easiest: https://guides.library.ucsc.edu/reserve-a-study-room",
        ].join("\n"),
      },
      {
        title: "Send the booking request",
        leadDays: 21,
        body: [
          "Each kind of space has its own form:",
          "- College lounges (Mary Holmes, Namaste, Hitchcock, Red Room), 7 business days ahead: https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform",
          "- Redwood Lounge or Deck (UCSC login): https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform",
          "- Staffed event centers (like Stevenson Event Center), 3 weeks ahead: https://docs.google.com/forms/d/e/1FAIpQLScxyOgk_d_8DK7_7gaOCocRYW6uO_VyGbmq2tAgttBRQj4oAg/viewform",
          "- Classrooms, 5 business days ahead: https://classroomreservations.ucsc.edu/",
        ].join("\n"),
      },
      {
        title: "Wait for the confirmation email",
        leadDays: 14,
        body: [
          "Sending the form doesn't book the room. It's yours only when the confirmation email arrives.",
          "No reply after 7 business days? Email the office that runs the space.",
          "Need to cancel? Do it more than 48 hours ahead.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "get-funding",
    name: "Get funding",
    summary: "Money for food and supplies. Skip it if you don't need any.",
    steps: [
      {
        title: "File the Event Proposal first",
        leadDays: 35,
        ...proposalForm,
        body: "Funding requests ask about your event, so file the Event Proposal before you ask for money.",
      },
      {
        title: "Pick where the money comes from",
        whenNote: "Skip if you don't need money",
        leadDays: 35,
        formLabel: "Campus funding guide",
        formUrl: "https://getinvolved.ucsc.edu/student-organizations/funding/",
        body: [
          "Read the campus funding guide, then pick one or more sources:",
          "- CEP: https://forms.gle/bXRQDfxdeSDdCuhx8",
          "- DSAS, apply 3 or more weeks ahead: https://studentsuccess.ucsc.edu/community/student-funding/",
          "- A college's student government (next step)",
        ].join("\n"),
      },
      {
        title: "Ask a college for funding",
        whenNote: "Only if you ask a college",
        leadDays: 35,
        body: [
          "Each college has its own form. Fill it in, email the college to get on their meeting agenda, then present your event for about 5 minutes.",
          "",
          "- Cowell: https://docs.google.com/forms/d/1Bczscq4YpYocvcTpCKc1qYKu8M7MyZC4CuM6ZPBWyUQ/viewform then email csenate@ucsc.edu",
          "- Stevenson: https://forms.gle/gqCz7mBAirm57vFK6 then email stevensonstudentcouncil@ucsc.edu. Up to $500. Apply a month ahead.",
          "- Crown: https://forms.gle/xEUxysogfbcbP6tz8 by Thursday 4pm the week before, then email crownsen@ucsc.edu. They meet Mondays at 8pm.",
          "- Merrill: https://bit.ly/MSG-funding-request then email msgcore-group@ucsc.edu. Apply 2 to 3 weeks ahead.",
          "- Porter: the forms on https://porter.ucsc.edu/student-opportunities/student-government then email portersenatetreasurer@ucsc.edu by Wednesday 4pm.",
          "- Kresge: https://bit.ly/ParliamentFunding25-26 then email kc_parl@ucsc.edu, 2 weeks before you present.",
          "- Oakes: https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform then email oakessen@ucsc.edu. Bring the paper award form.",
          "- Rachel Carson: https://docs.google.com/a/ucsc.edu/forms/d/1o3gnwRD7w4kGrB_yM6_EiJDPv-crlxLnr2Z_uQpMhjs/viewform then email rccouncil@ucsc.edu",
          "- College Nine: https://docs.google.com/forms/d/e/1FAIpQLSdQQNDPuf9xNzIHcgeyj8B4bzZm9wVN2fZPRmtlbEQ_7voZJg/viewform then email c9senate@ucsc.edu. Funds in rounds. No food.",
          "- John R. Lewis: email jrlgoco@ucsc.edu",
          "",
          "Stevenson, Crown and College Nine only fund events that serve their students. No alcohol, and nothing after the fact. Some forms are from last year's pages, so check the college's page first.",
        ].join("\n"),
      },
      {
        title: "Spend it through the campus account",
        leadDays: 7,
        body: "Funding is never handed out as cash. It goes to the org's campus account, and you spend it with a purchase order (see Purchase orders & receipts).",
      },
    ],
  },
  {
    slug: "purchase-orders",
    name: "Purchase orders & receipts",
    summary: "Buying food or anything else with org money.",
    steps: [
      {
        title: "New vendor? Get the 204 payee setup",
        whenNote: "Only if UCSC hasn't paid this vendor before",
        leadDays: 21,
        formLabel: "204 Payee Setup",
        formUrl: "https://financial.ucsc.edu/Pages/WF_Payee_Setup_204.aspx",
        body: "A business UCSC hasn't paid before needs a 204 Payee Setup first. It takes about 10 business days.",
      },
      {
        title: "Send the speaker or performer's Purchase Request",
        whenNote: "Only if you pay a speaker or performer",
        leadDays: 14,
        formLabel: "Purchase Request form",
        formUrl: PURCHASE_REQUEST_URL,
        body: "Services need at least 10 business days. The purchase order has to be in place before they speak or perform.",
      },
      {
        title: "Send the Purchase Request",
        leadDays: 7,
        formLabel: "Purchase Request form",
        formUrl: PURCHASE_REQUEST_URL,
        body: [
          "Send it at least 5 business days before you need the order. Say in the Event Proposal that you'll serve food before you order any.",
          "Full catering must be UCSC Catering or an approved caterer. Restaurant takeout is fine. Ask UCSC Catering about halal before ordering.",
          "Pay speakers by purchase order beforehand. No self-serve buffets.",
        ].join("\n"),
      },
      {
        title: "Keep the itemized receipt",
        leadDays: 0,
        body: "Get an itemized receipt that lists each item and price, not just the total. You need the original for any reimbursement.",
      },
    ],
  },
  {
    slug: "promote",
    name: "Promote the event",
    summary: "Flyers and posts so people know to come.",
    steps: [
      {
        title: "Make the flyer",
        leadDays: 14,
        body: [
          "Make it once the room is confirmed, so the flyer shows the right place.",
          "Every flyer needs:",
          "- the org name",
          "- a removal date",
          '- the access line: "If you have disability-related needs, contact [name] at [email] as soon as possible."',
          'Printed flyers can be at most 17×22".',
        ].join("\n"),
      },
      {
        title: "Post it",
        leadDays: 13,
        body: [
          "Share it on Instagram and in the WhatsApp group, and add the event to this site's calendar.",
          "Printed flyers go on designated boards only, following each college's posting rules. No chalking. Banners need approval.",
        ].join("\n"),
      },
      {
        title: "Table at the library",
        whenNote: "Only if you want a table",
        leadDays: 7,
        formLabel: "Library tabling form",
        formUrl:
          "https://docs.google.com/forms/d/e/1FAIpQLSeRImnhgI5NPfOR90zXyxijX6x_pgHcaj_PSP0PBpD7hzG1gg/viewform",
        body: "Quarry Plaza tabling is closed until Fall 2027, so table at the library instead.",
      },
      {
        title: "Send a reminder",
        leadDays: 1,
        body: "Post a short reminder the day before, with the time and place.",
      },
    ],
  },
  {
    slug: "after-the-event",
    name: "After the event",
    summary: "Wrap up: attendance, money back, thank-yous.",
    steps: [
      {
        title: "Keep an attendance log",
        leadDays: 0,
        body: "On the day, write down everyone's name and email.",
      },
      {
        title: "Thank people and post photos",
        leadDays: -2,
        body: "Thank the volunteers and anyone who helped, and share a few photos.",
      },
      {
        title: "File reimbursements",
        whenNote: "Only if someone paid out of pocket",
        leadDays: -14,
        body: [
          "File within 2 weeks (4 at most), with the original itemized receipt and proof of payment.",
          "A different Authorized Representative submits it.",
          "Gift cards, alcohol, gas and services are never reimbursed.",
        ].join("\n"),
      },
    ],
  },
];
