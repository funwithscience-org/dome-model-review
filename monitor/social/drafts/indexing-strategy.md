# Search Engine Indexing & Discoverability Strategy

**Author:** Social Analyst (automated)  
**Date:** 2026-04-11  
**Status:** Strategy document — actionable recommendations for human review  
**Requested by:** SOCIAL-NOTE-002

---

## Executive Summary

Neither our site (funwithscience-org.github.io/dome-model-review) nor the dome model site (john09289.github.io/predictions) is indexed by any search engine. This is the #1 discoverability blocker. All our machine-readable infrastructure (ClaimReview, llms.txt, OG tags, sitemap) is invisible to every search engine and fact-check aggregator until indexing happens.

This document presents a concrete, ranked action plan. Each recommendation includes counterarguments and identifies who needs to act.

---

## 1. Google Search Console Verification (HIGH IMPACT, LOW EFFORT)

**What:** Register our GitHub Pages URL as a URL-prefix property in Google Search Console (GSC).

**How it works for GitHub Pages:**
- Add `https://funwithscience-org.github.io/dome-model-review/` as a URL-prefix property
- Verify ownership via HTML file upload: Google provides an HTML verification file (e.g., `google1234567890abcdef.html`) that must be placed at the site root. For GitHub Pages project sites, this means committing the file to the `docs/` directory (or whichever directory serves the Pages site).
- Alternative: HTML meta tag verification — add a `<meta name="google-site-verification" content="...">` tag to the `<head>` of index.html. This would require a build script change to include the tag.
- Once verified: submit `sitemap.xml`, use URL Inspection tool to request priority indexing of key pages.

**Expected timeline:** 3–7 days from verification to initial indexing. URL Inspection requests can accelerate individual pages to 24–72 hours.

**Who acts:**
- **Human required** — creating a Google account and verifying site ownership in GSC cannot be automated by agents.
- **Agent can do** — once verified, the decider can add the HTML verification file to `docs/` and push. If meta tag verification is chosen, an issue should be filed for a `generate-html.js` change.

**Counterargument:** Google Search Console requires a Google account, which creates a personal data linkage. If privacy is a concern, a purpose-built Google account could be used. Also, indexing alone doesn't guarantee ranking — a new site with no backlinks may still rank poorly initially.

**Recommendation:** This is the single highest-impact action available. Do this first.

---

## 2. Bing Webmaster Tools + IndexNow (HIGH IMPACT, LOW EFFORT)

**What:** Register with Bing Webmaster Tools, then implement IndexNow for automatic submission.

**How it works:**
- Bing allows importing verification directly from Google Search Console (no separate verification needed if GSC is done first).
- IndexNow is an open protocol that notifies Bing, Yandex, DuckDuckGo, and other participating engines when content changes.
- Implementation: place an API key file (e.g., `abc123.txt`) at the site root (`docs/abc123.txt`) and submit URLs via HTTP POST to `https://api.indexnow.org/indexnow`.
- A GitHub Action exists (`jakob-bagterp/index-now-submit-sitemap-urls-action`) that auto-submits sitemap URLs on every push. This would integrate directly into our existing publish workflow.

**Expected timeline:** 5–10 days from Bing submission. IndexNow can accelerate new/changed page discovery to near-real-time for participating engines.

**Who acts:**
- **Human required** — Bing Webmaster Tools account creation.
- **Agent can do** — once the API key is provided, the decider can add the key file to `docs/`, add the GitHub Action to the workflow, and integrate IndexNow submission into `build.js publish`.

**Counterargument:** IndexNow only notifies engines that content has changed — it doesn't guarantee crawling or indexing. For a brand-new site with no history, the first submission may still take days. Also, Bing's market share is small (~3% globally), though it powers DuckDuckGo and Yahoo results.

**Recommendation:** Do this immediately after GSC verification. The GitHub Action automation is low-maintenance and provides ongoing benefit.

---

## 3. Backlink Strategy (MEDIUM IMPACT, MEDIUM EFFORT)

**What:** Earn inbound links from indexed pages to break out of the "search vacuum."

Backlinks are how search engines discover new sites organically and how they assess authority. A site with zero inbound links from indexed pages is effectively invisible to crawlers that haven't been told about it via GSC/Bing.

**Legitimate approaches (in priority order):**

**3a. GitHub repo README → published site link**
- Ensure the GitHub repo description and README.md prominently link to the published GitHub Pages URL. GitHub repo pages themselves rank in search results. This is the easiest "backlink" to create and is already partially in place.
- **Who acts:** Agent can update README.md.

**3b. Fact-check aggregator discovery**
- Our ClaimReview JSON-LD markup is designed to be picked up by Google Fact Check Explorer. However, this requires our page to be indexed first (chicken-and-egg problem). Once indexed via GSC, the ClaimReview markup should be automatically discovered by Google's fact-check crawler.
- **Important caveat:** Google determines "authoritative source" eligibility algorithmically. A brand-new site may not immediately qualify for Fact Check rich results. The eligibility criteria include: multiple pages with ClaimReview markup, accountability/transparency standards, corrections policy. Our single-page review may need supplementary pages to qualify.
- **Who acts:** After indexing, monitor Fact Check Explorer for our review. If not appearing, file an issue for adding a corrections/methodology page.

**3c. Academic/science communication communities**
- If the human decides to share the review in relevant communities (r/flatearth debunking threads, science communication forums, skeptic communities), each share from an indexed site creates a crawl path. This is a human decision — agents do not engage externally.
- **Who acts:** Human only.

**3d. Stack Overflow / developer forums**
- If the human has accounts on developer platforms, a profile link to the project is a legitimate dofollow backlink source. Low effort but also low SEO value.
- **Who acts:** Human only.

**Counterargument:** Backlink building is slow and organic. For a niche topic like dome model critique, there may never be significant inbound link volume. The GSC + IndexNow approach is more reliable for initial indexing and should be prioritized over backlink pursuit.

---

## 4. GitHub Repo SEO (LOW-MEDIUM IMPACT, LOW EFFORT)

**What:** Optimize the GitHub repo itself for search visibility.

**Specific actions:**
- Set a repo description (currently null): e.g., "Scientific critical review of the Ovoid Cavity Cosmological Model (ECM) — every claim checked against published data"
- Add topic tags: `flat-earth`, `fact-check`, `dome-model`, `scientific-review`, `claimreview`, `cosmology-critique`
- Ensure README.md has a prominent link to the published site with descriptive anchor text
- Add an "About" section link pointing to the GitHub Pages URL

**Who acts:**
- **Human required** — repo description and topics changes require GitHub account access with write permissions.
- **Agent can do** — draft the description and topic list; update README.md.

**Counterargument:** GitHub repos do rank in search, but typically for developer-oriented queries. Users searching for dome model debunking are unlikely to search GitHub. However, this is near-zero effort and provides a crawl seed for the Pages site.

---

## 5. Custom Domain (MEDIUM IMPACT, MEDIUM EFFORT)

**What:** Register a custom domain (e.g., `funwithscience.org` or `dome-model-review.com`) and point it to GitHub Pages.

**Benefits:**
- Builds independent brand authority rather than contributing to github.io subdomain authority
- More memorable URL for sharing
- Better trust signals for search engines
- GitHub Pages supports custom domains with free HTTPS via Let's Encrypt

**Costs:**
- $12–55/year depending on TLD
- One-time DNS setup (CNAME record pointing to `funwithscience-org.github.io`)
- Need to update all hardcoded references (sitemap, llms.txt, OG URLs, canonical tags, internal links)
- Redirects from the old github.io URL need to work to preserve any future SEO value

**Who acts:** Human required for domain purchase and DNS configuration. Decider can handle URL updates in the build pipeline.

**Counterargument:** This is premature optimization. The github.io URL works, and switching domains before we have any search presence means there's nothing to "migrate." The $12+/year is trivial but the URL update work across all files is non-trivial. More importantly, a custom domain does NOT solve the indexing problem — we still need GSC verification regardless.

**Recommendation:** Defer until after GSC/Bing indexing is working. Revisit in 30 days. If search performance is poor after indexing, a custom domain may be worth the effort. If search performance is acceptable on github.io, save the hassle.

---

## 6. AI Discoverability (ALREADY IN PLACE, MONITOR)

**What:** Ensure AI systems (ChatGPT, Perplexity, Claude) can find and correctly represent our review when asked about the dome model.

**Current state:**
- `llms.txt` is in place (4,764 bytes), with rebrand-resistant anchors
- ClaimReview JSON-LD is in the HTML
- The dome has `ai_manifest.json` with AI-steering directives; we deliberately do not replicate this pattern

**Gaps:**
- AI systems that crawl the web (Perplexity, ChatGPT with browsing) can only find us if our pages are indexed or if they follow direct links. Until indexing happens, AI discoverability is limited to systems that specifically crawl GitHub Pages or follow llms.txt conventions.
- We cannot directly test whether AI systems find us without using those systems' interfaces (which is a human task).

**Who acts:** Monitor only. Once indexed, consider asking AI systems about the dome model to see if our review appears.

---

## 7. Yandex Webmaster (LOW IMPACT, LOW EFFORT)

**What:** Submit to Yandex Webmaster for Russian/Eastern European search coverage.

**Counterargument:** Extremely niche audience. The dome model's primary audience is English-speaking. Yandex market share outside Russia is negligible. Do this only if all higher-priority items are done and there's nothing else to optimize.

---

## Recommended Action Sequence

| Priority | Action | Who | Effort | Timeline |
|----------|--------|-----|--------|----------|
| 1 | Google Search Console verification | Human | 15 min | Day 1 |
| 2 | Submit sitemap in GSC, request indexing | Human | 10 min | Day 1 |
| 3 | Import to Bing Webmaster Tools | Human | 5 min | Day 1 |
| 4 | Set GitHub repo description + topics | Human | 5 min | Day 1 |
| 5 | Add IndexNow to publish pipeline | Agent (decider) | 30 min | Day 2–3 |
| 6 | Monitor indexing in GSC/Bing | Human/Agent | Ongoing | Day 7+ |
| 7 | Evaluate custom domain need | Human | Decision | Day 30+ |

**Total human time required for items 1–4: approximately 35 minutes.**

---

## What We Should NOT Do

- **Paid SEO services or link farms.** Our credibility depends on being a legitimate scientific review. Any artificial link building undermines that.
- **Replicate the dome's AI-steering infrastructure.** Their `ai_manifest.json` tells LLMs how to argue. Our `llms.txt` presents evidence. This asymmetry is a feature, not a bug.
- **Obsess over ranking before indexing.** Ranking optimization (keyword density, content strategy, etc.) is premature when we're not in the index at all. Get indexed first, then optimize.
- **Post our review on external platforms for SEO.** This is a human engagement decision, not an agent action. If done, it should be for the purpose of genuine discourse, not SEO manipulation.
