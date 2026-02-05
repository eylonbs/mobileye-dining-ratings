import admin from 'firebase-admin';
import fs from 'fs';

// --- INITIALIZATION ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// --- CONFIGURATION ---
// Get JSON file path from command line or use default
const jsonFile = process.argv[2] || './menu-data-feb-2026.json';

async function main() {
  try {
    console.log(`📄 Reading ${jsonFile}...`);
    
    if (!fs.existsSync(jsonFile)) {
      console.log(`❌ File not found: ${jsonFile}`);
      process.exit(1);
    }

    const menuData = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    const dates = Object.keys(menuData);

    console.log(`📅 Found ${dates.length} days of menu data\n`);

    for (const date of dates) {
      const content = menuData[date];
      const stats = {
        main: content.main?.length || 0,
        plantBased: content.plantBased?.length || 0,
        fish: content.fish?.length || 0,
        soups: content.soups?.length || 0,
        desserts: content.desserts?.length || 0
      };
      
      console.log(`🚀 Uploading ${date} (${content.dayName}): ${stats.main} main, ${stats.plantBased} 🌱, ${stats.fish} 🐟, ${stats.soups} 🥣, ${stats.desserts} 🍰`);
      
      await db.collection('menus').doc(date).set(content);
    }

    console.log('\n✨ Firebase updated successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

