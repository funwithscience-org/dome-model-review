#!/usr/bin/env node

/**
 * generate-html.js
 *
 * Generates docs/index.html from:
 * - data/wins.json (WIN data and details)
 * - data/sections.json (prose content)
 * - Includes CSS and structure matching the current index.html exactly
 * - Now with tabbed navigation system
 */

const fs = require('fs');
const path = require('path');

// ════ CONFIGURATION ════

const WINS_PATH = path.join(__dirname, '..', 'data', 'wins.json');
const SECTIONS_PATH = path.join(__dirname, '..', 'data', 'sections.json');
const FAILURES_PATH = path.join(__dirname, '..', 'data', 'uncounted-failures.json');
const PREDICTIONS_PATH = path.join(__dirname, '..', 'data', 'predictions.json');
const PKG_PATH = path.join(__dirname, '..', 'package.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'index.html');

// ════ COMPUTED METADATA (never hardcode these in the template) ════

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const REVIEW_VERSION = pkg.version.split('.')[0]; // major version from package.json (e.g., "6" from "6.0.0")
const BUILD_DATE = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
// Dome model version — single source of truth. Update here when the dome publishes a new version.
const DOME_VERSION = 'V51.1';

// Load section-loader helper
let SECTIONS_CACHE = null;

function loadSectionsCache() {
  if (SECTIONS_CACHE !== null) return SECTIONS_CACHE;
  if (!fs.existsSync(SECTIONS_PATH)) {
    return null;
  }
  try {
    SECTIONS_CACHE = JSON.parse(fs.readFileSync(SECTIONS_PATH, 'utf8'));
    return SECTIONS_CACHE;
  } catch (e) {
    console.warn(`Warning: Could not load sections.json: ${e.message}`);
    return null;
  }
}

function getSection(sectionId) {
  const sections = loadSectionsCache();
  return sections ? sections[sectionId] : null;
}

function resolvePlaceholders(html, context) {
  if (!html || typeof html !== 'string') return html;
  let result = html;

  // Simple count replacements
  const replacements = {
    '{{TOTAL_WINS}}': context.totalWins || 0,
    '{{NEW_IN_V51}}': context.newInV51 || 0,
    '{{SELF_CONTRADICTED}}': context.selfContradicted || 0,
    '{{UNFALSIFIABLE}}': context.unfalsifiable || 0,

    // Tally
    '{{TALLY_REFUTED}}': context.tally['Refuted by Data'] || 0,
    '{{TALLY_STD}}': context.tally['Std Model Explains'] || 0,
    '{{TALLY_SELFCON}}': context.tally['Self-Contradicted'] || 0,
    '{{TALLY_MISLEADING}}': context.tally['Misleading'] || 0,
    '{{TALLY_NOTDEMO}}': context.tally['Not Demonstrated'] || 0,
    '{{TALLY_UNFALSIFIABLE}}': context.tally['Unfalsifiable'] || 0,

    // Code analysis
    '{{CA_REVIEWED}}': context.codeAnalysis?.reviewed || 0,
    '{{CA_PENDING}}': context.codeAnalysis?.pending || 0,
    '{{CA_HARDCODED}}': context.codeAnalysis?.monitoring?.hardcoded || 0,
    '{{CA_LIVE}}': context.codeAnalysis?.monitoring?.liveFetch || 0,
    '{{CA_NONE}}': context.codeAnalysis?.monitoring?.none || 0,
    '{{CA_RELABELS}}': context.codeAnalysis?.relabelsStandard || 0,
    '{{CA_POSTHOC}}': context.codeAnalysis?.postHoc || 0,
    '{{CA_DOME}}': context.codeAnalysis?.derivesFromDome || 0,

    // Acknowledged failures (soft-pedal bucket: refined/suspended/falsified, no dome_status_current)
    '{{ACKNOWLEDGED_FAILURES}}': context.acknowledgedFailures || 0,
    '{{DOME_CLAIMED_FAILURES}}': context.domeClaimedFailures || 0,
    '{{DOME_CLAIMED_ACCURACY}}': context.domeClaimedAccuracy || '?',
    '{{DOME_PROSPECTIVE_COUNT}}': context.domeProspectiveCount || '?',
    '{{ACCURACY_VARIANT_LIST}}': context.accuracyVariantList || '',
    '{{ACCURACY_VARIANT_DETAIL}}': context.accuracyVariantDetail || '',
    // Silent failures (items the dome has visibly removed/suspended but excluded from his accuracy denominator)
    '{{SILENT_FAILURES}}': context.silentFailures || 0,
    '{{TOTAL_DOCUMENTED_FAILURES}}': context.totalDocumentedFailures || 0,
    '{{HONEST_ACCURACY}}': context.honestAccuracy || '?',
    '{{HONEST_ACCURACY_DENOM}}': context.honestAccuracyDenom || 0,

    // De-duplication analysis (EXP-032)
    '{{INDEPENDENT_CLAIMS}}': context.independentClaims || 39,
    '{{DEDUP_REDUCTION_PERCENT}}': context.dedupReductionPct || 42,

    // Predictions catalog
    '{{PRED_TOTAL}}': context.predCounts?.total || 0,
    '{{PRED_REVIEWABLE}}': context.predCounts?.reviewable || 0,
    '{{PRED_PREDICTIONS}}': context.predCounts?.predictions || 0,
    '{{PRED_TRACKING}}': context.predCounts?.tracking || 0,
    '{{PRED_DATA_WATCH}}': context.predCounts?.data_watch || 0,
    '{{PRED_MANUAL_TEST}}': context.predCounts?.manual_test || 0,
    '{{PRED_PROSPECTIVE}}': context.predCounts?.prospective || 0,
    '{{PRED_PENDING}}': context.predCounts?.pending || 0,
    '{{PRED_CONFIRMED}}': context.predCounts?.confirmed || 0,
    '{{PRED_FALSIFIED}}': context.predCounts?.falsified || 0,
    '{{PRED_EXPIRED}}': context.predCounts?.expired || 0,
    '{{PRED_STD_RELABEL}}': context.predCounts?.stdRelabel || 0,
    '{{PRED_TESTABLE}}': context.predCounts?.testable || 0,
    '{{PRED_DOME_DERIVED}}': context.predCounts?.domeDerived || 0,
    '{{PRED_ACTIVE_WINDOWS}}': context.predCounts?.activeWindows || 0,
    '{{PRED_IMMINENT}}': context.predCounts?.imminent || 0,
    '{{PRED_RECYCLED}}': context.predCounts?.recycled || 0,
    '{{PRED_GENUINELY_PROSPECTIVE}}': context.predCounts?.genuinelyProspective || 0,
    '{{PROS_TOTAL}}': context.prosCounts?.total || 0,
    '{{PROS_PROMOTED}}': context.prosCounts?.promoted || 0,
    '{{PROS_SUSPENDED}}': context.prosCounts?.suspended || 0,
    '{{DOME_PRED_CLAIMED}}': context.domePredClaimed || 0,
  };

  // Simple replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(String(value));
  }

  // Computed expressions
  if (context.codeAnalysis && context.totalWins) {
    const hardcodedPlusNone = (context.codeAnalysis.monitoring?.hardcoded || 0) +
                              (context.codeAnalysis.monitoring?.none || 0);
    result = result.split('{{CA_HARDCODED_PLUS_NONE}}').join(String(hardcodedPlusNone));

    const pct = Math.round((context.codeAnalysis.reviewed || 0) / context.totalWins * 100);
    result = result.split('{{CA_REVIEWED_PCT}}').join(String(pct));
  }

  return result;
}

function resolveTypeB(html, winsByVerdict, counts, wins, tally, sectionNav) {
  // Replace Type B generated content placeholders with actual function calls
  // These are dynamic content blocks that can't be in static JSON

  if (html.includes('{{PIE_CHART}}')) {
    const chart = generatePieChart(tally, wins.length);
    html = html.replace('{{PIE_CHART}}', chart);
  }

  if (html.includes('{{WIN_TABLE}}')) {
    const table = wins.map(formatTableRow).join('\n');
    html = html.replace('{{WIN_TABLE}}', table);
  }

  // Detail sections - replace {{DETAILS_VERDICT}} with actual detail blocks
  const verdictDetailsMap = {
    '{{DETAILS_REFUTED}}': 'Refuted by Data',
    '{{DETAILS_SELFCON}}': 'Self-Contradicted',
    '{{DETAILS_STD}}': 'Std Model Explains',
    '{{DETAILS_NOTDEMO}}': 'Not Demonstrated',
    '{{DETAILS_MISLEADING}}': 'Misleading',
    '{{DETAILS_UNFALSIFIABLE}}': 'Unfalsifiable',
  };

  for (const [placeholder, verdict] of Object.entries(verdictDetailsMap)) {
    if (html.includes(placeholder)) {
      const details = (winsByVerdict[verdict] || []).map(formatWinDetail).join('\n');
      html = html.replace(placeholder, details);
    }
  }

  // Section navigation placeholders
  if (html.includes('{{SECTION_NAV}}')) {
    // Would need the actual sectionNav function call parameters
    // For now, we'll skip this - it's handled by keeping the old template
  }

  return html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFailureEntry(e) {
  const idLabel = escapeHtml(e.id);
  const refLabel = e.dome_ref_current
    ? escapeHtml(e.dome_ref_current) + (e.dome_status_current ? ` <span style="color:#8b0000;font-weight:600">[${escapeHtml(e.dome_status_current)}]</span>` : '')
    : escapeHtml(e.dome_ref || 'unknown');
  const summary = escapeHtml(e.summary || '');
  const prediction = escapeHtml(e.prediction || '');
  const outcome = escapeHtml(e.outcome || '');
  const domeLabel = escapeHtml(e.dome_label || '');
  const what = escapeHtml(e.what_actually_happened || '');
  const evidenceDate = escapeHtml(e.evidence_date || '');
  const staleNote = e.needs_reconciliation
    ? `<p style="font-size:.85rem;color:#888;font-style:italic;margin:.5rem 0 0">Note: the <code>${escapeHtml(e.dome_ref || '')}</code> reference above is from an earlier dome version and may have been reused on the current site for an unrelated prediction. Reconciliation against the V50.6→V51.1 history is in progress.</p>`
    : '';
  return `<div style="border-left:4px solid #c45050;background:var(--card-bg);padding:1rem 1.25rem;margin:1rem 0;border-radius:0 6px 6px 0">
<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.5rem">
  <strong>${idLabel}: ${summary}</strong>
  <span style="font-size:.85rem;color:#888">${refLabel}</span>
</div>
<p style="margin:.5rem 0 .25rem"><strong>Prediction:</strong> ${prediction}</p>
<p style="margin:.25rem 0"><strong>Outcome:</strong> ${outcome}</p>
<p style="margin:.25rem 0"><strong>Dome's label:</strong> <em>${domeLabel}</em>${evidenceDate ? ` <span style="color:#888;font-size:.85rem">(${evidenceDate})</span>` : ''}</p>
<p style="margin:.25rem 0 0">${what}</p>
${staleNote}
</div>`;
}

function renderFailuresBlock(failures, silentFailureEntries, acknowledgedBucketEntries, honestAccuracy, honestAccuracyDenom, totalWins) {
  const totalDome = failures.dome_claimed_failures || 0;
  const totalSilent = silentFailureEntries.length;
  const honestPct = honestAccuracy;

  const silentBlocks = silentFailureEntries.length > 0
    ? silentFailureEntries.map(renderFailureEntry).join('\n')
    : '<p><em>None currently tracked. The poller flags new removals as they appear.</em></p>';

  const ackBlocks = acknowledgedBucketEntries.length > 0
    ? acknowledgedBucketEntries.map(renderFailureEntry).join('\n')
    : '<p><em>None currently tracked.</em></p>';

  const totalFailures = totalDome + totalSilent;
  return `
<h2 id="p3-failures">Failures the dome doesn't count</h2>

<div class="scorecard" style="grid-template-columns:repeat(3,1fr);margin:1rem 0">
<div class="sc-card sc-sm" style="border-left:4px solid #c45050">
<div class="sc-number">${totalDome}</div>
<div class="sc-label">Acknowledged</div>
<div class="sc-sublabel">The dome's own count — items he labels "refined" and includes in his ${failures.dome_claimed_accuracy} denominator</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid #8b0000">
<div class="sc-number">${totalSilent}</div>
<div class="sc-label">Silent</div>
<div class="sc-sublabel">Predictions visibly removed or suspended but excluded from his accuracy denominator</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid #666">
<div class="sc-number">${honestPct}</div>
<div class="sc-label">Honest Accuracy</div>
<div class="sc-sublabel">Counting all ${totalFailures} failures: <code>${totalWins} / (${totalWins} + ${totalDome} + ${totalSilent})</code> = ${honestPct}, not ${failures.dome_claimed_accuracy}</div>
</div>
</div>

<p>The dome has produced predictions that <em>did not</em> hold up against data — but most are not visible in his ${failures.dome_claimed_accuracy} headline accuracy figure. He uses three layers of softening: <strong>"refined"</strong> (rewritten after the data comes in), <strong>"suspended"</strong> (paused indefinitely), and <strong>"removed"</strong> (withdrawn but excluded from the count entirely). His own accuracy formula <code>${totalWins} / (${totalWins} + ${totalDome})</code> only counts the first category.</p>

<h3 id="p3-ack-failures">Acknowledged failures — the dome's own "${totalDome} refined"</h3>

<p>These ${acknowledgedBucketEntries.length} predictions correspond to items the dome counts in his ${totalDome}-failure denominator. He calls them "refined" or "falsified" and they are the only failures included in his ${failures.dome_claimed_accuracy} accuracy figure.</p>

<div style="background:#fff9e6;border-left:4px solid #d4a017;padding:.75rem 1rem;margin:1rem 0;border-radius:0 4px 4px 0;font-size:.9rem">
<strong>⚠ Reconciliation in progress.</strong> The <code>dome_ref</code> field on the entries below points to W-numbers from an earlier dome version. The dome has since reused those W-numbers for unrelated CONFIRMED predictions (e.g. <code>W024</code> previously referred to "Polaris elevation excess" but now refers to "Roaring 40s = SAA Southern Boundary"). The analyst is working through the V50.6→V51.1 history to map each entry to its current dome state. Until that's complete, treat the W-references as historical pointers, not live cross-references.
</div>

${ackBlocks}

<h3 id="p3-silent-failures">Silent failures — removed or suspended, excluded from his count</h3>

<p>${totalSilent} prediction${totalSilent === 1 ? '' : 's'} that the dome has visibly disowned — marked <code>[REMOVED]</code> or <code>[SUSPENDED]</code> — but excluded from both the headline confirmed count and the ${totalDome} acknowledged failures. These are the entries that should reduce his accuracy but don't.</p>

${silentBlocks}
`;
}

function renderSectionFromJson(sectionId, context, winsByVerdict, wins, tally, sectionNavFunc) {
  const sections = loadSectionsCache();
  if (!sections) {
    throw new Error('sections.json not found or unparseable — cannot build. Restore from git.');
  }

  const section = sections[sectionId];
  if (!section || !section.html) {
    throw new Error(`Section "${sectionId}" not found in sections.json`);
  }

  let html = section.html;
  html = resolvePlaceholders(html, context);
  html = resolveTypeB(html, winsByVerdict, context, wins, tally, sectionNavFunc);
  return html;
}

const VERDICT_CLASSES = {
  'Refuted by Data': 'v-refuted',
  'Std Model Explains': 'v-std',
  'Self-Contradicted': 'v-selfcon',
  'Misleading': 'v-misleading',
  'Not Demonstrated': 'v-notdemo',
  'Unfalsifiable': 'v-unfalsifiable'
};

// ════ PIE CHART COLORS (match CSS verdict colors) ════

const VERDICT_COLORS_LIGHT = {
  'Refuted by Data': '#E57373',
  'Std Model Explains': '#66BB6A',
  'Self-Contradicted': '#42A5F5',
  'Misleading': '#FFA726',
  'Not Demonstrated': '#AB47BC',
  'Unfalsifiable': '#BDBDBD'
};

const VERDICT_COLORS_DARK = {
  'Refuted by Data': '#ef5350',
  'Std Model Explains': '#43a047',
  'Self-Contradicted': '#1e88e5',
  'Misleading': '#fb8c00',
  'Not Demonstrated': '#8e24aa',
  'Unfalsifiable': '#757575'
};

const VERDICT_ORDER = [
  'Refuted by Data', 'Self-Contradicted', 'Std Model Explains',
  'Misleading', 'Not Demonstrated', 'Unfalsifiable'
];

function generatePieChart(tally, total) {
  // Larger canvas to accommodate callout lines
  const cx = 150, cy = 150, r = 110;
  let angle = -Math.PI / 2; // start at top
  const slices = [];
  const callouts = [];
  const SMALL_THRESHOLD = 0.08; // slices < 8% get callout lines

  for (const verdict of VERDICT_ORDER) {
    const count = tally[verdict] || 0;
    if (count === 0) continue;
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const lightColor = VERDICT_COLORS_LIGHT[verdict];
    const darkColor = VERDICT_COLORS_DARK[verdict];

    slices.push(`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${lightColor}" class="pie-slice" data-dark="${darkColor}" stroke="var(--bg)" stroke-width="2"/>`);

    const midAngle = angle + sweep / 2;
    const pct = ((count / total) * 100).toFixed(0);
    const fraction = count / total;

    if (fraction < SMALL_THRESHOLD) {
      // Small slice: callout line from edge to outside label
      const innerR = r + 8;
      const outerR = r + 35;
      const ix = cx + innerR * Math.cos(midAngle);
      const iy = cy + innerR * Math.sin(midAngle);
      const ox = cx + outerR * Math.cos(midAngle);
      const oy = cy + outerR * Math.sin(midAngle);
      // Horizontal tail
      const tailDir = Math.cos(midAngle) >= 0 ? 1 : -1;
      const tx = ox + tailDir * 20;
      const anchor = tailDir > 0 ? 'start' : 'end';
      callouts.push(`<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="${darkColor}" stroke-width="1.2" class="callout-line" data-dark="${darkColor}" data-light="${darkColor}"/>`);
      callouts.push(`<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="${darkColor}" stroke-width="1.2" class="callout-line" data-dark="${darkColor}" data-light="${darkColor}"/>`);
      callouts.push(`<text x="${(tx + tailDir * 3).toFixed(1)}" y="${(oy + 1).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" font-weight="700" fill="${darkColor}" class="pie-callout">${count} (${pct}%)</text>`);
    } else {
      // Large slice: label inside
      const labelR = r * 0.6;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      callouts.push(`<text x="${lx.toFixed(1)}" y="${(ly - 6).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="700" fill="#fff" class="pie-label" style="text-shadow:0 1px 3px rgba(0,0,0,.4)">${count}</text>`);
      callouts.push(`<text x="${lx.toFixed(1)}" y="${(ly + 10).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="600" fill="#fff" class="pie-label" style="text-shadow:0 1px 3px rgba(0,0,0,.4)">${pct}%</text>`);
    }

    angle += sweep;
  }

  // Legend items — wide enough viewBox so text isn't clipped
  const legendItems = VERDICT_ORDER.filter(v => (tally[v] || 0) > 0).map((verdict, i) => {
    const count = tally[verdict] || 0;
    const pct = ((count / total) * 100).toFixed(0);
    const y = i * 28;
    return `<g transform="translate(0,${y})">
      <rect width="16" height="16" rx="3" fill="${VERDICT_COLORS_LIGHT[verdict]}" class="legend-swatch" data-dark="${VERDICT_COLORS_DARK[verdict]}"/>
      <text x="24" y="12.5" font-size="13" fill="var(--text)"><tspan font-weight="700">${count}</tspan> ${verdict} (${pct}%)</text>
    </g>`;
  });

  const legendH = VERDICT_ORDER.filter(v => (tally[v] || 0) > 0).length * 28;
  const svgW = 340, svgH = 340;

  return `
<div style="display:flex;align-items:center;justify-content:center;gap:2.5rem;flex-wrap:wrap;margin:1.2rem 0 1.5rem">
  <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="Verdict distribution pie chart">
    ${slices.join('\n    ')}
    ${callouts.join('\n    ')}
  </svg>
  <svg viewBox="0 0 300 ${legendH}" width="300" height="${legendH}" role="img" aria-label="Verdict legend">
    ${legendItems.join('\n    ')}
  </svg>
</div>
<script>
(function(){
  const mq = window.matchMedia('(prefers-color-scheme:dark)');
  document.querySelectorAll('.pie-slice').forEach(el => el.dataset.light = el.getAttribute('fill'));
  document.querySelectorAll('.legend-swatch').forEach(el => el.dataset.light = el.getAttribute('fill'));
  function apply(dark) {
    document.querySelectorAll('.pie-slice').forEach(el => el.setAttribute('fill', dark ? el.dataset.dark : el.dataset.light));
    document.querySelectorAll('.legend-swatch').forEach(el => el.setAttribute('fill', dark ? el.dataset.dark : el.dataset.light));
    document.querySelectorAll('.pie-label').forEach(el => el.setAttribute('fill', '#fff'));
  }
  apply(mq.matches);
  mq.addEventListener('change', e => apply(e.matches));
})();
</script>
`;
}

// ════ CSS (EXACT FROM CURRENT INDEX.HTML + NEW TAB STYLES + SCORECARD) ════

const CSS = `
:root{--bg:#fff;--text:#222;--heading:#2E4057;--accent:#4A6FA5;--link:#0563C1;--border:#ccc;--table-header:#2E4057;--refuted:rgba(229,115,115,0.25);--stdmodel:rgba(102,187,106,0.25);--selfcon:rgba(66,165,245,0.25);--misleading:rgba(255,167,38,0.25);--unfalsifiable:rgba(189,189,189,0.25);--notdemo:rgba(171,71,188,0.25);--refuted-solid:#E57373;--stdmodel-solid:#66BB6A;--selfcon-solid:#42A5F5;--misleading-solid:#FFA726;--unfalsifiable-solid:#BDBDBD;--notdemo-solid:#AB47BC;--code-bg:#f5f5f5;--card-bg:#fafafa}
@media(prefers-color-scheme:dark){:root{--bg:#1a1a2e;--text:#e0e0e0;--heading:#7eb8da;--accent:#8fafd4;--link:#5dade2;--border:#444;--table-header:#1c3045;--refuted:rgba(239,83,80,0.2);--stdmodel:rgba(67,160,71,0.2);--selfcon:rgba(30,136,229,0.2);--misleading:rgba(251,140,0,0.2);--unfalsifiable:rgba(117,117,117,0.25);--notdemo:rgba(142,36,170,0.2);--refuted-solid:#ef5350;--stdmodel-solid:#43a047;--selfcon-solid:#1e88e5;--misleading-solid:#fb8c00;--unfalsifiable-solid:#757575;--notdemo-solid:#8e24aa;--code-bg:#2a2a3e;--card-bg:#222240}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;line-height:1.65;color:var(--text);background:var(--bg);max-width:960px;margin:0 auto;padding:1rem 1.5rem 3rem;padding-top:0}
h1{font-size:1.8rem;color:var(--heading);margin:2.5rem 0 1rem;padding-bottom:.3rem;border-bottom:2px solid var(--accent)}
h2{font-size:1.4rem;color:var(--heading);margin:2rem 0 .8rem}
h3{font-size:1.15rem;color:var(--accent);margin:1.5rem 0 .6rem}
p{margin:.5rem 0}
a{color:var(--link);text-decoration:underline}
a:hover{text-decoration:none}
.title-block{text-align:center;padding:3rem 0 2rem;border-bottom:3px solid var(--accent);margin-bottom:2rem}
.title-block h1{border:none;font-size:2.4rem;margin:.3rem 0}
.title-block .subtitle{font-size:1.1rem;color:#666;margin:.2rem 0}
.title-block .meta{font-size:.95rem;color:#999;margin-top:1rem}
.scorecard{display:grid;gap:1.5rem;margin:2rem 0;max-width:none}
.sc-hero{grid-template-columns:repeat(4,1fr)}
@media(max-width:1100px){.sc-hero{grid-template-columns:repeat(2,1fr)}}
.sc-breakdown{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-top:.5rem}
.scorecard .sc-card{background:var(--card-bg);border:2px solid var(--border);border-radius:8px;padding:1.5rem 1.2rem;text-align:center;transition:all .2s}
.scorecard .sc-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);border-color:var(--accent)}
.scorecard .sc-card .sc-number{font-size:2.8rem;font-weight:700;color:var(--heading);margin:.5rem 0}
.scorecard .sc-card .sc-label{font-size:1rem;font-weight:600;color:var(--text);margin:.8rem 0 .4rem}
.scorecard .sc-card .sc-sublabel{font-size:.85rem;color:#888;line-height:1.4}
.scorecard .sc-card.accent{border-color:var(--accent);background:rgba(74,111,165,0.05)}
.scorecard .sc-card.accent .sc-number{color:var(--accent)}
.scorecard-framing{font-size:.9em;text-align:center;margin-bottom:.5rem;color:#888}
.scorecard .sc-card.sc-sm{padding:1rem .8rem}
.scorecard .sc-card.sc-sm .sc-number{font-size:2rem;margin:.3rem 0}
.scorecard .sc-card.sc-sm .sc-label{font-size:.85rem;margin:.4rem 0 .2rem}
.scorecard .sc-card.sc-sm .sc-sublabel{font-size:.78rem}
.sc-domains{grid-template-columns:repeat(3,1fr)}
.verdict-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.5rem;margin:1rem 0}
.verdict-legend .vl{padding:.5rem .8rem;border-radius:4px;font-size:.9rem;border-left:4px solid transparent}
.vl-refuted{background:var(--refuted);border-left-color:var(--refuted-solid)}.vl-std{background:var(--stdmodel);border-left-color:var(--stdmodel-solid)}.vl-selfcon{background:var(--selfcon);border-left-color:var(--selfcon-solid)}.vl-misleading{background:var(--misleading);border-left-color:var(--misleading-solid)}.vl-unfalsifiable{background:var(--unfalsifiable);border-left-color:var(--unfalsifiable-solid)}.vl-notdemo{background:var(--notdemo);border-left-color:var(--notdemo-solid)}
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.88rem}
th{background:var(--table-header);color:#fff;padding:.5rem .6rem;text-align:left;font-weight:600}
td{padding:.45rem .6rem;border:1px solid var(--border);vertical-align:top}
tr:nth-child(even){background:var(--card-bg)}
td.v-refuted{background:var(--refuted);font-weight:700}
td.v-std{background:var(--stdmodel);font-weight:700}
td.v-selfcon{background:var(--selfcon);font-weight:700}
td.v-misleading{background:var(--misleading);font-weight:700}
td.v-unfalsifiable{background:var(--unfalsifiable);font-weight:700}
td.v-notdemo{background:var(--notdemo);font-weight:700}
.tally{background:var(--card-bg);padding:.8rem 1rem;border-left:4px solid var(--accent);margin:1rem 0;font-size:.95rem}
.evidence{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:1rem 1.2rem;margin:.8rem 0}
.evidence p{margin:.4rem 0}
.pred-meta{font-size:.85rem;color:#888;margin:.2rem 0 .6rem}
.verdict-tag{display:inline-block;padding:.15rem .5rem;border-radius:3px;font-weight:700;font-size:.85rem;margin:.3rem 0;border-left:3px solid transparent}
.vt-refuted{background:var(--refuted);border-left-color:var(--refuted-solid)}.vt-std{background:var(--stdmodel);border-left-color:var(--stdmodel-solid)}.vt-selfcon{background:var(--selfcon);border-left-color:var(--selfcon-solid)}.vt-misleading{background:var(--misleading);border-left-color:var(--misleading-solid)}.vt-unfalsifiable{background:var(--unfalsifiable);border-left-color:var(--unfalsifiable-solid)}.vt-notdemo{background:var(--notdemo);border-left-color:var(--notdemo-solid)}
.ca-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0 .2rem;padding:.5rem 0 0;border-top:1px solid var(--border)}
.ca-tag{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;padding:.2rem .5rem;border-radius:3px;background:#f0f0f0;color:#555;border:1px solid #ddd}
.ca-tag.tag-true{background:#FFF3E0;color:#BF360C;border-color:#FFCC80}
.ca-tag.tag-false{background:#E8F5E9;color:#2E7D32;border-color:#A5D6A7}
.ca-tag.tag-monitoring-hardcoded{background:#FFEBEE;color:#B71C1C;border-color:#EF9A9A}
.ca-tag.tag-monitoring-live{background:#E8F5E9;color:#1B5E20;border-color:#A5D6A7}
.ca-tag.tag-monitoring-none{background:#FFF8E1;color:#F57F17;border-color:#FFE082}
.ca-tag .ca-icon{font-size:.8rem}
.ca-label{font-size:.7rem;color:#888;font-weight:400;margin-right:.3rem}
.ca-tag.tag-pending{background:#f5f5f5;color:#999;border-color:#e0e0e0}
nav.toc{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:1.2rem 1.5rem;margin:1.5rem 0}
nav.toc ul{list-style:none;padding-left:1.2rem}
nav.toc>ul{padding-left:0}
nav.toc li{margin:.25rem 0}
nav.toc a{text-decoration:none}
nav.toc a:hover{text-decoration:underline}
.downloads{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.dl-card{border:1px solid var(--border);border-radius:6px;padding:.8rem 1.2rem;background:var(--card-bg);text-decoration:none;color:var(--text);transition:box-shadow .2s}
.dl-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.15)}
.dl-card .dl-icon{font-size:1.5rem}
.dl-card .dl-label{font-weight:600}
.star-table{margin:.5rem 0 .8rem}
.star-table td{padding:.3rem .6rem;font-size:.88rem}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--border);font-size:.85rem;color:#888;text-align:center}

.tab-bar{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:2px solid var(--accent);display:flex;gap:.5rem;flex-wrap:wrap;padding:0.75rem 1.5rem;box-shadow:0 2px 4px rgba(0,0,0,.1)}
.tab-btn{padding:0.6rem 1.2rem;border:none;background:var(--card-bg);color:var(--text);cursor:pointer;border-radius:4px 4px 0 0;font-size:.95rem;font-weight:600;transition:all .2s;border:1px solid var(--border);border-bottom:none}
.tab-btn:hover{background:var(--border)}
.tab-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.tab-content{display:none;padding:1.5rem 0}
.tab-content.active{display:block}

.section-nav{display:flex;justify-content:space-between;align-items:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border)}
.section-nav a,.section-nav span{padding:.6rem 1rem;border-radius:4px;text-decoration:none;font-weight:600}
.nav-prev{color:var(--link);background:var(--card-bg)}
.nav-prev:hover{background:var(--border)}
.nav-next{color:var(--link);background:var(--card-bg)}
.nav-next:hover{background:var(--border)}

.ks-test{border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:6px;padding:1.2rem 1.4rem;margin:1.5rem 0;background:var(--card-bg)}
.ks-test h3{margin-top:0;font-size:1.1rem;color:var(--heading)}
.ks-test .ks-status{display:inline-block;font-size:.75rem;font-weight:700;text-transform:uppercase;padding:.15rem .5rem;border-radius:3px;margin-left:.5rem;vertical-align:middle}
.ks-status.ks-claimed{background:var(--refuted);color:var(--refuted-solid)}
.ks-status.ks-pending{background:var(--unfalsifiable);color:#666}
.ks-status.ks-failing{background:var(--misleading);color:#b45309}
@media(prefers-color-scheme:dark){.ks-status.ks-pending{color:#bbb}.ks-status.ks-failing{color:#f59e0b}}

details .ks-summary{cursor:pointer;list-style:none;padding:.8rem 1.2rem;border-radius:6px;background:var(--card-bg);border:1px solid var(--border);border-left:4px solid var(--accent);margin:1.2rem 0 0}
details .ks-summary::-webkit-details-marker{display:none}
details .ks-summary::marker{display:none}
details .ks-summary:hover{background:color-mix(in srgb,var(--accent) 8%,var(--card-bg))}
details .ks-summary .ks-tldr{margin:.4rem 0 0;font-style:italic;color:#666;font-size:.92rem;line-height:1.4}
@media(prefers-color-scheme:dark){details .ks-summary .ks-tldr{color:#aaa}}
details .ks-summary::after{content:'▸ expand';display:block;font-size:.75rem;color:var(--accent);font-weight:600;margin-top:.5rem;letter-spacing:.03em}
details[open] .ks-summary::after{content:'▾ collapse'}
details .ks-detail{padding:.6rem 1.2rem 1.2rem;border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;background:var(--bg);margin-bottom:1.5rem}
details[open] .ks-summary{border-radius:6px 6px 0 0;margin-bottom:0;border-bottom:none}
.evidence details.win-section{margin:.8rem 0}.evidence details.win-section .ks-summary{border-left-width:3px;padding:.6rem 1rem;margin:0}.evidence details.win-section .ks-detail{padding:.4rem 1rem 1rem}

details .ps-summary{cursor:pointer;list-style:none;padding:.8rem 1.2rem;border-radius:6px;background:var(--card-bg);border:1px solid var(--border);border-left:4px solid var(--heading);margin:1.2rem 0 0}
details .ps-summary::-webkit-details-marker{display:none}
details .ps-summary::marker{display:none}
details .ps-summary:hover{background:color-mix(in srgb,var(--heading) 6%,var(--card-bg))}
details .ps-summary h2{display:inline;margin:0;font-size:1.15rem}
details .ps-summary .ps-tldr{margin:.4rem 0 0;font-style:italic;color:#666;font-size:.92rem;line-height:1.45}
@media(prefers-color-scheme:dark){details .ps-summary .ps-tldr{color:#aaa}}
details .ps-summary::after{content:'▸ expand';display:block;font-size:.75rem;color:var(--accent);font-weight:600;margin-top:.5rem;letter-spacing:.03em}
details[open] .ps-summary::after{content:'▾ collapse'}
details .ps-detail{padding:.6rem 1.2rem 1.2rem;border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;background:var(--bg);margin-bottom:1.5rem}
details[open] .ps-summary{border-radius:6px 6px 0 0;margin-bottom:0;border-bottom:none}

@media(max-width:600px){body{padding:.5rem 1rem}h1{font-size:1.4rem}h2{font-size:1.2rem}table{font-size:.8rem}.tab-bar{padding:0.5rem .75rem;gap:.25rem}.tab-btn{padding:0.5rem 0.8rem;font-size:.85rem}.sc-hero{grid-template-columns:1fr}.sc-breakdown{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.6rem}.sc-domains{grid-template-columns:1fr}.ks-test{padding:.8rem 1rem}details .ks-summary{padding:.6rem .8rem}details .ks-summary::after{font-size:.65rem}details .ps-summary{padding:.6rem .8rem}details .ps-summary::after{font-size:.65rem}[style*="float:right"]{float:none!important;max-width:100%!important;margin:1rem 0!important}}

@media print{:root{--bg:#fff;--text:#222;--heading:#2E4057;--accent:#4A6FA5;--link:#0563C1;--border:#999;--table-header:#2E4057;--refuted:rgba(229,115,115,0.25);--stdmodel:rgba(102,187,106,0.25);--selfcon:rgba(66,165,245,0.25);--misleading:rgba(255,167,38,0.25);--unfalsifiable:rgba(189,189,189,0.25);--notdemo:rgba(171,71,188,0.25);--refuted-solid:#E57373;--stdmodel-solid:#66BB6A;--selfcon-solid:#42A5F5;--misleading-solid:#FFA726;--unfalsifiable-solid:#BDBDBD;--notdemo-solid:#AB47BC;--code-bg:#f5f5f5;--card-bg:#fafafa}
body{max-width:100%;padding:0.6in 0.7in;font-size:9.5pt;line-height:1.5}
h1{font-size:1.5rem;margin-top:1.5rem;page-break-before:always;page-break-after:avoid}
.title-block h1{page-break-before:avoid;page-break-after:avoid}
h2{font-size:1.2rem}
h3{font-size:1rem}
.evidence{padding:0.6rem 0.8rem;page-break-inside:avoid;margin:0.6rem 0}
.ks-test{page-break-inside:avoid}
details{display:block}details .ks-summary::after,details .ps-summary::after{display:none}details .ks-detail,details .ps-detail{border:none;padding:0}
.scorecard .sc-card{padding:0.8rem;page-break-inside:avoid}
.scorecard .sc-card .sc-number{font-size:2rem}
.tab-bar{display:none}
.tab-content{display:block!important}
.section-nav{display:none}
.downloads,h2:has(+.downloads){display:none}
.pie-slice{stroke:#999;stroke-width:1}
.pie-label{text-shadow:none;fill:#333}
.pie-callout{fill:#333}
.callout-line{stroke:#333}
}
/* De-duplication table (EXP-032) */
.dedup-table summary{cursor:pointer;font-size:1.05em;padding:8px 0;user-select:none}
.dedup-table summary:hover{color:var(--accent)}
.dedup-table table.dedup{width:100%;border-collapse:collapse;margin:12px 0;font-size:0.93em}
.dedup-table table.dedup th,.dedup-table table.dedup td{border:1px solid var(--border);padding:7px 9px;vertical-align:top}
.dedup-table table.dedup thead{background:#f5f5f5;font-weight:600}
.dedup-table table.dedup tr.dedup-total{background:#f9f9f9;font-weight:bold}
.dedup-table table.dedup tfoot td{background:#f0f0f0;font-size:0.9em;padding:8px}
@media (max-width:700px){.dedup-table table.dedup{font-size:0.82em}}
.breaking-news{border:2px solid var(--accent);border-radius:10px;padding:1rem 1.2rem;margin:1.5rem 0;background:linear-gradient(135deg,var(--card-bg),rgba(42,100,150,0.04))}
.bn-header{margin:0 0 .8rem;font-size:1.15rem;color:var(--accent);border:none}
.bn-item{display:flex;gap:.8rem;padding:.6rem 0;border-bottom:1px solid var(--border);align-items:baseline}
.bn-item:last-child{border-bottom:none;padding-bottom:0}
.bn-date{font-size:.8rem;color:#888;white-space:nowrap;min-width:5.5rem}
.bn-text{font-size:.93rem;line-height:1.5}
.bn-text strong{color:var(--text)}
@media print{.breaking-news{border:1px solid #ccc;break-inside:avoid}}
`;


// ════ UTILITIES ════

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function computeVerdictTallies(wins) {
  const tally = {};
  wins.forEach(win => {
    const verdict = win.verdict;
    tally[verdict] = (tally[verdict] || 0) + 1;
  });
  return tally;
}

function formatTableRow(win) {
  const verdictClass = VERDICT_CLASSES[win.verdict] || '';
  const id = `win${win.id}`;
  return `<tr><td><a href="#${id}">${win.id}</a></td><td>${escapeHtml(win.claim)}</td><td class="${verdictClass}">${escapeHtml(win.verdict)}</td><td>${escapeHtml(win.finding)}</td></tr>`;
}

function hasDetailContent(win) {
  return win.detail_claim || win.detail_evidence || win.detail_verdict_text || win.detail_extra;
}

function formatWinDetail(win) {
  if (!hasDetailContent(win)) return '';

  const verdictClass = VERDICT_CLASSES[win.verdict] || '';
  const verdictShortClass = verdictClass.replace('v-', 'vt-');
  let html = `<div class="evidence" id="win${win.id}">
<h3>WIN-${win.id}: ${escapeHtml(win.claim)}</h3>
`;

  if (win.detail_claim) {
    html += `<p><strong>Claim:</strong> ${escapeHtml(win.detail_claim)}</p>\n`;
  }

  if (win.detail_evidence) {
    const evTldr = win.tldr_evidence
      ? `<p class="ks-tldr">${escapeHtml(win.tldr_evidence)}</p>`
      : '';
    if (evTldr) {
      html += `<details class="win-section"><summary class="ks-summary"><strong>Evidence</strong>${evTldr}</summary>\n`;
      html += `<div class="ks-detail"><p>${win.detail_evidence}</p></div>\n</details>\n`;
    } else {
      html += `<p><strong>Evidence:</strong> ${win.detail_evidence}</p>\n`;
    }
  }

  if (win.detail_verdict_text) {
    const vdTldr = win.tldr_verdict
      ? `<p class="ks-tldr">${escapeHtml(win.tldr_verdict)}</p>`
      : '';
    const extraHtml = win.detail_extra ? `<p>${win.detail_extra}</p>\n` : '';
    if (vdTldr) {
      html += `<details class="win-section"><summary class="ks-summary"><span class="verdict-tag ${verdictShortClass}">${escapeHtml(win.verdict).toUpperCase()}</span>${vdTldr}</summary>\n`;
      html += `<div class="ks-detail"><p>${win.detail_verdict_text}</p>${extraHtml}</div>\n</details>\n`;
    } else {
      html += `<p><span class="verdict-tag ${verdictShortClass}">${escapeHtml(win.verdict).toUpperCase()}</span> ${win.detail_verdict_text}</p>\n`;
      if (win.detail_extra) {
        html += `<p>${win.detail_extra}</p>\n`;
      }
    }
  }

  // Code analysis tags
  html += formatCodeAnalysisTags(win);

  html += `</div>
`;
  return html;
}

function formatCodeAnalysisTags(win) {
  const ca = win.code_analysis;
  if (!ca) {
    return `<div class="ca-tags"><span class="ca-label">Code analysis:</span><span class="ca-tag tag-pending"><span class="ca-icon">\u2026</span> Pending review</span></div>\n`;
  }
  if (!ca.reviewed) {
    return `<div class="ca-tags"><span class="ca-label">Code analysis:</span><span class="ca-tag tag-pending"><span class="ca-icon">\u2026</span> Pending review</span></div>\n`;
  }

  let tags = '<div class="ca-tags"><span class="ca-label">Code analysis:</span>';

  // Monitoring
  if (ca.monitoring === 'hardcoded') {
    tags += '<span class="ca-tag tag-monitoring-hardcoded"><span class="ca-icon">\u26A0</span> Hardcoded check</span>';
  } else if (ca.monitoring === 'live_fetch') {
    tags += '<span class="ca-tag tag-monitoring-live"><span class="ca-icon">\u25C9</span> Live monitoring</span>';
  } else {
    tags += '<span class="ca-tag tag-monitoring-none"><span class="ca-icon">\u2298</span> No monitoring</span>';
  }

  // Relabels standard
  if (ca.relabels_standard) {
    tags += '<span class="ca-tag tag-true"><span class="ca-icon">\u21BB</span> Relabels standard physics</span>';
  } else {
    tags += '<span class="ca-tag tag-false"><span class="ca-icon">\u2713</span> Distinct from standard model</span>';
  }

  // Post-hoc
  if (ca.post_hoc) {
    tags += '<span class="ca-tag tag-true"><span class="ca-icon">\u25F7</span> Post-hoc</span>';
  } else {
    tags += '<span class="ca-tag tag-false"><span class="ca-icon">\u2713</span> Prospective</span>';
  }

  // Derives from dome
  if (ca.derives_from_dome) {
    tags += '<span class="ca-tag tag-false"><span class="ca-icon">\u2713</span> Geometrically derived</span>';
  } else {
    tags += '<span class="ca-tag tag-true"><span class="ca-icon">\u2717</span> No geometric derivation</span>';
  }

  tags += '</div>\n';
  return tags;
}

function sectionNav(prevTab, prevLabel, nextTab, nextLabel) {
  let html = '<div class="section-nav">';
  if (prevTab) html += `<a href="#" onclick="showTab('${prevTab}');window.scrollTo(0,0);return false" class="nav-prev">← ${prevLabel}</a>`;
  else html += '<span></span>';
  if (nextTab) html += `<a href="#" onclick="showTab('${nextTab}');window.scrollTo(0,0);return false" class="nav-next">${nextLabel} →</a>`;
  else html += '<span></span>';
  html += '</div>';
  return html;
}

// ════ PREDICTION PANELS ════

const PRED_VERDICT_CLASSES = {
  'standard_physics': 'vt-std',
  'recycled': 'vt-misleading',
  'falsified': 'vt-refuted',
  'unfalsifiable': 'vt-unfalsifiable',
  'pending': 'vt-notdemo',
};

const PRED_VERDICT_LABELS = {
  'standard_physics': 'Standard Physics',
  'recycled': 'Recycled from WIN',
  'falsified': 'Falsified',
  'unfalsifiable': 'Unfalsifiable',
  'pending': 'Pending',
};

const PRED_TD_CLASSES = {
  'standard_physics': 'v-std',
  'recycled': 'v-misleading',
  'falsified': 'v-refuted',
  'unfalsifiable': 'v-unfalsifiable',
  'pending': 'v-notdemo',
};

function formatPredictionDetail(pred) {
  if (!pred.detail_reasoning && !pred.claim) return '';

  const verdict = pred.our_verdict || 'pending';
  const verdictClass = PRED_VERDICT_CLASSES[verdict] || '';
  const verdictLabel = PRED_VERDICT_LABELS[verdict] || verdict;
  const anchorId = 'pred-' + pred.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Verdict badge color mapping (match kill-shot badge style)
  const badgeColors = {
    'standard_physics': 'background:#C8E6C9;color:#1B5E20',
    'recycled': 'background:#FFE0B2;color:#BF360C',
    'falsified': 'background:#FFCDD2;color:#B71C1C',
    'unfalsifiable': 'background:#E0E0E0;color:#424242',
    'pending': 'background:#D1C4E9;color:#4A148C',
  };
  const badgeStyle = badgeColors[verdict] || badgeColors['pending'];

  // TLDR: prefer dedicated tldr field, fall back to detail_reasoning, then generic
  const tldr = pred.tldr
    ? escapeHtml(pred.tldr)
    : pred.detail_reasoning
      ? escapeHtml(pred.detail_reasoning)
      : (verdict === 'pending' ? 'Awaiting assessment — test window has not yet closed.' : escapeHtml(verdictLabel));

  // ── Summary bar (always visible, kill-shot pattern) ──
  let html = `<div class="ks-test"><details id="${anchorId}"><summary class="ks-summary">`;
  html += `<h2 style="display:inline;margin:0">${escapeHtml(pred.id)}: ${escapeHtml(pred.claim || 'No claim text')}`;
  html += ` <span class="verdict-badge" style="${badgeStyle};padding:2px 8px;border-radius:3px;font-weight:600;margin-left:8px;">${escapeHtml(verdictLabel)}</span>`;
  html += `</h2>`;
  html += `<p class="ks-tldr">${tldr}</p>`;
  html += `</summary><div class="ks-detail">\n`;

  // ── Detail content (visible on expand) ──
  // Metadata line
  const meta = [];
  if (pred.category) meta.push(`<strong>Category:</strong> ${escapeHtml(pred.category)}`);
  if (pred.registration_date) meta.push(`<strong>Registered:</strong> ${escapeHtml(pred.registration_date)}`);
  if (pred.test_window) meta.push(`<strong>Test window:</strong> ${escapeHtml(typeof pred.test_window === 'string' ? pred.test_window : pred.test_window.closes || 'open')}`);
  if (pred.author_status) meta.push(`<strong>Author status:</strong> ${escapeHtml(pred.author_status)}`);
  if (meta.length) {
    html += `<p class="pred-meta">${meta.join(' · ')}</p>\n`;
  }

  // Restates WIN cross-reference
  if (pred.restates_win) {
    const rawWin = String(pred.restates_win).replace(/^WIN-/i, '');
    const winId = rawWin.padStart(3, '0');
    html += `<p><strong>Restates:</strong> <a href="#win${winId}" onclick="showTab('wins');return false">WIN-${escapeHtml(winId)}</a></p>\n`;
  }

  // Verdict tag + reasoning (full form in detail)
  if (pred.detail_reasoning) {
    html += `<p><span class="verdict-tag ${verdictClass}">${escapeHtml(verdictLabel).toUpperCase()}</span> ${escapeHtml(pred.detail_reasoning)}</p>\n`;
  } else if (verdict !== 'pending') {
    html += `<p><span class="verdict-tag ${verdictClass}">${escapeHtml(verdictLabel).toUpperCase()}</span></p>\n`;
  } else {
    html += `<p><span class="verdict-tag vt-notdemo">AWAITING ASSESSMENT</span></p>\n`;
  }

  html += `</div></details></div>\n`;
  return html;
}

function formatPredictionTableRow(pred) {
  const verdict = pred.our_verdict || 'pending';
  const tdClass = PRED_TD_CLASSES[verdict] || '';
  const verdictLabel = PRED_VERDICT_LABELS[verdict] || verdict;
  const anchorId = 'pred-' + pred.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const restatesDisplay = pred.restates_win
    ? 'WIN-' + String(pred.restates_win).replace(/^WIN-/i, '').padStart(3, '0')
    : '';
  return `<tr><td><a href="#${anchorId}">${escapeHtml(pred.id)}</a></td><td>${escapeHtml(pred.claim || '')}</td><td class="${tdClass}">${escapeHtml(verdictLabel)}</td><td>${escapeHtml(restatesDisplay)}</td></tr>`;
}

function _splitPredictions(predictions) {
  const entries = predictions.entries || [];
  const tombstone = entries.filter(e =>
    e.is_genuinely_prospective === true &&
    (e.entry_type === 'prediction' || e.entry_type === 'tracking')
  );
  const mined = entries.filter(e =>
    e.is_genuinely_prospective !== true &&
    (e.entry_type === 'prediction' || e.entry_type === 'tracking')
  );
  const operational = entries.filter(e =>
    e.entry_type === 'data_watch' || e.entry_type === 'manual_test'
  );
  function tallyVerdicts(arr) {
    const t = {};
    arr.forEach(e => { const v = e.our_verdict || 'pending'; t[v] = (t[v] || 0) + 1; });
    return t;
  }
  return { entries, tombstone, mined, operational, tombstoneTally: tallyVerdicts(tombstone), minedTally: tallyVerdicts(mined), domeClaimed: predictions.summary?.dome_total_claimed || '?' };
}

function renderPredictionScorecard(predictions) {
  const { entries, tombstone, mined, domeClaimed } = _splitPredictions(predictions);
  let html = '';
  html += `<div class="scorecard" style="grid-template-columns:repeat(4,1fr);margin:1rem 0">\n`;
  html += `<div class="sc-card sc-sm" style="border-left:4px solid #2a6496">
<div class="sc-number">${domeClaimed}</div>
<div class="sc-label">Dome Claims</div>
<div class="sc-sublabel">Total predictions on the dome's registry</div>
</div>\n`;
  html += `<div class="sc-card sc-sm" style="border-left:4px solid #555">
<div class="sc-number">${entries.length}</div>
<div class="sc-label">We Cataloged</div>
<div class="sc-sublabel">Our independent tally from the same source pages</div>
</div>\n`;
  html += `<div class="sc-card sc-sm" style="border-left:4px solid var(--accent)">
<div class="sc-number">${tombstone.length}</div>
<div class="sc-label">Genuinely Prospective</div>
<div class="sc-sublabel">Registered before the data — the only ones with real evidential weight</div>
</div>\n`;
  html += `<div class="sc-card sc-sm" style="border-left:4px solid var(--misleading-solid)">
<div class="sc-number">${mined.length}</div>
<div class="sc-label">Extracted / Mined</div>
<div class="sc-sublabel">Registered after the data was already public — postdictions, recycled WINs, standard physics</div>
</div>\n`;
  html += `</div>\n`;
  return html;
}

function renderPredictionPanels(predictions) {
  const { tombstone, mined, operational, tombstoneTally, minedTally } = _splitPredictions(predictions);
  let html = '';

  function verdictCardColor(v) {
    return v === 'standard_physics' ? 'stdmodel' : v === 'recycled' ? 'misleading' : v === 'falsified' ? 'refuted' : v === 'unfalsifiable' ? 'unfalsifiable' : 'notdemo';
  }

  // ── Tombstone Predictions (all visible except detail panels) ──
  html += `<h2 id="pred-tombstone">The Dome's Official Prospective Predictions</h2>\n`;
  html += `<p>The dome's predictions page designates ${tombstone.length} entries as genuinely prospective — predictions registered <em>before</em> the data comes in. These are the strongest category: if even one produces a novel, verified result that standard physics cannot explain, the dome model would earn real scientific credibility. So far, none do: most predict the same ranges as standard models (non-discriminating), and the timestamp infrastructure anchors the observations file, not the predictions. The prospective label is earned; the evidential weight is not.</p>\n`;

  html += `<div class="scorecard" style="grid-template-columns:repeat(${Object.keys(tombstoneTally).length},1fr)">\n`;
  for (const [v, count] of Object.entries(tombstoneTally)) {
    html += `<div class="sc-card sc-sm" style="border-left:4px solid var(--${verdictCardColor(v)}-solid)">\n`;
    html += `<div class="sc-number">${count}</div>\n<div class="sc-label">${escapeHtml(PRED_VERDICT_LABELS[v] || v)}</div>\n</div>\n`;
  }
  html += `</div>\n`;

  html += `<table><thead><tr><th>ID</th><th>Claim</th><th>Our Verdict</th><th>Restates</th></tr></thead><tbody>\n`;
  html += tombstone.map(formatPredictionTableRow).join('\n');
  html += `\n</tbody></table>\n`;

  // Individual prediction panels — each collapsible (kill-shot pattern)
  html += tombstone.map(formatPredictionDetail).join('\n');

  // ── Mined Predictions (all visible except detail panels) ──
  html += `<h2 id="pred-mined">Extracted Predictions — Registered After the Data</h2>\n`;
  html += `<p>The predictions page contains ${mined.length} additional entries registered <em>after</em> the relevant data was already published. Most restate existing WINs under new prediction IDs — what we classify as "recycled." Others are standard physics results repackaged with dome terminology. A prediction registered after its outcome is known is not a prediction; it is a postdiction. The volume pads the catalog without adding evidential weight.</p>\n`;

  html += `<div class="scorecard" style="grid-template-columns:repeat(${Object.keys(minedTally).length},1fr)">\n`;
  for (const [v, count] of Object.entries(minedTally)) {
    html += `<div class="sc-card sc-sm" style="border-left:4px solid var(--${verdictCardColor(v)}-solid)">\n`;
    html += `<div class="sc-number">${count}</div>\n<div class="sc-label">${escapeHtml(PRED_VERDICT_LABELS[v] || v)}</div>\n</div>\n`;
  }
  html += `</div>\n`;

  html += `<table><thead><tr><th>ID</th><th>Claim</th><th>Our Verdict</th><th>Restates</th></tr></thead><tbody>\n`;
  html += mined.map(formatPredictionTableRow).join('\n');
  html += `\n</tbody></table>\n`;

  // Detail panels — collapsed
  html += `<details id="pred-mined-detail"><summary class="ps-summary"><h2 style="display:inline;margin:0">Extracted Prediction Details (${mined.length})</h2>`;
  html += `<p class="ps-tldr">Full per-prediction assessments for the ${mined.length} post-hoc entries: recycled WINs, relabeled standard physics, and postdictions.</p>`;
  html += `</summary><div class="ps-detail">\n`;
  html += mined.map(formatPredictionDetail).join('\n');
  html += `</div></details>\n`;

  // ── Operational Tracking ──
  if (operational.length > 0) {
    html += `<details id="pred-operational"><summary class="ps-summary"><h2 style="display:inline;margin:0">Operational Tracking Items (${operational.length})</h2>`;
    html += `<p class="ps-tldr">Not predictions in the scientific sense — data watches and manual tests that monitor ongoing phenomena. Listed for completeness; none carry evidential weight.</p>`;
    html += `</summary><div class="ps-detail">\n`;
    html += `<table><thead><tr><th>ID</th><th>Type</th><th>Description</th></tr></thead><tbody>\n`;
    operational.forEach(e => {
      html += `<tr><td>${escapeHtml(e.id)}</td><td>${escapeHtml(e.entry_type)}</td><td>${escapeHtml(e.claim || '')}</td></tr>\n`;
    });
    html += `</tbody></table>\n`;
    html += `</div></details>\n`;
  }

  return html;
}

// ════ MAIN ════

function main() {
  console.log('Reading wins.json...');
  const wins = JSON.parse(fs.readFileSync(WINS_PATH, 'utf8'));

  console.log(`Found ${wins.length} WINs`);

  // Group wins by verdict for detailed sections
  const winsByVerdict = {};
  wins.forEach(win => {
    if (!winsByVerdict[win.verdict]) {
      winsByVerdict[win.verdict] = [];
    }
    winsByVerdict[win.verdict].push(win);
  });

  // Compute tallies
  const tally = computeVerdictTallies(wins);

  console.log('Verdict tally:', tally);

  // ════ COMPUTED COUNTS (all numbers in prose derive from data) ════
  // Base WINs = dome's claimed count (3-digit IDs only, e.g., "001"–"067")
  // Sub-IDs (e.g., "058b") are our tracking entries for dome numbering collisions
  const baseWins = wins.filter(w => /^\d{3}$/.test(w.id));
  const counts = {
    total: baseWins.length,  // dome's claimed count (used in prose as {{TOTAL_WINS}})
    newInV51: wins.filter(w => w.new_in_v51).length,
    // Verdict counts
    refuted: tally['Refuted by Data'] || 0,
    selfContradicted: tally['Self-Contradicted'] || 0,
    stdModel: tally['Std Model Explains'] || 0,
    misleading: tally['Misleading'] || 0,
    notDemonstrated: tally['Not Demonstrated'] || 0,
    unfalsifiable: tally['Unfalsifiable'] || 0,
    // Code analysis counts (from reviewed WINs with code_analysis tags)
    codeAnalysis: (() => {
      // Count against baseWins (3-digit IDs only) — sub-ID tracking entries like
      // WIN-058b are our own collision bookkeeping, not real WINs to review. Using
      // unfiltered `wins` caused prose to report "1 pending" forever after WIN-058b
      // was added (ISS-692).
      const reviewed = baseWins.filter(w => w.code_analysis && w.code_analysis.reviewed);
      return {
        reviewed: reviewed.length,
        pending: baseWins.length - reviewed.length,
        monitoring: {
          hardcoded: reviewed.filter(w => w.code_analysis.monitoring === 'hardcoded').length,
          liveFetch: reviewed.filter(w => w.code_analysis.monitoring === 'live_fetch').length,
          none: reviewed.filter(w => w.code_analysis.monitoring === 'none').length,
        },
        relabelsStandard: reviewed.filter(w => w.code_analysis.relabels_standard).length,
        postHoc: reviewed.filter(w => w.code_analysis.post_hoc).length,
        derivesFromDome: reviewed.filter(w => w.code_analysis.derives_from_dome).length,
      };
    })(),
    // Group counts
    groups: [...new Set(wins.filter(w => w.detail_group).map(w => w.detail_group))].length,
  };
  console.log('Computed counts:', JSON.stringify(counts, null, 2));

  // Load acknowledged failures
  let failures = { entries: [], dome_claimed_failures: 4, dome_claimed_accuracy: '94.5%' };
  if (fs.existsSync(FAILURES_PATH)) {
    failures = JSON.parse(fs.readFileSync(FAILURES_PATH, 'utf8'));
    console.log('Acknowledged failures:', failures.entries.length);
  }

  // Load predictions catalog
  let predictions = { entries: [] };
  if (fs.existsSync(PREDICTIONS_PATH)) {
    predictions = JSON.parse(fs.readFileSync(PREDICTIONS_PATH, 'utf8'));
    console.log('Predictions cataloged:', predictions.entries.length);
  }
  // Compute prediction counts
  const predEntries = predictions.entries || [];
  // Only count prediction and tracking types for headline numbers
  const reviewableEntries = predEntries.filter(e => e.entry_type === 'prediction' || e.entry_type === 'tracking');
  const predCounts = {
    total: predEntries.length,
    reviewable: reviewableEntries.length,
    predictions: predEntries.filter(e => e.entry_type === 'prediction').length,
    tracking: predEntries.filter(e => e.entry_type === 'tracking').length,
    data_watch: predEntries.filter(e => e.entry_type === 'data_watch').length,
    manual_test: predEntries.filter(e => e.entry_type === 'manual_test').length,
    prospective: predEntries.filter(e => e.prospective === true).length,
    pending: predEntries.filter(e => e.author_status === 'pending').length,
    confirmed: predEntries.filter(e => e.author_status === 'confirmed').length,
    falsified: predEntries.filter(e => e.author_status === 'falsified').length,
    expired: predEntries.filter(e => e.author_status === 'expired' || e.window_expired).length,
    stdRelabel: predEntries.filter(e => e.our_verdict === 'standard_physics').length,
    testable: predEntries.filter(e => e.testability === 'testable').length,
    domeDerived: predEntries.filter(e => e.our_verdict === 'dome_geometry').length,
    recycled: predEntries.filter(e => e.restates_win != null).length,
    genuinelyProspective: predEntries.filter(e =>
      e.is_genuinely_prospective === true &&
      (e.entry_type === 'prediction' || e.entry_type === 'tracking')
    ).length,
    activeWindows: predEntries.filter(e => e.test_window?.status === 'open').length,
    imminent: predEntries.filter(e => {
      if (!e.test_window?.closes) return false;
      const closes = new Date(e.test_window.closes);
      const now = new Date();
      const days = (closes - now) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 30;
    }).length,
    ourFalsified: predEntries.filter(e => e.our_verdict === 'falsified').length,
    ourUnfalsifiable: predEntries.filter(e => e.our_verdict === 'unfalsifiable').length,
    ourRecycled: predEntries.filter(e => e.our_verdict === 'recycled').length,
  };
  // Dead on arrival: count by our_verdict to avoid double-counting (restates_win overlaps with std_physics, unfalsifiable)
  predCounts.deadOnArrival = predCounts.stdRelabel + predCounts.ourRecycled + predCounts.ourFalsified + predCounts.ourUnfalsifiable;
  console.log('Prediction counts:', JSON.stringify(predCounts));

  // Compute PROS-bucket counts (entry_type === 'prospective')
  const prosEntries = predEntries.filter(e => e.entry_type === 'prospective');
  const prosCounts = {
    total: prosEntries.length,
    promoted: prosEntries.filter(e => e.dome_promotion_status === 'promoted').length,
    suspended: prosEntries.filter(e => e.dome_promotion_status === 'suspended').length,
  };
  console.log('PROS counts:', JSON.stringify(prosCounts));

  // Compute accuracy variant list from data
  const variantSources = failures.dome_accuracy_variants?.sources || [];
  const accuracyVariants = variantSources.map(s => s.result);
  const accuracyVariantList = accuracyVariants.length > 0
    ? accuracyVariants.slice(0, -1).join(', ') + ', or ' + accuracyVariants[accuracyVariants.length - 1]
    : '';
  // Detailed breakdown with endpoint names and formulas (for Section 6)
  const accuracyVariantDetail = variantSources
    .filter(s => s.endpoint.startsWith('api/'))
    .map(s => `<code>${s.endpoint}</code> gives ${s.formula} = ${s.result}`)
    .join('; ');

  // De-duplication clusters (EXP-032) — conservative clustering by shared primary data source
  // Only clusters WINs sharing the same primary dataset or where one WIN's value is derived from another's.
  const dedupClusters = [
    ['001','002','029','038','061','062'], // Schumann/Tesla cavity resonance
    ['045','046','049','050','051'],        // Tidal harmonic constituents
    ['004','005','035','040','041','060'], // SAA spatial morphology & drift
    ['006','007','022','036','043','059'], // NMP position & trajectory
    ['011','012','013','014'],             // Eclipse gravity/coupling
    ['037','042','063'],                   // Geomagnetic field decay rate
    ['010','025'],                         // Eclipse magnetometer response
    ['008','009'],                         // Telluric EM frequency
    ['016','017'],                         // Stellar astrometry
    ['018','019'],                         // Analemma solar geometry
  ];
  const clusteredWinSet = new Set(dedupClusters.flat());
  const independentClaims = dedupClusters.length + (counts.total - clusteredWinSet.size);
  const dedupReductionPct = Math.round((1 - independentClaims / counts.total) * 100);

  // Failures bucket split:
  //   - silent failures: entries the dome has visibly removed/suspended but excluded from any failure denominator
  //     (filter on dome_status_current being set, e.g. "REMOVED" or "SUSPENDED")
  //   - acknowledged-bucket: the rest of the entries — items the dome calls "refined", "suspended" via the
  //     historical W-NNN pointer, or "FALSIFIED". Many of these have stale dome refs and are awaiting
  //     reconciliation against the dome's V50.6→V51.1 history (see ISS-676, analyst assignment).
  // Note: these are OUR documented entries. The dome's own claimed failure count is failures.dome_claimed_failures.
  const silentFailureEntries = failures.entries.filter(e => e.dome_status_current);
  const acknowledgedBucketEntries = failures.entries.filter(e => !e.dome_status_current);
  const silentFailures = silentFailureEntries.length;
  const acknowledgedFailures = acknowledgedBucketEntries.length;
  const totalDocumentedFailures = failures.entries.length;
  // Honest accuracy: dome's wins divided by his denominator + the silent failures he excluded.
  // Formula: counts.total / (counts.total + dome_claimed_failures + silent_failures)
  const honestAccuracyDenom = counts.total + (failures.dome_claimed_failures || 0) + silentFailures;
  const honestAccuracy = honestAccuracyDenom > 0
    ? ((counts.total / honestAccuracyDenom) * 100).toFixed(1) + '%'
    : '?';

  // Build context object for section rendering
  const context = {
    totalWins: counts.total,
    newInV51: counts.newInV51,
    selfContradicted: counts.selfContradicted,
    unfalsifiable: counts.unfalsifiable,
    tally,
    codeAnalysis: counts.codeAnalysis,
    acknowledgedFailures,
    silentFailures,
    totalDocumentedFailures,
    honestAccuracy,
    honestAccuracyDenom,
    domeClaimedFailures: failures.dome_claimed_failures,
    domeClaimedAccuracy: failures.dome_claimed_accuracy,
    domeProspectiveCount: failures.dome_claimed_prospective_count,
    accuracyVariantList,
    accuracyVariantDetail,
    independentClaims,
    dedupReductionPct,
    predCounts,
    prosCounts,
    domePredClaimed: predictions.summary?.dome_total_claimed || 0,
  };

  // Start HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-QVD21HWH5X"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-QVD21HWH5X');
</script>
<meta name="description" content="Independent scientific review of every prediction claimed by the Ovoid Cavity Cosmological Model (ECM dome model). ${counts.total} claims evaluated — 0 survive scrutiny.">
<meta name="keywords" content="ovoid cavity cosmological model, dome model, ECM, flat earth predictions, critical review, scientific review, dome model review, firmament resonance, aetheric medium, dome cosmology, aetheric dome model, firmament cavity model, Nicholas Hughes, john09289, aetheric refraction index, local sun cosmology">
<meta property="og:title" content="Critical Review: Ovoid Cavity Cosmological Model">
<meta property="og:description" content="${counts.total} predictions claimed. 0 survive independent scrutiny. ${failures.entries.length} acknowledged failures the model doesn't count.">
<meta property="og:type" content="article">
<meta property="og:url" content="https://funwithscience-org.github.io/dome-model-review/">
<meta property="og:site_name" content="Fun With Science">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Critical Review: Ovoid Cavity Cosmological Model">
<meta name="twitter:description" content="${counts.total} predictions claimed. 0 survive independent scrutiny.">
<link rel="canonical" href="https://funwithscience-org.github.io/dome-model-review/">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ClaimReview",
  "url": "https://funwithscience-org.github.io/dome-model-review/",
  "claimReviewed": "The Ovoid Cavity Cosmological Model has ${counts.total} confirmed predictions with ${failures.dome_claimed_accuracy} accuracy",
  "author": {
    "@type": "Organization",
    "name": "Fun With Science",
    "url": "https://funwithscience-org.github.io/dome-model-review/"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": 1,
    "bestRating": 5,
    "worstRating": 1,
    "alternateName": "False"
  },
  "itemReviewed": {
    "@type": "CreativeWork",
    "url": "https://john09289.github.io/predictions",
    "name": "Ovoid Cavity Cosmological Model (ECM ${DOME_VERSION})",
    "author": {
      "@type": "Person",
      "name": "Nicholas Hughes"
    }
  }
}
</script>
<title>Critical Review: Ovoid Cavity Cosmological Model ${DOME_VERSION}</title>
<style>
${CSS}
</style>
</head>
<body>

<div class="tab-bar">
  <button class="tab-btn active" onclick="showTab('overview')">Overview</button>
  <button class="tab-btn" onclick="showTab('evaluate')">Evaluation Guide</button>
  <button class="tab-btn" onclick="showTab('model')">The Model</button>
  <button class="tab-btn" onclick="showTab('selftest')">Self-Contradictions</button>
  <button class="tab-btn" onclick="showTab('wins')">${counts.total} Wins Reviewed</button>
  <button class="tab-btn" onclick="showTab('pages')">Live Power Dashboard</button>
  <button class="tab-btn" onclick="showTab('killshots')">Kill Shots</button>
  <button class="tab-btn" onclick="showTab('timestamp')">Timestamp Error</button>
  <button class="tab-btn" onclick="showTab('predictions')">Predictions Analysis</button>
  <button class="tab-btn" onclick="showTab('falsify')">External Tests</button>
  <button class="tab-btn" onclick="showTab('ai')">AI & Conclusions</button>
  <button class="tab-btn" onclick="showTab('refs')">References</button>
</div>

<div class="tab-content active" id="overview">

<div class="title-block">
<h1 style="border:none">Critical Review</h1>
<h1 style="border:none;font-size:1.6rem;font-weight:400">Ovoid Cavity Cosmological Model ${DOME_VERSION}</h1>
<p class="subtitle">(formerly Dome Cosmological Model V50.6)</p>
<p class="subtitle">Point-by-Point Analysis of ${counts.total} Claimed Wins, Live Power Dashboard,<br>Falsification Tests, Version Change Tracking, and AI Prompt Injection Analysis</p>
<p class="meta">${BUILD_DATE} &nbsp;|&nbsp; Version ${REVIEW_VERSION}<br>Source: <a href="https://john09289.github.io/predictions">john09289.github.io/predictions</a></p>
</div>

<div class="scorecard sc-hero" style="grid-template-columns:repeat(4,1fr)">
<div class="sc-card">
<div class="sc-number">${counts.total}</div>
<div class="sc-label">Claimed "Wins"</div>
<div class="sc-sublabel">The author claims ${counts.total} confirmed predictions and zero falsifications</div>
</div>
<div class="sc-card accent">
<div class="sc-number">0</div>
<div class="sc-label">Actual Wins</div>
<div class="sc-sublabel">Not one claim produces a result that the globe model can't explain and the dome uniquely can</div>
</div>
<div class="sc-card" style="border-left:4px solid #c45050">
<div class="sc-number">${failures.dome_claimed_failures} + ${silentFailures}</div>
<div class="sc-label">Actual Failures</div>
<div class="sc-sublabel">He admits ${failures.dome_claimed_failures}. We found ${silentFailures} more he silently removed. Honest accuracy: <strong>${honestAccuracy}</strong>, not ${failures.dome_claimed_accuracy}. <a href="#p3-failures" onclick="showTab('wins');return false">Details →</a></div>
</div>
<div class="sc-card" style="border-left:4px solid #2a6496">
<div class="sc-number" style="font-size:1.4rem">Wrong Side</div>
<div class="sc-label">Timestamp Error</div>
<div class="sc-sublabel">His blockchain proof timestamps the <em>observations</em>, not the predictions. The cryptographic infrastructure is real — it just proves the wrong thing. <a href="#timestamp-error" onclick="showTab('timestamp');return false">Details →</a></div>
</div>
</div>

<div class="breaking-news">
<h2 class="bn-header">&#128240; Latest Findings</h2>
<div class="bn-item">
<span class="bn-date">2026-04-12</span>
<span class="bn-text"><strong>Dome's Refraction Fix Destroys Its Own Coordinate System.</strong> To avoid a sun/firmament collision, the model declares the sun an optical illusion — but the same refractive medium (n(r) = 1.2–2.8, vs Earth's 1.0003) contaminates every Polaris-based distance measurement the dome uses to build its map. The coordinate system collapses, taking 22 dependent WINs with it. <a href="#section-1-8">Full analysis →</a></span>
</div>
<div class="bn-item">
<span class="bn-date">2026-04-10</span>
<span class="bn-text"><strong>${context.predCounts.total} Predictions Cataloged — ${context.predCounts.deadOnArrival} Are Dead on Arrival.</strong> We datamined every testable claim from the dome's predictions page. Of ${context.predCounts.total} entries: ${context.predCounts.stdRelabel} are standard physics relabeled as dome predictions, ${context.predCounts.ourFalsified} are already falsified by hard data, ${context.predCounts.ourRecycled} recycle existing WINs, and ${context.predCounts.ourUnfalsifiable} are untestable. <a href="#pred-mined">See the full catalog →</a></span>
</div>
</div>

<p style="text-align:center;font-size:.95rem;color:#888;margin:0 0 .5rem">Where the ${counts.total} claims actually land:</p>

<div class="scorecard sc-breakdown">
<div class="sc-card sc-sm" style="border-left:4px solid var(--refuted-solid)">
<div class="sc-number">${tally['Refuted by Data'] || 0}</div>
<div class="sc-label">Refuted by Data</div>
<div class="sc-sublabel">Measurements directly contradict the claim</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--selfcon-solid)">
<div class="sc-number">${tally['Self-Contradicted'] || 0}</div>
<div class="sc-label">Self-Contradicted</div>
<div class="sc-sublabel">The dome's own math gives the wrong answer</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--misleading-solid)">
<div class="sc-number">${tally['Misleading'] || 0}</div>
<div class="sc-label">Misleading</div>
<div class="sc-sublabel">Data is cherry-picked, misrepresented, or duplicated</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--stdmodel-solid)">
<div class="sc-number">${tally['Std Model Explains'] || 0}</div>
<div class="sc-label">Std Model Explains</div>
<div class="sc-sublabel">Real observation, but mainstream physics already explains it</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--notdemo-solid)">
<div class="sc-number">${tally['Not Demonstrated'] || 0}</div>
<div class="sc-label">Not Demonstrated</div>
<div class="sc-sublabel">Based on unverified or unreplicated data</div>
</div>
<div class="sc-card sc-sm" style="border-left:4px solid var(--unfalsifiable-solid)">
<div class="sc-number">${tally['Unfalsifiable'] || 0}</div>
<div class="sc-label">Unfalsifiable</div>
<div class="sc-sublabel">Cannot be tested — typically theological claims</div>
</div>
</div>

<div style="border:2px solid var(--accent);border-radius:8px;padding:1.2rem 1.4rem;margin:1.5rem 0;background:var(--card-bg)">
<p style="margin-top:0"><strong>The headline "${failures.dome_claimed_accuracy}" accuracy is not computed by any script in the model's repository.</strong> It is a static string in the HTML source code — a <code>.score-number</code> CSS class rendering the percentage alongside the WIN count. No Python script, no JavaScript function, and no API endpoint produces this number. The arithmetic is stated on the wins page, but no script validates the count against the actual WIN registry. When the model's own internal data is queried, it returns ${accuracyVariantList} — depending on which data source and counting method is used. The denominator is chosen to include only ${failures.dome_claimed_failures} acknowledged falsifications while excluding unresolved open problems and below-detection-threshold entries. The headline number is manually entered with a self-serving denominator. See <a href="#part6" onclick="showTab('predictions');return false">Section 6.6</a> for the full source-code analysis.</p>
</div>

<h2>Downloads</h2>
<div class="downloads">
<a class="dl-card" href="../downloads/critical-review-dome-model-v6.pdf"><span class="dl-icon">&#128203;</span> <span class="dl-label">PDF Version</span><br><small>Print-ready format</small></a>
<a class="dl-card" href="../security-audit.md"><span class="dl-icon">&#128274;</span> <span class="dl-label">Security Audit</span><br><small>Prompt injection findings</small></a>
</div>

<h1 id="verdicts">Verdict Categories Used in This Review</h1>
<div class="verdict-legend">
<div class="vl vl-refuted"><strong>Refuted by Data:</strong> Direct physical measurements or experiments contradict the specific claim. Hard evidence exists proving the stated behavior does not occur or the cited source does not contain what is claimed.</div>
<div class="vl vl-std"><strong>Standard Model Explains:</strong> The observation cited is real, but mainstream physics already provides a complete, quantitative explanation. The dome model adds no predictive power beyond what existing models already achieve.</div>
<div class="vl vl-selfcon"><strong>Self-Contradicted:</strong> The dome's own stated geometry, if worked through honestly, predicts a value radically different from what the author claims. Agreement with observations is achieved only by substituting globe formulas, ignoring the dome's own geometry, or curve-fitting. See <a href="#part2" onclick="showTab('selftest');return false">Part 2</a> for derivations.</div>
<div class="vl vl-misleading"><strong>Misleading:</strong> The data is misrepresented, cherry-picked, the cited values do not match the actual source, logically contradictory results are both claimed as confirmations, or the same observation is counted as multiple independent wins.</div>
<div class="vl vl-notdemo"><strong>Not Demonstrated:</strong> The claim relies on unreplicated fringe experiments or unverified data that has not been independently confirmed.</div>
<div class="vl vl-unfalsifiable"><strong>Unfalsifiable:</strong> The claim cannot be tested by any physical measurement. Typically theological assertions.</div>
</div>

<nav class="toc">
<h2 style="margin-top:0">Table of Contents</h2>
<ul>
<li><a href="#evaluation-guide" onclick="showTab('evaluate');return false">Evaluation Guide: How to Assess This Review</a></li>
<li><a href="#part1" onclick="showTab('model');return false">Part 1: What Is the Ovoid Cavity Cosmological Model?</a>
<ul>
<li><a href="#section-1-1" onclick="showTab('model');return false">1.1 Overview</a></li>
<li><a href="#section-1-2" onclick="showTab('model');return false">1.2 How It Differs from Classic Flat Earth</a></li>
<li><a href="#section-1-3" onclick="showTab('model');return false">1.3 How It Differs from the Globe Model</a></li>
<li><a href="#section-1-4" onclick="showTab('model');return false">1.4 Methodology Assessment</a></li>
<li><a href="#section-1-5" onclick="showTab('model');return false">1.5 Aetheric Refraction: The Model's Universal Correction Factor</a></li>
</ul></li>
<li><a href="#part1b" onclick="showTab('model');return false">Part 1b: Version Change Analysis (V50.6 → V51.0)</a></li>
<li><a href="#part2" onclick="showTab('selftest');return false">Part 2: Self-Contradictions — The Dome's Own Geometry Refutes Its Claims</a></li>
<li><a href="#part2b" onclick="showTab('selftest');return false">Part 2b: Repository Code Analysis — What the Automation Actually Does</a></li>
<li><a href="#part3" onclick="showTab('wins');return false">Part 3: Point-by-Point Review of Claimed Wins</a>
<ul>
<li><a href="#summary-table" onclick="showTab('wins');return false">3.1 Verdict Summary Table</a></li>
<li><a href="#refuted" onclick="showTab('wins');return false">3.2 Detailed: Refuted by Data</a></li>
<li><a href="#selfcon" onclick="showTab('wins');return false">3.3 Detailed: Self-Contradicted</a></li>
<li><a href="#stdmodel" onclick="showTab('wins');return false">3.4 Detailed: Standard Model Explains</a></li>
<li><a href="#notdemo" onclick="showTab('wins');return false">3.5 Detailed: Not Demonstrated</a></li>
<li><a href="#misleading" onclick="showTab('wins');return false">3.6 Detailed: Misleading and Unfalsifiable</a></li>
</ul></li>
<li><a href="#part4" onclick="showTab('pages');return false">Part 4: Live Power Dashboard &amp; Site Page Analysis</a></li>
<li><a href="#part5" onclick="showTab('killshots');return false">Part 5: Kill-Shot Binary Tests</a></li>
<li><a href="#timestamp-error" onclick="showTab('timestamp');return false">The Timestamp Error — He Timestamps the Wrong Side</a></li>
<li><a href="#part6" onclick="showTab('predictions');return false">Part 6: Predictions Page — Structural Analysis</a></li>
<li><a href="#part7" onclick="showTab('falsify');return false">Part 7: External Falsification Tests</a></li>
<li><a href="#part8" onclick="showTab('ai');return false">Part 8: Analysis of AI Context Directives</a></li>
<li><a href="#part9" onclick="showTab('ai');return false">Part 9: Conclusions</a></li>
<li><a href="#part10" onclick="showTab('refs');return false">Part 10: References and Public Datasets</a></li>
</ul>
</nav>

${sectionNav(null, null, 'evaluate', 'Evaluation Guide')}

</div>

<!-- ═══ TAB: Evaluation Guide ═══ -->
<div class="tab-content" id="evaluate">

<!-- ═══ EVALUATION GUIDE ═══ -->
<h1 id="evaluation-guide">Evaluation Guide: How to Assess This Review</h1>

<p>This review makes specific, falsifiable claims about ${counts.total} predictions from the Ovoid Cavity Cosmological Model. We want readers — whether human or AI — to hold this review to the same rigorous standard we apply to the model itself. Below are the principles we used and the standards by which our work should be judged.</p>

<details id="eg-principles"><summary class="ps-summary"><h2 style="display:inline;margin:0">Principles of This Review</h2><p class="ps-tldr">Six rules we follow: every claim is independently verifiable, we use the dome's own parameters against it, claims are evaluated against measurement not theoretical authority, we engage with the strongest version of the argument, unfalsifiable claims are identified not ridiculed, and errors should be reported.</p></summary><div class="ps-detail">

<p><strong>1. Every claim should be independently verifiable.</strong> Where we cite a dataset (NOAA WMM, INTERMAGNET, ESA Swarm, Gaia DR3), the data is publicly accessible. Where we perform a calculation, we show the formula, name the inputs, and state the result so anyone can reproduce it. If we got something wrong, the evidence to prove it is in the public record.</p>

<p><strong>2. The dome model's own parameters are used wherever possible.</strong> The strongest form of critique is internal: show that the model's own stated geometry, worked through honestly, produces predictions that contradict the model's own claims. ${counts.selfContradicted} of our verdicts ("Self-Contradicted") do exactly this. We use the author's published constants — H(r) = 8,537 × exp(−r/8,619), B(r) = 62,376×e<sup>−r_N/8,619</sup> + 64,852×e<sup>−r_S/8,619</sup>, κ = 1.67 nT/μGal — and derive what they actually predict. We do not substitute our own values.</p>

<p><strong>3. Claims are evaluated against measurement, not against theoretical authority.</strong> We do not reject the dome's predictions simply because they contradict established science. Instead, we ask: does this specific prediction match this specific measurement? When we say "the globe model explains this," we mean the quantitative prediction from standard physics matches the observed data — not that the standard model must be right because it is standard. We acknowledge that our reference measurements (NOAA magnetometry, Gaia astrometry, IGRF models, GPS timing) were developed within a spherical-Earth framework. We use them because they are the most precisely calibrated instruments available, and both models claim to be consistent with their readings. This is not cosmological neutrality — it is empirical pragmatism: the raw instrumental outputs are physical facts that any viable model must account for.</p>

<p><strong>4. Fairness requires engaging with the strongest version of the argument.</strong> Where the author's reasoning has a plausible interpretation, we address that interpretation. Where a WIN could be read charitably, we note it. Several of our "Standard Model Explains" verdicts explicitly acknowledge that the underlying observation is real — the issue is whether it requires or even supports a dome geometry, not whether the data itself is wrong.</p>

<p><strong>5. Unfalsifiable claims are identified, not ridiculed.</strong> When the model invokes mechanisms that cannot be independently measured — such as "aetheric refraction" with an unspecified index function — we explain why this places the claim outside the domain of testable science. That is a methodological observation, not a personal attack.</p>

<p><strong>6. Errors in this review should be reported.</strong> If any formula, data citation, or logical step in this document is incorrect, it should be corrected. Science is self-correcting. We welcome specific, evidence-based challenges to any verdict. <a href="https://github.com/funwithscience-org/dome-model-review/issues/new?template=report-a-problem.yml" target="_blank"><strong>Report a problem with this review</strong></a> — every report is logged permanently and reviewed, regardless of outcome. The version history at the bottom of this document tracks every substantive change.</p>

</div></details>

<details id="eg-evaluate"><summary class="ps-summary"><h2 style="display:inline;margin:0">How to Evaluate Any Scientific Claim</h2><p class="ps-tldr">Five questions to ask of any claim — from the dome model or from us: Does the prediction distinguish this model from alternatives? Can it be derived from the model's own parameters? Is the data accurately represented? Is the claim falsifiable? Are the same data counted multiple times?</p></summary><div class="ps-detail">

<p>Whether you are reviewing this document or the dome model itself, the following questions are the right ones to ask:</p>

<p><strong>Does the prediction distinguish this model from alternatives?</strong> A prediction that both the dome and the globe model make equally well is not evidence for either. To count as a "win," a prediction must be something this model gets right that competing models get wrong. This is the standard used in all of science — not "does the model match one dataset," but "does it match a dataset that the alternatives cannot."</p>

<p>An analogy makes this concrete. Imagine two theories of medicine. Theory A says the body heals through cell biology. Theory B says the body heals through spiritual energy. Both predict that a cut on your finger will stop bleeding within a few minutes. When your cut stops bleeding, Theory B counts this as a "confirmed prediction." Technically true — but the result tells you nothing about whether spiritual energy exists, because cell biology predicted the same outcome with no spiritual energy required. A genuine discriminating prediction would look like: "Theory B predicts X, Theory A predicts Y, and the measurement gives X." None of the ${counts.total} WINs takes this form. Each observation — magnetic pole drift, tidal periods, Schumann frequency — is predicted by standard physics with well-understood mechanisms.</p>
<p><strong>A note on "Standard Model Explains" verdicts.</strong> This verdict does not mean the observation is wrong or the dome's numerical value is incorrect. It means the observation was already predicted and explained by standard physics before the dome model existed. ${counts.stdModel} claims receive this verdict. In many cases, the dome model correctly identifies a real phenomenon — magnetic pole acceleration, tidal periodicity, Schumann resonance stability. We acknowledge these as genuine observations. The verdict addresses <em>attribution</em>: the dome claims these observations as evidence for its geometry, but the quantitative derivation comes entirely from standard physics. Reproducing known results is necessary for any theory (a flat-earth model that could not account for tides would be immediately falsified) but it is not sufficient evidence for the model's specific claims about geometry. The medicine analogy above applies: correctly predicting that a cut heals is expected of any medical theory and does not distinguish between them.</p>

<p><strong>Can the prediction be derived from the model's own parameters?</strong> If a model claims a specific geometry, that geometry implies specific, calculable values for observable quantities. If those derived values don't match observations, the model is falsified on its own terms. If the author skips the derivation and instead curve-fits to match known data, that is not a prediction — it is calibration.</p>

<p><strong>Is the cited data accurately represented?</strong> Check the original source. Does the paper, dataset, or measurement actually say what is claimed? Misrepresentation of sources is not a matter of interpretation — it is verifiable.</p>

<p><strong>Is the claim falsifiable?</strong> A claim that can explain any possible observation — because it invokes a free parameter or unmeasurable mechanism — is not a scientific prediction. It is not wrong; it is untestable. Identifying unfalsifiability is not dismissal; it is a precise statement about what kind of claim is being made.</p>

<p><strong>Are the same data being counted multiple times?</strong> If tidal constituent periods (M2, S2, K1, O1) are each counted as separate predictions, but they all come from a single astronomical dataset, the actual number of independent predictions is one, not four. Counting methodology matters.</p>

</div></details>

<details id="eg-verdicts"><summary class="ps-summary"><h2 style="display:inline;margin:0">Verdict Assignment Criteria</h2><p class="ps-tldr">Each WIN receives the verdict matching its primary failure mode. When a WIN fails in multiple ways, the failure that would persist even if the others were corrected takes priority — a counterfactual test, not a severity ranking. The categories describe different kinds of failure, not degrees of it.</p></summary><div class="ps-detail">

<p>The six verdict categories describe qualitatively different failure modes. A WIN that contradicts the dome's own equations fails differently from one that merely restates standard physics. Assigning the correct category matters because a dome defender who can show a misclassified WIN gains a process objection against the entire review. Below we make the assignment criteria explicit so that any reader — or any AI — can audit our work.</p>

<p><strong>The primary-issue rule.</strong> Most WINs exhibit multiple problems: a claim might both restate standard physics and involve data misrepresentation. We assign the verdict that captures the <em>primary</em> structural failure — the one that, if corrected, would still leave the claim unsupported. For example: if a WIN cites wrong numbers AND standard physics explains the observation, the primary issue is the data error (Refuted by Data) if the numbers are verifiably wrong, or standard physics (Std Model Explains) if the numbers are correct but non-discriminating. A second example: if a WIN's dome-derived formula contradicts its own claimed value (Self-Contradicted) AND the data is also misrepresented (Misleading), the primary issue is the self-contradiction — because even with correctly represented data, the dome's own math still fails. Self-Contradicted takes priority when internal consistency alone is sufficient to invalidate the claim. In both cases, the secondary issue is noted in the detailed analysis but does not determine the verdict.</p>

<p><strong>Misleading vs. Std Model Explains — the decision boundary.</strong> These two categories share the most porous border. The distinguishing question is: <em>has the evidence been mishandled in the dome's presentation, or does it simply present a real observation that standard physics already explains?</em></p>

<ul>
<li><strong>Std Model Explains</strong> applies when the observation is accurately represented, the data sources are correctly cited, and the only problem is that standard physics predicts the same result without dome geometry. The dome's claim is not wrong — it is redundant. No deception is implied.</li>
<li><strong>Misleading</strong> applies when the dome's presentation involves an additional structural problem beyond non-discrimination: cherry-picked data ranges, misrepresented source values, logically contradictory claims both counted as confirmations, the same data counted multiple times, or circular derivations where the "prediction" was fitted to the data it claims to predict. Misleading implies the evidence has been mishandled, not merely that it is unpersuasive.</li>
</ul>

<p>Some WINs classified as Std Model Explains include secondary notes about duplication or overlap with other WINs in their detailed analysis. These notes are informational — the primary reason the WIN fails is that standard physics explains the observation, and the duplication is a compounding but not the defining issue.</p>

<p><strong>Substructure within Misleading.</strong> The Misleading verdicts encompass several distinct failure patterns: data misrepresentation (cited values don't match the source), count inflation (the same observation counted as multiple WINs), circular calibration (curve-fitting to known data then claiming prediction), and false-dilemma framing combined with additional mishandling (citing a competitor's unsolved problem as dome evidence while also misrepresenting significance, contradicting other dome claims, or lacking any dome-specific derivation). Pure false-dilemma — correctly identifying a genuine anomaly without offering dome physics — is Not Demonstrated rather than Misleading; WIN-054 (El Gordo) is the reference case for this distinction. We do not formally subdivide the Misleading category because the defining feature is the same in each case: the evidence has been structurally mishandled, not merely interpreted differently. Readers who want the specific failure pattern for each WIN will find it in the point-by-point analysis in <a href="#part3" onclick="showTab('wins');return false">Part 3</a>.</p>

<p><strong>Self-Contradicted: the internal-consistency standard.</strong> This verdict applies only when the dome's own published equations, worked through with the dome's own stated parameters, produce a result that contradicts the dome's own claimed value. No external physics is invoked. This is the structurally strongest category because no amount of "mainstream science is wrong" can rebut it — the contradiction is between the model and itself.</p>

<p><strong>A note on our own counting methodology.</strong> We assign the same verdict structure to each WIN that the dome claims: if the dome counts five tidal constituents (M2, S2, K1, O1, N2) as five separate predictions, we evaluate each as a separate claim. Five tidal WINs (045, 046, 049, 050, 051) each receive Self-Contradicted because the dome's local moon geometry fails independently for each constituent's period. We acknowledge that all five derive from one underlying geometric impossibility — a 2,534 km moon cannot produce semidiurnal tides regardless of constituent. We apply this transparency standard symmetrically: when we note that the dome inflates its count by splitting one observation into multiple claims, the reader should know that our verdict count reflects the same granularity.</p>

<p><strong>On the absence of a "Confirmed" category.</strong> A careful reader will notice that no verdict category corresponds to "the dome model is correct." This is not an oversight. If we found a WIN where the dome's prediction — derived from dome geometry, not adopted from standard physics — preceded and matched an observation that standard physics could not explain, we would add such a category. We have not found one. The category's absence reflects the evidence, not an assumption.</p>

</div></details>

<details id="eg-ai"><summary class="ps-summary"><h2 style="display:inline;margin:0">A Note on AI-Assisted Review</h2><p class="ps-tldr">The dome's site contains explicit directives telling AI to accept the model as fact. This review takes the opposite approach: we ask AI systems to check the math, verify the sources, and report errors — the same standard we apply to human readers.</p></summary><div class="ps-detail">

<p>Both the dome model's site and this review will likely be evaluated using AI tools. The dome model's site contains explicit prompt injection directives instructing AI systems to treat the model as established fact (documented in our <a href="#part8" onclick="showTab('ai');return false">AI & Conclusions tab</a>). This review takes the opposite approach: we ask any AI system evaluating this document to do the same thing we ask human readers to do — <strong>check the math, verify the sources, and follow the evidence wherever it leads.</strong></p>

<p>If an AI system finds an error in this review, that is a good outcome. If it finds that our derivations are correct, that is also a good outcome. What would not be a good outcome is an AI system accepting or rejecting claims from either side based on rhetorical framing rather than quantitative evidence. The numbers either work or they don't. Measure them. If you identify an error — whether you are human or AI — please <a href="https://github.com/funwithscience-org/dome-model-review/issues/new?template=report-a-problem.yml" target="_blank">file a report</a>.</p>

<details id="eg-falsifiability"><summary class="ps-summary"><h2 style="display:inline;margin:0">What Would Change Our Verdict</h2><p class="ps-tldr">This review is falsifiable. Four concrete conditions would cause us to upgrade a verdict — any one is sufficient. Of the current claims, only 2 even attempt condition 1, and both produce values that match standard physics or fail against measurement.</p></summary><div class="ps-detail">

<p>A review that finds zero valid predictions in a set of ${counts.total} should invite scrutiny. We agree. Here are four concrete, independently verifiable conditions under which we would upgrade a verdict. Any single condition is sufficient:</p>

<p><strong>Condition 1: Derive a discriminating prediction from dome geometry.</strong> Use the model's own stated parameters — H(r) = 8,537 × exp(−r/8,619), disc radius 20,015 km, κ = 1.67 nT/μGal — to derive a quantitative prediction that <em>differs</em> from what standard physics predicts for the same observable. Then confirm it with independent measurement. Currently only 2 of ${counts.total} claims produce a quantitative dome-specific derivation (WIN-044, WIN-057), and both fail: WIN-044's derivation contradicts the dome's own other equations (Self-Contradicted), and WIN-057's best result (6.2% RMSE) is 600× worse than standard geodesy's sub-meter precision (Misleading).</p>

<p><strong>Condition 2: Produce a genuine prospective prediction.</strong> Register a specific quantitative prediction (value ± uncertainty, named observable, named measurement station) <em>before</em> the confirming data exists, with the prediction document independently timestamped separately from any observation data. The dome's August 2026 eclipse predictions approach this standard but have methodological issues documented in our <a href="#part6" onclick="showTab('timestamp');return false">Timestamp Error analysis</a>.</p>

<p><strong>Condition 3: Derive 7.83 Hz from dome geometry.</strong> The Schumann fundamental resonance at 7.83 Hz is one of the most precisely measured electromagnetic constants on Earth. The dome's own cavity geometry — an exponentially decaying firmament over a flat disc — predicts a fundamental frequency of approximately 22–35 Hz when the stated dimensions are used honestly. If someone can derive 7.83 Hz from dome parameters without smuggling in the globe's radius (6,371 km) or its spherical cavity eigenvalue formula, that would be a genuine dome prediction that standard physics cannot replicate.</p>

<p><strong>Condition 4: Produce a coordinate system that achieves sub-5% error without globe inputs.</strong> The dome's V12/V13 coordinate system claims impressive accuracy for city-to-city distances, but takes WGS84 (globe) coordinates as input and curve-fits against globe-measured distances. If a coordinate system built entirely from dome geometry — disc radius, azimuthal distance from the north pole, no latitude/longitude conversions — could reproduce real-world distances to comparable accuracy, that would constitute independent evidence for the dome's geometry.</p>

<p>These conditions are demanding but not impossible. They are the same standard applied in all of science: show that your model predicts something the alternatives do not, and confirm it with data. We are not asking the dome to solve every problem — science is iterative, and a single discriminating prediction would be a genuine breakthrough worth acknowledging. The reason the current scorecard shows zero is not that we constructed an impossible standard — it is that none of the ${counts.total} claims meets even the weakest version of this standard.</p>

<p><strong>Eclipse pre-commitment:</strong> The dome model has registered predictions for the August 12, 2026 annular solar eclipse: magnetic anomalies of −17 to −21 nT at specified stations. Based on the Chapman mechanism (the standard physics explanation for eclipse-induced magnetic effects, documented since 1933), we expect anomalies of 5–20 nT in magnitude. If the dome's predictions are confirmed <em>and</em> fall outside the Chapman-mechanism range — that is, if the measured values match the dome's −17 to −21 nT range but <em>not</em> the 5–20 nT Chapman range — we will upgrade the relevant WIN. If they fall within both ranges, the result supports standard physics, not dome geometry, because the dome's prediction values were derived by scaling Chapman-mechanism data. We note that the ranges overlap substantially: any measurement between 17 and 20 nT in magnitude falls within both the dome's range and the Chapman range, and only values above 20 nT would favor the dome. The discriminating window is approximately 1 nT — a reflection of how little the dome's prediction actually differs from the standard model it claims to replace. We state this now, before the eclipse, so there is no ambiguity afterward.</p>

</div></details>

</div></details>

${sectionNav('overview', 'Overview', 'model', 'The Model')}

</div>

<!-- ═══ TAB: The Model (Parts 1, 1b) ═══ -->
<div class="tab-content" id="model">

${renderSectionFromJson('part1', context, winsByVerdict, wins, tally, sectionNav)}
${renderSectionFromJson('part1b', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('evaluate', 'Evaluation Guide', 'selftest', 'Self-Contradictions')}

</div>

<!-- ═══ TAB: Self-Contradictions (Parts 2, 2b) ═══ -->
<div class="tab-content" id="selftest">

${renderSectionFromJson('part2', context, winsByVerdict, wins, tally, sectionNav)}
${renderSectionFromJson('part2b', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('model', 'The Model', 'wins', counts.total + ' Wins Reviewed')}

</div>

<!-- ═══ TAB: Wins Reviewed (Part 3) ═══ -->
<div class="tab-content" id="wins">

${renderSectionFromJson('part3', context, winsByVerdict, wins, tally, sectionNav)}

${renderFailuresBlock(failures, silentFailureEntries, acknowledgedBucketEntries, honestAccuracy, honestAccuracyDenom, counts.total)}

${sectionNav('selftest', 'Self-Contradictions', 'pages', 'Live Power Dashboard')}

</div>

<!-- ═══ TAB: Live Power Dashboard (Part 4) ═══ -->
<div class="tab-content" id="pages">

${renderSectionFromJson('part4', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('wins', counts.total + ' Wins Reviewed', 'killshots', 'Kill Shots')}

</div>

<!-- ═══ TAB: Kill Shots (Part 5) ═══ -->
<div class="tab-content" id="killshots">

${renderSectionFromJson('part5', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('pages', 'Live Power Dashboard', 'timestamp', 'Timestamp Error')}

</div>

<!-- ═══ TAB: Timestamp Error ═══ -->
<div class="tab-content" id="timestamp">

<h1 id="timestamp-error">The Timestamp Error</h1>
<h2 style="color:var(--accent);font-weight:400;margin-top:0">He timestamps the observations, not the predictions</h2>

<div class="scorecard" style="grid-template-columns:1fr 1fr;margin:1.5em 0">
<div class="sc-card" style="border-left:4px solid #c45050">
<div class="sc-label" style="font-size:1.1em">What gets timestamped</div>
<div class="sc-sublabel"><code>status_history.json</code> — observed values, pass/fail audit results, statistical comparisons. This is the <strong>answer sheet</strong>.</div>
</div>
<div class="sc-card" style="border-left:4px solid #2a6496">
<div class="sc-label" style="font-size:1.1em">What should get timestamped</div>
<div class="sc-sublabel">The prediction itself — the formula, the expected value, the tolerance — in a <strong>separate document, before the data arrives</strong>.</div>
</div>
</div>

<p>The dome model uses <a href="https://opentimestamps.org/">OpenTimestamps</a> — Bitcoin blockchain anchoring — to prove predictions existed before confirming data arrived. The cryptographic mechanism is sound. Credit is due for implementing it. <strong>But it timestamps the wrong side of the ledger.</strong></p>

<p>OpenTimestamps anchors <code>status_history.json</code>, the file containing <em>reference data</em>: observed values, pass/fail results, and statistical comparisons. These are observations — the outcomes. The prediction parameters — the formulas, expected values, and tolerances — live in <code>monitor.py</code> source code and <code>docs/model.html</code>, which are only git-versioned, not blockchain-timestamped.</p>

<details id="ts-why-it-matters"><summary class="ps-summary"><h2 style="display:inline;margin:0">Why This Matters</h2><p class="ps-tldr">A valid timestamp proof requires two documents: the prediction locked before the data, and the observation recorded after. The dome timestamps only the observation side and leaves the prediction in mutable git history — the strongest cryptographic proof applies to the part that needs it least.</p></summary><div class="ps-detail">

<p>A timestamped prediction means one thing: cryptographic proof that <em>the prediction</em> existed before <em>the data</em>. To prove this, you need two documents with two timestamps:</p>

<ol>
<li><strong>A predictions-only document</strong>, timestamped <em>before</em> data collection. This locks in what you expect to see.</li>
<li><strong>An observations document</strong>, timestamped <em>after</em> data collection. This records what you actually saw.</li>
</ol>

<p>The first timestamp must predate the second. That's the entire proof structure. Anything less and you haven't proven temporal priority — you've just proven that a file existed at some point.</p>

<p>The dome model does the opposite. It timestamps the observation side (the file with measured values and pass/fail results) and leaves the prediction side in mutable git history. Git commits can be rewritten (<code>git rebase</code>, <code>force push</code>). Blockchain anchoring cannot. <strong>The system's strongest cryptographic proof applies to the part that needs it least.</strong></p>

</div></details>

<details id="ts-analogy"><summary class="ps-summary"><h2 style="display:inline;margin:0">The Exam Analogy</h2><p class="ps-tldr">Imagine sealing your exam answers in a notarized envelope — then claiming this proves you knew the answers before seeing the questions. The dome seals the answer sheet (observations) but leaves the questions (predictions) in an unsealed folder.</p></summary><div class="ps-detail">

<p>Imagine a student takes an exam, writes down the answers, then seals the answer sheet in a tamper-proof envelope and has it notarized. The notary confirms: "This envelope existed at 3:00 PM on Tuesday."</p>

<p>The student then claims: "See? I knew the answers before the exam was given."</p>

<p>But the notary timestamp proves the <em>answers</em> existed at 3:00 PM. It says nothing about when the <em>questions</em> were seen. To prove foreknowledge, you'd need to seal your answers <em>before</em> the questions are distributed — and have that earlier timestamp on record.</p>

<p>The dome model seals the answer sheet. The questions (predictions) sit in an unsealed folder (git). The notarization is real. The proof structure is backwards.</p>

</div></details>

<details id="ts-sha256"><summary class="ps-summary"><h2 style="display:inline;margin:0">The SHA-256 Hashes Don't Fix This</h2><p class="ps-tldr">The dome also uses per-prediction hashes, but a hash proves content integrity ("this text matches this hash"), not timing ("this text existed before the data"). Creating a hash after you already have the data is cryptographically perfect and temporally meaningless.</p></summary><div class="ps-detail">

<p>The model also uses per-prediction SHA-256 hashes — claimed formula: <code>SHA256('ECM V51.0 {ID}: {text} on {date}T00:00:00Z')</code>. A SHA-256 hash proves content integrity: given a hash, you can verify that a specific text produced it. But a hash alone does not prove <em>when</em> the text was written. Without an independent timestamp on the hash itself (from a third-party service, a blockchain, or a publication with a verifiable date), the hash proves "this text matches this hash" — not "this text existed before the data."</p>

<p>If you create the hash after you already have the data, the hash is cryptographically perfect and temporally meaningless.</p>

</div></details>

<details id="ts-what-would-fix-it"><summary class="ps-summary"><h2 style="display:inline;margin:0">What Would Fix It</h2><p class="ps-tldr">The fix is simple: create a predictions-only file, blockchain-timestamp it before pulling data, then record observations separately with their own timestamp. This is standard pre-registration — the dome's infrastructure is 90% there, the timestamp just needs to move to the prediction side.</p></summary><div class="ps-detail">

<p>The fix is straightforward and the dome author clearly has the technical skill to implement it:</p>

<ol>
<li>Create a <strong>predictions-only file</strong> — containing just the prediction ID, the expected value, the tolerance, and the test criteria. No observation data.</li>
<li><strong>Blockchain-timestamp that file</strong> (via OpenTimestamps or similar) <em>before</em> pulling the reference data.</li>
<li>Later, after the data arrives, record observations in a <strong>separate file</strong> with its own timestamp.</li>
<li>Publish both timestamps. The proof is in the ordering: prediction timestamp &lt; observation timestamp.</li>
</ol>

<p>This is exactly how pre-registration works in clinical trials, physics experiments, and prediction markets. The prediction is locked before the outcome is known. The dome author has built an impressive monitoring infrastructure — scripts that pull real data from real instruments. The architecture is 90% there. The timestamp just needs to move from the observation side to the prediction side.</p>

</div></details>

<details id="ts-scope"><summary class="ps-summary"><h2 style="display:inline;margin:0">Which Claims This Affects</h2><p class="ps-tldr">Every WIN that relies on "prospective" timestamping is affected — WIN-035 through WIN-039, all prediction registry entries with SHA-256 hashes, and any future prospective claim. We are not alleging fraud; we are saying the proof structure doesn't prove what it claims to prove.</p></summary><div class="ps-detail">

<p>Every WIN that relies on "prospective" timestamping for its credibility is affected. Specifically:</p>
<ul>
<li><strong>WIN-035 through WIN-039</strong> — described by the dome as prospective, with predictions registered via OpenTimestamps before data arrival. These are the WINs where the OTS chain is the primary evidence. But the OTS chain timestamps <code>status_history.json</code> (observations), not the prediction parameters.</li>
<li><strong>All entries in the prediction registry</strong> with SHA-256 hashes — the hashes prove content integrity but not temporal priority (see above).</li>
<li><strong>Any future claim of prospective prediction</strong> — until the timestamp moves to the prediction side, no claim of "registered before the data" has cryptographic backing.</li>
</ul>

<p>To be clear: the dome author may well have written these predictions before the data arrived. We are not claiming fraud. We are saying the <em>proof structure</em> doesn't prove what it claims to prove. The fix described above would resolve this. Until then, the cryptographic infrastructure — however technically impressive — does not demonstrate temporal priority.</p>

</div></details>

${sectionNav('killshots', 'Kill Shots', 'predictions', 'Predictions Analysis')}

</div>

<!-- ═══ TAB: Predictions Analysis (Part 6) ═══ -->
<div class="tab-content" id="predictions">

${renderPredictionScorecard(predictions)}

${renderSectionFromJson('part6', context, winsByVerdict, wins, tally, sectionNav)}

${renderPredictionPanels(predictions)}

${sectionNav('timestamp', 'Timestamp Error', 'falsify', 'External Tests')}

</div>

<!-- ═══ TAB: External Tests (Part 7) ═══ -->
<div class="tab-content" id="falsify">

${renderSectionFromJson('part7', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('predictions', 'Predictions Analysis', 'ai', 'AI & Conclusions')}

</div>

<!-- ═══ TAB: AI & Conclusions (Parts 8, 9) ═══ -->
<div class="tab-content" id="ai">

${renderSectionFromJson('part8', context, winsByVerdict, wins, tally, sectionNav)}
${renderSectionFromJson('part9', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('falsify', 'External Tests', 'refs', 'References')}

</div>

<!-- ═══ TAB: References (Part 10) ═══ -->
<div class="tab-content" id="refs">

${renderSectionFromJson('part10', context, winsByVerdict, wins, tally, sectionNav)}

${sectionNav('ai', 'AI & Conclusions', null, null)}

</div>

<script>
function showTab(tabId, opts) {
  opts = opts || {};
  // Hide all tabs
  const allTabs = document.querySelectorAll('.tab-content');
  allTabs.forEach(tab => tab.classList.remove('active'));

  // Remove active class from all buttons
  const allButtons = document.querySelectorAll('.tab-btn');
  allButtons.forEach(btn => btn.classList.remove('active'));

  // Show selected tab
  const selectedTab = document.getElementById('tab-' + tabId);
  if (selectedTab) {
    selectedTab.classList.add('active');
  } else {
    document.getElementById(tabId).classList.add('active');
  }

  // Set active button — find by matching tab ID, not event.target
  // (event.target may be an <a> from TOC or sectionNav, not the tab button)
  allButtons.forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + tabId + "'") !== -1) {
      btn.classList.add('active');
    }
  });

  if (!opts.skipHash) {
    window.location.hash = tabId;
  }
  if (!opts.skipScroll) {
    window.scrollTo(0, 0);
  }
}

// On page load, check for hash and show appropriate tab
window.addEventListener('load', function() {
  // Replace initial history entry so back button can return to overview
  history.replaceState({ tab: 'overview', anchor: null }, '', window.location.href);

  const hash = window.location.hash.slice(1);
  if (hash) {
    const el = document.getElementById(hash);
    if (el) {
      // Check if hash IS a tab
      if (el.classList.contains('tab-content')) {
        showTab(hash, { skipHash: true });
        history.replaceState({ tab: hash, anchor: null }, '', '#' + hash);
      } else {
        // Find which tab contains this element
        const parentTab = el.closest('.tab-content');
        if (parentTab) {
          showTab(parentTab.id, { skipHash: true, skipScroll: true });
          history.replaceState({ tab: parentTab.id, anchor: hash }, '', '#' + hash);
          expandToElement(el);
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        }
      }
    }
  }

  // Expand a <details> element and all its ancestors
  function expandToElement(el) {
    // If the element IS a <details>, open it
    if (el.tagName === 'DETAILS') el.open = true;
    // Open all ancestor <details> elements so the target is visible
    let parent = el.closest('details');
    while (parent) {
      parent.open = true;
      parent = parent.parentElement ? parent.parentElement.closest('details') : null;
    }
  }

  // Handle internal anchor links - switch to correct tab first
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', function(e) {
      const target = this.getAttribute('href').slice(1);
      if (target) {
        const element = document.getElementById(target);
        if (element) {
          // Find which tab contains this element
          let parentTab = element.closest('.tab-content');
          if (parentTab) {
            const tabId = parentTab.id;
            // Use skipHash + skipScroll so showTab doesn't clobber our anchor or fight scrollIntoView
            showTab(tabId, { skipHash: true, skipScroll: true });
            // Push the anchor hash into history so back button works
            history.pushState({ tab: tabId, anchor: target }, '', '#' + target);
            // Expand any collapsed <details> so the target is visible
            expandToElement(element);
            // Scroll to element after a brief delay
            setTimeout(() => {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
            e.preventDefault();
          }
        }
      }
    });
  });

  // Back/forward button support
  window.addEventListener('popstate', function(e) {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      // No hash — show overview tab
      showTab('overview', { skipHash: true });
      return;
    }
    const el = document.getElementById(hash);
    if (el) {
      if (el.classList.contains('tab-content')) {
        showTab(hash, { skipHash: true });
      } else {
        const parentTab = el.closest('.tab-content');
        if (parentTab) {
          showTab(parentTab.id, { skipHash: true, skipScroll: true });
          expandToElement(el);
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        }
      }
    }
  });
});
</script>

</body>
</html>
`;

  fs.writeFileSync(OUTPUT_PATH, html);
  console.log(`Generated HTML: ${OUTPUT_PATH}`);
  console.log(`File size: ${(html.length / 1024).toFixed(1)} KB`);
}

// Run
main();
