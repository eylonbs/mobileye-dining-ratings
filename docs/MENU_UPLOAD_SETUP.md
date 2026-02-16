# Automated Menu PDF Upload - Setup Guide

This guide explains how to set up the automated PDF upload system for the Mobileye Dining app.

## Overview

```
Operations Team → Google Drive → GitHub Actions → App Updated
```

## Step 1: Create Google Drive Shared Folder

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder called **"Mobileye Menu Uploads"**
3. Right-click the folder → **Share**
4. Add the operations team members who will upload menus
5. **Important**: Copy the folder ID from the URL:
   - URL looks like: `https://drive.google.com/drive/folders/1ABC123xyz...`
   - The folder ID is: `1ABC123xyz...`

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
6. Share the Drive folder with the service account:
   - Copy the service account email (looks like: `menu-uploader@project.iam.gserviceaccount.com`)
   - Go back to Google Drive
   - Share the "Mobileye Menu Uploads" folder with this email
   - Give it "Viewer" access

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository: https://github.com/eylonbs/mobileye-dining-ratings
2. Click Settings → Secrets and variables → Actions
3. Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `GOOGLE_SERVICE_ACCOUNT` | Paste the entire JSON content from the key file |
| `GOOGLE_DRIVE_FOLDER_ID` | The folder ID from Step 1 |
| `GITHUB_PAT` | A Personal Access Token (for the Apps Script webhook) |

### Creating a GitHub Personal Access Token (PAT):
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Name: "Menu Upload Webhook"
4. Select scope: `repo` (full control of private repositories)
5. Copy the token and save it as `GITHUB_PAT` secret

## Step 4: Set Up Google Apps Script

1. Go to the Google Drive folder you created
2. Click New → More → Google Apps Script
3. Delete any existing code and paste this:

```javascript
// ===== CONFIGURATION =====
const GITHUB_OWNER = 'eylonbs';
const GITHUB_REPO = 'mobileye-dining-ratings';
const GITHUB_PAT = 'YOUR_GITHUB_PAT_HERE'; // Replace with your token

// ===== MAIN FUNCTION =====
function onFileUpload(e) {
  const file = e.source;
  const fileName = file.getName();
  
  // Only process PDF files
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    console.log('Skipping non-PDF file:', fileName);
    return;
  }
  
  console.log('New PDF uploaded:', fileName);
  
  // Trigger GitHub Actions
  triggerGitHubWorkflow(file.getId(), fileName);
}

function triggerGitHubWorkflow(fileId, fileName) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;
  
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
      'Authorization': `Bearer ${GITHUB_PAT}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    console.log('GitHub workflow triggered successfully:', response.getResponseCode());
  } catch (error) {
    console.error('Failed to trigger GitHub workflow:', error);
  }
}

// ===== SETUP TRIGGER =====
function setupTrigger() {
  // Get the folder ID
  const folderId = 'YOUR_FOLDER_ID_HERE'; // Replace with your folder ID
  
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
    
    // Only process PDF files
    if (!fileName.toLowerCase().endsWith('.pdf')) continue;
    
    const modifiedDate = file.getLastUpdated();
    
    if (modifiedDate > lastCheckDate) {
      console.log('New/updated PDF found:', fileName);
      triggerGitHubWorkflow(file.getId(), fileName);
      newFileFound = true;
    }
  }
  
  // Update last check time
  PropertiesService.getScriptProperties().setProperty('LAST_CHECK', new Date().toISOString());
  
  if (!newFileFound) {
    console.log('No new PDF files found');
  }
}
```

4. Replace `YOUR_GITHUB_PAT_HERE` with your GitHub PAT
5. Replace `YOUR_FOLDER_ID_HERE` with your Google Drive folder ID
6. Save the script (Ctrl+S or Cmd+S)
7. Run the `setupTrigger` function:
   - Click the function dropdown (next to Debug)
   - Select `setupTrigger`
   - Click Run
   - Authorize the script when prompted

## How to Use

Once set up, the operations team simply:

1. Opens the "Mobileye Menu Uploads" folder in Google Drive
2. Drags and drops the weekly menu PDF
3. Within 5 minutes, the app automatically updates!

## Troubleshooting

### Check if it's working:
1. Go to GitHub → Actions tab
2. Look for "Menu PDF Upload" workflow runs
3. Check the logs for any errors

### Common issues:
- **PDF not parsed correctly**: Make sure the PDF has a clear table structure
- **Workflow not triggered**: Check the Apps Script logs (View → Logs)
- **Authentication errors**: Verify the GitHub PAT has `repo` scope

## Manual Fallback

If the PDF parsing fails, you can still manually edit `menu.csv` in the repository.
