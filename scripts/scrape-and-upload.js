import puppeteer from 'puppeteer';
import admin from 'firebase-admin';

// Parse service account JSON from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Hebrew category mappings
const CATEGORIES = {
  מרקים: 'soups',
  'עמדת דג יומי': 'main',
  'עמדת צימחוני טבעוני': 'main',
  'עמדת גריל': 'main',
  התבשיליה: 'main',
  'עמדת ספיישל יומית': 'main',
  קינוחים: 'desserts',
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
      
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        let currentCategory = null;
        let currentDay = null;
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          if (cells.length === 0) return;
          
          const firstCellText = cells[0].textContent.trim();
          
          // Check if this is a day header
          const dayMatch = firstCellText.match(/(ראשון|שני|שלישי|רביעי|חמישי)/);
          if (dayMatch && cells.length > 1) {
            const dateText = cells[cells.length - 1].textContent.trim();
            const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
            if (dateMatch) {
              currentDay = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
              if (!data[currentDay]) {
                data[currentDay] = {};
              }
            }
          }
          // Check if this is a category row
          else if (cells.length === 1 || (cells.length === 2 && !cells[1].textContent.trim())) {
            currentCategory = firstCellText;
          }
          // This is a dish row
          else if (currentDay && currentCategory && cells.length >= 2) {
            if (!data[currentDay][currentCategory]) {
              data[currentDay][currentCategory] = [];
            }
            data[currentDay][currentCategory].push(firstCellText);
          }
        });
      });
      
      return data;
    });

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
      const appSection = CATEGORIES[hebrewCategory];
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
