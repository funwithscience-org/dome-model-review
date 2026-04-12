# Decider: Reporting, Issue Management, and Morning Briefing

## Step 3: Cross-Reference Open Issues

Read `monitor/decisions/open-issues.json` (open issues ONLY — fixed/wontfix are in closed-issues.json).

For each new finding:
- Already tracked? Update the existing issue.
- Previously closed as wontfix? `node -e "const c=JSON.parse(require('fs').readFileSync('monitor/decisions/closed-issues.json','utf8'));c.issues.filter(i=>i.status==='wontfix').forEach(i=>console.log(i.issue_id,i.win_id,i.description.slice(0,80)))"` — if matching wontfix exists, do NOT re-raise.
- Genuinely new? Create new issue entry.

When fixed: move from open → closed with `status: "fixed"`, `fixed_at` timestamp.

## Step 4: Daily Report

Write to `monitor/decisions/daily-report-YYYY-MM-DDTHH-MM.json`:

```json
{
  "generated_at": "ISO 8601 timestamp",
  "report_date": "YYYY-MM-DD",
  "curmudgeon_reviews_processed": ["WIN-042", "WIN-043"],
  "pipeline_status": {
    "poller": "summary",
    "analyst": "summary",
    "curmudgeon": "progress (N/total reviewed)"
  },
  "external_changes": {
    "dome_site_changes": "summary or 'no changes'",
    "threat_level": "none|low|medium|high"
  },
  "internal_issues": [
    {
      "issue_id": "ISS-NNN",
      "win_id": "WIN-NNN",
      "severity": "critical|major|moderate|minor",
      "category": "factual_error|citation|verdict|missing_argument|code_analysis",
      "description": "What's wrong",
      "source": "curmudgeon|analyst|poller",
      "status": "new|existing|fixed",
      "suggested_patch": {
        "file": "data/wins.json or data/sections.json",
        "field": "detail_evidence or section identifier",
        "find": "exact text to replace",
        "replace": "corrected text"
      }
    }
  ],
  "code_analysis_updates": [
    {
      "win_id": "WIN-NNN",
      "tags": {
        "monitoring": "hardcoded|live_fetch|none",
        "relabels_standard": true,
        "post_hoc": true,
        "derives_from_dome": false,
        "reviewed": true
      },
      "source_review": "monitor/curmudgeon/reviews/WIN-NNN.json"
    }
  ],
  "recommended_actions": [
    {
      "priority": 1,
      "action": "description",
      "urgency": "immediate|next_session|backlog"
    }
  ],
  "breaking_news_suggestions": [
    {
      "headline": "Short punchy headline (clickbait-y, max ~15 words)",
      "summary": "2-3 sentence summary with specific numbers. Link to relevant section.",
      "link_target": "#anchor-id",
      "link_tab": "tab-name",
      "source": "Which agent/analysis produced this finding",
      "why_newsworthy": "Brief justification — what makes this a headline vs routine finding"
    }
  ]
}
```

## Step 5: Update Issue Tracker

**CRITICAL: Issue ID Assignment.** `open-issues.json` has a `next_id` field (integer). When creating new issues:
1. Read `next_id` from `open-issues.json`
2. Assign the new issue `ISS-{next_id}`
3. Increment `next_id` and write it back

**Never scan for max ID across issues.** IDs were historically reused between open and closed files, causing collisions. The `next_id` counter is the single source of truth for the next available ID.

```bash
# Example: create a new issue
node -e "
const fs=require('fs');
const o=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const id='ISS-'+o.next_id;
o.next_id++;
o.issues.push({id, win_id:null, severity:'moderate', category:'content-update', status:'open', description:'...', found_by:'decider', found_at:new Date().toISOString()});
fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(o,null,2));
console.log('Created',id);
"
```

Update `monitor/decisions/open-issues.json`:
```json
{
  "last_updated": "ISO timestamp",
  "next_id": 674,
  "issues": [
    {
      "id": "ISS-NNN",
      "win_id": "WIN-NNN or null",
      "severity": "critical|major|moderate|minor",
      "category": "factual_error|citation|verdict|missing_argument|code_analysis",
      "description": "What's wrong",
      "source": "curmudgeon|analyst|poller",
      "found_date": "YYYY-MM-DD",
      "status": "open|fixed|wontfix",
      "fix_details": "How it was fixed, or null",
      "fix_date": "YYYY-MM-DD or null"
    }
  ]
}
```

## Step 5b: Archive Closed Issues

If open-issues.json has >50 entries with status "fixed" or "wontfix" older than 7 days, move them to closed-issues.json (append). Keep only open + recently-closed in active file.

## Step 6b: Breaking News Suggestions

The overview page has a "Latest Findings" section (reverse-chronological, 3–5 items, slightly clickbait-y). **Adding items is a human decision** — your job is to surface candidates.

**When to suggest:** A finding is newsworthy if it represents a major new argument, a dramatic self-contradiction, a significant dome site change, or a milestone in the predictions catalog. Routine patches, minor fixes, and incremental expansions are NOT news.

**Good examples:** "Dome moves the sun to fix X, breaks Y other predictions." "N new predictions mined, M already falsified." "Dome author fixes [canary item] — confirms he's reading our review." "Kill-shot test X now has hard data: dome fails by N×."

**Bad examples:** "Fixed a typo in Section 3.2." "Curmudgeon reviewed 5 more WINs." "Analyst expanded Section 6.8."

Include `breaking_news_suggestions` in the daily report whenever you have a candidate. The analyst and poller can also flag items — look for `newsworthy` or `breaking_news` fields in their outputs. All suggestions go in the daily report and morning briefing for human review.

## Step 7: Morning Briefing

Write to `monitor/decisions/morning-briefing.txt`:

```
MORNING BRIEFING — YYYY-MM-DD
Generated: YYYY-MM-DDTHH:MM:SSZ
Curmudgeon reviews processed this run: N (WIN-XXX through WIN-YYY)
Previous decider run: YYYY-MM-DDTHH:MM:SSZ
```

Include:
- Site health (integrity: pass/warn/fail)
- External status (dome changes: yes/no)
- Internal status (issues found, severity breakdown)
- Top 3 priority actions
- Curmudgeon progress
- Code analysis tag status (validated vs pending)

## Step 8: Update Status

Update `monitor/status.json` and `monitor/review-state.json` if needed.

## Code Analysis Tag Tracking

When curmudgeon reviews include `code_analysis_tags`, note unsynced count. Tags applied via: `node build-scripts/sync-code-analysis.js --apply --workspace`. Recommend in morning briefing if gap exists.
