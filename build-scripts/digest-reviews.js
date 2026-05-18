#!/usr/bin/env node
/**
 * digest-reviews.js — Preprocessing step for the decider agent.
 *
 * Reads all curmudgeon review JSONs and the processed-reviews ledger,
 * then produces a compact digest of unprocessed reviews. The decider
 * reads this digest instead of opening 40+ full review files.
 *
 * Key guarantee: every finding (even minor) from every review appears
 * in the digest with enough detail to create an open-issues entry.
 * The decider only needs to open the full review file when crafting
 * an exact find/replace patch that requires reading the detailed argument.
 *
 * Usage:
 *   node build-scripts/digest-reviews.js [--workspace /path/to/workspace]
 *
 * Output:
 *   monitor/curmudgeon/pending-digest.json
 */

const fs = require('fs');
const path = require('path');

// Resolve workspace root
const args = process.argv.slice(2);
let workspace = process.cwd();
const wsIdx = args.indexOf('--workspace');
if (wsIdx !== -1 && args[wsIdx + 1]) {
  workspace = args[wsIdx + 1];
}

const REVIEWS_DIR = path.join(workspace, 'monitor/curmudgeon/reviews');
const PROCESSED_PATH = path.join(workspace, 'monitor/decisions/processed-reviews.json');
const DIGEST_PATH = path.join(workspace, 'monitor/curmudgeon/pending-digest.json');

function loadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function run() {
  // 1. Load processed ledger
  //    Supports both formats: filenames (WIN-001.json) and legacy WIN IDs (WIN-001)
  const processedData = loadJSON(PROCESSED_PATH);
  const processedRaw = processedData ? processedData.processed : [];
  const processedSet = new Set(processedRaw);

  // 2. Find all review files
  let reviewFiles;
  try {
    reviewFiles = fs.readdirSync(REVIEWS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();
    // For reviews with multiple cycle files (e.g., SEC-6.3.json and SEC-6.3.c2.json),
    // keep only the latest cycle per base ID. Cycle 1 files have no .c suffix.
    // Works for all prefixes: WIN-001, SEC-6.3, ISS-672-nr-coefficient, part6-FAIL-004, etc.
    const latestById = new Map();
    for (const file of reviewFiles) {
      const match = file.match(/^(.+?)(?:\.c(\d+))?\.json$/);
      if (!match) continue;
      const baseId = match[1];
      const cycle = match[2] ? parseInt(match[2]) : 1;
      const existing = latestById.get(baseId);
      if (!existing || cycle > existing.cycle) {
        latestById.set(baseId, { file, cycle });
      }
    }
    reviewFiles = [...latestById.values()].map(v => v.file).sort();
  } catch (e) {
    console.error(`Cannot read reviews directory: ${REVIEWS_DIR}`);
    process.exit(1);
  }

  // 3. Digest each review
  const pending = [];
  const alreadyProcessed = [];
  let errors = [];

  for (const file of reviewFiles) {
    // Extract base ID: "SEC-6.3.c2.json" → "SEC-6.3", "WIN-001.json" → "WIN-001"
    const baseId = file.replace(/(?:\.c\d+)?\.json$/, '');
    const filePath = path.join(REVIEWS_DIR, file);

    const review = loadJSON(filePath);
    if (!review) {
      errors.push({ file, error: 'Failed to parse JSON' });
      continue;
    }

    const entry = {
      item_id: review.point_id || review.item_id || baseId,
      // Keep win_id for backward compat — decider reads this field
      win_id: review.point_id || review.item_id || baseId,
      review_file: `monitor/curmudgeon/reviews/${file}`,
      reviewed_at: review.reviewed_at || null,
      cycle: review.cycle || null,
      topic: review.topic || null,
      verdict_holds: review.current_verdict_holds,
      confidence: review.confidence || null,
      recommended_action: review.recommended_action || null,

      // Every hole, with enough detail to create an open-issues entry
      holes: (review.holes_found || []).map(h => ({
        severity: h.severity,
        summary: h.description ? h.description.substring(0, 300) : '',
        recommendation: h.recommendation ? h.recommendation.substring(0, 300) : '',
        // Flag if recommendation mentions claim/finding fields (summary table impact)
        affects_summary_table: /\b(claim|finding)\b/i.test(h.recommendation || '')
      })),

      // Worst severity for quick sorting
      worst_severity: worstSeverity(review.holes_found || []),

      // Citation failures
      citation_failures: extractCitationFailures(review),

      // Code analysis tags (compact)
      code_analysis_tags: review.code_analysis_tags ? {
        monitoring: review.code_analysis_tags.monitoring,
        relabels_standard: review.code_analysis_tags.relabels_standard,
        post_hoc: review.code_analysis_tags.post_hoc,
        derives_from_dome: review.code_analysis_tags.derives_from_dome,
        reviewed: review.code_analysis_tags.reviewed
      } : null,

      // One-line summary from the review's own assessment
      argument_summary: review.our_argument_summary
        ? review.our_argument_summary.substring(0, 200)
        : null,

      // Stronger arguments count (decider may want to pull these for patches)
      stronger_arguments_count: (review.stronger_arguments || []).length,

      // Advocate mode: how well the dome defender's argument survives our content.
      // defense_survives >= 3 means a dome defender has a strong rebuttal we haven't preempted.
      // The decider should create issues for these — they represent factual or argumentative
      // vulnerabilities that could discredit the review if the dome author finds them.
      defense_survives: review.advocate_mode?.defense_survives ?? null,
      best_defense: review.advocate_mode?.best_defense
        ? review.advocate_mode.best_defense.substring(0, 300)
        : null,
      preemptive_recommendation: review.advocate_mode?.preemptive_recommendation
        ? review.advocate_mode.preemptive_recommendation.substring(0, 300)
        : null,

      // Whether the full review file needs to be read for patching
      // True if: verdict doesn't hold, has critical/major holes, citation failures,
      // or defense_survives >= 3 (dome defender has a strong rebuttal)
      needs_full_read: needsFullRead(review)
    };

    // Check processed status by filename first, then fall back to legacy WIN ID.
    // Cycle 2+ files (e.g., WIN-001.c2.json) must be checked by FILENAME only —
    // do NOT match against the base WIN ID, or every Cycle 2 review gets silently
    // marked as processed because Cycle 1's WIN-001.json is in the ledger.
    // Filename-only matching: cycle-aware by design (WIN-001.json ≠ WIN-001.c2.json)
    const isProcessed = processedSet.has(file);
    if (isProcessed) {
      alreadyProcessed.push(entry);
    } else {
      pending.push(entry);
    }
  }

  // 4. Coverage audit: check "processed" reviews for under-coverage
  //    Requires open-issues.json to count issues per WIN
  const OPEN_ISSUES_PATH = path.join(workspace, 'monitor/decisions/open-issues.json');
  const openIssuesData = loadJSON(OPEN_ISSUES_PATH);
  const underCovered = [];
  if (openIssuesData && openIssuesData.issues) {
    const issuesByWin = {};
    for (const issue of openIssuesData.issues) {
      let w = issue.win_id;
      if (!w) continue;
      w = String(w);
      const normalized = w.startsWith('WIN-') ? w : 'WIN-' + w.padStart(3, '0');
      issuesByWin[normalized] = (issuesByWin[normalized] || 0) + 1;
    }

    for (const entry of alreadyProcessed) {
      const issueCount = issuesByWin[entry.win_id] || 0;
      const holeCount = entry.holes.length;
      if (issueCount < holeCount) {
        underCovered.push({
          win_id: entry.win_id,
          topic: entry.topic,
          issues_created: issueCount,
          holes_found: holeCount,
          missing_holes: entry.holes.filter((_, i) => i >= issueCount).map(h => ({
            severity: h.severity,
            summary: h.summary
          }))
        });
      }
    }
  }

  // 5. Sort pending: defense_survives >= 3 floats to top (factual vulnerabilities),
  //    then by hole severity (critical first, then major, etc.)
  const severityOrder = { critical: 0, major: 1, moderate: 2, minor: 3, none: 4 };
  pending.sort((a, b) => {
    // Items with high defense_survives sort first — these are where the dome
    // defender has a strong rebuttal we haven't preempted
    const aDefense = a.defense_survives >= 3 ? 0 : 1;
    const bDefense = b.defense_survives >= 3 ? 0 : 1;
    if (aDefense !== bDefense) return aDefense - bDefense;
    // Within the defense tier, higher defense_survives = more urgent
    if (aDefense === 0 && bDefense === 0) {
      if ((b.defense_survives || 0) !== (a.defense_survives || 0)) {
        return (b.defense_survives || 0) - (a.defense_survives || 0);
      }
    }
    // Then by worst severity
    return (severityOrder[a.worst_severity] ?? 4) - (severityOrder[b.worst_severity] ?? 4);
  });

  // 6. Write digest
  const digest = {
    generated_at: new Date().toISOString(),
    total_reviews: reviewFiles.length,
    already_processed: processedSet.size,
    pending_count: pending.length,
    severity_breakdown: {
      critical: pending.filter(r => r.worst_severity === 'critical').length,
      major: pending.filter(r => r.worst_severity === 'major').length,
      moderate: pending.filter(r => r.worst_severity === 'moderate').length,
      minor: pending.filter(r => r.worst_severity === 'minor').length,
      none: pending.filter(r => r.worst_severity === 'none').length
    },
    defense_survives_breakdown: {
      high: pending.filter(r => r.defense_survives >= 4).length,
      moderate: pending.filter(r => r.defense_survives === 3).length,
      total_vulnerable: pending.filter(r => r.defense_survives >= 3).length
    },
    needs_full_read_count: pending.filter(r => r.needs_full_read).length,
    under_covered_processed: underCovered.length > 0 ? underCovered : undefined,
    under_covered_count: underCovered.length > 0 ? underCovered.length : 0,
    pending_reviews: pending,
    errors: errors.length > 0 ? errors : undefined
  };

  fs.writeFileSync(DIGEST_PATH, JSON.stringify(digest, null, 2));

  // Summary to stdout
  console.log(`Digest generated: ${DIGEST_PATH}`);
  console.log(`  Total reviews:     ${digest.total_reviews}`);
  console.log(`  Already processed: ${digest.already_processed}`);
  console.log(`  Pending:           ${digest.pending_count}`);
  console.log(`  Severity breakdown:`);
  console.log(`    Critical: ${digest.severity_breakdown.critical}`);
  console.log(`    Major:    ${digest.severity_breakdown.major}`);
  console.log(`    Moderate: ${digest.severity_breakdown.moderate}`);
  console.log(`    Minor:    ${digest.severity_breakdown.minor}`);
  console.log(`  Need full read:    ${digest.needs_full_read_count}`);
  if (errors.length > 0) {
    console.log(`  ⚠ Errors:            ${errors.length}`);
    errors.forEach(e => console.log(`      - ${e.file}: ${e.error}`));
    console.log(`    (Parse failures drop findings silently. Run:`);
    console.log(`      node build-scripts/fix-json-quotes.js ${errors.map(e => 'monitor/curmudgeon/reviews/' + e.file).join(' ')}`);
    console.log(`    to auto-recover, then re-run digest.)`);
  }
  if (underCovered.length > 0) {
    console.log(`  ⚠ Under-covered "processed" reviews: ${underCovered.length}`);
    const totalMissing = underCovered.reduce((sum, r) => sum + r.missing_holes.length, 0);
    console.log(`    Total missing issues: ${totalMissing}`);
    console.log(`    (These WINs are marked processed but have holes with no corresponding open-issues entry)`);
  }

  // Exit non-zero if parse errors — forces visibility in CI/agent logs and
  // signals to the decider that recovery action is needed before acting on
  // the rest of the digest.
  if (errors.length > 0) {
    process.exitCode = 2;
  }
}

function worstSeverity(holes) {
  const order = ['critical', 'major', 'moderate', 'minor'];
  for (const level of order) {
    if (holes.some(h => h.severity === level)) return level;
  }
  return 'none';
}

function extractCitationFailures(review) {
  if (!review.citation_check) return [];
  const failures = review.citation_check.citations_failed || [];
  return failures.map(c => typeof c === 'string' ? c : (c.citation || c.description || JSON.stringify(c)));
}

function needsFullRead(review) {
  if (review.current_verdict_holds === false) return true;
  const holes = review.holes_found || [];
  if (holes.some(h => h.severity === 'critical' || h.severity === 'major')) return true;
  if (review.citation_check && (review.citation_check.citations_failed || []).length > 0) return true;
  if (review.advocate_mode && review.advocate_mode.defense_survives >= 3) return true;
  return false;
}

run();
