#!/usr/bin/env node

/**
 * add-references.js
 *
 * Adds clickable hyperlinks to verifiable data sources, datasets, papers,
 * and institutions referenced in wins.json detail fields.
 *
 * Run: node build-scripts/add-references.js
 * Then: node build.js html
 */

const fs = require('fs');
const path = require('path');

const WINS_PATH = path.join(__dirname, '..', 'data', 'wins.json');

// ════ REFERENCE URL MAP ════
// Only link to authoritative, stable URLs

const REFS = [
  // Geomagnetic models & datasets
  { pattern: /\bWMM2025\b/g, url: 'https://www.ncei.noaa.gov/products/world-magnetic-model', label: 'WMM2025' },
  { pattern: /\bIGRF(?:-?\d+)?\b/g, url: 'https://www.ngdc.noaa.gov/IAGA/vmod/igrf.html', label: null },
  { pattern: /\bCHAOS-7\b/g, url: 'https://spacecenter.dk/files/magnetic-models/CHAOS-7/', label: 'CHAOS-7' },
  { pattern: /\bINTERMAGNET\b/g, url: 'https://www.intermagnet.org/', label: 'INTERMAGNET' },

  // Satellite missions
  { pattern: /\bSwarm\b(?!\s*\/)/g, url: 'https://earth.esa.int/eogateway/missions/swarm', label: 'Swarm' },
  { pattern: /\bCHAMP\b(?!\s*\/)/g, url: 'https://op.gfz-potsdam.de/champ/', label: 'CHAMP' },
  { pattern: /\bGaia\b/g, url: 'https://www.cosmos.esa.int/web/gaia', label: 'Gaia' },
  { pattern: /\bGRACE\b/g, url: 'https://grace.jpl.nasa.gov/', label: 'GRACE' },

  // Institutions & data portals
  { pattern: /\bNOAA\b/g, url: 'https://www.noaa.gov/', label: 'NOAA' },
  { pattern: /\bESA\b/g, url: 'https://www.esa.int/', label: 'ESA' },
  { pattern: /\bUSGS\b/g, url: 'https://www.usgs.gov/', label: 'USGS' },
  { pattern: /\bBGS\b/g, url: 'https://www.bgs.ac.uk/', label: 'BGS' },
  { pattern: /\bGFZ\b/g, url: 'https://www.gfz-potsdam.de/', label: 'GFZ' },

  // Specific experiments/observatories
  { pattern: /\bCUORE\b/g, url: 'https://cuore.lngs.infn.it/', label: 'CUORE' },
  { pattern: /\bSuperMAG\b/g, url: 'https://supermag.jhuapl.edu/', label: 'SuperMAG' },
  { pattern: /\bLISN\b/g, url: 'https://lisn.igp.gob.pe/', label: 'LISN' },

  // Specific papers / references
  { pattern: /\bTerra-Nova (?:et al\.?\s*)?(?:\(?2017\)?)?/g, url: 'https://doi.org/10.1016/j.epsl.2017.06.036', label: null },
  { pattern: /\bMistele (?:\(?2024\)?)/g, url: 'https://doi.org/10.3847/2041-8213/ad8e69', label: null },

  // Measurement techniques
  { pattern: /\bVLBI\b/g, url: 'https://ivscc.gsfc.nasa.gov/about/vlbi/', label: 'VLBI' },
  { pattern: /\bOpenTimestamps\b/g, url: 'https://opentimestamps.org/', label: 'OpenTimestamps' },

  // Navigation / geodesy
  { pattern: /\bWGS[\s-]?84\b/g, url: 'https://earth-info.nga.mil/php/download.php?file=coord-wgs84', label: null },
];

// ════ LINK INJECTION ════

function addLinks(text) {
  if (!text) return text;

  // Track which ranges are already linked (inside <a> tags) to avoid double-linking
  const existingLinks = [];
  const linkRe = /<a\s[^>]*>.*?<\/a>/gi;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    existingLinks.push({ start: m.index, end: m.index + m[0].length });
  }

  function isInsideLink(idx) {
    return existingLinks.some(l => idx >= l.start && idx < l.end);
  }

  // Apply each reference pattern, but only link the FIRST occurrence per field
  for (const ref of REFS) {
    const re = new RegExp(ref.pattern.source, ref.pattern.flags);
    let firstMatch = null;
    let match;

    while ((match = re.exec(text)) !== null) {
      if (!isInsideLink(match.index)) {
        firstMatch = match;
        break;
      }
    }

    if (firstMatch) {
      const original = firstMatch[0];
      const label = ref.label || original;
      const link = `<a href="${ref.url}" target="_blank">${label}</a>`;

      // Only replace this specific occurrence
      text = text.substring(0, firstMatch.index) + link + text.substring(firstMatch.index + original.length);

      // Update existing link ranges since we changed the string length
      const diff = link.length - original.length;
      existingLinks.push({ start: firstMatch.index, end: firstMatch.index + link.length });
      // Shift subsequent ranges
      for (const el of existingLinks) {
        if (el.start > firstMatch.index && el !== existingLinks[existingLinks.length - 1]) {
          el.start += diff;
          el.end += diff;
        }
      }
    }
  }

  return text;
}

// ════ MAIN ════

const wins = JSON.parse(fs.readFileSync(WINS_PATH, 'utf8'));

let totalLinksAdded = 0;

for (const win of wins) {
  for (const field of ['detail_evidence', 'detail_verdict_text', 'detail_extra']) {
    if (!win[field]) continue;
    const before = win[field];
    const after = addLinks(before);
    if (before !== after) {
      const linksBefore = (before.match(/<a\s/g) || []).length;
      const linksAfter = (after.match(/<a\s/g) || []).length;
      const added = linksAfter - linksBefore;
      if (added > 0) {
        totalLinksAdded += added;
        console.log(`WIN-${win.id} ${field}: +${added} link(s)`);
      }
      win[field] = after;
    }
  }
}

fs.writeFileSync(WINS_PATH, JSON.stringify(wins, null, 2) + '\n');
console.log(`\nTotal links added: ${totalLinksAdded}`);
console.log('Updated:', WINS_PATH);
