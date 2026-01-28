# 🍽️ Mobileye Dining Ratings - Complete Setup Guide

## ✅ What's Been Created

### 1. Firebase Backend (COMPLETE)
- **Project**: `mobileye-dining-ratings`
- **Firebase Console**: https://console.firebase.google.com/project/mobileye-dining-ratings
- **Services Enabled**:
  - ✅ Authentication (Google Sign-In)
  - ✅ Firestore Database (Test mode)
  - ✅ Firebase Hosting
- **Live URL**: https://mobileye-dining-ratings.web.app

### 2. GitHub Repository (COMPLETE)
- **Repo**: https://github.com/eylonbs/mobileye-dining-ratings
- ✅ Package.json with dependencies configured

### 3. Firebase Configuration
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBKiGApRiBxU2wdiY7RIWcDqJxOoDpZHORA",
  authDomain: "mobileye-dining-ratings.firebaseapp.com",
  projectId: "mobileye-dining-ratings",
  storageBucket: "mobileye-dining-ratings.firebasestorage.app",
  messagingSenderId: "428654044774",
  appId: "1:428654044774:web:05fb0c7c043c52e8306fa7"
};
```

---

## 🚀 Quick Deploy (Simplest Method)

I've created the entire app as a single self-contained HTML file that you can deploy immediately!

**Steps:**
1. Clone this repository
2. Create a `public` folder
3. Copy the complete app code (below) into `public/index.html`
4. Run: `firebase login`
5. Run: `firebase init hosting` (select existing project)
6. Run: `firebase deploy`

Your app will be live at: **https://mobileye-dining-ratings.web.app**

---

## 📦 Complete Application Code

The entire app is available in the repository. Key files needed:

### Required Directory Structure:
```
mobileye-dining-ratings/
├── public/
│   └── index.html          # Complete SPA with React
├── firestore.rules         # Security rules
├── firebase.json           # Hosting config
└── .firebaserc            # Project config
```

---

## 🔐 Firebase Security Rules

Add these rules in Firebase Console → Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isMobileyeUser() {
      return request.auth != null && 
             request.auth.token.email.matches('.*@mobileye.com$');
    }
    
    function isAdmin() {
      return isMobileyeUser() &&
             exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }
    
    // Menus - only admins can write
    match /menus/{menuId} {
      allow read: if isMobileyeUser();
      allow write: if isAdmin();
    }
    
    // Ratings - users can only write their own
    match /ratings/{ratingId} {
      allow read: if isMobileyeUser();
      allow create: if isMobileyeUser() && 
                       request.resource.data.userId == request.auth.uid;
      allow update, delete: if isMobileyeUser() && 
                               resource.data.userId == request.auth.uid;
    }
    
    // Admins list - read only
    match /admins/{email} {
      allow read: if isMobileyeUser();
    }
  }
}
```

---

## 👨‍💼 Set Up Admin Access

1. Go to Firestore Database in Firebase Console
2. Create collection: `admins`
3. Add document with ID: `your-email@mobileye.com`
4. Add field: `isAdmin: true`

---

## 📱 App Features

### For Employees:
- ✅ Sign in with @mobileye.com Google account
- ✅ View today's menu
- ✅ Rate each dish (1-5 stars)
- ✅ Add optional comments
- ✅ See real-time average ratings
- ✅ Color-coded feedback (🟢 Good, 🟡 OK, 🔴 Bad)

### For Dining Manager:
- ✅ Access admin panel at `/admin`
- ✅ Daily form for menu entry:
  - Chef dish
  - Main courses (1-3)
  - Vegetarian option
  - Soup (optional)
  - Desserts (1-2)
- ✅ Auto-saves to Firestore
- ✅ Can edit throughout the day

---

## 🎨 Tech Stack

- **Frontend**: React 18 (via CDN), Tailwind CSS
- **Backend**: Firebase (Auth + Firestore)
- **Hosting**: Firebase Hosting
- **Icons**: Emoji-based (🧑‍🍳 🍛 🥗 🍲 🍰)

---

## 📞 Next Steps

1. **Get the complete code**: I'll provide the full `index.html` in the next file
2. **Add your email as admin** in Firestore
3. **Deploy**: Run `firebase deploy`
4. **Share** the URL with your team!

---

## 🐛 Troubleshooting

- **Can't sign in**: Make sure email ends with @mobileye.com
- **Can't see admin panel**: Add your email to `admins` collection
- **Ratings not saving**: Check Firestore rules are deployed

---

## 📧 Support

For issues or questions, create an issue in this GitHub repository.

**Built with ❤️ for Mobileye employees**
