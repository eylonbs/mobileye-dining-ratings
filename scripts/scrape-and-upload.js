import puppeteer from 'puppeteer';
import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const CATEGORIES = {
  soups: ['מרק', 'מרקים'],
  main: ['גריל', 'בשרי', 'דג', 'צמחוני', 'טבעוני', 'תבשיל', 'ספיישל', 'התבשיליה', 'עיקרית'],
  desserts: ['קינוח', 'מתוק', 'פירות']
};

async function scrapeMenu() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://life.mobileye.com/page/terminal-menu?SearchId=0', {
      waitUntil: 'networkidle2', timeout: 60000
    });

    const menuData = await page.evaluate((CATEGORIES) => {
      const data = {};
      const rows = Array.from(document.querySelectorAll('tr, div.menu-row'));
      let currentDay = null;
      let currentCategory = null;

      rows.forEach(row => {
        const text = row.innerText.trim();
        if (!text || text.length < 2) return;

        // 1. Find Date (Today: 01/02/2026 or 1.2.26)
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

        // 2. Identify Category and Add Dishes
        if (currentDay) {
          let foundSection = null;
          for (const [section, keywords] of Object.entries(CATEGORIES)) {
            if (keywords.some(k => text.includes(k))) {
              foundSection = section;
              break;
            }
          }

          if (foundSection) {
            currentCategory = foundSection;
          } else if (currentCategory && text.length > 3) {
            // If it's not a category name but we are under a date, it's a dish!
            data[currentDay][currentCategory].push(text);
          }
        }
      });
      return data;
    }, CATEGORIES);

    return menuData;
  } finally {
    await browser.close();
  }
}

async function uploadToFirebase(menuData) {
  for (const [date, content] of Object.entries(menuData)) {
    // Clean up empty strings or duplicates
    const finalDoc = {
      main: [...new Set(content.main)].filter(d => d.length > 5),
      soups: [...new Set(content.soups)].filter(d => d.length > 5),
      desserts: [...new Set(content.desserts)].filter(d => d.length > 5)
    };

    console.log(`Uploading to Firebase for ${date}:`, JSON.stringify(finalDoc));
    await db.collection('menus').doc(date).set(finalDoc);
  }
}

async function main() {
  try {
    const data = await scrapeMenu();
    if (Object.keys(data).length === 0) {
      console.error("CRITICAL: No data extracted. Structure might have changed.");
    } else {
      await uploadToFirebase(data);
      console.log('Menu update completed successfully!');
    }
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
}

main();
