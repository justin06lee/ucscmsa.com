UPDATE `guides` SET `title` = 'Book a room', `body` = '1. File the **Event Proposal** first (see "Run an event"). It''s required for every on-campus event.
2. Pick a space at https://spaces.ucsc.edu/spaces-directory/
3. Book it the way its page says:
   - **College lounges** (Stevenson Fireside, Mary Holmes, Namaste, Hitchcock, Red Room): https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform
   - **Redwood Lounge or Deck** (UCSC login): https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform
   - **Event centers** (e.g. Stevenson Event Center): https://docs.google.com/forms/d/e/1FAIpQLScxyOgk_d_8DK7_7gaOCocRYW6uO_VyGbmq2tAgttBRQj4oAg/viewform
   - **Classrooms:** https://classroomreservations.ucsc.edu/
   - **"Reserve now" spaces:** use the calendar on the space''s page.
4. Wait for the confirmation email. No reply in 7 business days? Email roomres@ucsc.edu and cc conf@ucsc.edu.

**Small meetings:** library study rooms at https://guides.library.ucsc.edu/reserve-a-study-room (4 hours a day, up to 1 week ahead, not for events).

**Gotchas:**
- The form doesn''t book the room; the email does.
- Lounges and event centers: 7 business days. Event centers needing staff: 3 weeks.
- Classrooms: 5 business days, no food, no weekday bookings until after Week 2.
- Cancel more than 48 hours ahead or you may pay up to half the fee.
' WHERE `slug` = 'book-a-room' AND `body` <> '1. File the **Event Proposal** first (see "Run an event"). It''s required for every on-campus event.
2. Pick a space at https://spaces.ucsc.edu/spaces-directory/
3. Book it the way its page says:
   - **College lounges** (Stevenson Fireside, Mary Holmes, Namaste, Hitchcock, Red Room): https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform
   - **Redwood Lounge or Deck** (UCSC login): https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform
   - **Event centers** (e.g. Stevenson Event Center): https://docs.google.com/forms/d/e/1FAIpQLScxyOgk_d_8DK7_7gaOCocRYW6uO_VyGbmq2tAgttBRQj4oAg/viewform
   - **Classrooms:** https://classroomreservations.ucsc.edu/
   - **"Reserve now" spaces:** use the calendar on the space''s page.
4. Wait for the confirmation email. No reply in 7 business days? Email roomres@ucsc.edu and cc conf@ucsc.edu.

**Small meetings:** library study rooms at https://guides.library.ucsc.edu/reserve-a-study-room (4 hours a day, up to 1 week ahead, not for events).

**Gotchas:**
- The form doesn''t book the room; the email does.
- Lounges and event centers: 7 business days. Event centers needing staff: 3 weeks.
- Classrooms: 5 business days, no food, no weekday bookings until after Week 2.
- Cancel more than 48 hours ahead or you may pay up to half the fee.
';
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) SELECT 'book-a-room', 'Book a room', '1. File the **Event Proposal** first (see "Run an event"). It''s required for every on-campus event.
2. Pick a space at https://spaces.ucsc.edu/spaces-directory/
3. Book it the way its page says:
   - **College lounges** (Stevenson Fireside, Mary Holmes, Namaste, Hitchcock, Red Room): https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform
   - **Redwood Lounge or Deck** (UCSC login): https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform
   - **Event centers** (e.g. Stevenson Event Center): https://docs.google.com/forms/d/e/1FAIpQLScxyOgk_d_8DK7_7gaOCocRYW6uO_VyGbmq2tAgttBRQj4oAg/viewform
   - **Classrooms:** https://classroomreservations.ucsc.edu/
   - **"Reserve now" spaces:** use the calendar on the space''s page.
4. Wait for the confirmation email. No reply in 7 business days? Email roomres@ucsc.edu and cc conf@ucsc.edu.

**Small meetings:** library study rooms at https://guides.library.ucsc.edu/reserve-a-study-room (4 hours a day, up to 1 week ahead, not for events).

**Gotchas:**
- The form doesn''t book the room; the email does.
- Lounges and event centers: 7 business days. Event centers needing staff: 3 weeks.
- Classrooms: 5 business days, no food, no weekday bookings until after Week 2.
- Cancel more than 48 hours ahead or you may pay up to half the fee.
' WHERE NOT EXISTS (SELECT 1 FROM `guide_versions` WHERE `guide_slug` = 'book-a-room' AND `body` = '1. File the **Event Proposal** first (see "Run an event"). It''s required for every on-campus event.
2. Pick a space at https://spaces.ucsc.edu/spaces-directory/
3. Book it the way its page says:
   - **College lounges** (Stevenson Fireside, Mary Holmes, Namaste, Hitchcock, Red Room): https://docs.google.com/forms/d/e/1FAIpQLSetTP8kGTdY1_rH7cdxHB7cMZQCQBjWGcMYaHTUZur9BhzrOw/viewform
   - **Redwood Lounge or Deck** (UCSC login): https://docs.google.com/forms/d/e/1FAIpQLSd4lXQAcMVEomd7vu_8420ySAP3dxuc9mtYGQEeJz4-_LT0sA/viewform
   - **Event centers** (e.g. Stevenson Event Center): https://docs.google.com/forms/d/e/1FAIpQLScxyOgk_d_8DK7_7gaOCocRYW6uO_VyGbmq2tAgttBRQj4oAg/viewform
   - **Classrooms:** https://classroomreservations.ucsc.edu/
   - **"Reserve now" spaces:** use the calendar on the space''s page.
4. Wait for the confirmation email. No reply in 7 business days? Email roomres@ucsc.edu and cc conf@ucsc.edu.

**Small meetings:** library study rooms at https://guides.library.ucsc.edu/reserve-a-study-room (4 hours a day, up to 1 week ahead, not for events).

**Gotchas:**
- The form doesn''t book the room; the email does.
- Lounges and event centers: 7 business days. Event centers needing staff: 3 weeks.
- Classrooms: 5 business days, no food, no weekday bookings until after Week 2.
- Cancel more than 48 hours ahead or you may pay up to half the fee.
');
--> statement-breakpoint
UPDATE `guides` SET `title` = 'Get funding', `body` = '1. Read https://getinvolved.ucsc.edu/student-organizations/funding/
2. Pick sources that fit:
   - **CEP:** https://forms.gle/bXRQDfxdeSDdCuhx8
   - **DSAS:** https://studentsuccess.ucsc.edu/community/student-funding/ (3+ weeks)
   - **Colleges:** see the list below.
3. For each college: fill in its form, **then** email it for an agenda slot, **then** present at the meeting (about 5 minutes).
4. Once approved, the money is spent by PO or moved to your campus account. You never get cash.

**Colleges** (form → email, meeting):
- **Cowell:** https://docs.google.com/forms/d/1Bczscq4YpYocvcTpCKc1qYKu8M7MyZC4CuM6ZPBWyUQ/viewform → csenate@ucsc.edu
- **Stevenson:** https://forms.gle/gqCz7mBAirm57vFK6 → stevensonstudentcouncil@ucsc.edu. Max $500, apply 1 month ahead.
- **Crown:** https://forms.gle/xEUxysogfbcbP6tz8, due Thursday 4pm the week before → crownsen@ucsc.edu. Meets Mondays 8pm.
- **Merrill:** https://bit.ly/MSG-funding-request → msgcore-group@ucsc.edu. Apply 2–3 weeks ahead.
- **Porter:** forms on https://porter.ucsc.edu/student-opportunities/student-government → portersenatetreasurer@ucsc.edu by Wednesday 4pm.
- **Kresge:** https://bit.ly/ParliamentFunding25-26 → kc_parl@ucsc.edu, 2 weeks before presenting.
- **Oakes:** https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform → oakessen@ucsc.edu. Bring the paper award form.
- **Rachel Carson:** https://docs.google.com/a/ucsc.edu/forms/d/1o3gnwRD7w4kGrB_yM6_EiJDPv-crlxLnr2Z_uQpMhjs/viewform → rccouncil@ucsc.edu
- **College Nine:** https://docs.google.com/forms/d/e/1FAIpQLSdQQNDPuf9xNzIHcgeyj8B4bzZm9wVN2fZPRmtlbEQ_7voZJg/viewform → c9senate@ucsc.edu. Funds in rounds. No food. $200 cap for outside orgs.
- **John R. Lewis:** jrlgoco@ucsc.edu

**Gotchas:**
- Apply 5–6 weeks out, because purchasing takes another 1–2 weeks after approval.
- Stevenson, Crown and C9 only fund events that serve their students.
- No alcohol. Nothing retroactive.
- Some college forms and emails come from 2025–26 pages. Check the college''s page before applying.
' WHERE `slug` = 'funding' AND `body` <> '1. Read https://getinvolved.ucsc.edu/student-organizations/funding/
2. Pick sources that fit:
   - **CEP:** https://forms.gle/bXRQDfxdeSDdCuhx8
   - **DSAS:** https://studentsuccess.ucsc.edu/community/student-funding/ (3+ weeks)
   - **Colleges:** see the list below.
3. For each college: fill in its form, **then** email it for an agenda slot, **then** present at the meeting (about 5 minutes).
4. Once approved, the money is spent by PO or moved to your campus account. You never get cash.

**Colleges** (form → email, meeting):
- **Cowell:** https://docs.google.com/forms/d/1Bczscq4YpYocvcTpCKc1qYKu8M7MyZC4CuM6ZPBWyUQ/viewform → csenate@ucsc.edu
- **Stevenson:** https://forms.gle/gqCz7mBAirm57vFK6 → stevensonstudentcouncil@ucsc.edu. Max $500, apply 1 month ahead.
- **Crown:** https://forms.gle/xEUxysogfbcbP6tz8, due Thursday 4pm the week before → crownsen@ucsc.edu. Meets Mondays 8pm.
- **Merrill:** https://bit.ly/MSG-funding-request → msgcore-group@ucsc.edu. Apply 2–3 weeks ahead.
- **Porter:** forms on https://porter.ucsc.edu/student-opportunities/student-government → portersenatetreasurer@ucsc.edu by Wednesday 4pm.
- **Kresge:** https://bit.ly/ParliamentFunding25-26 → kc_parl@ucsc.edu, 2 weeks before presenting.
- **Oakes:** https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform → oakessen@ucsc.edu. Bring the paper award form.
- **Rachel Carson:** https://docs.google.com/a/ucsc.edu/forms/d/1o3gnwRD7w4kGrB_yM6_EiJDPv-crlxLnr2Z_uQpMhjs/viewform → rccouncil@ucsc.edu
- **College Nine:** https://docs.google.com/forms/d/e/1FAIpQLSdQQNDPuf9xNzIHcgeyj8B4bzZm9wVN2fZPRmtlbEQ_7voZJg/viewform → c9senate@ucsc.edu. Funds in rounds. No food. $200 cap for outside orgs.
- **John R. Lewis:** jrlgoco@ucsc.edu

**Gotchas:**
- Apply 5–6 weeks out, because purchasing takes another 1–2 weeks after approval.
- Stevenson, Crown and C9 only fund events that serve their students.
- No alcohol. Nothing retroactive.
- Some college forms and emails come from 2025–26 pages. Check the college''s page before applying.
';
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) SELECT 'funding', 'Get funding', '1. Read https://getinvolved.ucsc.edu/student-organizations/funding/
2. Pick sources that fit:
   - **CEP:** https://forms.gle/bXRQDfxdeSDdCuhx8
   - **DSAS:** https://studentsuccess.ucsc.edu/community/student-funding/ (3+ weeks)
   - **Colleges:** see the list below.
3. For each college: fill in its form, **then** email it for an agenda slot, **then** present at the meeting (about 5 minutes).
4. Once approved, the money is spent by PO or moved to your campus account. You never get cash.

**Colleges** (form → email, meeting):
- **Cowell:** https://docs.google.com/forms/d/1Bczscq4YpYocvcTpCKc1qYKu8M7MyZC4CuM6ZPBWyUQ/viewform → csenate@ucsc.edu
- **Stevenson:** https://forms.gle/gqCz7mBAirm57vFK6 → stevensonstudentcouncil@ucsc.edu. Max $500, apply 1 month ahead.
- **Crown:** https://forms.gle/xEUxysogfbcbP6tz8, due Thursday 4pm the week before → crownsen@ucsc.edu. Meets Mondays 8pm.
- **Merrill:** https://bit.ly/MSG-funding-request → msgcore-group@ucsc.edu. Apply 2–3 weeks ahead.
- **Porter:** forms on https://porter.ucsc.edu/student-opportunities/student-government → portersenatetreasurer@ucsc.edu by Wednesday 4pm.
- **Kresge:** https://bit.ly/ParliamentFunding25-26 → kc_parl@ucsc.edu, 2 weeks before presenting.
- **Oakes:** https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform → oakessen@ucsc.edu. Bring the paper award form.
- **Rachel Carson:** https://docs.google.com/a/ucsc.edu/forms/d/1o3gnwRD7w4kGrB_yM6_EiJDPv-crlxLnr2Z_uQpMhjs/viewform → rccouncil@ucsc.edu
- **College Nine:** https://docs.google.com/forms/d/e/1FAIpQLSdQQNDPuf9xNzIHcgeyj8B4bzZm9wVN2fZPRmtlbEQ_7voZJg/viewform → c9senate@ucsc.edu. Funds in rounds. No food. $200 cap for outside orgs.
- **John R. Lewis:** jrlgoco@ucsc.edu

**Gotchas:**
- Apply 5–6 weeks out, because purchasing takes another 1–2 weeks after approval.
- Stevenson, Crown and C9 only fund events that serve their students.
- No alcohol. Nothing retroactive.
- Some college forms and emails come from 2025–26 pages. Check the college''s page before applying.
' WHERE NOT EXISTS (SELECT 1 FROM `guide_versions` WHERE `guide_slug` = 'funding' AND `body` = '1. Read https://getinvolved.ucsc.edu/student-organizations/funding/
2. Pick sources that fit:
   - **CEP:** https://forms.gle/bXRQDfxdeSDdCuhx8
   - **DSAS:** https://studentsuccess.ucsc.edu/community/student-funding/ (3+ weeks)
   - **Colleges:** see the list below.
3. For each college: fill in its form, **then** email it for an agenda slot, **then** present at the meeting (about 5 minutes).
4. Once approved, the money is spent by PO or moved to your campus account. You never get cash.

**Colleges** (form → email, meeting):
- **Cowell:** https://docs.google.com/forms/d/1Bczscq4YpYocvcTpCKc1qYKu8M7MyZC4CuM6ZPBWyUQ/viewform → csenate@ucsc.edu
- **Stevenson:** https://forms.gle/gqCz7mBAirm57vFK6 → stevensonstudentcouncil@ucsc.edu. Max $500, apply 1 month ahead.
- **Crown:** https://forms.gle/xEUxysogfbcbP6tz8, due Thursday 4pm the week before → crownsen@ucsc.edu. Meets Mondays 8pm.
- **Merrill:** https://bit.ly/MSG-funding-request → msgcore-group@ucsc.edu. Apply 2–3 weeks ahead.
- **Porter:** forms on https://porter.ucsc.edu/student-opportunities/student-government → portersenatetreasurer@ucsc.edu by Wednesday 4pm.
- **Kresge:** https://bit.ly/ParliamentFunding25-26 → kc_parl@ucsc.edu, 2 weeks before presenting.
- **Oakes:** https://docs.google.com/forms/d/1Cav9BEd5mqBPgXNLlje_QlgbZPRQBYmoSx_ct6pSjrg/viewform → oakessen@ucsc.edu. Bring the paper award form.
- **Rachel Carson:** https://docs.google.com/a/ucsc.edu/forms/d/1o3gnwRD7w4kGrB_yM6_EiJDPv-crlxLnr2Z_uQpMhjs/viewform → rccouncil@ucsc.edu
- **College Nine:** https://docs.google.com/forms/d/e/1FAIpQLSdQQNDPuf9xNzIHcgeyj8B4bzZm9wVN2fZPRmtlbEQ_7voZJg/viewform → c9senate@ucsc.edu. Funds in rounds. No food. $200 cap for outside orgs.
- **John R. Lewis:** jrlgoco@ucsc.edu

**Gotchas:**
- Apply 5–6 weeks out, because purchasing takes another 1–2 weeks after approval.
- Stevenson, Crown and C9 only fund events that serve their students.
- No alcohol. Nothing retroactive.
- Some college forms and emails come from 2025–26 pages. Check the college''s page before applying.
');
--> statement-breakpoint
UPDATE `guides` SET `title` = 'Run an event (any size)', `body` = '1. Work out your size:
   - **Small:** ≤50 people / $700
   - **Mid:** ≤100 / $1,400
   - **Large:** ≤250
   - **Major:** >250, or advertised to the public
2. An Authorized Representative files the **Event Proposal** (DocuSign): [Event Proposal form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=649e3cb3-3650-479f-a4b9-bf1ae2d7e7de&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
   - Small: ≥5 business days (10 recommended)
   - Mid: ≥2 weeks (4 recommended)
   - Large: 6 weeks
   - Major: 8 weeks
3. Meet: a Peer Advisor drop-in (small), or a booked SOMeCA advisor meeting (mid and up).
4. Extras if needed:
   - Tent: https://forms.gle/LWTZSTPW5xryuFXc7
   - AV equipment: Learning Technologies, 2 weeks ahead (https://its.ucsc.edu/av-checkout)
5. On the day: keep an attendance log (names and emails).

**Gotchas:**
- Students can''t sign contracts.
- No official off-campus events. If members go somewhere off campus, the post must say "This is not a UCSC-sponsored activity."
- Raffles are illegal. Free-entry drawings are OK.
- Food sold at fundraisers must be store-bought and pre-packaged, and needs a food permit through your advisor.
' WHERE `slug` = 'bigger-events' AND `body` <> '1. Work out your size:
   - **Small:** ≤50 people / $700
   - **Mid:** ≤100 / $1,400
   - **Large:** ≤250
   - **Major:** >250, or advertised to the public
2. An Authorized Representative files the **Event Proposal** (DocuSign): [Event Proposal form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=649e3cb3-3650-479f-a4b9-bf1ae2d7e7de&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
   - Small: ≥5 business days (10 recommended)
   - Mid: ≥2 weeks (4 recommended)
   - Large: 6 weeks
   - Major: 8 weeks
3. Meet: a Peer Advisor drop-in (small), or a booked SOMeCA advisor meeting (mid and up).
4. Extras if needed:
   - Tent: https://forms.gle/LWTZSTPW5xryuFXc7
   - AV equipment: Learning Technologies, 2 weeks ahead (https://its.ucsc.edu/av-checkout)
5. On the day: keep an attendance log (names and emails).

**Gotchas:**
- Students can''t sign contracts.
- No official off-campus events. If members go somewhere off campus, the post must say "This is not a UCSC-sponsored activity."
- Raffles are illegal. Free-entry drawings are OK.
- Food sold at fundraisers must be store-bought and pre-packaged, and needs a food permit through your advisor.
';
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) SELECT 'bigger-events', 'Run an event (any size)', '1. Work out your size:
   - **Small:** ≤50 people / $700
   - **Mid:** ≤100 / $1,400
   - **Large:** ≤250
   - **Major:** >250, or advertised to the public
2. An Authorized Representative files the **Event Proposal** (DocuSign): [Event Proposal form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=649e3cb3-3650-479f-a4b9-bf1ae2d7e7de&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
   - Small: ≥5 business days (10 recommended)
   - Mid: ≥2 weeks (4 recommended)
   - Large: 6 weeks
   - Major: 8 weeks
3. Meet: a Peer Advisor drop-in (small), or a booked SOMeCA advisor meeting (mid and up).
4. Extras if needed:
   - Tent: https://forms.gle/LWTZSTPW5xryuFXc7
   - AV equipment: Learning Technologies, 2 weeks ahead (https://its.ucsc.edu/av-checkout)
5. On the day: keep an attendance log (names and emails).

**Gotchas:**
- Students can''t sign contracts.
- No official off-campus events. If members go somewhere off campus, the post must say "This is not a UCSC-sponsored activity."
- Raffles are illegal. Free-entry drawings are OK.
- Food sold at fundraisers must be store-bought and pre-packaged, and needs a food permit through your advisor.
' WHERE NOT EXISTS (SELECT 1 FROM `guide_versions` WHERE `guide_slug` = 'bigger-events' AND `body` = '1. Work out your size:
   - **Small:** ≤50 people / $700
   - **Mid:** ≤100 / $1,400
   - **Large:** ≤250
   - **Major:** >250, or advertised to the public
2. An Authorized Representative files the **Event Proposal** (DocuSign): [Event Proposal form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=649e3cb3-3650-479f-a4b9-bf1ae2d7e7de&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
   - Small: ≥5 business days (10 recommended)
   - Mid: ≥2 weeks (4 recommended)
   - Large: 6 weeks
   - Major: 8 weeks
3. Meet: a Peer Advisor drop-in (small), or a booked SOMeCA advisor meeting (mid and up).
4. Extras if needed:
   - Tent: https://forms.gle/LWTZSTPW5xryuFXc7
   - AV equipment: Learning Technologies, 2 weeks ahead (https://its.ucsc.edu/av-checkout)
5. On the day: keep an attendance log (names and emails).

**Gotchas:**
- Students can''t sign contracts.
- No official off-campus events. If members go somewhere off campus, the post must say "This is not a UCSC-sponsored activity."
- Raffles are illegal. Free-entry drawings are OK.
- Food sold at fundraisers must be store-bought and pre-packaged, and needs a food permit through your advisor.
');
--> statement-breakpoint
UPDATE `guides` SET `title` = 'Buy food', `body` = '1. Make sure your Event Proposal says you''ll serve food and is approved.
2. New restaurant or vendor? Get a **204 Payee Setup** done (10 business days): [204 Payee Setup](https://financial.ucsc.edu/Pages/WF_Payee_Setup_204.aspx)
3. Submit the **Purchase Request** (DocuSign) ≥5 business days ahead, or 10 for services: [Purchase Request form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=72406750-4802-4826-a97f-81bf1b2b6dca&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
4. You get a PO, and the university pays the vendor.
5. Keep the original itemized receipt.

**Paid yourself?** File the reimbursement within 2 weeks (4 max) with the original itemized receipt and proof of payment. A different Authorized Representative submits it.

**Gotchas:**
- No self-serve buffets.
- Full catering must be UCSC Catering or an approved caterer. Restaurant takeout is fine.
- Never reimbursed: gift cards, alcohol, gas, services. Pay speakers by PO beforehand.
- Halal: dining halls label halal proteins. Ask UCSC Catering about halal before ordering.
' WHERE `slug` = 'food' AND `body` <> '1. Make sure your Event Proposal says you''ll serve food and is approved.
2. New restaurant or vendor? Get a **204 Payee Setup** done (10 business days): [204 Payee Setup](https://financial.ucsc.edu/Pages/WF_Payee_Setup_204.aspx)
3. Submit the **Purchase Request** (DocuSign) ≥5 business days ahead, or 10 for services: [Purchase Request form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=72406750-4802-4826-a97f-81bf1b2b6dca&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
4. You get a PO, and the university pays the vendor.
5. Keep the original itemized receipt.

**Paid yourself?** File the reimbursement within 2 weeks (4 max) with the original itemized receipt and proof of payment. A different Authorized Representative submits it.

**Gotchas:**
- No self-serve buffets.
- Full catering must be UCSC Catering or an approved caterer. Restaurant takeout is fine.
- Never reimbursed: gift cards, alcohol, gas, services. Pay speakers by PO beforehand.
- Halal: dining halls label halal proteins. Ask UCSC Catering about halal before ordering.
';
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) SELECT 'food', 'Buy food', '1. Make sure your Event Proposal says you''ll serve food and is approved.
2. New restaurant or vendor? Get a **204 Payee Setup** done (10 business days): [204 Payee Setup](https://financial.ucsc.edu/Pages/WF_Payee_Setup_204.aspx)
3. Submit the **Purchase Request** (DocuSign) ≥5 business days ahead, or 10 for services: [Purchase Request form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=72406750-4802-4826-a97f-81bf1b2b6dca&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
4. You get a PO, and the university pays the vendor.
5. Keep the original itemized receipt.

**Paid yourself?** File the reimbursement within 2 weeks (4 max) with the original itemized receipt and proof of payment. A different Authorized Representative submits it.

**Gotchas:**
- No self-serve buffets.
- Full catering must be UCSC Catering or an approved caterer. Restaurant takeout is fine.
- Never reimbursed: gift cards, alcohol, gas, services. Pay speakers by PO beforehand.
- Halal: dining halls label halal proteins. Ask UCSC Catering about halal before ordering.
' WHERE NOT EXISTS (SELECT 1 FROM `guide_versions` WHERE `guide_slug` = 'food' AND `body` = '1. Make sure your Event Proposal says you''ll serve food and is approved.
2. New restaurant or vendor? Get a **204 Payee Setup** done (10 business days): [204 Payee Setup](https://financial.ucsc.edu/Pages/WF_Payee_Setup_204.aspx)
3. Submit the **Purchase Request** (DocuSign) ≥5 business days ahead, or 10 for services: [Purchase Request form](https://na2.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=72406750-4802-4826-a97f-81bf1b2b6dca&env=na2&acct=abcfecea-7d7c-4b44-88dc-4279ba599ef8&v=2)
4. You get a PO, and the university pays the vendor.
5. Keep the original itemized receipt.

**Paid yourself?** File the reimbursement within 2 weeks (4 max) with the original itemized receipt and proof of payment. A different Authorized Representative submits it.

**Gotchas:**
- No self-serve buffets.
- Full catering must be UCSC Catering or an approved caterer. Restaurant takeout is fine.
- Never reimbursed: gift cards, alcohol, gas, services. Pay speakers by PO beforehand.
- Halal: dining halls label halal proteins. Ask UCSC Catering about halal before ordering.
');
--> statement-breakpoint
UPDATE `guides` SET `title` = 'Promote the event', `body` = '- **3–4 weeks before:** design the flyer. Add the org name, a removal date, and the access line: "If you have disability-related needs, contact [name] at [email] as soon as possible."
- **2 weeks before:** Instagram, WhatsApp, site calendar, and flyers on designated boards only (max 17×22"; follow each college''s posting rules).
- **1 day before:** reminder post.

**Gotchas:**
- No chalking.
- Banners need approval.
- Quarry Plaza tabling is closed until Fall 2027. Library tabling form: https://docs.google.com/forms/d/e/1FAIpQLSeRImnhgI5NPfOR90zXyxijX6x_pgHcaj_PSP0PBpD7hzG1gg/viewform
' WHERE `slug` = 'promotion' AND `body` <> '- **3–4 weeks before:** design the flyer. Add the org name, a removal date, and the access line: "If you have disability-related needs, contact [name] at [email] as soon as possible."
- **2 weeks before:** Instagram, WhatsApp, site calendar, and flyers on designated boards only (max 17×22"; follow each college''s posting rules).
- **1 day before:** reminder post.

**Gotchas:**
- No chalking.
- Banners need approval.
- Quarry Plaza tabling is closed until Fall 2027. Library tabling form: https://docs.google.com/forms/d/e/1FAIpQLSeRImnhgI5NPfOR90zXyxijX6x_pgHcaj_PSP0PBpD7hzG1gg/viewform
';
--> statement-breakpoint
INSERT INTO `guide_versions` (`guide_slug`, `title`, `body`) SELECT 'promotion', 'Promote the event', '- **3–4 weeks before:** design the flyer. Add the org name, a removal date, and the access line: "If you have disability-related needs, contact [name] at [email] as soon as possible."
- **2 weeks before:** Instagram, WhatsApp, site calendar, and flyers on designated boards only (max 17×22"; follow each college''s posting rules).
- **1 day before:** reminder post.

**Gotchas:**
- No chalking.
- Banners need approval.
- Quarry Plaza tabling is closed until Fall 2027. Library tabling form: https://docs.google.com/forms/d/e/1FAIpQLSeRImnhgI5NPfOR90zXyxijX6x_pgHcaj_PSP0PBpD7hzG1gg/viewform
' WHERE NOT EXISTS (SELECT 1 FROM `guide_versions` WHERE `guide_slug` = 'promotion' AND `body` = '- **3–4 weeks before:** design the flyer. Add the org name, a removal date, and the access line: "If you have disability-related needs, contact [name] at [email] as soon as possible."
- **2 weeks before:** Instagram, WhatsApp, site calendar, and flyers on designated boards only (max 17×22"; follow each college''s posting rules).
- **1 day before:** reminder post.

**Gotchas:**
- No chalking.
- Banners need approval.
- Quarry Plaza tabling is closed until Fall 2027. Library tabling form: https://docs.google.com/forms/d/e/1FAIpQLSeRImnhgI5NPfOR90zXyxijX6x_pgHcaj_PSP0PBpD7hzG1gg/viewform
');
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('funding', 'funding', 'Apply for funding', 35, 'funding', 10) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('proposal', NULL, 'File the Event Proposal (DocuSign)', 14, 'bigger-events', 20) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('proposal-big', 'big', 'Big event: Event Proposal due (6 weeks; 8 if over 250 or public)', 42, 'bigger-events', 19) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('advisor', NULL, 'Meet an advisor (Peer Advisor drop-in; SOMeCA for mid-size and up)', 7, 'bigger-events', 21) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('collab', 'collab', 'Agree with the partner org who does what', 35, NULL, 25) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('room', 'room', 'Book a room (after filing the proposal)', 14, 'book-a-room', 30) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('offcampus', 'offcampus', 'Off-campus: meet the advisor (no official off-campus events)', 35, 'bigger-events', 40) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('vendor-204', 'food', 'New vendor? Get the 204 payee setup', 21, 'food', 45) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('purchase', 'food', 'Submit the Purchase Request (DocuSign)', 10, 'food', 50) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('flyer', NULL, 'Design the flyer (with the access line)', 21, 'promotion', 55) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('promo-week', NULL, 'Post on Instagram, WhatsApp and the site', 14, 'promotion', 60) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
--> statement-breakpoint
INSERT INTO `task_templates` (`id`, `tag`, `title`, `days_before`, `guide_slug`, `sort`) VALUES ('promo-eve', NULL, 'Post a reminder', 1, 'promotion', 70) ON CONFLICT(`id`) DO UPDATE SET `tag` = excluded.`tag`, `title` = excluded.`title`, `days_before` = excluded.`days_before`, `guide_slug` = excluded.`guide_slug`, `sort` = excluded.`sort`;
