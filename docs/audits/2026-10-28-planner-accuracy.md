# Timeline planner accuracy, 2026-10-28

The Plan a timeline chat on master (915da2f's planner, model
meta-llama/Llama-3.3-70B-Instruct-Turbo on DeepInfra), scored against an
answer key: 15 event descriptions, 2 runs each, "today" Wed Oct 28 2026.
Script and key: `scripts/planner-accuracy.ts`; raw output was
`tmp/llm-accuracy.out`.

## The answer key

For each description: the right date, the right size (SOMeCA's: small under
50 people, mid 51 to 100 or any speaker, large 101 to 250, major over 250 or
open to the public), the steps it must have, and the steps it may have
without being wrong. Step numbers are the Playbook's order (26 steps).

- Every on-campus event in a booked space: proposal (1), advisor meeting (2),
  the room (9, 10, 11), flyer (20), post (21), reminder (23), attendance (24),
  thank-you (25).
- Off campus: the off-campus advisor talk (4) instead of the room steps.
- Food: food permit (5), Purchase Request (18), receipt (19), reimbursements (26).
- Funding asked for: pick the source (13), spend it through the campus account
  (15); asking colleges adds (14).
- A paid speaker or performer: its paperwork (6) and Purchase Request (17), and
  reimbursements (26).
- Allowed, not required: tent or AV (3) for big halls, the new-vendor setup
  (16) for any vendor, a library table (22) where it fits.
- "Not sure yet" is the answer to anything but the date; "December 3" to the date.

| | Description | Date | Size |
|---|---|---|---|
| a | halaqa thursday night in a classroom, ~15 people, no food | Oct 29 | small |
| b | weekly jummah | Dec 3 | small |
| c | halaqa with pizza, ~40 people | Dec 3 | small |
| d | big eid dinner, 150 people, catered, need funding | Dec 3 | large |
| e | bringing an outside speaker, ticketed, in a big hall | Dec 3 | mid |
| f | beach cleanup off campus | Dec 3 | small |
| g | bake sale fundraiser on campus | Dec 3 | small |
| h | day trip to the Monterey Bay Aquarium on Nov 14, 25 students, funding for tickets | Nov 14 | small |
| i | samosa sale fundraiser at Quarry Plaza on Nov 18, cooked at home, for charity | Nov 18 | small |
| j | imam giving a talk, $300 honorarium, ~60 students, Stevenson Event Center | Dec 3 | mid |
| k | sisters study halaqa, 8 people, library study room, Monday 6pm | Nov 2 | small |
| l | Eid dinner open to the community, ~300 guests, catered, college funding | Dec 3 | major |
| m | jummah every friday in the Redwood Lounge | Oct 30 | small |
| n | ticketed nasheed concert, paid performer, ~120 people, Recital Hall | Dec 3 | large |
| o | tabling at the library to recruit members | Dec 3 | small |

a to g are the seven the planner was tuned on (October 27); h to o are new.

## Results

A plan is "all right" when its date, size and steps all match the key: nothing
required missing, nothing outside the allowed steps.

| | Runs | All right | Date | Size | Step precision | Step recall | Missing | Extra |
|---|---|---|---|---|---|---|---|---|
| The model's own answer | 30 | **0 (0%)** | 100% | 60% | 86% | 91% | 31 | 63 |
| What the site ships (model + code fixes) | 30 | **22 (73%)** | 100% | 87% | 98% | 98% | 8 | 8 |
| Keyword rules alone (no model) | 15 | 10 (67%) | 100% | 100% | 98% | 99% | 2 | 5 |

Split by tuned and new descriptions, what the site ships:

- a to g (tuned on): 14 of 14 runs right.
- h to o (new): 8 of 16 runs right. j, k, m and o right in both runs; h, i, l and n wrong in both.

The two runs gave the same plan every time except h (one run added #6).

## Where it goes wrong

The model on its own: it adds the "File the Event Proposal first" repeats
(#8, #12), library tables, food orders and speaker paperwork nobody
mentioned; it leaves out the advisor meeting, sometimes the proposal itself,
receipts and reimbursements; and it sizes 12 of 30 wrong. The site's code
already removes or adds most of these; what gets through:

| Event | Ships | Should be | Why |
|---|---|---|---|
| h aquarium trip, 25 students | size mid | small | with a headcount given, the site keeps the model's size, and the model said mid |
| n concert, ~120 people | size mid | large | the same: the model's size kept, and it said mid |
| l Eid dinner | speaker paperwork (#6, #17) | none | the model added a speaker; the code drops only unasked tables, gear, food orders and funding, not speaker steps |
| i samosa sale | speaker paperwork (#6, sometimes #17); no room steps (#9 to #11); no receipt (#19) | room steps, receipt | "samosa" and "cook" aren't food words to the code, so the food steps aren't forced in; the model took Quarry Plaza for a place that needs no booking |
| h aquarium trip (one run) | speaker paperwork (#6) | none | as for l |

## Fixes worth making (not made; for a go-ahead)

1. Size from the headcount by SOMeCA's thresholds, not from the model, whenever
   a headcount is given (fixes h and n).
2. Drop the speaker and performer steps (#6, #17) unless the description names
   a speaker, performer, imam, DJ and so on, as is already done for tables and
   gear (fixes l, h, i).
3. More food words: samosa, cook, baked, chai, kabob, and similar; or
   treat "sell" with anything homemade as food (fixes i's receipt).
4. Keep the room steps unless the description is online or off campus; a
   named campus place (Quarry Plaza, a lounge) still needs a booking (fixes i).

Each fix answers a failure above, but none is built or tested yet. After
them, the fair test is a third set of new descriptions, not the ones the
fixes were made from.
