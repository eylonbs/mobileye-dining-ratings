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
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Navigating to Mobilife...');
    await page.goto('https://life.mobileye.com/page/terminal-menu?SearchId=0', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // FIX: Replaced page.waitForTimeout with a modern promise-based delay
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    // DEBUG: Let's see what the page actually says
    const debugInfo = await page.evaluate(() => ({
      title: document.title,
      bodySnippet: document.body.innerText.substring(0, 500)
    }));
    console.log('Page Title:', debugInfo.title);
    console.log('Page Content Snippet:', debugInfo.bodySnippet);

    const menuData = await page.evaluate((CATEGORIES_MAP) => {
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
          for (const [section, keywords] of Object.entries(CATEGORIES_MAP)) {
            if (keywords.some(k => text.includes(k))) {
              foundSection = section;
              break;
            }
          }

          if (foundSection) {
            currentCategory = foundSection;
          } else if (text.length > 4 && !text.includes('Mobileye') && !text.includes('כל הזכויות')) {
            const isDuplicate = data[currentDay][currentCategory].includes(text);
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
      console.log('No structured data found. Checking if site is empty or blocked...');
      return;
    }

    for (const date of datesFound) {
      const doc = data[date];
      const finalDoc = {
        main: [...new Set(doc.main)].filter(d => d.length > 5).slice(0, 15),
        soups: [...new Set(doc.soups)].filter(d => d.length > 5).slice(0, 5),
        desserts: [...new Set(doc.desserts)].filter(d => d.length > 5).slice(0, 5)
      };

      if (finalDoc.main.length > 0) {
        console.log(`Uploading ${date}: Found ${finalDoc.main.length} main dishes.`);
        await db.collection('menus').doc(date).set(finalDoc);
      }
    }
    console.log('Update process finished.');
  } catch (e) {
    console.error('Script Error:', e);
    process.exit(1);
  }
}

main();
