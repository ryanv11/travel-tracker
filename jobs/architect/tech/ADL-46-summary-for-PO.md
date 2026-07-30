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
| **Only one "Springfield" can exist per country** | **Springfield, Illinois and Springfield, Missouri can both exist** |
| A city name matching several places picks one silently | **You're asked which one**, using the region dropdown that's already on the form |

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

**6. When a city name matches more than one place, we ask you which.** Your question, and you said
either answer was workable. I chose asking, for three reasons. The duplicate-names change makes
guessing worse — a wrong guess now creates a second plausible-looking entry instead of harmlessly
colliding with the first. Asking is also the cheapest possible fix for the stale-entry problem, since
an entry that's never created needs no cleanup tool. And it keeps a city's name, region and
coordinates consistent, because they all come from the one option you picked. **It costs almost
nothing to build**: the form already has a region dropdown that the app already fills in for you —
when there's more than one candidate, that dropdown offers the choices instead of pre-picking one. No
new screen, no extra step, and if you ignore it the city is still created. **If the release needs to
get smaller, this is the first thing I'd cut** — reverting to "take the top answer" — and §4 says what
that costs.

---

## 3a. Your three points from the review — what changed

**"I don't want to be architecting based on the current user base."** Taken, and it was a fair hit.
I'd been justifying several decisions with "fine at two users", which optimises for today and bills
later. I went back through every one. Two became real fixes (below); the rest became follow-ons **with
a trigger** rather than vague "laters". One thing I deliberately did *not* re-weigh: where a decision
rests on the *data* in staging and production being disposable, that's a fact about today's database,
not a guess about user numbers — so those stay as they were.

**"Duplicate city names across regions."** **Fixed, in this release.** A city's identity becomes name
+ country + region. The trap you'd expect is real and I've guarded it: the region field is often
empty, and databases treat "empty" as never equal to "empty", so the obvious version of this change
would have let *unlimited* duplicates in for countries that don't use regions — the exact bug that
was fixed in July. The fix collapses "no region" to a single fixed value so those countries keep
today's protection precisely. **It needs no new database migration** — it fits inside one already
planned — **and it can't break existing data**, because the new rule is strictly looser than the old
one, so nothing currently stored can violate it.

**"What happens when multiple results are found?"** **You're asked.** Details and reasoning in §3
below.

## 4. Trade-offs you should know about — and where to push back

**The one I'd challenge if I were you.** *A wrong entry can still reach the shared list, and nobody
can currently fix it.* Asking you to choose (decision 6) prevents most of these, and the lookup is now
restricted to the country and region already selected — so what's left is the case where the service
returns exactly one answer and it's wrong. You can always fix *your own* trip. **Nobody can fix the
shared entry, because there's no screen for editing a city.** That's a real gap and I'm no longer
excusing it with "there are only two of us": it's recorded as work that must land **before anyone
beyond your friend uses the app**. If you'd rather have that tool now, that's a reasonable call.

**Worth knowing: most "wrong" leftovers aren't actually wrong.** You asked what happens to the stale
shared entry after you fix your own list. Usually: Springfield, Illinois is a *real city with correct
coordinates* that nobody has visited yet — no different from a city that shipped with the app and
nobody's been to. It stays, and that's correct. The genuine problem case is narrower: an entry whose
name and coordinates disagree. Nothing currently cleans those up and nothing can repair them — that's
the gap above, and it's what the repair tool closes. When it's built it should **hide** entries rather
than delete them, so it can never break someone else's saved trip.

**Everything ships at once.** You chose this over four separate releases. It means one round of
testing instead of four, but it also means **the friend's bug stays broken until the whole thing is
ready.** There's an emergency option — a small piece of it fixes just that bug with no database
change — but it only works *before* the release goes out, not after.

**No going back after it ships.** Once the database migration runs, we can't simply undo the release;
problems get fixed forward. That's normal for this project, but it's worth knowing given everything
lands together. It matters less right now because the data in both environments is disposable.

**The size, said plainly.** This latest round added the duplicate-names fix and the "ask which one"
behaviour. Neither adds a database migration and neither can damage existing data — but the release
is now fourteen decisions, three database rebuilds, a new server route, per-user lists and a small new
interaction. **That's a lot for one round.** I'm not recommending splitting it, because the pieces
genuinely depend on each other now, and splitting would reintroduce the half-finished states you chose
to avoid. But the four-stage breakdown still exists in the spec if you want it, and §4 names the first
thing I'd cut.

**One thing deliberately left out**, so you can object: cleaning up the leftover entry after someone
corrects a typo. It's invisible and harmless, and it collides with a place-deletion change already
queued (the delete/move/cancel prompt) — building it now would mean designing against a screen that's
about to change.

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
