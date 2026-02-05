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
const JSON_OUTPUT_PATH = './menu-data-feb-2026.json'; // Will be renamed dynamically

// Hebrew day names mapping (column index to day info)
const DAY_NAMES = {
  1: { en: 'Sunday', he: 'יום ראשון' },
  2: { en: 'Monday', he: 'יום שני' },
  3: { en: 'Tuesday', he: 'יום שלישי' },
  4: { en: 'Wednesday', he: 'יום רביעי' },
  5: { en: 'Thursday', he: 'יום חמישי' }
};

// Category mapping - maps Hebrew row labels to app categories
const CATEGORY_MAPPING = {
  'מרקים': 'soups',
  'מרק': 'soups',
  'התבשיליה': 'main',
  'עמדת גריל': 'main',
  'גריל': 'main',
  'עמדת צימחוני טבעוני': 'plantBased',
  'צמחוני טבעוני': 'plantBased',
  'צמחוני': 'plantBased',
  'טבעוני': 'plantBased',
  'עמדת דג יומית': 'fish',
  'דג יומית': 'fish',
  'דגים': 'fish',
  'עמדת ספיישל יומית': 'main',
  'ספיישל יומית': 'main',
  'ספיישל': 'main',
  'קינוחים': 'desserts',
  'מתוקים': 'desserts'
};

// --- 3. HELPERS ---
function parseDate(dateStr) {
  // Parse DD.MM.YYYY format
  const [d, m, y] = dateStr.split('.');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getMonthName(month) {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return months[month];
}

// --- 4. CSV PROCESSING ---
async function processCSV() {
  console.log('📄 Reading CSV file...');
  const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
  const rows = parse(fileContent, { skip_empty_lines: true });

  // Parse date range from header (e.g., "01.02.2026-05.02.2026")
  const dateRange = rows[0][0];
  const [startDateStr, endDateStr] = dateRange.split('-').map(s => s.trim());
  const startDate = parseDate(startDateStr);
  
  console.log(`📅 Week: ${startDateStr} to ${endDateStr}`);

  // Initialize menu data structure
  const menuData = {};
  
  // Create entries for each day (5 days: Sunday to Thursday)
  for (let i = 0; i < 5; i++) {
    const currentDate = addDays(startDate, i);
    const dateKey = formatDateISO(currentDate);
    const dayInfo = DAY_NAMES[i + 1];
    
    menuData[dateKey] = {
      dayName: dayInfo.en,
      dayNameHe: dayInfo.he,
      soups: [],
      main: [],
      plantBased: [],
      fish: [],
      desserts: []
    };
  }

  // Process each row
  let lastCategory = null;
  
  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0) return; // Skip header row
    
    const rowLabel = row[0]?.trim();
    
    // Check if this row defines a category
    if (rowLabel) {
      // Find matching category
      for (const [key, category] of Object.entries(CATEGORY_MAPPING)) {
        if (rowLabel.includes(key) || key.includes(rowLabel)) {
          lastCategory = category;
          break;
        }
      }
    }
    
    if (!lastCategory) return;
    
    // Process each day column (columns 1-5)
    for (let col = 1; col <= 5; col++) {
      const dish = row[col]?.trim();
      const currentDate = addDays(startDate, col - 1);
      const dateKey = formatDateISO(currentDate);
      
      if (dish && dish !== '' && dish !== '-' && menuData[dateKey]) {
        // Avoid duplicates
        if (!menuData[dateKey][lastCategory].includes(dish)) {
          menuData[dateKey][lastCategory].push(dish);
        }
      }
    }
  });

  return { menuData, startDate };
}

// --- 5. SAVE JSON FILE ---
function saveJSON(menuData, startDate) {
  const month = getMonthName(startDate.getMonth());
  const year = startDate.getFullYear();
  const jsonPath = `./menu-data-${month}-${year}.json`;
  
  fs.writeFileSync(jsonPath, JSON.stringify(menuData, null, 2), 'utf-8');
  console.log(`💾 Saved JSON to ${jsonPath}`);
  
  return jsonPath;
}

// --- 6. UPLOAD TO FIREBASE ---
async function uploadToFirebase(menuData) {
  const dates = Object.keys(menuData);
  
  for (const date of dates) {
    const content = menuData[date];
    const totalDishes = content.main.length + content.plantBased.length + content.fish.length + content.soups.length;
    
    if (totalDishes > 0) {
      console.log(`🚀 Uploading ${date} (${content.dayName}): ${content.main.length} main, ${content.plantBased.length} plant-based, ${content.fish.length} fish`);
      await db.collection('menus').doc(date).set(content);
    }
  }
}

// --- 7. MAIN EXECUTION ---
async function main() {
  try {
    if (!fs.existsSync(CSV_FILE_PATH)) {
      console.log('❌ No CSV file found at', CSV_FILE_PATH);
      process.exit(1);
    }

    // Process CSV
    const { menuData, startDate } = await processCSV();
    
    const dates = Object.keys(menuData);
    if (dates.length === 0) {
      console.log('⚠️ No menu data found in CSV.');
      return;
    }

    // Print summary
    console.log('\n📊 Menu Summary:');
    for (const date of dates) {
      const day = menuData[date];
      console.log(`  ${day.dayName} (${date}): ${day.main.length} main, ${day.plantBased.length} 🌱, ${day.fish.length} 🐟, ${day.soups.length} 🥣, ${day.desserts.length} 🍰`);
    }

    // Save JSON file
    const jsonPath = saveJSON(menuData, startDate);
    
    // Upload to Firebase
    await uploadToFirebase(menuData);
    
    console.log('\n✨ Update completed successfully!');
    console.log(`📁 JSON file: ${jsonPath}`);
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

main();
