#!/usr/bin/env node

/**
 * cron-tz-sanity.js — operator helper for scheduled-tasks cron sanity.
 *
 * Created 2026-06-09 after two consecutive operator-side errors in
 * converting between intended UTC fire slots and the scheduled-tasks
 * tool's cron expression (which is interpreted in tool-local time).
 *
 * Both errors were the same shape: assume a tool-local timezone, fail
 * to test the assumption against multiple non-aliasing observations,
 * commit a wrong cron. This script makes the check mechanical.
 *
 * Two modes:
 *
 *   show   — Given a cron and an assumed tool-local UTC offset, print
 *            the next N scheduled UTC fire times (jitter not included).
 *            Use BEFORE setting a schedule to verify the cron matches
 *            intent.
 *
 *   verify — Given a cron and an observed UTC fire timestamp, scan
 *            all integer-hour timezone hypotheses (UTC-12..UTC+14)
 *            and report which are consistent. Use AFTER setting a
 *            schedule and reading lastRunAt to confirm your TZ
 *            assumption.
 *
 * Supports cron fields: minute, hour, day-of-month, month, day-of-week.
 * Supports values: integers, ranges (a-b), lists (a,b,c), wildcards (*).
 * Does NOT support: step (`/n`), `?`, `L`, `#`, named days, seconds.
 *
 * Examples:
 *
 *   # Verify the new analyst schedule fires at intended UTC slots
 *   node monitor/scripts/cron-tz-sanity.js show \
 *     --cron "0 1,5,9 * * *" --offset-hours 1 --count 6
 *
 *   # Infer tool-local TZ from a real observation
 *   node monitor/scripts/cron-tz-sanity.js verify \
 *     --cron "0 1,5,9 * * *" --observed-utc 2026-06-09T04:03:29Z
 */

'use strict';

function parseField(field, min, max) {
  if (field === '*') {
    const arr = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
  }
  const set = new Set();
  for (const part of field.split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) {
        throw new Error(`Bad range ${part} for field [${min}-${max}]`);
      }
      for (let i = a; i <= b; i++) set.add(i);
    } else if (/^\d+$/.test(part)) {
      const v = parseInt(part, 10);
      if (v < min || v > max) {
        throw new Error(`Value ${v} out of range [${min}-${max}]`);
      }
      set.add(v);
    } else {
      throw new Error(`Unsupported cron token: ${part}`);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function parseCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron must have 5 fields (minute hour dom month dow); got ${fields.length}`);
  }
  return {
    minutes: parseField(fields[0], 0, 59),
    hours: parseField(fields[1], 0, 23),
    dom: parseField(fields[2], 1, 31),
    months: parseField(fields[3], 1, 12),
    dow: parseField(fields[4], 0, 6),
  };
}

function matches(cron, localDate) {
  // localDate's UTC components ARE the local clock readings, by construction
  // (we shift the millisecond by offsetHours and then read getUTC* off it).
  return cron.minutes.includes(localDate.getUTCMinutes())
    && cron.hours.includes(localDate.getUTCHours())
    && cron.dom.includes(localDate.getUTCDate())
    && cron.months.includes(localDate.getUTCMonth() + 1)
    && cron.dow.includes(localDate.getUTCDay());
}

/**
 * Yield the next N scheduled UTC fire times for a cron + offset.
 * "offsetHours" is the LOCAL-MINUS-UTC offset (e.g., UTC+1 = +1, PT = -7 in DST).
 */
function* nextFireTimesUtc(cron, offsetHours, fromUtc, count) {
  const MIN = 60 * 1000;
  // Round up to next minute boundary
  let cur = new Date(fromUtc.getTime());
  cur.setUTCSeconds(0, 0);
  cur = new Date(cur.getTime() + MIN);
  let yielded = 0;
  const MAX_ITER = 60 * 24 * 35; // 35 days
  for (let i = 0; i < MAX_ITER && yielded < count; i++) {
    const localMs = cur.getTime() + offsetHours * 3600 * 1000;
    const localDate = new Date(localMs);
    if (matches(cron, localDate)) {
      yield new Date(cur);
      yielded++;
    }
    cur = new Date(cur.getTime() + MIN);
  }
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fmt(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}T${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}Z`;
}

function fmtLocal(d, offsetHours) {
  const l = new Date(d.getTime() + offsetHours * 3600 * 1000);
  const sign = offsetHours >= 0 ? '+' : '-';
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1, 2)}-${pad(l.getUTCDate(), 2)} ${pad(l.getUTCHours(), 2)}:${pad(l.getUTCMinutes(), 2)} (local UTC${sign}${Math.abs(offsetHours)})`;
}

function cmdShow(args) {
  const cronStr = args.cron;
  const offsetHours = parseFloat(args['offset-hours'] || '0');
  const count = parseInt(args.count || '5', 10);
  const from = args.from ? new Date(args.from) : new Date();
  if (!cronStr) {
    throw new Error('show requires --cron "<expr>"');
  }
  if (isNaN(offsetHours)) {
    throw new Error('show requires --offset-hours <N> (integer/float)');
  }
  const cron = parseCron(cronStr);
  console.log(`cron:      ${cronStr}`);
  console.log(`local TZ:  UTC${offsetHours >= 0 ? '+' : '-'}${Math.abs(offsetHours)}`);
  console.log(`from:      ${fmt(from)}`);
  console.log(`next ${count} scheduled fire times (UTC; jitter not included):`);
  let i = 1;
  for (const t of nextFireTimesUtc(cron, offsetHours, from, count)) {
    console.log(`  ${i.toString().padStart(2, ' ')}.  ${fmt(t)}    [${fmtLocal(t, offsetHours)}]`);
    i++;
  }
  if (i === 1) {
    console.log('  (no fires in 35-day window — cron may be impossible)');
  }
}

function cmdVerify(args) {
  const cronStr = args.cron;
  const observedUtcStr = args['observed-utc'];
  const jitterTolMin = parseInt(args['jitter-tolerance-min'] || '15', 10);
  if (!cronStr || !observedUtcStr) {
    throw new Error('verify requires --cron "<expr>" --observed-utc <ISO>');
  }
  const cron = parseCron(cronStr);
  const observed = new Date(observedUtcStr);
  if (isNaN(observed.getTime())) {
    throw new Error(`Bad ISO timestamp: ${observedUtcStr}`);
  }
  console.log(`cron:              ${cronStr}`);
  console.log(`observed UTC fire: ${fmt(observed)}`);
  console.log(`jitter tolerance:  ${jitterTolMin} min (forward only; jitter is positive delay)`);
  console.log('');
  console.log('Scanning integer-hour timezone hypotheses UTC-12..UTC+14:');
  console.log('');
  const consistent = [];
  for (let off = -12; off <= 14; off++) {
    // Under hypothesis local = UTC + off, what scheduled UTC fires would the cron produce
    // in the +/- 1 day window around observed?
    const dayBefore = new Date(observed.getTime() - 24 * 3600 * 1000);
    const candidateFires = [];
    for (const t of nextFireTimesUtc(cron, off, dayBefore, 50)) {
      if (t.getTime() > observed.getTime() + 24 * 3600 * 1000) break;
      candidateFires.push(t);
    }
    // Find the nearest candidate <= observed (jitter is positive, so scheduled <= observed)
    let nearest = null;
    let nearestDeltaMs = Infinity;
    for (const cf of candidateFires) {
      const delta = observed.getTime() - cf.getTime();
      if (delta >= 0 && delta < nearestDeltaMs) {
        nearestDeltaMs = delta;
        nearest = cf;
      }
    }
    if (nearest && nearestDeltaMs <= jitterTolMin * 60 * 1000) {
      const deltaSec = Math.round(nearestDeltaMs / 1000);
      const deltaMin = Math.round(nearestDeltaMs / 60000 * 10) / 10;
      const offStr = `UTC${off >= 0 ? '+' : '-'}${Math.abs(off)}`;
      consistent.push({ off, nearest, deltaSec, deltaMin });
      console.log(`  ${offStr.padStart(7)}  consistent  scheduled ${fmt(nearest)}  +${deltaMin}min jitter`);
    }
  }
  console.log('');
  if (consistent.length === 0) {
    console.log('NO TIMEZONE HYPOTHESIS IS CONSISTENT within jitter tolerance.');
    console.log('Either the cron does not actually fire at the observed UTC, or jitter > tolerance.');
    console.log('Try --jitter-tolerance-min 30 or recheck the observed timestamp.');
  } else if (consistent.length === 1) {
    const c = consistent[0];
    const offStr = `UTC${c.off >= 0 ? '+' : '-'}${Math.abs(c.off)}`;
    console.log(`UNAMBIGUOUS: tool-local = ${offStr}`);
  } else {
    console.log(`AMBIGUOUS: ${consistent.length} hypotheses fit. Test with a non-aliasing cron.`);
    console.log('Examples of non-aliasing: prime hour values (5, 7, 11, 13), or 3-slot patterns');
    console.log('like 1,7,13 instead of 4-aliased 0,4,8,12,16,20.');
  }
}

function parseArgs(argv) {
  const args = {};
  let cmd = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!cmd && (a === 'show' || a === 'verify')) {
      cmd = a;
      continue;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = val;
        i++;
      }
    }
  }
  return { cmd, args };
}

function usage() {
  console.log(`Usage:`);
  console.log(`  node monitor/scripts/cron-tz-sanity.js show \\`);
  console.log(`    --cron "<expr>" --offset-hours <N> [--count <K>] [--from <ISO>]`);
  console.log(``);
  console.log(`  node monitor/scripts/cron-tz-sanity.js verify \\`);
  console.log(`    --cron "<expr>" --observed-utc <ISO> [--jitter-tolerance-min <N>]`);
  console.log(``);
  console.log(`See file header for full docs and examples.`);
  process.exit(2);
}

function main() {
  const { cmd, args } = parseArgs(process.argv.slice(2));
  if (!cmd) usage();
  try {
    if (cmd === 'show') cmdShow(args);
    else if (cmd === 'verify') cmdVerify(args);
    else usage();
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
