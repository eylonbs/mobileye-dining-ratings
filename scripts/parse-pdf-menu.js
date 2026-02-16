import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

// --- 1. CONFIGURATION ---
const CSV_OUTPUT_PATH = './menu.csv';

// Hebrew day names mapping (both long and short forms)
const DAY_NAMES_HE = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי'];
const DAY_NAMES_SHORT = ["א'", "ב'", "ג'", "ד'", "ה'"];

// Category keywords for detecting rows - expanded for new format
const CATEGORY_KEYWORDS = {
  // Soups
  'מרקים': 'מרקים',
  'מרק עוף': 'מרקים',
  'מרק': 'מרקים',
  
  // Main dishes
  'התבשיליה': 'התבשיליה',
  'עמדת גריל': 'עמדת גריל',
  'גריל': 'עמדת גריל',
  'עמדת ספיישל': 'עמדת ספיישל יומית',
  'ספיישל': 'עמדת ספיישל יומית',
  'עיקריות': 'עיקריות',
  
  // Plant-based
  'צימחוני טבעוני': 'עמדת צימחוני טבעוני',
  'צימחוני': 'עמדת צימחוני טבעוני',
  'טבעוני': 'עמדת צימחוני טבעוני',
  
  // Fish
  'דג יומית': 'עמדת דג יומית',
  'דגים': 'עמדת דג יומית',
  
  // Side dishes (NEW)
  'תוספות': 'תוספות',
  'פחמימה': 'תוספות',
  'ירקניה': 'תוספות',
  'תוספת': 'תוספות',
  
  // Salads (NEW)
  'סלטים': 'סלטים',
  'טחינה': 'סלטים',
  'חומוס': 'סלטים',
  'סלט': 'סלטים',
  'מטבוחה': 'סלטים',
  'מיונז': 'סלטים',
  'חמוצי': 'סלטים',
  
  // Desserts
  'קינוחים': 'קינוחים',
  'קינוח': 'קינוחים',
  'מתוקים': 'קינוחים'
};

// --- 2. GOOGLE DRIVE AUTHENTICATION ---
async function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  
  return auth;
}

// --- 3. DOWNLOAD PDF FROM GOOGLE DRIVE ---
async function downloadPDF(fileId) {
  console.log('📥 Downloading PDF from Google Drive...');
  
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  
  // Get file metadata
  const fileMetadata = await drive.files.get({
    fileId,
    fields: 'name, mimeType'
  });
  
  console.log(`📄 File: ${fileMetadata.data.name}`);
  
  // Download file content
  const response = await drive.files.get({
    fileId,
    alt: 'media'
  }, {
    responseType: 'arraybuffer'
  });
  
  const pdfBuffer = Buffer.from(response.data);
  const tempPath = `/tmp/menu-${Date.now()}.pdf`;
  fs.writeFileSync(tempPath, pdfBuffer);
  
  console.log(`✅ Downloaded PDF (${pdfBuffer.length} bytes)`);
  
  return { pdfBuffer, tempPath, fileName: fileMetadata.data.name };
}

// --- 4. PARSE PDF TABLE ---
async function parsePDFTable(pdfBuffer) {
  console.log('🔍 Parsing PDF content...');
  
  const data = await pdfParse(pdfBuffer);
  const text = data.text;
  
  console.log('📝 Extracted text length:', text.length);
  
  // Split into lines and clean up
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  return lines;
}

// --- 5. EXTRACT DATE RANGE ---
function extractDateRange(lines) {
  // Look for date pattern like "01.02.2026-05.02.2026" or "01/02/2026-05/02/2026"
  const datePattern = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})\s*[-–]\s*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/;
  
  for (const line of lines) {
    const match = line.match(datePattern);
    if (match) {
      // Normalize to DD.MM.YYYY format
      const startDate = match[1].replace(/\//g, '.');
      const endDate = match[2].replace(/\//g, '.');
      console.log(`📅 Found date range: ${startDate} - ${endDate}`);
      return `${startDate}-${endDate}`;
    }
  }
  
  // If no date found, generate from current week (Sunday-Thursday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  const thursday = new Date(sunday);
  thursday.setDate(sunday.getDate() + 4);
  
  const formatDate = (d) => {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };
  
  const dateRange = `${formatDate(sunday)}-${formatDate(thursday)}`;
  console.log(`📅 Generated date range: ${dateRange}`);
  return dateRange;
}

// --- 6. STRUCTURE MENU DATA ---
function structureMenuData(lines) {
  console.log('🏗️ Structuring menu data...');
  
  const categories = {
    'מרקים': [],
    'התבשיליה': [],
    'עמדת גריל': [],
    'עמדת צימחוני טבעוני': [],
    'עמדת דג יומית': [],
    'עמדת ספיישל יומית': [],
    'תוספות': [],
    'סלטים': [],
    'קינוחים': []
  };
  
  let currentCategory = null;
  let currentDayIndex = -1;
  
  // Initialize 5 days for each category
  Object.keys(categories).forEach(cat => {
    categories[cat] = [[], [], [], [], []];
  });
  
  for (const line of lines) {
    // Check for day headers (both long and short forms)
    let dayIndex = DAY_NAMES_HE.findIndex(day => line.includes(day));
    if (dayIndex === -1) {
      dayIndex = DAY_NAMES_SHORT.findIndex(day => line.includes(day));
    }
    if (dayIndex !== -1) {
      currentDayIndex = dayIndex;
      continue;
    }
    
    // Check for category headers
    let foundCategory = false;
    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (line.includes(keyword)) {
        currentCategory = category;
        foundCategory = true;
        break;
      }
    }
    
    if (foundCategory) continue;
    
    // If we have a current category and valid day, this might be a dish
    if (currentCategory && currentDayIndex >= 0 && currentDayIndex < 5) {
      // Filter out noise (very short lines, headers, etc.)
      if (line.length > 3 && !line.match(/^\d+$/) && !line.includes('עמוד')) {
        // Clean up the dish name
        const dishName = line
          .replace(/^\s*[-•]\s*/, '') // Remove bullet points
          .replace(/\s+/g, ' ')        // Normalize whitespace
          .trim();
        
        if (dishName.length > 2 && categories[currentCategory]) {
          categories[currentCategory][currentDayIndex].push(dishName);
        }
      }
    }
  }
  
  return categories;
}

// --- 7. CONVERT TO CSV FORMAT ---
function convertToCSV(dateRange, categories) {
  console.log('📊 Converting to CSV format...');
  
  const rows = [];
  
  // Header row with date range and day names
  rows.push([dateRange, ...DAY_NAMES_HE, ''].join(','));
  
  // Category order (expanded with new categories)
  const categoryOrder = [
    'מרקים',
    'התבשיליה',
    'עמדת גריל',
    'עמדת צימחוני טבעוני',
    'עמדת דג יומית',
    'עמדת ספיישל יומית',
    'תוספות',
    'סלטים',
    'קינוחים'
  ];
  
  for (const category of categoryOrder) {
    const dishes = categories[category] || [[], [], [], [], []];
    
    // Find max number of items in any day for this category
    const maxItems = Math.max(...dishes.map(d => d.length), 1);
    
    for (let i = 0; i < maxItems; i++) {
      const row = [];
      
      // First column is category name (only for first row of category)
      row.push(i === 0 ? category : '');
      
      // Add dish for each day
      for (let day = 0; day < 5; day++) {
        const dish = dishes[day][i] || '';
        // Escape commas and quotes in dish names
        const escapedDish = dish.includes(',') || dish.includes('"') 
          ? `"${dish.replace(/"/g, '""')}"` 
          : dish;
        row.push(escapedDish);
      }
      
      row.push(''); // Empty last column
      rows.push(row.join(','));
    }
  }
  
  return rows.join('\n');
}

// --- 8. FALLBACK: SIMPLE TEXT-TO-CSV ---
function simplePDFToCSV(text, dateRange) {
  console.log('⚠️ Using simple text extraction fallback...');
  
  // This is a simpler approach that works better with some PDF formats
  // It looks for table-like structures and converts them
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const categories = {
    'מרקים': [[], [], [], [], []],
    'התבשיליה': [[], [], [], [], []],
    'עמדת גריל': [[], [], [], [], []],
    'עמדת צימחוני טבעוני': [[], [], [], [], []],
    'עמדת דג יומית': [[], [], [], [], []],
    'עמדת ספיישל יומית': [[], [], [], [], []],
    'תוספות': [[], [], [], [], []],
    'סלטים': [[], [], [], [], []],
    'קינוחים': [[], [], [], [], []]
  };
  
  let currentCategory = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect category
    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (line.includes(keyword)) {
        currentCategory = category;
        break;
      }
    }
    
    // If line looks like it has multiple items separated by tabs or multiple spaces
    if (currentCategory && categories[currentCategory]) {
      const parts = line.split(/\t+|\s{2,}/).filter(p => p.trim().length > 2);
      
      if (parts.length >= 2 && parts.length <= 6) {
        // Skip if this is just the category name
        let isCategoryLine = false;
        for (const keyword of Object.keys(CATEGORY_KEYWORDS)) {
          if (parts[0].includes(keyword)) {
            isCategoryLine = true;
            break;
          }
        }
        
        if (!isCategoryLine) {
          for (let day = 0; day < Math.min(parts.length, 5); day++) {
            const dish = parts[day].trim();
            if (dish.length > 2 && !DAY_NAMES_HE.includes(dish) && !DAY_NAMES_SHORT.includes(dish)) {
              categories[currentCategory][day].push(dish);
            }
          }
        }
      }
    }
  }
  
  return convertToCSV(dateRange, categories);
}

// --- 9. MAIN EXECUTION ---
async function main() {
  const fileId = process.env.PDF_FILE_ID;
  
  if (!fileId) {
    console.log('❌ No PDF_FILE_ID provided');
    process.exit(1);
  }
  
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.log('❌ No GOOGLE_SERVICE_ACCOUNT provided');
    process.exit(1);
  }
  
  try {
    // Download PDF
    const { pdfBuffer, tempPath, fileName } = await downloadPDF(fileId);
    
    // Parse PDF
    const data = await pdfParse(pdfBuffer);
    const text = data.text;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    console.log('\n📝 PDF Text Preview (first 500 chars):');
    console.log(text.substring(0, 500));
    console.log('\n');
    
    // Extract date range
    const dateRange = extractDateRange(lines);
    
    // Try structured parsing first
    let csvContent;
    const categories = structureMenuData(lines);
    
    // Check if we got meaningful data
    const totalDishes = Object.values(categories).reduce(
      (sum, cat) => sum + cat.reduce((s, day) => s + day.length, 0), 
      0
    );
    
    if (totalDishes >= 5) {
      console.log(`✅ Structured parsing found ${totalDishes} dishes`);
      csvContent = convertToCSV(dateRange, categories);
    } else {
      console.log('⚠️ Structured parsing found few dishes, trying fallback...');
      csvContent = simplePDFToCSV(text, dateRange);
    }
    
    // Write CSV file
    fs.writeFileSync(CSV_OUTPUT_PATH, csvContent, 'utf-8');
    console.log(`\n💾 Saved CSV to ${CSV_OUTPUT_PATH}`);
    
    // Print CSV preview
    console.log('\n📊 CSV Preview:');
    console.log(csvContent.split('\n').slice(0, 10).join('\n'));
    
    // Cleanup
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    
    console.log('\n✨ PDF parsing completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
