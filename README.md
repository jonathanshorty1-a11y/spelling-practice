# Spelling Practice

A weekly spelling-practice app for families. Parents create a free account,
add their kids, drop in this week's spelling words (paste, type, or — later —
snap a photo of the worksheet), and their kids study and take practice tests
independently. Built as an installable, offline-capable PWA, tuned for iPad
Safari.

This is the **commercial MVP** — the version meant to be tried by real
families, not just one household. It replaced an earlier single-family
prototype (still kept, untouched, in [`legacy-static/`](legacy-static/)) that
had no accounts, no cloud sync, and no subscription model.

## 1. What this app does

- **Guest mode first.** Nobody has to sign up to try it: tap *Try it Free*,
  add a child, paste this week's words, and take a practice test — all
  stored locally on the device. After the first completed test, the app
  offers to save that progress to a free account.
- **Family accounts.** One parent account → one family → multiple child
  profiles. Sign in with Apple, Google, or a 6-digit emailed code (no
  passwords).
- **Study Mode.** Listen / Repeat / Show Word / Spell It, word-by-word, with
  shuffle.
- **Practice Test.** The word is never shown. Two attempts, then a "Need
  help?" menu (hear again / first letter / show answer). Every submitted
  answer, hint used, and reveal is recorded per word. Words missed become an
  automatic "Practice Mistakes" round.
- **Results & history.** Score, percentage, and missed words after every
  test; a Progress view per child in Parent Area.
- **Subscriptions**, enforced server-side, not just in the UI:
  - New accounts get **7 days of full Premium**, automatically.
  - After the trial: **25 free practice answers, for the life of the
    family** (not per child, per list, or per device — and deleting a child
    never resets the count).
  - At 0 remaining, practice is paywalled; everything else (viewing kids,
    lists, history, settings) still works.
  - An **Admin Panel**, gated by a real `admins` table (not a hidden route),
    can flip a test family between Free / Trial / Premium.
- **Not built yet, on purpose:** real payments (Stripe), and anything for
  teachers/schools/classrooms. See §13. (Real OCR/Vision for photo import
  **is** connected — see §4 "Photo Import (OCR/Vision)".)

## 2. Architecture

```
src/
  domains/
    auth/            Supabase auth (email OTP, Apple/Google) + AuthContext
    family/           Family + guest→cloud migration + FamilyContext
    children/         Child profiles CRUD
    weeklyLists/       Weekly word lists, paste/type parsing, photo-import mock
    study/            Study Mode screen
    practice/         Practice Test screen + pure scoring/hint logic
    results/          Post-test results screen
    subscription/      Entitlements (pure logic), subscription service, Paywall
    parentArea/       PIN gate + Children/Lists/Progress/Account/Subscription/Settings
    admin/            Admin dashboard (RPC-backed, admin-only)
    analytics/         trackEvent()
    speech/           Centralized speakWord()/speakLetters() over Web Speech API
    onboarding/       Welcome screen, "don't lose your progress" prompt
    home/             "Who's practicing today?" + per-child menu
  lib/
    supabaseClient.ts  null when no Supabase project is configured
    localDb.ts         localStorage-backed guest-mode persistence
    dataMode.ts        'local' | 'cloud' — passed explicitly into every service call
    supabaseRows.ts    snake_case DB row <-> camelCase domain type mapping
  styles/global.css    design tokens + shared component classes (ported from
                       the original prototype's proven design)
supabase/
  migrations/0001_init.sql   full schema, RLS policies, and RPC functions
legacy-static/         the original single-family vanilla-JS/HTML/CSS app —
                       kept for reference, not part of the build
```

**Why React + Vite instead of keeping the original vanilla JS?** The original
app was a good, working prototype — Study Mode, Practice Test, the speech
synthesis strategy, the visual design, and the PWA setup are all carried over
conceptually (and the file itself is kept in `legacy-static/`). But this MVP
needs real auth, routing between many screens, a database with row-level
security, centralized entitlement logic, and an admin panel — react-router +
Supabase's JS client made that dramatically less code to get right than
hand-rolling it in one `app.js`. Nothing was migrated "for its own sake":
every screen either ports the original's proven UX or implements a
requirement (accounts, trial, paywall) the prototype never had.

**"Local" vs "cloud" mode.** Every domain service (`childrenService`,
`weeklyListsService`, `practiceService`, `subscriptionService`, ...) takes an
explicit `mode: 'local' | 'cloud'` as its first argument instead of branching
on hidden global state. `'local'` reads/writes `localStorage` (guest, no
account yet); `'cloud'` reads/writes Supabase. `FamilyContext` is the only
place that decides which mode is active (based on whether there's a Supabase
session) and hands it down via `useFamily()`. When a guest signs up,
`migrateGuestToCloud()` copies every local row into Supabase field-for-field
(table shapes in `domains/shared/types.ts` mirror the SQL schema exactly for
this reason) and clears local storage — nothing is lost, nothing is
duplicated.

## 3. Install & run locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. With no Supabase project configured (see
§4), the app runs entirely in **guest/local mode** — you can build and test
the whole non-account experience without a backend.

**Demo data.** In dev mode only (`npm run dev`, never in a production
build), open the browser console and run `__loadDemoData()` to instantly
seed a local guest family ("Hillary" + "Jeimy", each with a starter weekly
list) instead of clicking through Add Child by hand every time — then reload
the page. See `src/lib/devSeed.ts`.

Other scripts:

```bash
npm run build      # tsc -b && vite build -> dist/
npm run preview    # serve the production build locally
npm test           # vitest run (pure-logic unit tests, no backend needed)
npm run lint       # oxlint
```

## 4. Setting up a Supabase project

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. In **Project Settings → API**, copy the **Project URL** and the **anon /
   public key**.
3. Copy `.env.example` to `.env.local` and fill them in:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   The anon key is safe to ship in the client — it's designed for that, and
   is constrained entirely by the Row Level Security policies below. **Never**
   put the `service_role` key in this file or anywhere in frontend code.
4. Restart `npm run dev` — the app will now use Supabase instead of
   localStorage the moment a user signs in.

### Running the migrations

Open your project's **SQL Editor** in the Supabase dashboard and run, **in
order**, the full contents of:

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — families, children, weekly lists/words, practice sessions/answers, subscriptions, analytics, admins.
2. [`supabase/migrations/0002_mastery_and_readiness.sql`](supabase/migrations/0002_mastery_and_readiness.sql) — the `word_mastery` table, `weekly_lists.test_date`, `practice_sessions.practice_type`, `families.parent_language`, and the richer `admin_overview()`.
3. [`supabase/migrations/0003_subscriptions_insert_policy.sql`](supabase/migrations/0003_subscriptions_insert_policy.sql) — adds the missing RLS INSERT policy for `subscriptions` (needed by the guest→cloud migration's fallback path).
4. [`supabase/migrations/0004_grants.sql`](supabase/migrations/0004_grants.sql) — grants table-level SELECT/INSERT/UPDATE/DELETE to the `authenticated` role on every app table. RLS policies (steps 1-3) still gate which *rows* are reachable; this is the coarser table-level grant Postgres requires before RLS is even evaluated. Some Supabase projects' default privileges don't automatically cover tables created via the SQL Editor — if you hit `permission denied for table ...` (Postgres error 42501) after running 1-3, this fixes it.
5. [`supabase/migrations/0005_fix_consume_free_answer_ambiguity.sql`](supabase/migrations/0005_fix_consume_free_answer_ambiguity.sql) — fixes an ambiguous `status` column reference in `consume_free_answer()` (Postgres error 42702) that broke every answer check in Practice Test under cloud mode. Confirmed live against a real project; never caught before because the SQL had never run against real Postgres.

All five are also written to work with the Supabase CLI if you prefer:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Together they create every table, enable Row Level Security on all of them,
and install the RPC functions (`consume_free_answer`, `is_admin`,
`admin_overview`, `admin_list_families`, `admin_test_action`) the app calls.

### What the migration sets up automatically

- A `handle_new_user` trigger creates a `families` row (and a `trial`
  subscription, 7 days out) the instant a new `auth.users` row appears — so
  a family always exists exactly once, however the user was created.
- RLS policies so a signed-in user can only ever read/write rows under their
  own `family_id` (`children`, `weekly_lists`, `weekly_words`,
  `practice_sessions`, `practice_answers`), and can only *read* (never write
  directly) their own `subscriptions` row.
- Free-answer metering happens **only** inside the `consume_free_answer` SQL
  function (`SECURITY DEFINER`, and it re-checks that the caller actually
  owns the family before touching anything) — so it can't be bypassed by a
  client editing local state or calling the REST API directly.

### Making yourself an admin

The Admin Panel (`/admin`) is gated by a real table, not a hidden URL. After
signing in once, run in the SQL editor:

```sql
insert into admins (user_id)
values ('<your auth.users id, from the Authentication tab>');
```

### Photo Import (OCR/Vision)

Turning a photo of a spelling sheet into words (`extractSpellingListFromImage()`
in [`src/domains/weeklyLists/photoImport.ts`](src/domains/weeklyLists/photoImport.ts))
is real, not a mock — it calls a Supabase Edge Function
([`supabase/functions/extract-spelling-list/index.ts`](supabase/functions/extract-spelling-list/index.ts))
that talks to an OpenAI vision model server-side. The OpenAI API key never
reaches the browser; it only ever lives as a Supabase secret.

1. Create an API key at
   [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and
   make sure the account has billing/credits — an OpenAI account with no
   credits fails every request with `insufficient_quota`.
2. Deploy the function and set the secret:
   ```bash
   supabase functions deploy extract-spelling-list
   supabase secrets set OPENAI_API_KEY=sk-...
   ```
3. Optional — override the model without touching code:
   ```bash
   supabase secrets set OPENAI_VISION_MODEL=gpt-5.4-mini   # this is already the default
   ```

The function is deployed **with JWT verification on** (no `--no-verify-jwt`),
so an unauthenticated request is rejected by the Supabase gateway before the
function code ever runs. On top of that, it re-checks the caller's own
`subscriptions.status` (must be `trial` or `premium`) so the Photo Import
paywall can't be bypassed by calling the function directly instead of going
through the app's UI gate — see the comment at the top of `index.ts` for the
full design. Every field in the model's JSON response is validated/clamped
(word count, word length, date format, confidence range) before it's
returned to the client; a photo with no legible words returns a clear `422`
instead of an empty or garbage word list.

Tested live against real spelling-sheet photos (one clean printed list, one
messy 4th-grade cursive test) — both extracted the full word list correctly
with the review screen's existing manual-correction UI catching the handful
of words the model misread on the cursive one. Extraction quality depends
entirely on the configured `OPENAI_VISION_MODEL`; if a given model
underperforms on handwriting, swap it via the secret above with no code
changes.

## 5. Configuring sign-in

### Email (works out of the box)

Supabase's built-in email OTP needs no extra setup beyond §4 — it sends a
6-digit code (or magic link) automatically. In a fresh Supabase project this
uses Supabase's shared rate-limited test SMTP sender, fine for development;
for production add your own SMTP provider under **Authentication →
Providers → Email**.

### Continue with Google — what's needed from you

1. Create OAuth credentials in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (OAuth client ID, type "Web application").
2. Add `https://<your-project-ref>.supabase.co/auth/v1/callback` as an
   authorized redirect URI.
3. In Supabase, **Authentication → Providers → Google**: paste the Client ID
   and Client Secret, and enable it.

No code changes needed — `signInWithGoogle()` in
[`src/domains/auth/authService.ts`](src/domains/auth/authService.ts) already
calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. Until this is
configured, tapping "Continue with Google" shows a friendly, catchable error
instead of failing silently.

### Continue with Apple — what's needed from you

1. In the [Apple Developer portal](https://developer.apple.com/account/):
   create a **Services ID**, enable "Sign in with Apple" for it, and
   register your Supabase callback URL
   (`https://<your-project-ref>.supabase.co/auth/v1/callback`) plus your
   production domain.
2. Generate a **Sign in with Apple private key** (.p8) and note its Key ID
   and your Team ID.
3. In Supabase, **Authentication → Providers → Apple**: fill in the Services
   ID, Team ID, Key ID, and the private key contents.

Same story — `signInWithApple()` is already wired to
`supabase.auth.signInWithOAuth({ provider: 'apple' })`; it just needs these
values to exist somewhere other than in this repo.

**No credentials, secrets, or IDs are hardcoded anywhere in this codebase.**

## 6. Trying the trial / free-answer / paywall logic

With a Supabase project connected:

1. Sign up as a new family (any flow — guest→save, or Sign In directly) →
   you're immediately `trial`, 7 days out.
2. To skip ahead without waiting a week: sign in as an admin (§4), open
   `/admin`, find the test family, and tap **Reset Trial** (sets a fresh
   7-day window) or **Set Free** (jumps straight to the metered state).
3. As `free`, open Practice Test and submit answers — `Free practice: X / 25`
   shows in Parent Area → Subscription. At 25/25, the next attempt to start
   or continue practicing redirects to `/paywall`; Study Mode, results, and
   settings all remain reachable.
4. Tap **Activate Premium** in `/admin` to confirm premium never meters and
   never shows the paywall.

Without Supabase configured, the same logic runs against `localStorage` (see
`subscriptionService.ts`'s `'local'` branch) — useful for UI work, but it is
**not** the authoritative enforcement path; only the SQL function is.

## 7. Deploying

The app is a static Vite build (`npm run build` → `dist/`) plus one public
env-baked Supabase URL/key, so any static host works. **Netlify or Vercel are
recommended over the GitHub Pages setup the original prototype used** —
both let you set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` per
environment from a dashboard and handle client-side routing (this app uses
`react-router`, which needs a SPA fallback GitHub Pages doesn't do without
extra configuration) with zero config.

**Netlify:**
```bash
npm run build
```
then drag the `dist/` folder into [app.netlify.com/drop](https://app.netlify.com/drop),
or connect the GitHub repo and set: Build command `npm run build`, publish
directory `dist`, and the two `VITE_*` env vars under Site settings →
Environment variables.

**Vercel:** import the repo at [vercel.com/new](https://vercel.com/new) —
it detects Vite automatically. Add the two env vars under Project Settings →
Environment Variables, framework preset "Vite".

**GitHub Pages** (if you'd rather keep using it): set `base` in
`vite.config.ts` to `/<repo-name>/`, add a `404.html` that's a copy of
`index.html` (the standard SPA-on-Pages trick), and pass the two `VITE_*`
values as repository secrets to a GitHub Actions build step — plainer static
hosts don't need this because they read env vars directly from their own
dashboards.

## 8. Installing on an iPad

Open the deployed HTTPS URL in **Safari** → the Share icon → **Add to Home
Screen**. It installs with its own icon and launches full-screen; after the
first load it keeps working offline for the app shell (see §9).

## 9. Offline behavior

The service worker (via `vite-plugin-pwa`) precaches the app shell so the UI
loads with no connection. There's no offline data sync for Supabase reads/
writes — if a practice answer can't reach the server, the UI does not
silently drop it: `OfflineBanner` shows a clear "you're offline" notice
site-wide so nothing is lost silently.

## 10. Testing

```bash
npm test
```

Runs Vitest against everything that's pure logic and doesn't need a live
Supabase project: entitlement rules (trial doesn't meter, free blocks at 25,
premium is unlimited, deleting a child doesn't reset credits — the "no cheat"
math), the practice-test scoring/hint state machine, word-list parsing/
dedup, and voice selection. 35 tests as of this writing, all green.

What's **not** covered by an automated test yet, because it needs a live
Supabase project to exercise for real: RLS isolation between two families,
the guest→cloud migration end-to-end, and the trial→free cutover via the DB
trigger. §11 below is the manual checklist we ran instead.

## 11. Manual test checklist (what was actually run before calling this done)

- [x] Guest creates a child, pastes a weekly list, completes a Practice Test,
      sees Results with correct score/missed words.
- [x] Practice Test: 2 wrong answers reveals the "Need help?" menu; First
      Letter and Show Answer both work; Show Answer doesn't double-count as
      a submitted answer.
- [x] "Practice These Words" starts a new round scoped to only the missed
      words.
- [x] Guest sees "Don't lose your child's progress" after their first
      completed test; tapping Apple/Google shows the "not configured yet"
      message instead of crashing (no Supabase project in this environment
      — see §5); email OTP UI renders and calls the right service.
- [x] Parent Area: set a PIN, leave, come back → PIN gate reappears; wrong
      PIN shows an error; right PIN unlocks; Children/Lists/Progress/
      Account/Subscription/Settings all render real data.
- [x] Home shows each child's last score; deleting a child (with confirm)
      works.
- [x] Paywall screen renders benefits + both prices; tapping a plan shows
      "payments coming soon" instead of charging anything.
- [x] `/admin` redirects non-admins to "you don't have access."
- [x] `npm run build`, `npm test` (35/35), and `npm run lint` all pass clean.
- [ ] RLS cross-family isolation, guest→cloud migration, trial auto-expiry —
      **need a live Supabase project to run for real**; the code paths exist
      and are documented in §6, but I could not execute them in this
      environment without your project credentials.

## 12. What I need from you

Nothing is blocking local development or guest-mode use. To go further:

1. **A Supabase project** (§4) — URL + anon key, so cloud accounts, RLS, and
   the free-answer metering can actually run and be tested end-to-end rather
   than just read in the source.
2. **Google OAuth credentials** (§5) — only if you want "Continue with
   Google" live; otherwise it stays a friendly disabled state.
3. **Apple Sign-In credentials** (§5) — same, for "Continue with Apple."
4. A decision on **where to deploy** (§7) — Netlify/Vercel recommended; say
   the word and it can be wired to auto-deploy from this repo the same way
   the original prototype was connected to GitHub Pages.

## 13. Not built yet (by design — see spec priorities)

- **Real payments.** `subscriptionServiceClient.ts` has `startCheckout()` /
  `openBillingPortal()` as documented placeholders (see the comment there for
  the exact Stripe integration shape: a Checkout Session edge function, a
  webhook to update `subscriptions`, and a Billing Portal session). No Stripe
  keys exist anywhere in this repo.
- **Example sentences.** `weekly_words.example_sentence` and
  `speakTestPrompt()` exist in the schema/speech service (spec §25/§26) but
  no screen generates or shows a sentence yet — deliberately not blocking
  this MVP on it.
- **Teachers, schools, classrooms, class codes, teacher-assigned homework** —
  explicitly out of scope for this MVP per the spec; nothing here should
  make that harder to add later (child profiles belong to a family, not a
  classroom, on purpose).

## 14. Design

Kid-facing screens (Study, Practice Test, Home) use a bright per-child accent
color (`data-theme="pink|teal|purple|orange|mint|red"` on the child's card
carries through to their whole session) and big touch targets. Parent Area
and Admin switch to a deliberately calmer, low-color palette
(`data-mode="parent"`) per the "Kid Mode vs Parent Mode" split in the spec.
Both respect `prefers-color-scheme: dark`. All text inputs are 16px+ to
avoid iOS Safari's auto-zoom-on-focus, `viewport-fit=cover` + safe-area
padding handle the iPad notch/home-indicator, and every interactive control
is sized for touch first.

## 15. Smart Practice: Mastery, Readiness & the Practice Queue

A second iteration on top of the MVP above, turning the product from "another
spelling practice app" into the "Snap a photo → child practices
independently → parent knows when they're ready" pitch. Nothing from §1-14
was removed; this section documents what was added on top, in
[`src/domains/mastery/`](src/domains/mastery/).

### Mastery rule (v1) — `masteryEngine.ts`

Every `(family, child, list, word)` gets a `word_mastery` row with a status —
`not_practiced` → `learning` → `almost_mastered` → `mastered` — computed from
plain counters (no ML): correct/incorrect counts, a consecutive-correct
streak, how many *distinct* sessions have seen the word, and whether a hint
or "Show Answer" was used. The exact thresholds (3 consecutive-correct + 2
distinct sessions + a clean last-2 for `mastered`; a reveal never counts
toward mastery; status is recomputed from scratch on every event, so a
mastered word that's missed again drops straight back to `learning`) are
documented in the file's header comment, not buried in code. A parallel
0-100 `masteryScore` feeds queue prioritization only — it's never shown to
the child, and "mastered" the status is always the source of truth, not the
score.

### Readiness rule (v1) — `readiness.ts`

`NEEDS_PRACTICE` / `ALMOST_READY` / `READY_FOR_TEST` for a child's whole
list, **not** "did the last test go well" — it's driven by the aggregate
mastered-percent across the list (strict `mastered`-only for the 90%
`READY_FOR_TEST` bar; `mastered + almost_mastered` combined for the more
lenient 60% `ALMOST_READY` bar), plus a check for any word answered wrong in
the last 2 days — a fresh slip demotes `READY_FOR_TEST` back to
`ALMOST_READY` even at 90%+, on the theory that one recent miss on an
otherwise-strong list is worth a flag, not a false "all clear."

### Smart Practice queue — `practiceQueue.ts`

`generatePracticeQueue()` is a weighted shuffle (not a plain shuffle, not a
strict sort) — recently-incorrect words rank highest, then `learning`, then
`not_practiced`, then `almost_mastered`, then `mastered` last (weight 1, so
they show up rarely — never zero, per spec). `selectWordsForPracticeType()`
is the single function every entry point (the Practice Test screen, Kid
Home's recommendation, Parent Area's "Practice Weak Words" button) calls to
decide which words a given practice type uses — `weak_words` filters out
anything already `mastered` (falling back to the full list if literally
everything is), `quick_practice` clamps to 5-10 words, everything else
covers the whole list, just reordered.

**Spaced repetition within a session:** when a word is only resolved via
"Show Answer" (not gotten right), `reinsertMissedWord()` splices one fresh
retry attempt back into the *same session's* queue 2-4 questions later
(never immediately next) — capped at one retry per word per session, so a
child who keeps missing the same word doesn't get stuck in a loop. The
session's final score dedupes by word (the retry's outcome wins), so a word
missed once but caught on retry correctly counts as a win.

### Recommended practice — `recommendedPractice.ts`

`getRecommendedPractice()` is what powers Kid Home's single dominant
button. Priority order: nothing practiced yet → **Start Practicing**;
a test date is set and ≤1 day away → **Final Review**; already
`READY_FOR_TEST` → **Quick Review** (a light check-in, not zero practice);
otherwise → **Continue Practice**. Each comes with an estimated-minutes
figure (25 sec/word, clamped 3-10 min) used for the "About N minutes" line.

### New database changes — `supabase/migrations/0002_mastery_and_readiness.sql`

- **`word_mastery`** table (one row per family+child+list+word; unique
  constraint on `(child_id, list_id, word_id)`), RLS-scoped to the owning
  family exactly like every other table — one family cannot read or write
  another's mastery data.
- **`weekly_lists.test_date`** (nullable `date`) and **`weekly_words.example_sentence`** (nullable `text`, unused by any screen yet — see §13).
- **`practice_sessions.practice_type`** (`practice_test` / `smart_practice` /
  `weak_words` / `quick_practice` / `final_review` / `study`) alongside the
  original `mode` column, kept for backward compatibility with existing rows.
- **`families.parent_language`** (`en`/`es`, default `en`).
- **`admin_overview()`** extended with `words_practiced`, `words_mastered`,
  `families_ready_for_test` (a live snapshot: any family with a list ≥90%
  mastered right now — not a historical first-crossed-the-line event log,
  which would need its own table this iteration didn't add), and
  `avg_sessions_before_ready` (avg completed sessions per child, overall —
  a proxy metric; a precise "sessions until first reaching ready" would also
  need history the schema doesn't keep yet).

### Parent language (i18n) — `src/lib/i18n.tsx`, `src/locales/{en,es}.json`

A minimal `t(key, vars)` context, switched instantly by Parent Area →
Settings → Parent Language (persisted on `families.parent_language`, or
locally for guests). **Scope decision:** applied to Parent Area (tabs,
Progress's mastery groups/readiness badge, Subscription, Settings) and the
post-practice Results copy — the parent-facing surface where the spec's
example Spanish phrases live. Kid-facing screens (Study, Practice Test, Kid
Home) stay English-only on purpose — the spec is explicit that the child
always practices in English regardless of the parent's language. Admin
wasn't translated (internal testing tool). Adding a string elsewhere later
is one `t('new.key')` call plus one line in each of the two JSON files, not
a refactor.

### Verified end-to-end in the browser (not just unit-tested)

Guest → Add Child → Add Weekly Words (photo tab now primary; "Friday" quick-pick
correctly computed the next Friday; pasted 5 words) → onboarding dropped
straight into Smart Practice → answered word 1 wrong, watched it get
reinserted exactly 2 questions later (not immediately) → answered correctly
on retry → finished 5/5 (100%) with the retry correctly overriding the
original miss in the score → Results showed "Practice complete. 5 words
improved." and a "Needs Practice" readiness pill → Kid Home showed
"Hi Hillary 👋 / Your spelling test is Friday, Oct 2. / 0 / 5 words mastered /
Continue Practice — About 3 minutes" (all five words were `learning`, not yet
`mastered`, which is correct after one session) → Home's chooser card showed
the same mastered count → Parent Area → Progress showed
Mastered/Almost/Learning/Not Practiced counts, tapping "Learning — 5"
expanded to list the actual words, "Practice Weak Words" correctly started a
new round scoped to the 5 non-mastered words → switching Parent Language to
Español instantly relabeled the whole Parent Area (`Área de Padres`,
`Necesita Práctica`, `Aprendiendo — 5`, etc.) with zero reload. Zero console
errors the entire time.

### What still needs a live Supabase project to verify for real

Same caveat as §11: RLS cross-family isolation for `word_mastery` follows
the identical policy pattern already verified structurally for every other
table, but wasn't exercised against two real signed-in families in this
session.

### Tests added

35 new tests across `masteryEngine.test.ts`, `readiness.test.ts`,
`practiceQueue.test.ts`, and `recommendedPractice.test.ts` (73 total in the
repo now, all passing) — covering the spec's explicit list: new word →
`not_practiced`, one wrong answer → `learning`, enough correct →
`almost_mastered`, correct across multiple sessions → `mastered`, mastery
regressing after a later miss, the queue prioritizing recent mistakes,
mastered words appearing less (never zero), a missed word never repeating
immediately, readiness responding to more than just the last test, and
`READY_FOR_TEST` requiring more than one lucky session. The existing
free-answer-counter and premium-doesn't-meter tests from §10 were re-run
unchanged and still pass — mastery tracking doesn't touch that logic.
