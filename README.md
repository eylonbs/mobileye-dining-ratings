# 🍽️ Mobileye Dining Ratings

> Daily food rating app for Mobileye dining room - Rate your meals and help improve the menu!

**[🚀 Live App](https://eylonbs.github.io/mobileye-dining-ratings/)** | **[📱 Mobile-Friendly](https://eylonbs.github.io/mobileye-dining-ratings/)**

---

## 🌟 Overview

Mobileye Dining Ratings is a community-driven web application that allows Mobileye employees to rate their daily meals at the Terminal restaurant. The app automatically syncs the weekly menu from Mobilife and provides a platform for employees to share their dining experiences.

### ✨ Key Features

- 📅 **Automatic Menu Sync** - Daily automated menu updates from Mobilife
- ⭐ **Rate & Review** - Rate soups, main courses, and desserts with 1-5 stars
- 📊 **Leaderboard** - See the most popular and least popular dishes
- 🔐 **Admin Panel** - Manage users and moderate ratings
- 📱 **Mobile Responsive** - Works seamlessly on all devices
- 🌐 **Hebrew Support** - Full RTL support for Hebrew menu items

---

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Firebase (Firestore Database, Authentication)
- **Automation**: GitHub Actions, Puppeteer
- **Hosting**: GitHub Pages
- **Data Source**: Mobilife Terminal Menu

### Project Structure

```
mobileye-dining-ratings/
├── index.html              # Main app interface
├── menu-data-feb-2026.json # Static menu fallback
├── package.json            # Node.js dependencies
├── scripts/
│   └── scrape-and-upload.js # Menu scraping script
└── .github/
    └── workflows/
        └── daily-menu-update.yml # Automated workflow
```

---

## 🤖 Automated Menu Sync

### How It Works

1. **Daily Schedule**: GitHub Actions runs every day at 6:00 AM Israel time
2. **Web Scraping**: Puppeteer scrapes the Mobilife menu page in Hebrew
3. **Data Processing**: Script extracts soups, main courses, and desserts
4. **Firebase Upload**: Menu data is automatically uploaded to Firestore
5. **Real-time Update**: App displays the latest menu instantly

### Menu Categories Synced

- 🥣 **Soups** (מרקים)
- 🍗 **Main Courses**:
  - Daily Fish Station (עמדת דג יומי)
  - Vegan Station (עמדת צימחוני טבעוני)
  - Grill Station (עמדת גריל)
  - Daily Special (עמדת ספיישל יומית)
  - Hot Dishes (התבשיליה)
- 🍰 **Desserts** (קינוחים)

### Workflow Configuration

```yaml
name: Daily Menu Update
on:
  schedule:
    - cron: '0 4 * * *'  # 6 AM Israel time
  workflow_dispatch:  # Manual trigger
```

---

## 🔐 Firebase Integration

### Database Structure

```
firestore/
├── menus/
│   └── {date}/
│       ├── main: [dishes...]
│       ├── soups: [dishes...]
│       └── desserts: [dishes...]
├── ratings/
│   └── {ratingId}/
│       ├── dishName: string
│       ├── rating: number
│       ├── comment: string
│       ├── date: timestamp
│       └── userId: string
└── admins/
    └── {email}/
        └── isAdmin: boolean
```

### Security Rules

- ✅ All users can read menus
- ✅ Authenticated users can add ratings
- ✅ Users can only edit/delete their own ratings
- ✅ Only admins can manage admin list

---

## 🚀 Deployment

### GitHub Pages

The app is automatically deployed via GitHub Pages:
- **URL**: https://eylonbs.github.io/mobileye-dining-ratings/
- **Auto-deploy**: Every push to `main` branch triggers deployment
- **CDN**: Cloudflare CDN for fast global access

---

## 👨‍💻 Development

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

### Setup

1. Clone the repository
```bash
git clone https://github.com/eylonbs/mobileye-dining-ratings.git
cd mobileye-dining-ratings
```

2. Install dependencies
```bash
npm install
```

3. Run the scraper locally (requires Firebase credentials)
```bash
node scripts/scrape-and-upload.js
```

### Environment Variables

```bash
FIREBASE_SERVICE_ACCOUNT  # Firebase service account JSON
```

---

## 📦 Dependencies

### Production
- `firebase-admin`: ^13.0.2 - Firebase server SDK
- `puppeteer`: ^23.11.0 - Headless browser automation

### Module System
- Uses ES Modules (`"type": "module"` in package.json)
- Import/export syntax throughout codebase

---

## 🎯 Future Enhancements

- [ ] Push notifications for new menu updates
- [ ] Personalized dish recommendations
- [ ] Dietary preferences filtering (vegan, gluten-free, etc.)
- [ ] Photo uploads for dishes
- [ ] Social features (follow users, dish discussions)
- [ ] Analytics dashboard for management
- [ ] Multi-location support

---

## 📄 License

MIT License - Feel free to use this project for your organization!

---

## 🙏 Acknowledgments

- Mobileye employees for their valuable feedback
- Mobilife for providing the menu data
- GitHub Actions for reliable automation
- Firebase for seamless backend infrastructure

---

## 📞 Contact

For questions or suggestions, please open an issue on GitHub.

**Built with ❤️ for the Mobileye community**
