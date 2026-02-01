import puppeteer from 'puppeteer';
import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const CATEGORIES_MAP = {
  soups: ['מרק', 'מרקים'],
  main: ['גריל', 'בשרי', 'דג', 'צמחוני', 'טבעוני', 'תבשיל', 'ספיישל', 'התבשיליה', 'עיקרית', 'פסטה', 'אסייתי'],
  desserts: ['קינוח', 'מתוק', 'פירות']
};

async function scrapeMenu() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    // Use a real browser User-Agent to avoid being blocked
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Navigating to Mobilife...');
    await page.goto('https://life.mobileye.com/page/terminal-menu?SearchId=0', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for ANY content to load
    await page.waitForTimeout(5000); 

    const menuData = await page.evaluate((CATEGORIES_MAP) => {
      const data = {};
      // Grab every single text element on the page, regardless of table structure
      const allElements = Array.from(document.querySelectorAll('div, td, tr, span, p, h1, h2, h3, h4'));
      
      let currentDay = null;
      let currentCategory = 'main'; // Default fallback

      allElements.forEach(el => {
        const text = el.innerText ? el.innerText.trim() : "";
        if (!text || text.length < 2 || text.length > 100) return;

        // 1. Detect Date (e.g., 01/02/2026)
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
          // 2. Detect Category change
          let foundSection = null;
          for (const [section, keywords] of Object.entries(CATEGORIES_MAP)) {
            if (keywords.some(k => text.includes(k))) {
              foundSection = section;
              break;
            }
          }

          if (foundSection) {
            currentCategory = foundSection;
          } else if (text.length > 4 && !text.includes('כל הזכויות')) {
            // 3. It's a dish! (Avoid duplicate adding by checking if already in any category for this day)
            const isDuplicate = Object.values(data[currentDay]).some(arr => arr.includes(text));
            if (!isDuplicate) {
              data[currentDay][currentCategory].push(text);
            }
          }
        }
      });
      return data;
    }, CATEGORIES_MAP);

    return menuData;
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    const data = await scrapeMenu();
    const datesFound = Object.keys(data);
    
    if (datesFound.length === 0) {
      console.error("CRITICAL: Still no data. Mobilife might be showing a 'No Menu' message or login screen.");
      return;
    }

    for (const date of datesFound) {
      const doc = data[date];
      // Final cleanup
      const finalDoc = {
        main: [...new Set(doc.main)].slice(0, 15),
        soups: [...new Set(doc.soups)].slice(0, 5),
        desserts: [...new Set(doc.desserts)].slice(0, 5)
      };

      console.log(`Final data for ${date}:`, JSON.stringify(finalDoc));
      await db.collection('menus').doc(date).set(finalDoc);
    }
    console.log('Update complete!');
  } catch (e) {
    console.error('Failed:', e);
  }
}

main();
