#!/usr/bin/env node
/*
 * monitor/scripts/audit-rewrite.js (PROP-041 Phase 2)
 *
 * Mechanical content-preservation pre-check for sloppytoppy-rewrite RW
 * proposals. Belt-and-suspenders sibling to the Opus curmudgeon-on-rewrite
 * rubric: this script catches numeric/citation drift (mechanical); the
 * Opus rubric (monitor/prompts/reference/sloppytoppy-rewrite-rubric.md)
 * catches argument-structure drift (judgment).
 *
 * Invocation:
 *   node monitor/scripts/audit-rewrite.js monitor/sloppytoppy/rewrites/RW-NNN.json
 *
 * Exit codes:
 *   0  audit passed — decider may push to priority-queue class='rewrite-verify'
 *   1  audit failed — decider marks RW status='rejected' with rejection_reason
 *   2  file not found or schema-invalid — same handling as exit 1 but logged distinctly
 *
 * On exit 1 or 2, the script writes a JSON report to stdout describing
 * the failures. The decider includes this report verbatim in rejection_reason.
 *
 * Checks (mechanical only):
 *   C1: numbers_preserved is a subset of numbers actually appearing in
 *       rewritten_text (token-level normalized comparison)
 *   C2: citations_preserved is a subset of citations actually appearing
 *       in rewritten_text (substring comparison)
 *   C3: numbers_in_rewritten_text declared by the rewriter actually appears
 *       in rewritten_text (rewriter self-consistency check)
 *   C4: citations_in_rewritten_text declared by the rewriter actually
 *       appears in rewritten_text (same)
 *   C5: HTML tag balance (open == close for common tags)
 *   C6: JSON-string encoding sanity (no unescaped \" inside JSON-quoted
 *       content)
 *   C7: rewrite_category_tags non-empty (Q-OP-6: empty → PUNT, not RW)
 *   C8: schema-required fields all present (rw_id, surface_id, original_text,
 *       rewritten_text, CONTENT_PRESERVATION_AUDIT, predicted_delta_breakdown)
 *
 * NOT checked (those are the Opus curmudgeon's job):
 *   - Whether the rewritten text actually improves understandability
 *   - Whether load-bearing logical connectives are preserved
 *   - Whether the argument's claim/verdict is preserved at a semantic level
 *   - Whether the predicted-delta is plausible
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = [
  'rw_id', 'surface_id', 'surface_type', 'original_content_hash',
  'scored_composite_before', 'original_text', 'rewritten_text',
  'rewrite_category_tags', 'CONTENT_PRESERVATION_AUDIT',
  'predicted_delta_breakdown', 'authored_by_run', 'authored_at', 'status'
];

const PRESERVATION_AUDIT_FIELDS = [
  'numbers_preserved', 'numbers_in_rewritten_text',
  'citations_preserved', 'citations_in_rewritten_text',
  'argument_structure_summary'
];

const VALID_CATEGORIES = ['A', 'B', 'C', 'D', 'E'];

function normalizeNumber(s) {
  // Strip whitespace; keep units intact. '11.79 Hz' stays '11.79 Hz'.
  return String(s).trim().replace(/\s+/g, ' ');
}

function findInText(needle, haystack) {
  // Substring match, case-sensitive. Numbers and citations are case-sensitive
  // by convention in the dome-review domain (CVE-2024-..., Tesla 1899, etc.).
  return haystack.indexOf(needle) !== -1;
}

function countHtmlTags(text, tag) {
  const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
  const closeRe = new RegExp(`</${tag}>`, 'gi');
  const opens = (text.match(openRe) || []).length;
  const closes = (text.match(closeRe) || []).length;
  return { opens, closes };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(JSON.stringify({ exit: 2, reason: 'usage: audit-rewrite.js <RW-file>' }, null, 2));
    process.exit(2);
  }
  const rwPath = args[0];

  let rw;
  try {
    rw = JSON.parse(fs.readFileSync(rwPath, 'utf8'));
  } catch (e) {
    console.error(JSON.stringify({ exit: 2, reason: 'cannot-parse-rw-file', error: e.message }, null, 2));
    process.exit(2);
  }

  const failures = [];

  // C8: schema-required fields present
  for (const f of REQUIRED_FIELDS) {
    if (rw[f] === undefined || rw[f] === null) {
      failures.push({ check: 'C8', detail: `missing required field: ${f}` });
    }
  }
  if (rw.CONTENT_PRESERVATION_AUDIT) {
    for (const f of PRESERVATION_AUDIT_FIELDS) {
      if (rw.CONTENT_PRESERVATION_AUDIT[f] === undefined) {
        failures.push({ check: 'C8', detail: `missing CONTENT_PRESERVATION_AUDIT.${f}` });
      }
    }
  }

  // If schema is broken, no point running content checks.
  if (failures.length > 0) {
    console.error(JSON.stringify({ exit: 1, schema_failures: failures }, null, 2));
    process.exit(1);
  }

  const audit = rw.CONTENT_PRESERVATION_AUDIT;
  const original = String(rw.original_text);
  const rewritten = String(rw.rewritten_text);

  // C7: rewrite_category_tags non-empty
  if (!Array.isArray(rw.rewrite_category_tags) || rw.rewrite_category_tags.length === 0) {
    failures.push({ check: 'C7', detail: 'rewrite_category_tags is empty — Q-OP-6 requires this to be a PUNT, not an RW' });
  } else {
    for (const tag of rw.rewrite_category_tags) {
      if (!VALID_CATEGORIES.includes(tag)) {
        failures.push({ check: 'C7', detail: `invalid category tag: ${tag} (must be one of A/B/C/D/E)` });
      }
    }
  }

  // C1: numbers_preserved ⊆ numbers actually in rewritten_text
  const numsToPreserve = (audit.numbers_preserved || []).map(normalizeNumber);
  const missingNums = numsToPreserve.filter(n => !findInText(n, rewritten));
  if (missingNums.length > 0) {
    failures.push({
      check: 'C1',
      detail: `numbers_preserved not found in rewritten_text: ${JSON.stringify(missingNums)}`,
      severity: 'major',
      explanation: 'Every number flagged as preservation-required by the rewriter must appear in the rewritten text. Missing numbers mean content was dropped.'
    });
  }

  // C2: citations_preserved ⊆ citations actually in rewritten_text
  const citesToPreserve = audit.citations_preserved || [];
  const missingCites = citesToPreserve.filter(c => !findInText(c, rewritten));
  if (missingCites.length > 0) {
    failures.push({
      check: 'C2',
      detail: `citations_preserved not found in rewritten_text: ${JSON.stringify(missingCites)}`,
      severity: 'major',
      explanation: 'Every citation flagged as preservation-required must appear verbatim in the rewritten text.'
    });
  }

  // C3: numbers_in_rewritten_text self-consistency — what the rewriter claims
  // is in its draft should actually be there.
  const claimedNums = (audit.numbers_in_rewritten_text || []).map(normalizeNumber);
  const phantomNums = claimedNums.filter(n => !findInText(n, rewritten));
  if (phantomNums.length > 0) {
    failures.push({
      check: 'C3',
      detail: `numbers_in_rewritten_text declared but not found: ${JSON.stringify(phantomNums)}`,
      severity: 'moderate',
      explanation: 'Rewriter claimed these numbers are in the draft but they are not. Likely a transcription error or hallucination in the audit field.'
    });
  }

  // C4: citations_in_rewritten_text self-consistency
  const claimedCites = audit.citations_in_rewritten_text || [];
  const phantomCites = claimedCites.filter(c => !findInText(c, rewritten));
  if (phantomCites.length > 0) {
    failures.push({
      check: 'C4',
      detail: `citations_in_rewritten_text declared but not found: ${JSON.stringify(phantomCites)}`,
      severity: 'moderate'
    });
  }

  // C5: HTML tag balance for common tags. Surfaces are JSON-string content with
  // HTML markup; mismatched tags break the rendered page.
  for (const tag of ['p', 'ul', 'ol', 'li', 'em', 'strong', 'sub', 'sup', 'a', 'details', 'summary', 'table', 'tr', 'td', 'th']) {
    const { opens, closes } = countHtmlTags(rewritten, tag);
    if (opens !== closes) {
      failures.push({
        check: 'C5',
        detail: `unbalanced <${tag}> tags in rewritten_text: ${opens} open, ${closes} close`,
        severity: 'major'
      });
    }
  }

  // C6: JSON-string encoding sanity. Rewritten text will end up inside a JSON
  // string field; unescaped " or unescaped \ will break the wins.json or
  // sections.json file at integration time. We can't fully replicate JSON.parse
  // here without round-tripping, but we can check for the common bug: an
  // unescaped " inside what looks like HTML attribute content.
  // The conservative check: count " occurrences and ensure they balance (every
  // open has a close), and that no " appears in an HTML attribute context that
  // isn't already escaped. This is a heuristic, not a guarantee — full check
  // is at integration time (decider runs node test.js after find/replace).
  const quoteCount = (rewritten.match(/\\?"/g) || []).length;
  // Even count is necessary but not sufficient; report odd counts as moderate.
  if (quoteCount % 2 !== 0) {
    failures.push({
      check: 'C6',
      detail: `odd number of \" characters in rewritten_text (${quoteCount}); likely unbalanced quote will break JSON encoding at integration`,
      severity: 'moderate'
    });
  }

  // Final verdict
  if (failures.length === 0) {
    console.log(JSON.stringify({
      exit: 0,
      rw_id: rw.rw_id,
      surface_id: rw.surface_id,
      checks_passed: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
      audit_version: 'audit-rewrite-v1.0'
    }, null, 2));
    process.exit(0);
  } else {
    const majorCount = failures.filter(f => f.severity === 'major').length;
    console.error(JSON.stringify({
      exit: 1,
      rw_id: rw.rw_id,
      surface_id: rw.surface_id,
      total_failures: failures.length,
      major_failures: majorCount,
      failures: failures,
      audit_version: 'audit-rewrite-v1.0'
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
