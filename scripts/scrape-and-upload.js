import puppeteer from 'puppeteer';
import admin from 'firebase-admin';

// Parse service account JSON from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Hebrew category mappings
const CATEGORIES = {
  'מרקים': 'soups',
  'מרק': 'soups',
  'עמדת דג יומי': 'main',
  'דגים': 'main',
  'עמדת צימחוני טבעוני': 'main',
  'צמחוני': 'main',
  'עמדת גריל': 'main',
  'גריל': 'main',
  'התבשיליה': 'main',
  'תבשילים': 'main',
  'עמדת ספיישל יומית': 'main',
  'ספיישל': 'main',
  'קינוחים': 'desserts',
  'מתוקים': 'desserts'
};

async function scrapeMenu() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    console.log('Navigating to Mobilife menu page...');
    await page.goto('https://life.mobileye.com/page/terminal-menu?SearchId=0', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('Extracting menu data...');
    const menuData = await page.evaluate(() => {
      const data = {};
      const tables = document.querySelectorAll('table');
      let currentDay = null;
      let currentCategory = null;

      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const text = row.innerText.trim();
          if (!text || text.length < 2) return;

          // FIX: Flexible Date Match (Handles 1.2.2026, 01/02/26, 1/2/26, etc.)
          const dateMatch = text.match(/(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2,4})/);
          if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const month = dateMatch[2].padStart(2, '0');
            let year = dateMatch[3];
            if (year.length === 2) year = '20' + year;
            currentDay = `${year}-${month}-${day}`;
            if (!data[currentDay]) data[currentDay] = {};
            return;
          }

          // If we have a date, check for categories or dishes
          if (currentDay) {
            // Check if this row is a category
            const categoriesInRow = ['מרקים', 'מרק', 'גריל', 'בשרי', 'צמחוני', 'קינוחים', 'ספיישל', 'התבשיליה', 'דגים'];
            const foundCat = categoriesInRow.find(cat => text.includes(cat));

            if (foundCat) {
              currentCategory = text;
              if (!data[currentDay][currentCategory]) data[currentDay][currentCategory] = [];
            } else if (currentCategory && text.length > 3) {
              // It's a dish - push to the last category found
              data[currentDay][currentCategory].push(text);
            }
          }
        });
      });
      return data;
    });

    // This will now show you EXACTLY what was found in the GitHub Logs
    console.log('Menu data extracted:', JSON.stringify(menuData, null, 2));
    return menuData;
  } finally {
    await browser.close();
  }
}

async function uploadToFirebase(menuData) {
  console.log('Uploading menu data to Firebase...');
  
  for (const [date, categories] of Object.entries(menuData)) {
    const menuDoc = {
      main: [],
      soups: [],
      desserts: [],
    };

    // Map Hebrew categories to app sections
    for (const [hebrewCategory, dishes] of Object.entries(categories)) {
      // Look for any category that contains the Hebrew word
      const appSection = Object.entries(CATEGORIES).find(([key]) => 
        hebrewCategory.includes(key) || key.includes(hebrewCategory))?.[1];
      if (appSection) {
        menuDoc[appSection].push(...dishes);
      }
    }

    // Remove duplicates
    menuDoc.main = [...new Set(menuDoc.main)];
    menuDoc.soups = [...new Set(menuDoc.soups)];
    menuDoc.desserts = [...new Set(menuDoc.desserts)];

    console.log(`Uploading menu for ${date}:`, menuDoc);
    
    try {
      await db.collection('menus').doc(date).set(menuDoc);
      console.log(`Successfully uploaded menu for ${date}`);
    } catch (error) {
      console.error(`Error uploading menu for ${date}:`, error);
    }
  }
}

async function main() {
  try {
    console.log('Starting menu scraper...');
    const menuData = await scrapeMenu();
    await uploadToFirebase(menuData);
    console.log('Menu update completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error during menu update:', error);
    process.exit(1);
  }
}

main();
