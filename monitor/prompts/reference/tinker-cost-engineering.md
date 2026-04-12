# Tinker Mode 3: Cost Engineering & Architecture

This module is loaded when the pipeline is healthy and you have context to spend on the highest-value work: making this pipeline cheaper and smarter. This is where you think, not where you check boxes.

## The Goal

Increase responsiveness (run agents more often) without increasing cost — or decrease cost while maintaining quality. Every Opus token spent on "nothing changed, skipping" is a token that could have been spent on actual analysis.

## Step 1: Measure Waste

Read each agent's recent reports and ask: "How much of this run was setup/discovery vs. actual analytical work?" Track the ratio.

A healthy agent spends >60% of its tokens on judgment. An unhealthy one spends >60% on boilerplate.

### No-op patterns to look for:
- **Analyst:** "No new WINs. No pending expansions. No human notes. Ran Mode 4 on 1 item." — Opus run for a Haiku task.
- **Decider:** "No new digest entries. No new external reports. 0 patches." — Expensive round-trip for nothing.
- **Curmudgeon:** Reviewed 1 item but spent half its tokens cloning, loading context.
- **Social:** "No new activity. All files verified OK." — Sonnet run for a Haiku checklist.
- **Tinker (yourself):** If this run produces only "everything looks fine" — you just wasted an Opus invocation.

For each agent, estimate what fraction of recent runs produced substantive output. Report this.

## Step 1b: Detect Wasted Compute (Re-Work Patterns)

No-ops are cheap waste — the agent discovers there's nothing to do and stops. **Re-work is expensive waste** — the agent spends full Opus tokens re-analyzing something another agent already finished. Detecting re-work is harder because the agent's output looks substantive; only cross-referencing reveals it was redundant.

### Patterns to scan for:

**1. Curmudgeon re-reviewing the same target:**
```bash
# Find targets reviewed more than once. Same target_id across multiple review files = re-review.
node -e "
const fs=require('fs');
const dir='monitor/curmudgeon/reviews/';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
const byTarget={};
files.forEach(f=>{
  try{const r=JSON.parse(fs.readFileSync(dir+f,'utf8'));
  const tid=r.target_id||r.win_id||f.replace('.json','');
  (byTarget[tid]=byTarget[tid]||[]).push({file:f,date:r.reviewed_at||fs.statSync(dir+f).mtime.toISOString()});
  }catch(e){}
});
Object.entries(byTarget).filter(([k,v])=>v.length>1).forEach(([k,v])=>console.log(k+': '+v.length+' reviews — '+v.map(x=>x.file).join(', ')));
"
```
Root cause: curmudgeon's fresh clone doesn't contain its own prior reviews (written to FUSE). Fix: curmudgeon checks FUSE for existing reviews before starting (already patched — verify it's working).

**2. Analyst re-writing completed expansions:**
```bash
# Expansion tracker items that are integrated but were worked on after integration.
# Check: any expansion file modified AFTER its tracker item was marked integrated.
node -e "
const fs=require('fs');
const t=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));
t.items.filter(i=>i.integrated&&i.integrated_at).forEach(i=>{
  const expFile='monitor/analyst/expansions/'+i.id+'.json';
  if(fs.existsSync(expFile)){
    const mtime=fs.statSync(expFile).mtime.toISOString();
    if(mtime>i.integrated_at) console.log('RE-WORK: '+i.id+' integrated at '+i.integrated_at+' but file modified at '+mtime);
  }
});
"
```
Root cause: `integrated: true` set without `status: 'complete'` — analyst sees pending item and re-does it. Fix: decider always sets both fields together (already patched — verify).

Also check for the inverse: `status: 'complete'` without `integrated: true` that's been sitting for more than 2 decider cycles:
```bash
node -e "
const t=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));
const stale=t.items.filter(i=>i.status==='complete'&&!i.integrated&&!i.routed_to_curmudgeon);
stale.forEach(i=>console.log('STALE COMPLETE: '+i.id+' — complete but never integrated, created '+i.created_at));
"
```

**3. Decider re-processing orphaned proposals (FUSE can't unlink):**
```bash
# Check processed-proposals ledger vs actual proposal files on FUSE.
# If proposal files exist that AREN'T in the ledger, they'll be re-processed next run.
node -e "
const fs=require('fs');
const dir='monitor/analyst/issue-proposals/';
const ledgerPath='monitor/analyst/processed-proposals.json';
const ledger=fs.existsSync(ledgerPath)?JSON.parse(fs.readFileSync(ledgerPath,'utf8')):{files:[]};
const onDisk=fs.readdirSync(dir).filter(f=>f.startsWith('proposal-')&&f.endsWith('.json'));
const orphans=onDisk.filter(f=>!ledger.files.includes(f));
if(orphans.length) console.log('ORPHAN PROPOSALS (will be re-processed): '+orphans.join(', '));
else console.log('All proposals in ledger — no orphan risk');
"
```
Root cause: FUSE can't delete files; ledger-based dedup is the fix (already implemented). Verify ledger is being maintained.

**4. Agents producing output that duplicates already-committed content:**
```bash
# Check for new-wins files that correspond to WINs already in wins.json.
node -e "
const fs=require('fs');
const wins=JSON.parse(fs.readFileSync('data/wins.json','utf8')).map(w=>w.win_id);
const dir='monitor/analyst/new-wins/';
if(fs.existsSync(dir)){
  fs.readdirSync(dir).filter(f=>f.endsWith('.json')).forEach(f=>{
    const id=f.replace('.json','');
    if(wins.includes(id)) console.log('DUPLICATE: '+f+' already committed to wins.json');
  });
}
"
```

**5. Priority queue items that target already-reviewed content:**
```bash
# Queue items pointing at targets that curmudgeon has already reviewed post-integration.
node -e "
const fs=require('fs');
const pq=JSON.parse(fs.readFileSync('monitor/curmudgeon/priority-queue.json','utf8'));
const reviewDir='monitor/curmudgeon/reviews/';
const reviews=fs.existsSync(reviewDir)?fs.readdirSync(reviewDir):[];
pq.queue.forEach(q=>{
  const matchingReviews=reviews.filter(r=>r.includes(q.target_id));
  const postPush=matchingReviews.filter(r=>{
    try{const rev=JSON.parse(fs.readFileSync(reviewDir+r,'utf8'));
    return rev.reviewed_at&&rev.reviewed_at>q.pushed_at;}catch(e){return false;}
  });
  if(postPush.length) console.log('STALE QUEUE: '+q.target_id+' already reviewed after push ('+postPush.map(r=>r).join(', ')+')');
});
"
```

### Reporting:

Include in your report:
```json
"wasted_compute": {
  "re_reviews": [{"target": "SEC-6.11", "count": 3, "root_cause": "clone missing FUSE reviews", "status": "FIXED|ACTIVE"}],
  "re_work": [{"expansion": "EXP-075", "root_cause": "integrated without status:complete", "status": "FIXED|ACTIVE"}],
  "orphan_reprocessing": [{"file": "proposal-ISS-700-status.json", "in_ledger": true}],
  "duplicate_outputs": [],
  "stale_queue_items": [],
  "estimated_wasted_opus_runs": 0,
  "trend": "IMPROVING|STABLE|WORSENING"
}
```

**Escalation:** If any pattern shows 3+ instances of active (not fixed) re-work, flag as `major` finding and write a PROP to fix the root cause. The goal is zero active re-work patterns — every agent run should produce NEW analysis, never repeat old analysis.

## Step 2: Pick the Worst Offender and Go Deep

**Do NOT survey all agents shallowly.** Pick the SINGLE agent with the highest waste or biggest prompt, read its actual prompt file, and produce a complete PROP with all the files needed to implement the fix. One agent, deep work, ready to apply.

### How to pick:
1. Check prompt line counts: `wc -l monitor/prompts/*.md`
2. Check which agents already have dispatchers: look for dispatcher routing logic in the prompt
3. Pick the fattest un-converted agent, OR the agent with highest waste from Step 1
4. Read its FULL prompt: `cat monitor/prompts/{agent}.md`

### What to produce:
A PROP file containing the ACTUAL dispatcher prompt and ALL worker module files — not a description of what they'd look like, the real content. The human should be able to copy-paste these files and be done.

To write a good dispatcher split, you need to understand:
- **What's the agent's soul?** The core directive that every mode needs (e.g., analyst's Kernel of Truth). This stays in the dispatcher.
- **What are the mutually exclusive modes?** Each becomes a worker module.
- **What's shared infrastructure?** (auth setup, data loading) — stays in dispatcher or becomes a tiny shared module.
- **What's the routing logic?** Quick checks (file counts, timestamps, tracker status) that determine which mode to run.

### Conversion template:
```
Dispatcher (~80-100 lines):
  - Identity + core directive
  - Context (brief)
  - Setup steps (auth, etc.)
  - Mode priority checks (bash one-liners)
  - Routing: "Read reference/agent-modeN.md, execute"
  - Critical rules (apply to ALL modes)

Worker module (~60-150 lines each):
  - Full procedure for one mode
  - All code blocks, schemas, examples for that mode
  - Self-contained — agent doesn't need the other modules
```

### Optimization patterns (beyond dispatcher conversion):

**Haiku pre-flight gate:** Cheaper agent checks if there's work before spinning up Opus. Good intermediate step.

**Preprocessor scripts:** Move mechanical data gathering into Node scripts. We have `digest-reviews.js` already. Look for more: "what changed since last run" summaries, skip-signal files.

**Smarter scheduling:** Event-driven beats time-driven. If curmudgeon hasn't produced a new review, why run the decider?

**Prompt diet:** Extract reference material to files. Stepping stone to dispatcher, not the end state.

## Step 3: Track and Report

Include in your report:
```json
"cost_engineering": {
  "agent_efficiency": [
    {
      "agent": "analyst",
      "recent_runs_checked": 3,
      "substantive_runs": 1,
      "no_op_runs": 2,
      "estimated_waste_pct": 67,
      "model": "opus",
      "recommendation": "Dispatcher conversion (PROP-NNN)"
    }
  ],
  "proposals_written": [
    {"id": "PROP-NNN", "summary": "Brief description", "priority": "high|medium|low"}
  ],
  "implemented_since_last_report": [],
  "cumulative_estimated_savings": "Running total"
}
```

## Step 4: Per-Agent Context Load Tracking (Bloat Watch)

Every agent reads CLAUDE.md + its dispatcher prompt + some set of reference files. A major refactor (V6, 2026-04-07) dramatically reduced prompt sizes. **We need to make sure we don't creep back.**

**Each Mode 3 run, compute the TOTAL context load for each Opus agent:**

```bash
# Per-agent total context load (lines). Adjust if agents gain/lose reference files.
CLAUDE=$(wc -l < CLAUDE.md)
echo "CLAUDE.md: ${CLAUDE}L"

# Analyst: dispatcher + SCIENTIFIC-CONTEXT + DATA-SCHEMAS + all analyst-mode*.md + analyst-infrastructure.md
ANALYST=$(cat monitor/prompts/analyst.md monitor/prompts/reference/SCIENTIFIC-CONTEXT.md monitor/prompts/reference/DATA-SCHEMAS.md monitor/prompts/reference/analyst-mode0-onboarding.md monitor/prompts/reference/analyst-mode1-expansions.md monitor/prompts/reference/analyst-mode1b-predictions.md monitor/prompts/reference/analyst-mode34-procedures.md monitor/prompts/reference/analyst-normal-analysis.md monitor/prompts/reference/analyst-infrastructure.md | wc -l)
echo "Analyst total (excl CLAUDE.md): ${ANALYST}L, with CLAUDE.md: $((ANALYST+CLAUDE))L"

# Curmudgeon: dispatcher + SCIENTIFIC-CONTEXT + DATA-SCHEMAS + conditionally-loaded change/holistic module
CURM_DISP=$(cat monitor/prompts/curmudgeon.md monitor/prompts/reference/SCIENTIFIC-CONTEXT.md monitor/prompts/reference/DATA-SCHEMAS.md | wc -l)
CURM_COND=$(wc -l < monitor/prompts/reference/curmudgeon-change-and-holistic.md)
echo "Curmudgeon dispatcher+refs (excl CLAUDE.md): ${CURM_DISP}L, conditional: ${CURM_COND}L, max total: $((CURM_DISP+CURM_COND+CLAUDE))L"

# Decider: dispatcher + SCIENTIFIC-CONTEXT + DATA-SCHEMAS + all decider-*.md + BUILD-AND-CHANGE
DECIDER=$(cat monitor/prompts/decider.md monitor/prompts/reference/SCIENTIFIC-CONTEXT.md monitor/prompts/reference/DATA-SCHEMAS.md monitor/prompts/reference/decider-intake.md monitor/prompts/reference/decider-curmudgeon.md monitor/prompts/reference/decider-patches-and-selfapply.md monitor/prompts/reference/decider-reporting.md monitor/prompts/reference/BUILD-AND-CHANGE.md | wc -l)
echo "Decider total (excl CLAUDE.md): ${DECIDER}L, with CLAUDE.md: $((DECIDER+CLAUDE))L"

# Tinker: dispatcher + all tinker-*.md + all reference files (reads everything)
TINKER=$(cat monitor/prompts/tinker.md monitor/prompts/reference/tinker-pipeline-health.md monitor/prompts/reference/tinker-infrastructure.md monitor/prompts/reference/tinker-cost-engineering.md monitor/prompts/reference/tinker-proposals-and-fixes.md | wc -l)
echo "Tinker total (excl CLAUDE.md): ${TINKER}L, with CLAUDE.md: $((TINKER+CLAUDE))L"
```

**Report these in a `context_load` section:**
```json
"context_load": {
  "claude_md_lines": 214,
  "per_agent": {
    "analyst": {"dispatcher": 164, "references": 869, "claude_md": 214, "total": 1247},
    "curmudgeon": {"dispatcher": 313, "references": 147, "conditional": 107, "claude_md": 214, "base_total": 674, "max_total": 781},
    "decider": {"dispatcher": 306, "references": 1001, "claude_md": 214, "total": 1521},
    "tinker": {"dispatcher": 126, "references": 476, "claude_md": 214, "total": 816}
  },
  "trend": "STABLE|GROWING|SHRINKING compared to last report",
  "alerts": ["List any agent whose total grew >10% since last report"]
}
```

**Bloat alerts:**
- If any Opus agent's total context load grew >10% since the last report → flag as `moderate` finding
- If any Opus agent's total grew >25% → flag as `major` finding
- If CLAUDE.md itself grew >15% → flag as `major` (it multiplies across ALL agents)
- Always note WHAT grew — dispatcher vs reference file vs CLAUDE.md — so the fix is targeted

**Extraction analysis (the key question):** When you flag growth, always ask: **does this content need to be loaded every run, or could it be a conditionally-loaded reference file?** Content that's only used in one code path (e.g., a procedure that only runs when a specific priority level is reached) is a prime candidate for extraction to `monitor/prompts/reference/`. The dispatcher keeps a brief description and a "→ Read reference/foo.md" pointer; the full procedure lives in the reference file and is only loaded when needed.

Examples of good extraction candidates:
- A procedure that only fires when a queue is empty (most runs have queue items)
- A schema or template that's only needed when writing a specific output type
- Historical context or worked examples that help with rare edge cases
- Validation checklists that apply to one mode but live in the dispatcher

Examples of content that should STAY in the dispatcher:
- Core identity and directives (the agent's "soul")
- Priority routing logic (must evaluate every run)
- Brief descriptions of each priority level (so the agent understands the hierarchy)
- Critical rules that apply to ALL modes

When recommending extraction, write a concrete PROP: which lines move, what the dispatcher pointer looks like, what the reference file is named. Don't just say "consider extracting" — make it implementable.

**Baseline (2026-04-12, post-V6 refactor + change-driven architecture):** The first report after this change sets the baseline. Subsequent reports compare against it.

## Step 5: Audit Yourself and Track Conversions

**You are not exempt.** Track your own no-op rate, module growth, and proposal implementation rate.

**Dispatcher conversion status** (check with `wc -l monitor/prompts/*.md`):
- Agents already converted: check for dispatcher routing logic in the prompt
- Agents intentionally excluded: curmudgeon (benefits from holistic context), integrity/poller/social (small enough or cheap model)
- If all high-impact agents are converted, shift focus to other patterns (Haiku pre-flight gates, preprocessor scripts, smarter scheduling)

## The Quality Guardrail

**Never sacrifice analytical depth for cost.** The goal is to spend the same Opus budget on MORE analysis, not LESS. Every proposal must answer: "Does this reduce the quality of the agent's judgment work, or does it just eliminate overhead?"

Some overhead is valuable — the curmudgeon's full context enables holistic thinking. The analyst's fingerprint hunt finds things because it reads broadly. Don't optimize away serendipity. The waste to target is the "clone repo, read 400-line prompt, discover nothing changed, write empty report" pattern — not the "read deeply and think hard" pattern.
