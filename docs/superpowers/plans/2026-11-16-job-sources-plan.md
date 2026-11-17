# Step 3 plan: finding employers' job boards and collecting their UK jobs

Date: 2026-11-16
Status: draft for founder review
Builds on: [the blueprint](../specs/2026-11-05-visasponsorjobsuk-blueprint-design.md), §6 and §9 step 3

Labels used in this document:
- **(Founder)**: decided by the founder.
- **(Call)**: Claude's call, which the founder can override.
- **(Decide)**: needs the founder's decision before that stage is built.

## Goal

For as many register employers as possible:
1. find the hiring system that runs their job listings;
2. confirm it's really theirs;
3. collect their **UK** jobs into the `jobs` table every 6 hours.

Labelling the jobs (sponsorship offered / likely eligible / open to all) is step 4. It is not part of this plan.

## What we learned from real data (2026-11-16)

| Finding | Effect on the plan |
|---|---|
| Register names are legal names; boards use brands. Examples: "Monzo Bank Limited" → board "Monzo"; "Roofoods Ltd" → "Deliveroo". | Exact-name matching misses most employers. Brands unrelated to the legal name need a web search to find. |
| Greenhouse board "wise" is a US firm ("Wise Worksite Field Sales"), not Wise Payments. | Matching must be strict, and confirmed by UK jobs. |
| wise.jobs is Wise's branded careers page, but its jobs come from SmartRecruiters (438 jobs, structured locations). | Many custom-looking careers pages sit on a standard hiring system that we can read through its API. |
| Each system exposes different data. Greenhouse has a board name and free-text locations. Lever has no company name but a country field. Ashby's API has no company name, but its page title does ("Deliveroo Jobs"). SmartRecruiters has a company name and structured locations with a country code, but answers 200 even for made-up names (check `totalFound`). Workable's widget API didn't return JSON in testing (to confirm while building). | One small reader per system, each tested against saved real responses. |
| The latest Common Crawl index lists ~1,500 Greenhouse boards and misses some (Deliveroo). | Board lists are a useful head start, not complete coverage. |

## The matching rule (Founder, 2026-11-16)

A board belongs to an employer only if **all** of these hold:
1. The board's company name, normalised the same way as register names, is the **start of exactly one live employer's** normalised name. For example, "monzo" is the start of "monzo bank". It must match whole words: "wise" doesn't match "wiseman".
2. The board has **at least one UK job**.
3. That employer isn't an agency.

If two or more employers could match, the board is stored as `ambiguous` and skipped, never guessed. An exact name doesn't win over longer names that start with it. **(Call, changed 2026-11-16)** My first version let it win, but the real register has "WISE", a different organisation from "Wise Payments". That version would have put Wise's 209 jobs under the wrong employer.

## Stages

Each stage needs the founder's go-ahead, is built test-first, and is verified before it's called done.

### Stage A: Board readers (Greenhouse first) (Call)

**What it does:** for each hiring system, a small module that takes a board name and returns:
- the company name;
- the jobs: id, title, description (HTML and plain text), apply URL, location text and any country field, posted date.

**Order:** Greenhouse → SmartRecruiters → Lever → Ashby → Workable.

**How it's tested:** against real responses saved as test files, so no network is needed in tests.

### Stage B: UK-only location check (Call)

**What it does:** decides whether a job is in the UK. Three steps, in order:
1. If the system gives a country (SmartRecruiters `gb`, Lever `country`), use it.
2. Otherwise, read the location text against a list of UK place names and clear UK markers ("United Kingdom", "UK", "England", "Remote (UK)" …).
3. Also check a list of foreign markers: countries, US state codes, and known lookalikes such as Melbourne (Australia vs Derbyshire), Perth, London ON and Cambridge MA.

**Ambiguous cases:**
- A job listing several places is kept if any of them is in the UK.
- A location that's unclear, or a bare "Remote", is not kept (blueprint §6).

**Place-name data:** the ONS *Index of Place Names in Great Britain* plus a Northern Ireland list. Both are free public data, stored as a data file in the repo.

**How it's tested:** against every distinct location string found in Stage C's first real boards, checked by hand.

### Stage C: Discovery without a web search (free)

**What it does:** fills `job_sources` with matched boards (status `active` or `ambiguous`). It has two parts:
1. **Board lists:** collect board names from public web archives (Common Crawl indexes) for each system, then read each board and apply the matching rule.
2. **Name-guessing:** for each live, non-agency employer, build a few likely board names from its register name (e.g. `monzobank`, `monzo-bank`, `monzo`), try them on each system, and apply the matching rule.

**Volume:** the first full pass is roughly 300k+ requests for Greenhouse alone, several hours. It runs in nightly batches that pick up where the last one stopped. After that, each day only checks that day's new employers.

**Politeness:** low request rates per system, a generic user agent, and no personal email.

**Schema change (Decide):** a new table, `discovery_checks` (system, board name, checked when, result). It stops us asking for the same board twice; without it, every pass would repeat all ~300k requests.

### Stage D: Collecting jobs every 6 hours

**What it does:** for each `active` board:
1. read its jobs;
2. keep only UK jobs, and only from non-agency employers;
3. insert new jobs, update changed ones (using `content_hash`), and set `closed_at` on jobs that have disappeared;
4. delete jobs 7 days after they closed (Founder);
5. mark boards `error` / `not_found` when they fail, and log each run in `runs`.

**Schema change (Decide):** `jobs.label`, `label_reason`, `rules_version`, `labelled_at` and `category` are currently required. Jobs collected before step 4's labeller runs won't have them. Proposal: make them optional, and **hide unlabelled jobs everywhere** until they're labelled.

**Built (2026-11-17):** `src/lib/collect/`, `scripts/collect.ts` (`npm run collect`, `-- --apply` to write), `.github/workflows/collect-jobs.yml` (every 6 hours at :30). Rules as built:
- an edited ad (title, description, apply link, UK places, remote flag or posting date changed) has its label cleared, so it's hidden until re-labelled;
- a failed read marks the board `error` and leaves its jobs open; a board that no longer exists is marked `not_found` and its jobs close. Both are tried again on the next run, so boards recover by themselves;
- jobs of employers that leave the register or become agencies close at the start of each run;
- a closed job that reappears reopens (same ad) or is updated (edited ad).

### Stage E: Scheduling (Call)

GitHub Actions, like the register sync:
- **Discovery:** a nightly batch, capped at about 2 hours.
- **Collection:** every 6 hours.

Run times are reported in each run's stats, so GitHub minutes (2,000 a month free on a private repo) can be watched. **(Decide)** whether the repo stays private.

### Stage F: Web search discovery (later; separate approval) (Founder)

**What it does:** for employers still unmatched after Stage C, starting with A-rated Skilled Worker employers:
1. search the web for the employer's careers page;
2. detect the hiring system behind it (links or scripts pointing at Greenhouse, SmartRecruiters, Workday …);
3. read that system's API, applying the same matching rule plus a check that the website belongs to the employer.

**(Decide) before building:** the search service and a budget. Searching ~120k employers costs per thousand searches, and Claude will bring options with current prices.

Truly custom careers sites with no standard system behind them come **after** this, one at a time, and only for large employers.

## Known gaps (accepted for now)

- Employers whose brand is unrelated to their legal name (Roofoods → Deliveroo) aren't found until Stage F.
- Agencies with neutral names aren't caught by the name rule; job-level checks may come later.
- Workday and NHS sources are blueprint Phase 2, not in this plan.

## Decisions needed before building

1. Approve the `discovery_checks` table (Stage C).
2. Approve making the job label fields optional, with unlabelled jobs hidden (Stage D).
3. Private or public GitHub repo, which affects free Actions minutes (Stage E).
4. Later, for Stage F: search service and budget.
