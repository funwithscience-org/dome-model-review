#!/usr/bin/env node
/**
 * Repair JSON files where the issue is unescaped " inside string values.
 * Strategy: parse iteratively; on each parse error at position P, verify P is
 * inside a string context and the char at P is ", then insert a backslash.
 * Max 500 iterations to prevent runaway.
 */
const fs = require('fs');

function tryParse(text) {
  try { JSON.parse(text); return {ok: true}; }
  catch (e) {
    const m = e.message.match(/position (\d+)/);
    return {ok: false, pos: m ? parseInt(m[1]) : -1, msg: e.message};
  }
}

// Determine if position P is INSIDE a string value by walking from start
// and tracking in-string state. This correctly respects escape sequences.
function isInsideString(text, targetPos) {
  let inStr = false;
  let escaping = false;
  for (let i = 0; i < targetPos; i++) {
    const c = text[i];
    if (escaping) { escaping = false; continue; }
    if (c === '\\') { escaping = true; continue; }
    if (c === '"') { inStr = !inStr; }
  }
  return inStr;
}

function repair(path) {
  let text = fs.readFileSync(path, 'utf8');
  let iterations = 0;
  let fixed = 0;
  while (iterations < 500) {
    const r = tryParse(text);
    if (r.ok) return {ok: true, fixed, iterations};
    iterations++;
    const pos = r.pos;
    if (pos < 0) return {ok: false, reason: 'no position in error: ' + r.msg};
    // Scan forward from pos looking for the first "
    // Usually the error points at the char AFTER the bad quote
    // Try looking at pos-1 first, then pos
    let badPos = -1;
    for (const candidate of [pos - 1, pos, pos - 2, pos + 1]) {
      if (candidate < 0 || candidate >= text.length) continue;
      if (text[candidate] === '"' && isInsideString(text, candidate)) {
        badPos = candidate;
        break;
      }
    }
    if (badPos < 0) return {ok: false, reason: 'cannot locate unescaped quote near position ' + pos + '; ' + r.msg};
    text = text.slice(0, badPos) + '\\' + text.slice(badPos);
    fixed++;
  }
  return {ok: false, reason: 'exceeded 500 iterations'};
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: fix-json-quotes.js <file1> [file2 ...]');
  process.exit(1);
}

let anyFailed = false;
for (const file of files) {
  const res = repair(file);
  if (res.ok) {
    // Write repaired file
    let text = fs.readFileSync(file, 'utf8');
    let iterations = 0;
    while (iterations < 500) {
      const r = tryParse(text);
      if (r.ok) break;
      iterations++;
      const pos = r.pos;
      let badPos = -1;
      for (const candidate of [pos - 1, pos, pos - 2, pos + 1]) {
        if (candidate < 0 || candidate >= text.length) continue;
        if (text[candidate] === '"' && isInsideString(text, candidate)) {
          badPos = candidate;
          break;
        }
      }
      if (badPos < 0) break;
      text = text.slice(0, badPos) + '\\' + text.slice(badPos);
    }
    fs.writeFileSync(file, text);
    console.log(`${file}: fixed ${res.fixed} unescaped quotes in ${res.iterations} passes`);
  } else {
    console.log(`${file}: FAILED - ${res.reason}`);
    anyFailed = true;
  }
}
process.exit(anyFailed ? 1 : 0);
