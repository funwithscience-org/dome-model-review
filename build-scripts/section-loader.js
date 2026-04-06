/**
 * section-loader.js
 *
 * Loads and resolves sections from data/sections.json for HTML generation.
 * Handles placeholder resolution for computed values.
 */

const fs = require('fs');
const path = require('path');

const SECTIONS_PATH = path.join(__dirname, '..', 'data', 'sections.json');

/**
 * Load sections.json
 */
function loadSections() {
  if (!fs.existsSync(SECTIONS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(SECTIONS_PATH, 'utf8'));
  } catch (e) {
    console.error(`Error loading sections.json: ${e.message}`);
    return null;
  }
}

/**
 * Resolve placeholders in prose with computed values
 */
function resolvePlaceholders(html, context) {
  let result = html;

  if (!context) return result;

  // Simple count replacements
  const replacements = {
    '{{TOTAL_WINS}}': context.totalWins,
    '{{NEW_IN_V51}}': context.newInV51,
    '{{SELF_CONTRADICTED}}': context.selfContradicted,
    '{{UNFALSIFIABLE}}': context.unfalsifiable,

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

/**
 * Get a specific section by ID with placeholders resolved
 */
function getSection(sectionId, context) {
  const sections = loadSections();
  if (!sections || !sections[sectionId]) {
    return null;
  }

  let html = sections[sectionId].html;
  html = resolvePlaceholders(html, context);

  return html;
}

/**
 * Check if sections.json is available
 */
function hasSections() {
  return fs.existsSync(SECTIONS_PATH);
}

module.exports = {
  loadSections,
  resolvePlaceholders,
  getSection,
  hasSections,
};
