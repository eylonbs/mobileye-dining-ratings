# Automated Menu PDF Upload - Setup Guide

This guide explains how to set up the automated PDF upload system for the Mobileye Dining app.

## Overview

```
Operations Team → Google Drive → GitHub Actions → App Updated
```

## Step 1: Google Drive menu folder

Production menu uploads use this folder (team drops the weekly file here):

- **Folder**: [Mobileye menu inbox on Drive](https://drive.google.com/drive/folders/10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh)
- **Folder ID** (for Apps Script + GitHub): `10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh`

Share that folder with:

- Operations people who upload menus (Editor or Content manager as you prefer)
- The Google Cloud **service account** email (Viewer is enough for the import script)

## Step 2: Create Google Cloud Service Account

This allows GitHub Actions to access the Google Drive folder.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing): "Mobileye Menu Automation"
3. Enable the **Google Drive API**:
   - Go to APIs & Services → Library
   - Search for "Google Drive API"
   - Click Enable
4. Create a Service Account:
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → "Service Account"
   - Name: `menu-uploader`
   - Click Create and Continue
   - Skip the optional steps, click Done
5. Create a Key:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Add Key → Create new key → JSON
   - Download the JSON file (keep it safe!)
6. Share the **production menu folder** with the service account:
   - Copy the service account email (looks like: `menu-uploader@project.iam.gserviceaccount.com`)
   - Open the [menu folder](https://drive.google.com/drive/folders/10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh) → Share
   - Add the service account with **Viewer** access

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository: https://github.com/eylonbs/mobileye-dining-ratings
2. Click Settings → Secrets and variables → Actions
3. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `GOOGLE_SERVICE_ACCOUNT` | Paste the entire JSON content from the key file |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional: `10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh` (the parser defaults to this if omitted) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin JSON (used by `scrape-and-upload.js` to write `menu-data-*.json` and Firestore) |

The GitHub token for Drive → `repository_dispatch` lives in **Google Apps Script** (script property `GITHUB_PAT`), not in GitHub Actions secrets.

### Creating a GitHub Personal Access Token (PAT):
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Name: "Menu Upload Webhook"
4. Select scope: **`repo`** (classic), **or** a fine-grained token on this repo with **Contents: Read and write** (required for [`repository_dispatch`](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event))
5. Copy the token — you will paste it into Apps Script as property **`GITHUB_PAT`** (see **Step 4** below).

## Step 4: Set Up Google Apps Script

1. Open the [menu folder on Drive](https://drive.google.com/drive/folders/10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh)
2. Click New → More → Google Apps Script
3. Delete any existing code and paste this:

```javascript
// ===== CONFIGURATION =====
const GITHUB_OWNER = 'eylonbs';
const GITHUB_REPO = 'mobileye-dining-ratings';
// Best: Project Settings → Script properties → add GITHUB_PAT (do not commit a real token).
// Fallback for quick tests only:
const GITHUB_PAT_FALLBACK = 'YOUR_GITHUB_PAT_HERE';

function githubPat() {
  const p = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (p) return p;
  return GITHUB_PAT_FALLBACK;
}

function isMenuFileName(fileName) {
  const n = fileName.toLowerCase();
  return n.endsWith('.pdf') || n.endsWith('.csv') || n.endsWith('.xlsx') || n.endsWith('.xls');
}

// ===== MAIN FUNCTION =====
function onFileUpload(e) {
  const file = e.source;
  const fileName = file.getName();

  if (!isMenuFileName(fileName)) {
    console.log('Skipping non-menu file:', fileName);
    return;
  }

  console.log('New menu file uploaded:', fileName);

  // Trigger GitHub Actions
  triggerGitHubWorkflow(file.getId(), fileName);
}

function triggerGitHubWorkflow(fileId, fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;
  const pat = githubPat();
  if (!pat || pat.indexOf('YOUR_GITHUB') === 0) {
    console.error('Configure GITHUB_PAT in Script properties or GITHUB_PAT_FALLBACK');
    return;
  }

  const payload = {
    event_type: 'menu-pdf-upload',
    client_payload: {
      file_id: fileId,
      file_name: fileName
    }
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code === 204) {
      console.log('GitHub repository_dispatch accepted (204). Open Actions → Daily Menu Update.');
    } else {
      console.error('GitHub dispatch failed HTTP', code, body);
    }
  } catch (error) {
    console.error('Failed to trigger GitHub workflow:', error);
  }
}

// ===== SETUP TRIGGER =====
function setupTrigger() {
  // Must match the shared menu folder (same ID as GitHub secret / parse script)
  const folderId = '10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh';
  
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create a time-based trigger that checks for new files every 5 minutes
  ScriptApp.newTrigger('checkForNewFiles')
    .timeDriven()
    .everyMinutes(5)
    .create();
  
  // Store folder ID in script properties
  PropertiesService.getScriptProperties().setProperty('FOLDER_ID', folderId);
  
  console.log('Trigger set up successfully!');
}

function checkForNewFiles() {
  const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const lastCheck = PropertiesService.getScriptProperties().getProperty('LAST_CHECK');
  const lastCheckDate = lastCheck ? new Date(lastCheck) : new Date(0);
  
  // Get files modified after last check
  const files = folder.getFiles();
  let newFileFound = false;
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    
    if (!isMenuFileName(fileName)) continue;
    
    const modifiedDate = file.getLastUpdated();
    
    if (modifiedDate > lastCheckDate) {
      console.log('New/updated menu file found:', fileName);
      triggerGitHubWorkflow(file.getId(), fileName);
      newFileFound = true;
    }
  }
  
  // Update last check time
  PropertiesService.getScriptProperties().setProperty('LAST_CHECK', new Date().toISOString());
  
  if (!newFileFound) {
    console.log('No new menu files found');
  }
}
```

4. Add a **Script property** `GITHUB_PAT` (recommended): Project Settings (gear) → Script properties → Add `GITHUB_PAT` = your token. You can leave `GITHUB_PAT_FALLBACK` as the placeholder.
5. Save the script (Ctrl+S or Cmd+S)
6. Run the `setupTrigger` function:
   - Click the function dropdown (next to Debug)
   - Select `setupTrigger`
   - Click Run
   - Authorize the script when prompted

## How to Use

Once set up, the operations team simply:

1. Opens the [menu folder on Drive](https://drive.google.com/drive/folders/10ci6Q2Q8-rGd4QRnV9CF4l2_FUDAAEhh)
2. Uploads the weekly menu as **PDF**, **CSV**, or **Excel** (`.xlsx` / `.xls`) — same formats `scripts/parse-pdf-menu.js` supports
3. Within a few minutes (Apps Script poll + Actions), `menu.csv` / `menu-data-*.json` update and GitHub Pages picks up the new commit

## Troubleshooting

### Check if it's working:
1. Go to GitHub → **Actions** tab
2. Open workflow **Daily Menu Update** (runs after each Drive upload webhook, on schedule, or when `menu.csv` / the scraper script changes)
3. Open the latest run → confirm **parse-pdf** (on Drive upload) then **update-menu** both succeed; you should see a new commit updating `menu-data-*.json`

### Common issues:
- **PDF not parsed correctly**: Make sure the PDF has a clear table structure
- **Workflow not triggered**: In Apps Script, run **Executions** and confirm `checkForNewFiles` runs every 5 minutes; fix any HTTP 401/403 in logs (PAT or token scope). You can run `triggerGitHubWorkflow` manually with a file ID to test.
- **Authentication errors**: Classic PAT needs **`repo`** scope; fine-grained needs **Contents: Read and write** on `mobileye-dining-ratings`
- **JSON not updating after parse**: Ensure **Daily Menu Update** run shows **update-menu** on the latest commit (workflow now hard-resets to `origin/<branch>` so it always picks up the new `menu.csv` from **parse-pdf**)

## Manual Fallback

If the PDF parsing fails, you can still manually edit `menu.csv` in the repository.
