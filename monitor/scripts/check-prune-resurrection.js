#!/usr/bin/env node
/**
 * check-prune-resurrection.js - PROP-099 (implements PROP-094 Phase 2).
 * Resurrection canary for the prune <-> workspace-sync re-add loop.
 * prune-integrity.js archives every deleted filename into per-category
 * *-archive.jsonl (the tombstone ledger). This canary reads tombstones from
 * the last N hours (default 48) and flags any whose source path is PRESENT
 * again in the working tree (== git HEAD in a fresh clone). Prune artifacts
 * have timestamp-unique filenames, so a tombstoned filename reappearing IS
 * the resurrection signal - presence-only, no content-match gate.
 *
 * DESIGN NOTE: an earlier draft gated on content-hash match against the
 * archived body to exclude legitimate producer recreation. That produced
 * FALSE NEGATIVES: the archive stores body as parsed JSON, re-serialized
 * formatting differs from on-disk, so same-file resurrections were missed
 * (validation run missed 3 narrative-cite re-adds that DID happen). Presence
 * is the reliable signal for timestamp-unique artifacts; content match is
 * kept only as an informational annotation, never as a gate.
 *
 * GIT-DEPTH-INDEPENDENT: reads the archive JSONL + working tree only, no
 * git log. This is deliberate - the parallel git-history approach
 * (git log --diff-filter=D) is BLIND in a shallow clone when the deleting
 * commit is older than clone depth, which is exactly how the loop evaded
 * PROP-094 GIT_DELETED_SET. The ledger does not have that blind spot.
 *
 * Exit 0 = clean, exit 3 = resurrection detected. Read-only.
 */
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const args=process.argv.slice(2);
const hi=args.indexOf('--hours');
const WINDOW_H=hi>=0&&args[hi+1]?parseInt(args[hi+1],10):48;
// Root resolution (tinker 2026-07-23, ISS pending): __dirname-first, NOT cwd.
// The cwd walk-up had two live failure modes observed on the 2026-07-23 run:
//   (1) cwd inside the FUSE workspace -> scans FUSE, where pruned artifacts
//       are EXPECTED undrained orphans (unlink-impossible; DIRECTIVE-20260708-001
//       steady state) -> false LOOP-LIVE (RC=3) every run;
//   (2) cwd outside any repo -> walk-up exhausts, falls back to cwd, IDIR
//       missing -> every archive skipped -> silent false-clean (RC=0).
// __dirname pins the scan to the clone the script was invoked from (script is
// clone-only / NEVER_PUSH, absent on FUSE). --workspace <path> overrides for
// testing. If the derived root has no monitor/integrity, exit 1 so callers'
// RC discrimination reports canary-did-not-run instead of clean.
const wi=args.indexOf('--workspace');
const root=(()=>{
  if(wi>=0&&args[wi+1])return path.resolve(args[wi+1]);
  const selfRoot=path.resolve(__dirname,'..','..');
  if(fs.existsSync(path.join(selfRoot,'monitor','integrity')))return selfRoot;
  let c=process.cwd();while(c!==path.dirname(c)){if(fs.existsSync(path.join(c,'monitor','integrity')))return c;c=path.dirname(c);}return process.cwd();
})();
const IDIR=path.join(root,'monitor','integrity');
if(!fs.existsSync(IDIR)){
  console.error(JSON.stringify({event:'prune-resurrection-canary',error:'monitor/integrity not found under root '+root+' -- canary did not run'}));
  process.exit(1);
}
const ARCHIVES=[
  'narrative-cite-audit-archive.jsonl',
  'verify-pending-runs-archive.jsonl',
  'workspace-sync-runs-archive.jsonl',
  'push-failure-archive.jsonl',
  'report-archive.jsonl'
];
const cutoff=Date.now()-WINDOW_H*3600*1000;
const sha=s=>crypto.createHash('sha1').update(s).digest('hex');
let hits=[];
for(const a of ARCHIVES){
  const ap=path.join(IDIR,a);
  if(!fs.existsSync(ap))continue;
  let lines;try{lines=fs.readFileSync(ap,'utf8').split(String.fromCharCode(10));}catch(e){continue;}
  for(const line of lines){
    if(!line.trim())continue;
    let rec;try{rec=JSON.parse(line);}catch(e){continue;}
    const fname=rec.file;if(!fname)continue;
    const mt=rec.mtime?Date.parse(rec.mtime):0;
    if(mt&&mt<cutoff)continue;
    const candidates=[path.join(IDIR,fname),path.join(IDIR,path.basename(fname))];
    for(const cand of candidates){
      if(!fs.existsSync(cand))continue;
      let contentMatches=null;
      try{
        const onDisk=fs.readFileSync(cand,'utf8');
        const body=typeof rec.body==='string'?rec.body:JSON.stringify(rec.body,null,2);
        contentMatches=(sha(onDisk.trim())===sha(String(body).trim()));
      }catch(e){}
      hits.push({archive:a,file:path.relative(root,cand),tombstoned_at:rec.mtime,content_matches_archive:contentMatches});
      break;
    }
  }
}
const byCat={};for(const h of hits){byCat[h.archive]=(byCat[h.archive]||0)+1;}
const out={event:'prune-resurrection-canary',ts:new Date().toISOString(),window_hours:WINDOW_H,resurrected_total:hits.length,by_category:byCat,sample:hits.slice(0,12)};
console.log(JSON.stringify(out,null,2));
process.exit(hits.length>0?3:0);