#!/usr/bin/env node
/**
 * generate-pdf.js
 * Generates PDF from docs/index.html using playwright headless chromium.
 * Replaces the old DOCX→LibreOffice→PDF pipeline.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HTML_PATH = path.join(__dirname, '..', 'docs', 'index.html');
const PDF_PATH = path.join(__dirname, '..', 'downloads', 'critical-review-dome-model-v6.pdf');

async function main() {
  if (!fs.existsSync(HTML_PATH)) {
    throw new Error('docs/index.html not found — run generate-html.js first');
  }

  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Loading HTML...');
  await page.goto('file://' + path.resolve(HTML_PATH), { waitUntil: 'networkidle' });

  // Use @media print CSS to handle layout — no manual JS manipulation needed
  // The print styles already show all tabs, hide nav, etc.

  console.log('Generating PDF...');
  await page.pdf({
    path: PDF_PATH,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.6in', bottom: '0.6in', left: '0.7in', right: '0.7in' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:8pt;color:#999"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });

  const stats = fs.statSync(PDF_PATH);
  console.log(`Generated PDF: ${PDF_PATH}`);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

  await browser.close();
}

main().catch(err => {
  console.error('PDF generation failed:', err.message);
  process.exit(1);
});
