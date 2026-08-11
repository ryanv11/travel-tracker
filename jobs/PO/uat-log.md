# PO UAT Log — what still needs your testing

This is the **live list**. Open it, go top to bottom, test only what's here. When an item passes it
leaves this file. History lives in [`uat-archive.md`](./uat-archive.md).

**Recording a verdict:** write on the `Result:` line, or just tell me `N PASS` / `N FAIL: <what you saw>` / `N N/A`.
On a PASS I flip the tracker item to done and remove it from here.

**Before you start (10 seconds):** hard-refresh staging (**Cmd/Ctrl+Shift+R** — the browser caches the old
bundle), then open **`/health`** and confirm the `commit` matches the latest `main`. If it doesn't, staging
is stale — tell me and everything below is void until it redeploys. *(This bit us once already.)*

---

## A · Add-a-place / city picker — test as one pass

Open a trip, add a place, and watch the picker. These all came back **PARTIAL** on 2026-08-08.
Your three specific complaints last round were: **coordinates shown** in the picker, **two indistinguishable
rows**, and the **city name editable** on the picker screen when it shouldn't be. Check those explicitly —
any survivor is a FAIL regardless of tracker status.

1. **BUG-71** — an ambiguous city name (e.g. "Springfield", "Newport") offers a **disambiguation choice**, not a silent auto-pick of some state.
   Result:
2. **BUG-72** — the picker rows are **distinguishable** from each other (you can tell which specific city is which).
   Result:
3. **BUG-81** — the rows are **skimmable**: no county/postcode noise, no raw coordinates.
   Result:
4. **BUG-73** — a geocode lookup **failure is visibly signalled**, not silent.
   Result:
5. **BUG-74** — an **upstream** geocoder failure (not just browser↔backend) is signalled too.
   Result:
6. **BUG-87** — on a trip with a country set, searching a name that exists in several countries (**"Newport" on a UK trip**) narrows/ranks to the trip's countries — not only USA Newports. A trip with **no** country set prompts rather than filtering to nothing.
   Result:

## B · Trips list & status

7. **BUG-58** — changing a trip's status (lock it, or move it **backward** e.g. Confirmed→Planning) **keeps it selected** in the left panel — it must not blank out and force you to re-find it.
   Result:
8. **BUG-86** — open a trip in **review** status → **Back to trip** → lands on the active trip view, not a blank panel.
   Result:
9. **BUG-91** — add a trip → press **Enter** in the country-search field → the form does **not** save/close; you can still set dates in the same flow.
   Result:
10. **BUG-93** — add a place → its **map pin appears with no manual refresh**.
    Result:
11. **UX-14** — *(not a bug — confirm copy)* hover a **blue date** field → the tooltip explaining the "explicit dates" accent reads sensibly.
    Result:

## C · Quick checks

12. **QUAL-26** — open **`/health`** on staging → a `commit` SHA is present and matches latest `main`. *(Same as the pre-flight check above — record once.)*
    Result:
13. **QUAL-43 + QUAL-49** — *(smoke test, not a feature)* the backend data-access layer and response serialization were rewritten with **zero intended behaviour change**. Just do a normal loop: trip list → open a trip → places & items → add a place → add an item → map renders → admin panel. **Everything should behave exactly as before** — anything different is a FAIL, tell me even if it seems trivial.
    Result:

---

## Adding a new finding

Just add a numbered line under the right section (or a new section), or tell me and I'll log it. For a
behaviour bug, steps-to-reproduce beat a screenshot; for a visual bug, a screenshot + one line is ideal.
Screenshots → `jobs/PO/screenshots/[date]-[short-description].png`.
