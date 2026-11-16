# VisaSponsorJobsUK — Product Blueprint

Date: 2026-11-05
Status: draft for founder review

Labels used in this document:
- **(Founder)**: decided by the founder.
- **(Call)**: Claude's call, which the founder can override.
- **(Builder)**: left to whoever builds it.

---

## 1. Intent: why this exists

LinkedIn, Indeed and other job boards are full of recruitment-agency posts, reposts and low-quality "bullshit" listings. Applying through those boards is also inefficient. **(Founder)**

VisaSponsorJobsUK lists only **genuine jobs that UK employers publish on their own careers sites**. It shows each employer's **full job description** and sends the applicant **straight to the employer's own application page**. Every employer on the site holds a UK Home Office sponsor licence. **(Founder)**

The main product answers one question for people who need a visa: **"Will this job sponsor me, or could it?"** **(Founder)**

## 2. Who it serves

| Audience | Who | What they need |
|---|---|---|
| **Primary** | Experienced workers switching from one sponsored job to another. Graduates moving off the Student or Graduate visa. | Jobs that state sponsorship, or that meet the sponsorship rules. |
| **Secondary** | Anyone with the right to work in the UK. | Genuine, employer-posted jobs with no agency noise. |

**(Founder)**

## 3. Goals, non-goals, anti-goals

**Goals**
- List as many genuine UK jobs from licensed sponsors as possible, to attract traffic. **(Founder)**
- Label every job by sponsorship status (§5). **(Founder)**
- Offer a paid personalised job page plus Telegram alerts (§7). **(Founder)**
- **Success at 3 months:** good traffic and 100–200 paying users. **(Founder)**

**Non-goals for v1**
- Jobs outside the UK. All jobs must be UK-based. **(Founder)**
- CV upload or CV parsing. **(Call)**
- Discount codes, free trials, refunds through the site (handled manually in Stripe), employer or team accounts. **(Call)**
- Recurring subscriptions. **(Founder)**

**Anti-goals: these would defeat the product even if it works**
- Agency or third-party jobs appearing anywhere on the site. **(Call, from the founder's core promise)**
- Non-UK jobs appearing on the site. **(Founder)**
- A job labelled "Sponsorship offered" or "Likely eligible" when it isn't. A false green is worse than a missed one. **(Call)**
- Hand-curating employers or jobs. Collection must be automated. The founder is solo. **(Founder, earlier session)**

## 4. Working rules for this project

These are the founder's rules. **(Founder)**
- Nothing is built without the founder's explicit go-ahead. No extra features or work beyond what was asked.
- Every implementation is test-driven: write a failing test first, then make it pass.
- No work is called done without fresh verification evidence.
- Follow the Karpathy guidelines: simplest working code, surgical changes, assumptions stated out loud.
- **Code first, minimal AI.** Ads are read with rules and keyword checks in code. AI is used only where code genuinely can't cope, and each such use is raised with the founder first.

## 5. Job labels: the core of the product

Each job gets exactly one label, checked in this order. **(Founder, with calls marked)**

1. **Excluded: not listed at all.** Any of these applies:
   - the job is outside the UK;
   - the employer is a recruitment or staffing agency;
   - the ad is missing a title or a working apply link.

   **(Call, from the founder's rules)**
2. **Sponsorship offered.** The ad explicitly says the employer will sponsor a visa, for example "visa sponsorship available" or "we can sponsor a Skilled Worker visa". This label applies **even if the salary isn't stated**. **(Founder)**
3. **"No sponsorship" overrides the rule checks.** If the ad says "no sponsorship", "must already have the right to work in the UK" or similar, the job can only be **Open to all**. **(Founder approved)**
4. **Likely eligible.** The ad doesn't mention sponsorship, but **all** of these are true:
   - the job title maps to an **eligible occupation code** (SOC 2020) on the Home Office list of skilled occupations;
   - a **salary is stated** and meets the threshold for that occupation, meaning both the general threshold and the occupation's going rate. **No stated salary means not Likely eligible.** **(Founder)**
   - it is **full-time**: not part-time, bank, locum, sessional, zero-hours or casual. **(Founder)**
   - it is **permanent, or fixed-term for 12 months or longer**. **(Founder)**

   **Job type** is stored as a list, because a job can have more than one type, for example `{full_time, fixed_term}`. The allowed types are: `full_time`, `part_time`, `fixed_term` (fixed-term or temporary), `zero_hours`, `freelance` (freelance, consultant or contractor) and `early_careers` (apprenticeships, internships, graduate schemes). `part_time`, `zero_hours` and `freelance` block Likely eligible. `fixed_term` needs 12+ months stated. `early_careers` doesn't block on its own, and it's also a filter. An empty list means the ad didn't say. **(Founder)**

   If the ad doesn't state the hours or the contract type, that does not block the label. Only these block it: a stated part-time or casual arrangement, a fixed-term contract shorter than 12 months, or a temporary contract with no length given. **(Founder approved; Call: a temporary contract with no length given blocks the label)**
5. **Likely eligible for new entrants only.** Everything in rule 4 holds, except the salary meets only the lower **new-entrant** rate. The site shows a short "What's a new entrant?" explanation: under 26, switching from the Student or Graduate visa, recent graduates, or people working towards a professional qualification. **(Founder: label wording; Call: chose "new entrants" over "graduates")**
6. **Open to all.** Every other job from a licensed, non-agency employer.

**Edge cases (Call)**
- Both "Likely eligible" labels also require the employer's sponsor licence to cover the Skilled Worker route (which includes Health and Care) on the register. An employer licensed only for other routes can't produce Likely eligible.
- **Sponsorship offered** and both **Likely eligible** labels require the employer's **Worker licence to be A-rated** (`sponsors.rating = 'a'`; Premium and SME+ count as A). B-rated employers (downgraded for compliance problems, so they generally can't sponsor new workers), provisional UK Expansion Worker licences, and employers with only a Temporary Worker licence produce **Open to all** at most. **(Founder approved, 2026-11-16)**
- A job listed in several locations is kept if at least one is in the UK, and only the UK locations are shown.
- "Remote – UK" counts as UK. A bare "Remote" with no country is treated as unclear and isn't listed.

**Rules as data.** Thresholds, going rates, the list of eligible occupations and the new-entrant rules all live in database tables, so they can be updated without a code change. The builder must copy the current figures from gov.uk at build time and record the source and date. **(Call)**

**Reading the ad (Builder, within these constraints)**
- Salary: work out the annual pay from the ad's stated salary, converting hourly, daily or monthly figures to a yearly amount. For a salary range, use the **lower end**. **(Call)**
- Occupation code: match job titles against the ONS SOC 2020 coding index, a public table of job titles and their codes. If a title has no confident match, the job can't be Likely eligible. **(Call)**
- Every label must be reproducible from the stored ad text and the rule version that produced it. Store which rule fired, and the matching phrase if there is one, so the founder can check any label. **(Call)**

## 6. Job collection

**Employers (Founder approved)**
- Download the Home Office register of licensed sponsors automatically every day.
- Exclude agencies automatically, using name keywords and (Builder) any other free signal such as Companies House SIC codes.

**Sources, easiest first (Founder)**
- **Phase 1:** employers whose careers pages run on a hiring system with public, structured job feeds: Greenhouse, Lever, Ashby, Workable, SmartRecruiters.
- **Phase 2:** Workday, then the NHS sources (NHS Jobs and Trac), which are early priorities because healthcare is a major sponsorship sector.
- **Later:** other hiring systems, one at a time.

**Finding each employer's hiring system (Builder):** do it automatically. One approach is to try likely board names on each system's public feed and confirm the company name matches the register. Never match by hand.

**Industries:** no industry filter at the start. Take every UK job we can read. Sort each job into a category: Healthcare, Software & IT, Engineering, Finance, Business, Marketing, Sales, Design, Education, Other. The builder may refine this list. **(Founder; Call: exact list)**

**Data kept per job:**
- title, employer, UK location(s), salary as written plus the worked-out annual figure;
- hours, contract type, the full description as written, the apply URL on the employer's site;
- posting date, first seen, last seen, category, label, label reason, rule version.

**(Founder approved)**

**Freshness**
- Collect jobs every 6 hours **(Call)**.
- A job disappears from the site once it's no longer on the employer's feed.
- Remove duplicates across sources.

**UK-only check:** be strict and handle place names that exist both in the UK and abroad (Melbourne, Perth, Cambridge MA, London ON). Use the feed's country field where there is one. When the location is unclear, don't list the job. **(Call)**

**Be polite to employer sites (Call):** respect robots.txt, keep request rates low, and identify the scraper with a generic user agent.

## 7. Free vs premium

**Free: no account needed (Founder approved)**
- Browse every listed job, with labels and full descriptions.
- Search, and filter by category, label, location and salary.
- Apply links go straight to the employer.

**Premium: one-off passes through Stripe, no auto-renewal (Founder)**

| Pass | Price |
|---|---|
| Week | £3.99 |
| Month | £9.99 |
| Lifetime | £49.99 |

- Sign in with Supabase Auth, using Google or an email magic link. **(Call)**
- **Profile form:** highest education level and subject, total years of experience, job titles held or wanted (chosen from suggestions), one or more categories, and current visa situation. **(Founder: education and experience; Call: field breakdown)**
- **Personal page:** only matched jobs, newest first, with Sponsorship offered and Likely eligible first. Location and salary are **filters only**, not matching factors. **(Founder: filters; Call: ordering)**
- **Matching (code, no AI):** a job matches when all of these hold:
  - its category is one of the user's categories;
  - its title matches one of their job titles;
  - its seniority fits their years of experience. Check in this order:
    1. stated years ("X years' experience") are compared directly with the user's years;
    2. otherwise, seniority words in the title (graduate, junior, senior, lead) are used;
    3. if there's neither, seniority isn't used for matching.

    For display and filters, a job that only states years gets a level from these bands: 0–1 junior, 2–4 mid, 5–7 senior, 8+ lead. `graduate` comes only from words in the ad. **(Founder)**
  - its label fits their visa situation. "New entrants only" jobs are shown only to users who qualify.

  **(Founder: education and experience including level; Call: the mechanics)**
- **Telegram alerts:**
  - The user links their account once, through a bot deep link.
  - When a new matched job is labelled Sponsorship offered or either Likely eligible label, send a message with the title, employer, location, salary, label and link. Open to all jobs never trigger alerts. **(Founder)**
- **Expiry (Call, founder approved):**
  - Send a Telegram reminder one day before a pass expires.
  - At expiry the personal page and alerts stop, but the profile is kept.
  - Buying a pass while one is active adds the time to the end.
  - Lifetime never expires.

## 8. How it's built

**Current repo**
- Next.js 16.4.5 with the App Router, with `cacheComponents`, `partialPrefetching` and the React Compiler switched on.
- React 19.3, TypeScript.
- Tailwind v4, and shadcn (`base-nova` style, Base UI) with lucide icons.
- Supabase (Postgres and Auth via `@supabase/ssr`).
- Drizzle ORM 1.0 RC with drizzle-kit and postgres-js.
- Environment keys already set: Supabase, Anthropic, Telegram, site URL, contact email.

**Next.js 16 warning:** this version differs from older Next.js. Read `node_modules/next/dist/docs/` before writing Next code (see AGENTS.md).

**Hosting (Founder)**
- **Vercel** hosts the website and anything that must answer instantly: the Stripe webhook and Telegram account linking.
- **GitHub Actions** runs all scheduled work:
  - daily register download and hiring-system discovery;
  - job collection, labelling, expiry and alerts every 6 hours;
  - daily pass-expiry reminders.
- Both sides use one Supabase database.

**Testing:** add Vitest as the test runner. **(Call)** It's needed for the test-driven rule.

**Migrations:** the founder runs database migrations themselves.

**Known risks for the builder to watch and report on**
- **GitHub Actions minutes.** A private repo gets 2,000 free minutes a month. Measure real run times early and report before this becomes a cost.
- **Scheduled runs start late.** GitHub's scheduler can start runs 10–30 minutes late. That's acceptable: alerts arrive "within hours".
- **Showing full job descriptions.** Always credit the employer and link to the original ad.
- **UK GDPR.** Premium profiles hold personal data, so the site needs a privacy policy and a way to delete an account.

## 9. Suggested build order (each step needs the founder's go-ahead)

1. **Foundation:** Vitest, database schema, the rules-data tables loaded with current gov.uk figures.
2. **Sponsor register:** daily download and storage, with agencies excluded.
3. **First source:** Greenhouse discovery and collection, with the UK-only check.
4. **Labeller:** rules 1–6 in code, tested against a hand-checked sample of real ads.
5. **Public site:** job list, filters, job detail page with full description and apply link.
6. **More Phase 1 sources:** Lever, Ashby, Workable, SmartRecruiters.
7. **Premium:** auth, profile form, Stripe passes, personal page, matching.
8. **Telegram:** account linking, alerts, expiry reminders.
9. **Phase 2 sources:** Workday, NHS Jobs, Trac.

**(Call)** Step 5 gives the site something to show early, which supports the traffic goal.

## 10. Left to the builder

- Database schema details and indexes.
- Page layouts and visual design, within the shadcn setup.
- The exact keyword lists for sponsorship statements, "no sponsorship" statements, agency detection and seniority. Each list must be covered by tests.
- How each hiring system is discovered and read.
- The URL structure and SEO details. **(Call)** Suggestion: add Google for Jobs structured data on job pages, which supports the traffic goal. The founder must approve it before it's built.
