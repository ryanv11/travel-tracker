# ADL-46 in plain language — for the PO

**What this is:** a one-page version of a 1,000-line spec, written for the person deciding whether to
approve it rather than the person implementing it. Full detail is in
`jobs/architect/tech/ADL-46-non-owner-access-model.md`; the independent review is
`jobs/architect/tech/ADL-46-review.md`.

**Status:** spec only. No code has changed. Nothing ships until you approve and two briefs run.

---

## 1. The problem, in one paragraph

You gave the app to a friend and they couldn't add a place to a trip. The cause wasn't a forgotten
setting — **two requirements in the BRD contradict each other**, and the code correctly implements
one of them. One says category, activity and city creation are owner-only; another says any user can
add their own categories. Both can't be true. Because the code followed the stricter one, a non-owner
can't load the trip form's pickers *and* can't create a city, which together mean they can't add a
place at all. Two earlier bugs (the country picker, the admin tabs) were the same root cause. This
spec settles the underlying question so there isn't a fourth.

---

## 2. What changes for a user

| Today | After |
|---|---|
| A non-owner can't add a place to a trip at all | They can, start to finish |
| Categories and activities are one global list only you can edit | **Everyone gets their own list**, pre-filled with the defaults so it's never blank. Your list is yours; theirs is theirs |
| Only you can add a city | Anyone can, while logging a trip — but only through the "search first, create if missing" path, never as a free-for-all |
| Country/region auto-fill is silently broken in the deployed app | Fixed — it moves to the server, where it can identify itself properly to the map service |
| A city you mistype is stuck | You can correct the place by pointing it at the right city, keeping its items and notes |

Countries stay yours alone. So does correcting or removing a city from the shared list.

---

## 3. The five decisions worth your attention

**1. Categories and activities become per-user.** This is the one you already chose. It follows the
same pattern companions and map colours already use, so it's a well-worn path — but it needs a
database migration, which is the single biggest risk item in the release.

**2. Anyone can add a city, but the app checks with the mapping service first.** When someone types a
city, the server asks OpenStreetMap and builds the record from *its* answer, not the raw typing. That
converges "Denverr", "denver co" and "Denver" onto one entry instead of three.

**3. A city nobody has confirmed yet is only visible to the person who added it.** It becomes visible
to everyone once the mapping service confirms it — which happens automatically in the background. The
practical effect: **junk never becomes everyone's problem, without anyone having to moderate
anything.** This was your call and it's the thing I'd most want you to keep.

**4. "No such place" is permanent; "couldn't reach the service" is retried.** Your refinement, and
it's better than what I had. If the service answers and says it doesn't know that name, asking again
tomorrow won't help — so we stop. If the network failed, we retry a few times and then stop. Without
this, every typo anyone ever makes gets looked up every fifteen minutes forever.

**5. The map lookup moves to the server.** It's currently done by the browser, which can't identify
itself to OpenStreetMap the way their rules require — a browser silently strips that. So the current
setup is anonymous against a service that asks us not to be, and it's blocked in the deployed app
anyway.

---

## 4. Trade-offs you should know about — and where to push back

**The one I'd challenge if I were you.** *A wrong match can still get into the shared list, and right
now nobody can fix it.* If someone adds "Springfield" and the service picks the Illinois one when
they meant Missouri, that entry becomes everyone's Springfield with the wrong coordinates. I've made
this much less likely — the lookup is now restricted to the country and region the user already
picked — but not impossible. The affected user can fix *their own* trip. Nobody can fix the shared
entry, because there's no screen for editing a city's coordinates. **I judged that acceptable for two
people and said so explicitly rather than hiding it. It stops being acceptable if the app grows.** If
you want the repair tool now rather than later, that's a reasonable call and it's the change I'd
expect you to ask for.

**Related, and genuinely a limitation rather than a bug:** the app can only hold *one* "Springfield"
per country. That's been true since a fix in July and isn't something this release causes — but this
release makes it easier to notice. Fixing it properly is its own piece of work.

**Everything ships at once.** You chose this over four separate releases. It means one round of
testing instead of four, but it also means **the friend's bug stays broken until the whole thing is
ready.** There's an emergency option — a small piece of it fixes just that bug with no database
change — but it only works *before* the release goes out, not after.

**No going back after it ships.** Once the database migration runs, we can't simply undo the release;
problems get fixed forward. That's normal for this project, but it's worth knowing given everything
lands together. It matters less right now because the data in both environments is disposable.

**Two small things deliberately left out**, so you can object if you disagree: cleaning up the
leftover entry after someone corrects a typo (it's invisible and harmless, and it collides with a
place-deletion change already queued), and a "did you mean X or Y?" picker for ambiguous city names.

---

## 5. What I'd want you to know about how this was checked

A second architect reviewed it with no knowledge of my reasoning, and **tried to break the core
design and couldn't.** They found ten things, all of which I accepted. Two mattered:

- **I'd claimed activities were stored in one place; they're stored in two.** The safety check before
  the migration was looking at the wrong table and would have reported "all clear" while a problem
  existed. It also meant a genuine gap: one route accepts an activity from a user without checking it
  belongs to them. Now fixed and tested.
- **The standard command for generating the migration produces a file that doesn't work.** The
  reviewer found this by running it. The instruction is now "throw that away and hand-write it," with
  working SQL they wrote and tested.

They also *checked the thing I was most worried about* — whether the migration preserves the links
between trips and their categories — by actually running it against a copy of the real database
structure. It works.

**Two corrections went the other way**, which I mention because it's the process working: a premise I
was given about how the map lookup runs was wrong, and I said so with evidence rather than building
on it — which made that part of the work smaller. And I declined to guess on an ambiguous instruction
about who can deactivate what, and asked instead.

---

## 6. What happens next if you approve

1. Three requirement updates and one new requirement go into the BRD.
2. Two briefs: the database change first, then the backend and frontend work.
3. One round of testing covering the friend's original bug *and* the new per-user behaviour.

**The honest summary of size:** this started as "someone forgot a permission check" and ended as a
release with three database migrations, a new server route, and a route relocation. That growth is
real and I've flagged it at each step rather than letting it creep. The scope is what the questions
you asked actually required — but if it now feels too big for one release, **the four-stage breakdown
still exists inside the spec** and could be split back apart.
