#!/usr/bin/env node
/**
 * Unified build pipeline for the Dome Model Critical Review.
 *
 * Usage:
 *   node build.js          — Build HTML + DOCX + PDF
 *   node build.js html     — Build HTML only
 *   node build.js docx     — Build DOCX + PDF only
 *   node build.js publish  — Build all + git commit + push
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const target = process.argv[2] || 'all';

function run(cmd, label) {
  console.log(`\n⏳ ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`✅ ${label}`);
  } catch (e) {
    console.error(`❌ ${label} failed`);
    process.exit(1);
  }
}

function fixBookmarks() {
  console.log('\n⏳ Fixing DOCX bookmark IDs...');
  const AdmZip = require('adm-zip');
  const docxPath = path.join(ROOT, 'downloads', 'critical-review-dome-model-v4.docx');

  const zip = new AdmZip(docxPath);
  const docEntry = zip.getEntry('word/document.xml');
  let content = docEntry.getData().toString('utf8');

  let counter = 0;
  content = content.replace(/(w:name="[^"]*"\s+)w:id="\d+"/g, (match, prefix) => {
    counter++;
    return prefix + `w:id="${counter}"`;
  });

  zip.updateFile('word/document.xml', Buffer.from(content, 'utf8'));
  zip.writeZip(docxPath);
  console.log(`✅ Fixed ${counter} bookmark IDs`);
}

function printTally() {
  const wins = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'wins.json'), 'utf8'));
  const tally = {};
  wins.forEach(w => { tally[w.verdict] = (tally[w.verdict] || 0) + 1; });
  console.log(`\n📊 Verdict Tally (${wins.length} WINs):`);
  Object.entries(tally).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
}

// ── Main ──
printTally();

if (target === 'all' || target === 'html') {
  run('node build-scripts/generate-html.js', 'Generate HTML');
}

if (target === 'all' || target === 'docx') {
  run('node build-scripts/build-doc-v4.js', 'Generate DOCX');

  // Copy docx to downloads
  const src = path.join(ROOT, 'critical-review-dome-model-v4.docx');
  const dst = path.join(ROOT, 'downloads', 'critical-review-dome-model-v4.docx');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    fs.unlinkSync(src);
  }

  // Fix bookmark IDs
  try {
    fixBookmarks();
  } catch (e) {
    // Fall back to Python if adm-zip not available
    console.log('⏳ Falling back to Python bookmark fix...');
    run(`python3 -c "
import zipfile, re, os, shutil
src = 'downloads/critical-review-dome-model-v4.docx'
tmp = '/tmp/docx_fix'
if os.path.exists(tmp): shutil.rmtree(tmp)
os.makedirs(tmp)
with zipfile.ZipFile(src, 'r') as z: z.extractall(tmp)
doc_path = os.path.join(tmp, 'word/document.xml')
with open(doc_path, 'r', encoding='utf-8') as f: content = f.read()
counter = [0]
def replace_id(m):
    counter[0] += 1
    return m.group(1) + 'w:id=\\\"' + str(counter[0]) + '\\\"'
content = re.sub(r'(w:name=\\\"[^\\\"]*\\\"\\s+)w:id=\\\"\\d+\\\"', replace_id, content)
with open(doc_path, 'w', encoding='utf-8') as f: f.write(content)
os.remove(src)
with zipfile.ZipFile(src, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(tmp):
        for file in files:
            fp = os.path.join(root, file)
            z.write(fp, os.path.relpath(fp, tmp))
shutil.rmtree(tmp)
print(f'Fixed {counter[0]} bookmark IDs')
"`, 'Python bookmark fix');
  }

  // Generate PDF
  run('libreoffice --headless --convert-to pdf downloads/critical-review-dome-model-v4.docx --outdir downloads', 'Generate PDF');
}

if (target === 'publish') {
  run('git add data/ docs/ downloads/ build-scripts/', 'Stage files');
  const msg = `Update review (auto-build ${new Date().toISOString().slice(0,10)})`;
  run(`git commit -m "${msg}\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"`, 'Commit');
  run('git push origin main', 'Push to GitHub');

  // Sync key files to workspace (FUSE mount can't run git, but agents read from there)
  const workspace = '/sessions/peaceful-gallant-rubin/mnt/dome-model-review';
  if (fs.existsSync(workspace)) {
    console.log('\n⏳ Sync to workspace...');
    const syncFiles = ['data/wins.json', 'docs/index.html', 'build-scripts/generate-html.js', 'build-scripts/build-doc-v4.js', 'CLAUDE.md'];
    let synced = 0;
    for (const f of syncFiles) {
      const src = path.join(ROOT, f);
      const dst = path.join(workspace, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        synced++;
      }
    }
    console.log(`✅ Sync to workspace (${synced} files)`);
  }
}

console.log('\n🎉 Build complete!');
