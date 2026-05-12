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

// Hebrew day names mapping (column index to day info)
const DAY_NAMES = {
  1: { en: 'Sunday', he: 'יום ראשון' },
  2: { en: 'Monday', he: 'יום שני' },
  3: { en: 'Tuesday', he: 'יום שלישי' },
  4: { en: 'Wednesday', he: 'יום רביעי' },
  5: { en: 'Thursday', he: 'יום חמישי' }
};

// Short day names (א', ב', ג', ד', ה') to column index mapping
const SHORT_DAY_MAPPING = {
  "א'": 1, "א": 1,
  "ב'": 2, "ב": 2,
  "ג'": 3, "ג": 3,
  "ד'": 4, "ד": 4,
  "ה'": 5, "ה": 5
};

// Category mapping - maps Hebrew row labels to app categories
const CATEGORY_MAPPING = {
  // Soups
  'מרקים': 'soups',
  'מרק עוף': 'soups',
  'מרק': 'soups',
  
  // Main dishes
  'התבשיליה': 'main',
  'עמדת גריל': 'main',
  'גריל': 'main',
  'עמדת ספיישל יומית': 'main',
  'ספיישל יומית': 'main',
  'ספיישל': 'main',
  'עיקריות': 'main',
  
  // Plant-based
  'עמדת צימחוני טבעוני': 'plantBased',
  'צמחוני טבעוני': 'plantBased',
  'צמחוני': 'plantBased',
  'טבעוני': 'plantBased',
  
  // Fish
  'עמדת דג יומית': 'fish',
  'דג יומית': 'fish',
  'דג היום': 'fish',
  'דגים': 'fish',
  
  // Side dishes (NEW)
  'תוספות': 'sides',
  'פחמימה': 'sides',
  'פחמימת בריאות': 'sides',
  'ירקניה': 'sides',
  'תוספת': 'sides',
  
  // Salads (NEW)
  'סלטים': 'salads',
  'טחינה': 'salads',
  'חומוס': 'salads',
  'סלט': 'salads',
  'מטבוחה': 'salads',
  'מיונז': 'salads',
  'מורכב': 'salads',
  'סלט בריא': 'salads',
  'חמוצי השף': 'salads',
  
  // Desserts
  'קינוחים': 'desserts',
  'קינוח פרי': 'desserts',
  'קינוח בית': 'desserts',
  'קינוח משתנה': 'desserts',
  'מתוקים': 'desserts'
};

// Categories to skip (not food items)
const SKIP_CATEGORIES = ['גולדיס גלאט'];

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

/** Excel/Drive exports often use row 1 as ",יום ראשון,יום שני,…" with an empty first cell. */
function hasWeeklyDayHeaderRow(row) {
  if (!row || row.length < 3) return false;
  let hits = 0;
  for (let i = 1; i <= 5 && i < row.length; i++) {
    const t = (row[i] || '').trim();
    if (!t) continue;
    if (/יום (ראשון|שני|שלישי|רביעי|חמישי)/.test(t)) hits++;
    else if (["א'", "ב'", "ג'", "ד'", "ה'"].includes(t)) hits++;
  }
  return hits >= 2;
}

function startOfWeekSunday(d) {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

// --- 4. CSV PROCESSING ---
async function processCSV() {
  console.log('📄 Reading CSV file...');
  const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
  const rows = parse(fileContent, { skip_empty_lines: false, relax_quotes: true, relax_column_count: true });

  // Detect format: old format has date range in A1, new format has "פריט" or Hebrew weekday column headers
  const firstCell = rows[0][0]?.trim() || '';
  const isNewFormat =
    firstCell === 'פריט' ||
    firstCell.includes('פריט') ||
    hasWeeklyDayHeaderRow(rows[0]);

  let startDate;

  if (isNewFormat) {
    // New format: no date range in A1 — anchor week to "today" in the runner's timezone (GitHub: UTC)
    console.log('📋 Detected new menu format (item column or weekday header row)');
    startDate = startOfWeekSunday(new Date());
    console.log(`📅 Using current week starting: ${formatDateISO(startDate)}`);
  } else {
    // Old format: parse date range from header (e.g., "01.02.2026-05.02.2026")
    console.log('📋 Detected old menu format (date range header)');
    const dateRange = firstCell;
    const [startDateStr, endDateStr] = dateRange.split('-').map(s => s.trim());
    startDate = parseDate(startDateStr);
    console.log(`📅 Week: ${startDateStr} to ${endDateStr}`);
  }

  if (Number.isNaN(startDate.getTime())) {
    console.warn('⚠️ Invalid week start from CSV; using Sunday-based week from today.');
    startDate = startOfWeekSunday(new Date());
  }

  // Initialize menu data structure with new categories
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
      desserts: [],
      sides: [],    // NEW: side dishes
      salads: []    // NEW: salads
    };
  }

  // Process each row
  let lastCategory = null;
  
  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0) return; // Skip header row
    
    const rowLabel = row[0]?.trim();
    
    // Skip empty rows and skip categories
    if (!rowLabel && !lastCategory) return;
    if (SKIP_CATEGORIES.some(skip => rowLabel?.includes(skip))) {
      lastCategory = null;
      return;
    }
    
    // Check if this row defines a category
    if (rowLabel) {
      let foundCategory = false;
      for (const [key, category] of Object.entries(CATEGORY_MAPPING)) {
        if (rowLabel.includes(key) || key.includes(rowLabel)) {
          lastCategory = category;
          foundCategory = true;
          break;
        }
      }
      // If row label is a section header (like "עיקריות", "תוספות", "סלטים", "קינוחים"), skip the row itself
      if (['עיקריות', 'תוספות', 'סלטים', 'קינוחים'].includes(rowLabel)) {
        return;
      }
    }
    
    if (!lastCategory) return;
    
    // Process each day column (columns 1-5)
    for (let col = 1; col <= 5; col++) {
      let dish = row[col]?.trim();
      
      // Clean up multi-line content (common in new format)
      if (dish) {
        dish = dish.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      }
      
      const currentDate = addDays(startDate, col - 1);
      const dateKey = formatDateISO(currentDate);
      
      if (dish && dish !== '' && dish !== '-' && menuData[dateKey] && menuData[dateKey][lastCategory]) {
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
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Cannot write menu JSON: invalid week start date');
  }
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
    const totalDishes = (content.main?.length || 0) + 
                        (content.plantBased?.length || 0) + 
                        (content.fish?.length || 0) + 
                        (content.soups?.length || 0) +
                        (content.sides?.length || 0) +
                        (content.salads?.length || 0);
    
    if (totalDishes > 0) {
      console.log(`🚀 Uploading ${date} (${content.dayName}): ${content.main?.length || 0} main, ${content.plantBased?.length || 0} 🌱, ${content.fish?.length || 0} 🐟, ${content.sides?.length || 0} sides, ${content.salads?.length || 0} salads`);
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
      const mainCount = day.main?.length || 0;
      const plantCount = day.plantBased?.length || 0;
      const fishCount = day.fish?.length || 0;
      const soupCount = day.soups?.length || 0;
      const dessertCount = day.desserts?.length || 0;
      const sidesCount = day.sides?.length || 0;
      const saladsCount = day.salads?.length || 0;
      console.log(`  ${day.dayName} (${date}): ${mainCount} main, ${plantCount} 🌱, ${fishCount} 🐟, ${soupCount} 🥣, ${dessertCount} 🍰, ${sidesCount} sides, ${saladsCount} salads`);
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
