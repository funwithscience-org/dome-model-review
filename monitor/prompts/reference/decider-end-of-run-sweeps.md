# Decider End-of-Run Sweeps (A0 / A0b / A0c)

> Relocated from `decider.md` by PROP-119 (2026-07-04) — decider prompt-slim (~5065 tokens moved out of hot path).
> **These sweeps are correctness-critical.** They MUST run every decider run, in order, before End-of-Run Step A (Attention Inbox).

---

## End-of-Run Step A0: status='closed' Normalization Sweep (PROP-056, added 2026-05-25)

Before the attention inbox step, walk `open-issues.json` for any entries with `status === 'closed'`. These are the residue of improvised close sites (BAU-wontfix, already-resolved, superseded, stranded-patch self-apply) that wrote `iss.status='closed'` but did NOT move the entry to `closed-issues.json`. The canonical close path is documented in `decider-curmudgeon-pq-mechanics.md` Step 8 and `decider-patches-and-selfapply.md` Step 1 — those set status='fixed' or 'fixed-pending-verification' and migrate. This sweep is the safety net for any close site that bypassed the canonical path.

```bash
echo "STEP_MARKER end-of-run-A0-closed-normalize $(date +%s)" >&2
node -e "
const fs=require('fs');
const RUN_ID=process.env.RUN_ID || 'decider-unknown';
const oi=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const ci=JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json','utf8'));
const closedIds=new Set(ci.issues.map(i=>i.id));

// Walk for status='closed' residue
const stranded=oi.issues.filter(i=>i.status==='closed');
if(stranded.length===0){ console.log('Step A0 sweep: no status=closed residue'); process.exit(0); }

// Canonical status mapping: anything containing 'wontfix' or 'superseded' or 'already-resolved' -> 'wontfix';
// anything else (genuine patch closures) -> 'fixed'.
function canonicalStatus(iss){
  const fb=String(iss.fixed_by||iss.closed_by||'').toLowerCase();
  if(/wontfix|superseded|already-resolved|fuse-sync-gap/.test(fb)) return 'wontfix';
  return 'fixed';
}

// Also check the ledger so we don't duplicate-append on idempotent re-run
const ledgerPath='monitor/decisions/closure-ledger.jsonl';
const existingLedger=new Set();
if(fs.existsSync(ledgerPath)){
  for(const line of fs.readFileSync(ledgerPath,'utf8').split('\\n')){
    if(!line.trim())continue;
    try{existingLedger.add(JSON.parse(line).iss_id);}catch{}
  }
}

let migrated=0, dupSkipped=0;
for(const iss of stranded){
  if(closedIds.has(iss.id)){
    // Already in closed-issues.json (someone migrated but forgot to remove from open) — drop the dupe
    dupSkipped++;
    continue;
  }
  const canonical=canonicalStatus(iss);
  const now=new Date().toISOString();
  iss.status=canonical;
  iss.migrated_at=now;
  iss.migrated_by_run=RUN_ID;
  iss.migrated_by_mechanism='step-a0-sweep-PROP-056';
  ci.issues.push(iss);
  // Append ledger line if missing
  if(!existingLedger.has(iss.id)){
    const ledgerLine={
      closed_at: iss.closed_at || iss.fixed_at || now,
      closed_by_run: iss.closed_by_run || iss.migrated_by_run,
      closed_by_mechanism: 'step-a0-sweep',
      iss_id: iss.id,
      prior_status: 'closed-in-open-issues',
      closure_reason: 'PROP-056 normalization sweep: original close site bypassed migration; canonical status='+canonical,
      action_taken: canonical==='wontfix' ? 'wontfix' : 'patch',
      closure_evidence: {
        original_fixed_by: iss.fixed_by || iss.closed_by || null,
        severity: iss.severity || 'unknown',
        description_excerpt: String(iss.description||iss.title||'').slice(0,120)
      },
      can_revert: false,
      dryrun: false
    };
    fs.appendFileSync(ledgerPath, JSON.stringify(ledgerLine)+'\\n');
  }
  migrated++;
}

// Remove migrated entries from open-issues.json
oi.issues = oi.issues.filter(i=>i.status!=='closed' || !ci.issues.find(c=>c.id===i.id));
oi.last_updated=new Date().toISOString();

fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(oi,null,2));
fs.writeFileSync('monitor/decisions/closed-issues.json',JSON.stringify(ci,null,2));
console.log('Step A0 sweep: migrated='+migrated+', dup-dropped='+dupSkipped+'. open='+oi.issues.length+', closed='+ci.issues.length);
"
```

**Self-test:** at run-end, verify `oi.issues.filter(i=>i.status==='closed').length === 0`. If non-zero, the sweep failed (likely a JSON write error). Fail-loud and abort commit.

**Why a sweep instead of fixing every close site individually:** the improvised close sites are LLM-generated (BAU-wontfix-already-fixed, superseded-by-X, etc.) — they appear ad-hoc inside the decider's reasoning context, not in the documented prompt. We could try to enumerate and prohibit them, but a future LLM run will invent new sites. A single end-of-run sweep is the robust answer: any close site that forgot to migrate gets cleaned up at run-end, regardless of which improvised mechanism wrote the status. This is the same pattern as the M1 BAU self-test (decider.md line 195) — let close sites be informal, enforce canonicality at run-end.

## End-of-Run Step A0b: blocked-on-curmudgeon Residue Sweep (PROP-058, added 2026-05-25, sibling to PROP-056 Step A0)

Immediately after Step A0 (status='closed' normalization), walk `open-issues.json` for entries with `status === 'blocked-on-curmudgeon'`. These are the residue of routing-to-curmudgeon close sites that pushed work onto the curmudgeon priority-queue (or referenced a blocker ISS) and never walked back to close the dependent ISS when the underlying EXP integrated or the blocker resolved.

```bash
echo "STEP_MARKER end-of-run-A0b-blocked-on-curmudgeon $(date +%s)" >&2
node -e "
const fs=require('fs');
const RUN_ID=process.env.RUN_ID || 'decider-unknown';
const oi=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const ci=JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json','utf8'));
const tracker=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));

// Build EXP integration index: any EXP that is integrated=true (live) or in tracker-archive with integrated=true.
const expIntegrated=new Map();
for(const e of (tracker.items||[])){
  if(e.integrated===true || (e.status==='complete' && e.integration_mode)) expIntegrated.set(e.id, {at:e.integrated_at||e.completed_at, mode:e.integration_mode});
}
try{
  for(const line of fs.readFileSync('monitor/analyst/expansion-tracker-archive.jsonl','utf8').split('\n')){
    if(!line.trim())continue;
    try{
      const e=JSON.parse(line);
      if((e.integrated===true || (e.status==='complete' && e.integration_mode)) && !expIntegrated.has(e.id))
        expIntegrated.set(e.id, {at:e.integrated_at||e.completed_at, mode:e.integration_mode});
    }catch{}
  }
}catch{}

// Closed-iss index for blocker lookup
const closedSet=new Set(ci.issues.map(i=>i.id));

// Walk blocked-on-curmudgeon residue
const zombies=oi.issues.filter(i=>i.status==='blocked-on-curmudgeon');
if(zombies.length===0){ console.log('Step A0b sweep: no blocked-on-curmudgeon residue'); process.exit(0); }

// Ledger dedup
const ledgerPath='monitor/decisions/closure-ledger.jsonl';
const existingLedger=new Set();
try{
  for(const l of fs.readFileSync(ledgerPath,'utf8').split('\n')){
    if(!l.trim())continue;
    try{existingLedger.add(JSON.parse(l).iss_id);}catch{}
  }
}catch{}

function extractExpId(iss){
  if(iss.exp_id && /^EXP-\d+$/.test(iss.exp_id)) return iss.exp_id;
  const txt=String(iss.blocked_reason||'')+' '+String(iss.description||'');
  const m=txt.match(/\bEXP-\d+\b/g);
  return m && m[0] || null;
}
function extractBlockerIss(iss){
  const txt=String(iss.blocked_reason||'');
  const m=txt.match(/\bblocked on (ISS-\d+)\b/i);
  return m && m[1] || null;
}

const now=new Date().toISOString();
const migrated=[], skipped=[];
for(const iss of zombies){
  const expId=extractExpId(iss);
  const blockerIss=extractBlockerIss(iss);
  let resolveMech=null, resolveEvidence={};
  if(expId && expIntegrated.has(expId)){
    const meta=expIntegrated.get(expId);
    resolveMech='exp-integrated-burndown';
    resolveEvidence={exp_id:expId, exp_integrated_at:meta.at, exp_integration_mode:meta.mode};
  }else if(blockerIss && closedSet.has(blockerIss)){
    const blocker=ci.issues.find(c=>c.id===blockerIss);
    resolveMech='blocker-iss-closed-burndown';
    resolveEvidence={blocker_iss:blockerIss, blocker_closed_at:blocker.closed_at||blocker.fixed_at};
  }else{
    skipped.push({id:iss.id, reason:'no integrated EXP or closed blocker found; genuine block remains'});
    continue;
  }
  // Migrate to closed-issues.json
  iss.status='fixed';
  iss.fixed_at=now;
  iss.fixed_by=resolveMech;
  iss.migrated_at=now;
  iss.migrated_by_run=RUN_ID;
  iss.migrated_by_mechanism='step-a0b-sweep-PROP-058';
  iss.closure_evidence=resolveEvidence;
  ci.issues.push(iss);
  if(!existingLedger.has(iss.id)){
    fs.appendFileSync(ledgerPath, JSON.stringify({
      closed_at: now, closed_by_run: RUN_ID, closed_by_mechanism: 'step-a0b-sweep',
      iss_id: iss.id, prior_status: 'blocked-on-curmudgeon',
      closure_reason: 'PROP-058 sweep: dependency resolved (' + resolveMech + ')',
      action_taken: 'patch',
      closure_evidence: Object.assign({severity:iss.severity||'unknown', description_excerpt:String(iss.description||'').slice(0,120)}, resolveEvidence),
      can_revert: false, dryrun: false
    })+'\n');
  }
  migrated.push({id:iss.id, mech:resolveMech, evidence:resolveEvidence});
}

// Remove migrated entries from open-issues.json
const migratedIds=new Set(migrated.map(m=>m.id));
oi.issues = oi.issues.filter(i=>!migratedIds.has(i.id));
oi.last_updated=now;
fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(oi,null,2));
fs.writeFileSync('monitor/decisions/closed-issues.json',JSON.stringify(ci,null,2));
console.log('Step A0b sweep: migrated='+migrated.length+', genuine-blocks-kept='+skipped.length);
migrated.forEach(m=>console.log('  closed', m.id, 'via', m.mech, JSON.stringify(m.evidence)));
skipped.forEach(s=>console.log('  kept-open', s.id, '-', s.reason));
"
```

**Self-test:** after the sweep, verify that every status='blocked-on-curmudgeon' entry in open-issues.json has either (a) no extractable exp_id AND no extractable blocker_iss, OR (b) an exp_id whose tracker entry is NOT yet integrated, OR (c) a blocker_iss that is NOT yet closed. If any zombie remains (integrated EXP / closed blocker), the sweep failed — fail-loud and abort commit.

**Why a sweep (mirroring PROP-056's reasoning):** the dependent-ISS close-back step is fragile to add at every integration site (the decider would have to walk open-issues.json on every EXP integration and on every iss closure, both of which already do plenty). A single end-of-run sweep is the robust answer: any close site that forgot to walk back gets cleaned up at run-end, regardless of which close mechanism triggered it.

## End-of-Run Step A0c: assigned-analyst Chain-Aware Close Sweep (PROP-070, added 2026-05-31, sibling to PROP-056 Step A0 and PROP-058 Step A0b)

Immediately after Step A0b (blocked-on-curmudgeon residue), walk `open-issues.json` for entries with `status === 'assigned-analyst'`. These are ISSs whose EXP-chain endpoint has reached `integrated=true` (often via baby-consolidation into a parent EXP that then integrated) but whose canonical Step 8 close-on-integration never fired for them — either because Step 8 was bypassed (the LLM-skip-by-omission defect class that produced the 2026-05-31 6-DIRECT-case event) or because the chain endpoint integrated upstream and Step 8 only closed the endpoint's literal issue_ids, not the upstream-pre-consolidation references.

```bash
echo "STEP_MARKER end-of-run-A0c-assigned-analyst $(date +%s)" >&2
node -e "
const fs=require('fs');
const RUN_ID=process.env.RUN_ID || 'decider-unknown';
const oi=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const ci=JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json','utf8'));
const tracker=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));

// Build EXP map keyed by id: live tracker entries take precedence over archive duplicates
const expMap=new Map();
for(const e of (tracker.items||[])){ expMap.set(e.id, e); }
try{
  for(const line of fs.readFileSync('monitor/analyst/expansion-tracker-archive.jsonl','utf8').split('\n')){
    if(!line.trim())continue;
    try{
      const e=JSON.parse(line);
      if(!expMap.has(e.id)) expMap.set(e.id, e);
    }catch{}
  }
}catch{}

// Chain walker: follow status='consolidated-into-EXP-X' from start expId up to depth 8.
// Returns {endpoint:<EXP entry>, path:[expId...]} or {endpoint:null, path:[...], reason:'cycle'|'unresolved'|'too-deep'}.
function chainEndpoint(expId, seen){
  seen = seen || new Set();
  const path=[];
  let cur=expId, depth=0;
  while(cur && depth<8){
    if(seen.has(cur)) return {endpoint:null, path, reason:'cycle'};
    seen.add(cur); path.push(cur);
    const e=expMap.get(cur);
    if(!e) return {endpoint:null, path, reason:'unresolved'};
    if(typeof e.status==='string'){
      const m=e.status.match(/^consolidated-into-(EXP-\d+)$/);
      if(m){ cur=m[1]; depth++; continue; }
    }
    return {endpoint:e, path};
  }
  return {endpoint:null, path, reason:'too-deep'};
}

function extractExpId(iss){
  if(iss.exp_id && /^EXP-\d+$/.test(iss.exp_id)) return iss.exp_id;
  if(iss.related_expansion && /^EXP-\d+$/.test(iss.related_expansion)) return iss.related_expansion;
  const txt=String(iss.description||'')+' '+String(iss.title||'')+' '+String(iss.notes||'')+' '+String(iss.routing_reason||'');
  const m=txt.match(/\bEXP-\d+\b/g);
  return m && m[0] || null;
}

// 48h recently-touched guard: skip ISSs touched recently — leave to natural integration flow
const NOW=Date.now();
function tooFresh(iss){
  const t=iss.last_touched_at || iss.last_updated || iss.routed_at || iss.assigned_at;
  if(!t) return false;
  return (NOW - Date.parse(t)) < 48*3600*1000;
}

// Amendment-noted hold-back: integration_mode='amendment-noted-pre-EXP-XXX-integration' means
// the amendment was filed but its real-site effect is gated on parent EXP integration.
// Parse parent EXP from integration_mode; if parent is NOT itself integrated, hold the ISS open.
function amendmentNotedHeldBack(endpoint){
  const mode=String(endpoint.integration_mode||'');
  if(!mode.startsWith('amendment-noted-')) return false;
  const m=mode.match(/EXP-\d+/);
  if(!m){
    // Can't parse parent — conservative: hold ISS open
    return true;
  }
  const parentId=m[0];
  const parent=expMap.get(parentId);
  if(!parent) return true; // parent not in tracker — hold
  if(parent.integrated===true) return false; // parent integrated — amendment-noted is now durable
  return true; // parent not yet integrated — hold
}

const candidates=oi.issues.filter(i=>i.status==='assigned-analyst');
if(candidates.length===0){ console.log('Step A0c sweep: no assigned-analyst residue'); process.exit(0); }

// Ledger dedup
const ledgerPath='monitor/decisions/closure-ledger.jsonl';
const existingLedger=new Set();
try{
  for(const l of fs.readFileSync(ledgerPath,'utf8').split('\n')){
    if(!l.trim())continue;
    try{existingLedger.add(JSON.parse(l).iss_id);}catch{}
  }
}catch{}

const now=new Date().toISOString();
const migrated=[], heldOpen=[];
for(const iss of candidates){
  if(tooFresh(iss)){ heldOpen.push({id:iss.id, reason:'touched <48h — leave to natural integration flow'}); continue; }
  const startExp=extractExpId(iss);
  if(!startExp){ heldOpen.push({id:iss.id, reason:'no extractable EXP reference'}); continue; }
  const walk=chainEndpoint(startExp);
  if(!walk.endpoint){ heldOpen.push({id:iss.id, reason:'chain '+walk.reason+'; path='+walk.path.join('->')}); continue; }
  if(walk.endpoint.integrated!==true){ heldOpen.push({id:iss.id, reason:'endpoint '+walk.endpoint.id+' not integrated (status='+walk.endpoint.status+')'}); continue; }
  if(amendmentNotedHeldBack(walk.endpoint)){ heldOpen.push({id:iss.id, reason:'amendment-noted hold-back: endpoint '+walk.endpoint.id+' integration_mode='+walk.endpoint.integration_mode}); continue; }

  // Migrate to closed-issues.json
  iss.status='fixed';
  iss.fixed_at=now;
  iss.fixed_by='exp-chain-endpoint-integrated';
  iss.migrated_at=now;
  iss.migrated_by_run=RUN_ID;
  iss.migrated_by_mechanism='step-a0c-sweep-PROP-070';
  iss.closure_evidence={
    start_exp:startExp,
    chain_path:walk.path,
    endpoint_id:walk.endpoint.id,
    endpoint_integrated_at:walk.endpoint.integrated_at || walk.endpoint.completed_at,
    endpoint_integration_mode:walk.endpoint.integration_mode || null
  };
  ci.issues.push(iss);
  if(!existingLedger.has(iss.id)){
    fs.appendFileSync(ledgerPath, JSON.stringify({
      closed_at: now, closed_by_run: RUN_ID, closed_by_mechanism: 'step-a0c-sweep',
      iss_id: iss.id, prior_status: 'assigned-analyst',
      closure_reason: 'PROP-070 sweep: EXP-chain endpoint integrated (' + walk.path.join('->') + ' -> ' + walk.endpoint.id + ')',
      action_taken: 'patch',
      closure_evidence: Object.assign({severity:iss.severity||'unknown', description_excerpt:String(iss.description||'').slice(0,120)}, iss.closure_evidence),
      can_revert: false, dryrun: false
    })+'\n');
  }
  migrated.push({id:iss.id, chain:walk.path, endpoint:walk.endpoint.id});
}

// Remove migrated entries from open-issues.json
const migratedIds=new Set(migrated.map(m=>m.id));
oi.issues = oi.issues.filter(i=>!migratedIds.has(i.id));
oi.last_updated=now;
fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(oi,null,2));
fs.writeFileSync('monitor/decisions/closed-issues.json',JSON.stringify(ci,null,2));
console.log('Step A0c sweep: migrated='+migrated.length+', held-open='+heldOpen.length);
migrated.forEach(m=>console.log('  closed', m.id, 'via chain', m.chain.join('->'), '-> endpoint', m.endpoint));
heldOpen.forEach(h=>console.log('  kept-open', h.id, '-', h.reason));

// Self-test: every remaining status='assigned-analyst' entry MUST satisfy one of the safety predicates
// (touched <48h, no extractable EXP, chain unresolved/cycle/too-deep, endpoint not integrated, amendment-noted hold-back).
// If any remaining entry's chain endpoint is integrated AND not amendment-noted-held AND >48h old, the sweep failed.
const oi2=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const remaining=oi2.issues.filter(i=>i.status==='assigned-analyst');
const leaks=[];
for(const iss of remaining){
  if(tooFresh(iss)) continue;
  const startExp=extractExpId(iss);
  if(!startExp) continue;
  const walk=chainEndpoint(startExp);
  if(!walk.endpoint) continue;
  if(walk.endpoint.integrated!==true) continue;
  if(amendmentNotedHeldBack(walk.endpoint)) continue;
  leaks.push({id:iss.id, chain:walk.path, endpoint:walk.endpoint.id});
}
if(leaks.length>0){
  console.error('Step A0c SELF-TEST FAIL: '+leaks.length+' assigned-analyst ISSs remain whose chain endpoint is integrated:');
  leaks.forEach(l=>console.error('  LEAK', l.id, 'chain='+l.chain.join('->'), 'endpoint='+l.endpoint));
  console.error('Aborting commit. Investigate why the sweep did not close these.');
  process.exit(1);
}
"
```

**Self-test:** after the sweep, every remaining `status='assigned-analyst'` entry in open-issues.json must satisfy AT LEAST ONE safety predicate: (a) touched <48h, (b) no extractable EXP reference, (c) chain unresolved/cycle/too-deep, (d) endpoint not integrated, (e) amendment-noted hold-back. If ANY remaining entry's chain endpoint is integrated AND >48h old AND not amendment-noted-held, the sweep failed — fail-loud and abort commit. This is the same defect class as Step 8 bypass (canonical close path documented, LLM execution dropped the step); the fail-loud abort converts a silent leak into an operator-visible signal.

**Why this exists (PROP-070):** the 2026-05-31 operator burndown of 18 stuck ISSs surfaced two gaps: (Gap A — DIRECT, 6 cases) Step 8 is sometimes bypassed (commit 1727ee3 integrated EXP-464/465 but did NOT close ISS-2326/2327); (Gap B — CONSOLIDATED, 12 cases) status='assigned-analyst' ISSs whose EXP-chain endpoint reached integrated=true have no existing sweep (PROP-056 covers status='closed', PROP-058 covers status='blocked-on-curmudgeon'). Step A0c targets the right status enum AND adds chain-awareness via the consolidation walker, so an upstream pre-consolidation ISS closes when its chain endpoint integrates. The amendment-noted hold-back protects ISSs (e.g., ISS-2343/2344/2345) whose chain endpoint is an amendment-noted-pre-parent-integration EXP — those should remain open until the parent EXP actually integrates.
