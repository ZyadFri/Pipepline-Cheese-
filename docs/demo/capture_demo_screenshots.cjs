// Captures a screenshot of every major page in the app, authenticated via a
// JWT injected into localStorage (same shape zustand's persist middleware
// writes) rather than driving the login form. Used to build docs/demo's
// walkthrough video/screenshots.
//
// Requires: `npm install --no-save puppeteer-core` in pipeline/frontend
// (not a project dependency — installed on demand), Chrome installed at the
// default Windows path below, and both the backend (:8000) and frontend
// (:5173) dev servers already running.
//
// Usage (PowerShell):
//   $env:DEMO_TOKEN = python -c "from app.core.security import create_access_token; print(create_access_token({'sub': '<user_id>'}))"
//   $env:DEMO_USER_ID = "<user_id>"; $env:DEMO_USER_EMAIL = "you@example.com"; $env:DEMO_USER_NAME = "Your Name"
//   node capture_demo_screenshots.cjs
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.DEMO_BASE_URL || 'http://localhost:5173';
const OUT_DIR = path.join(__dirname, 'shots');
const TOKEN = process.env.DEMO_TOKEN;
const USER = {
  id: Number(process.env.DEMO_USER_ID || 1),
  email: process.env.DEMO_USER_EMAIL || 'demo@example.com',
  full_name: process.env.DEMO_USER_NAME || 'Demo User',
};

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Swap these for a real project/paper ID with populated data in whichever
// DB you're pointed at (an empty project makes for a much less useful demo).
const PROJECT_ID = process.env.DEMO_PROJECT_ID || '43';
const PAPER_ID = process.env.DEMO_PAPER_ID || '30';

const PAGES = [
  { name: '00_landing_signed_out', url: BASE + '/', clearAuth: true },
  { name: '01_login', url: BASE + '/login', clearAuth: true },
  { name: '02_dashboard', url: BASE + '/' },
  { name: '03_project_home', url: `${BASE}/projects/${PROJECT_ID}` },
  { name: '04_paper_overview', url: `${BASE}/projects/${PROJECT_ID}/papers/${PAPER_ID}/overview` },
  { name: '05_paper_docling', url: `${BASE}/projects/${PROJECT_ID}/papers/${PAPER_ID}/docling` },
  { name: '06_paper_charts', url: `${BASE}/projects/${PROJECT_ID}/papers/${PAPER_ID}/charts` },
  { name: '07_paper_extract_data', url: `${BASE}/projects/${PROJECT_ID}/papers/${PAPER_ID}/validation` },
  { name: '08_paper_review', url: `${BASE}/projects/${PROJECT_ID}/papers/${PAPER_ID}/review` },
  { name: '09_paper_database', url: `${BASE}/projects/${PROJECT_ID}/papers/${PAPER_ID}/database` },
  { name: '10_project_studies', url: `${BASE}/projects/${PROJECT_ID}/studies` },
  { name: '11_project_experiments', url: `${BASE}/projects/${PROJECT_ID}/experiments` },
  { name: '12_project_treatments', url: `${BASE}/projects/${PROJECT_ID}/treatments` },
  { name: '13_project_normalization', url: `${BASE}/projects/${PROJECT_ID}/normalization` },
  { name: '14_project_export', url: `${BASE}/projects/${PROJECT_ID}/export` },
  { name: '15_project_jobs', url: `${BASE}/projects/${PROJECT_ID}/jobs` },
  { name: '16_project_audit', url: `${BASE}/projects/${PROJECT_ID}/audit` },
  { name: '17_project_team', url: `${BASE}/projects/${PROJECT_ID}/team` },
  { name: '18_project_settings', url: `${BASE}/projects/${PROJECT_ID}/settings` },
  { name: '19_profile', url: BASE + '/profile' },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [console error]', msg.text().slice(0, 200));
  });

  for (const p of PAGES) {
    try {
      if (p.clearAuth) {
        await page.evaluateOnNewDocument(() => localStorage.clear());
      } else {
        const authValue = JSON.stringify({ state: { token: TOKEN, user: USER }, version: 0 });
        await page.evaluateOnNewDocument((val) => {
          localStorage.setItem('food-research-auth', val);
        }, authValue);
      }
      await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise((r) => setTimeout(r, 1200)); // let async data fetches settle
      await page.screenshot({ path: path.join(OUT_DIR, p.name + '.png') });
      console.log('OK  ', p.name);
    } catch (err) {
      console.log('FAIL', p.name, err.message);
      try {
        await page.screenshot({ path: path.join(OUT_DIR, p.name + '_FAILED.png') });
      } catch (_) {}
    }
  }

  await browser.close();
})();
