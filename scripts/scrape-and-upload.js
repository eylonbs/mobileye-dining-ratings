import puppeteer from 'puppeteer';
import admin from 'firebase-admin';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

// --- 1. INITIALIZATION ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// --- 2. CONFIGURATION ---
const CSV_FILE_PATH = './menu.csv';

// Hebrew mapping used by BOTH the CSV and the Scraper
const CATEGORY_GROUPS = {
  'מרקים': 'soups',
  'מרק': 'soups',
  'התבשיליה': 'main',
  'עמדת גריל': 'main',
  'גריל': 'main',
  'עמדת צימחוני טבעוני': 'main',
  'צמחוני': 'main',
  'טבעוני': 'main',
  'עמדת דג יומית': 'main',
  'דגים': 'main',
  'עמדת ספיישל יומית': 'main',
  'ספיישל': 'main',
  'קינוחים': 'desserts',
  'מתוקים': 'desserts'
};

// --- 3. HELPERS ---
function addDays(startDateStr, daysToAdd) {
  const [d, m, y] = startDateStr.split('.');
  const date = new Date(`${y}-${m}-${d}`);
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split('T')[0];
}

// --- 4. OPTION A: EXCEL/CSV PROCESSING ---
async function processCSV() {
  console.log('✅ CSV file detected. Processing Excel data...');
  const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
  const rows = parse(fileContent, { skip_empty_lines: true });

  const dateRange = rows[0][0]; // Cell A1
  const startDate = dateRange.split('-')[0].trim();
  
  const menuData = {};
  let lastAppCategory = null;

  rows.forEach((row, rowIndex) => {
    if (rowIndex < 1) return;
    const rowLabel = row[0]?.trim();
    if (rowLabel && CATEGORY_GROUPS[rowLabel]) {
      lastAppCategory = CATEGORY_GROUPS[rowLabel];
    }
    if (!lastAppCategory) return;

    for (let i = 1; i <= 5; i++) {
      const targetDate = addDays(startDate, i - 1);
      const dish = row[i]?.trim();
      if (dish && dish !== "" && dish !== "-") {
        if (!menuData[targetDate]) menuData[targetDate] = { soups: [], main: [], desserts: [] };
        if (!menuData[targetDate][lastAppCategory].includes(dish)) {
          menuData[targetDate][lastAppCategory].push(dish);
        }
      }
    }
  });
  return menuData;
}

// --- 5. OPTION B: WEB SCRAPER (BACKUP LOGIC) ---
async function scrapeMenu() {
  console.log('🌐 No CSV found. Falling back to Puppeteer scraper...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto('https://life.mobileye.com/page/terminal-menu?SearchId=0', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(r => setTimeout(r, 5000));

    // RE-INSERTED LOGIC: Scans page text for dates and keywords
    return await page.evaluate((CATEGORY_GROUPS) => {
      const data = {};
      const allElements = Array.from(document.querySelectorAll('div, td, tr, span, p, li'));
      let currentDay = null;
      let currentCategory = 'main';

      allElements.forEach(el => {
        const text = el.innerText ? el.innerText.trim() : "";
        if (!text || text.length < 2 || text.length > 150) return;

        const dateMatch = text.match(/(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2,4})/);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const month = dateMatch[2].padStart(2, '0');
          let year = dateMatch[3];
          if (year.length === 2) year = '20' + year;
          currentDay = `${year}-${month}-${day}`;
          if (!data[currentDay]) data[currentDay] = { soups: [], main: [], desserts: [] };
          return;
        }

        if (currentDay) {
          let foundSection = null;
          for (const [key, section] of Object.entries(CATEGORY_GROUPS)) {
            if (text.includes(key)) {
              foundSection = section;
              break;
            }
          }

          if (foundSection) {
            currentCategory = foundSection;
          } else if (text.length > 4 && !text.includes('Mobileye') && !text.includes('כל הזכויות')) {
            if (!data[currentDay][currentCategory].includes(text)) {
              data[currentDay][currentCategory].push(text);
            }
          }
        }
      });
      return data;
    }, CATEGORY_GROUPS);
  } finally {
    await browser.close();
  }
}

// --- 6. MAIN EXECUTION ---
async function main() {
  try {
    let menuData;
    if (fs.existsSync(CSV_FILE_PATH)) {
      menuData = await processCSV();
    } else {
      menuData = await scrapeMenu();
    }

    const dates = Object.keys(menuData);
    if (dates.length === 0) {
      console.log('⚠️ No menu data found. (Check if site is blocked or CSV is empty)');
      return;
    }

    for (const date of dates) {
      const content = menuData[date];
      // Only upload if there are actual dishes found
      if (content.main.length > 0 || content.soups.length > 0) {
        console.log(`🚀 Uploading ${date}: ${content.main.length} main dishes.`);
        await db.collection('menus').doc(date).set(content);
      }
    }
    console.log('✨ Update completed!');
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

main();
