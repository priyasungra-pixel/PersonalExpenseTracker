// =====================================================
// Google Apps Script - Deploy as Web App
// =====================================================
// SETUP INSTRUCTIONS:
// 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1OUk4L1PIcgqZL7pKUCP541qFEq8tkmci_OP-HxdgA20/edit
// 2. In the top menu, click: Extensions > Apps Script
// 3. Delete any code in the editor, and paste this entire code
// 4. Click the "Save" icon (or press Ctrl+S)
// 5. Click the "Deploy" button (top right) > Choose "New Deployment"
// 6. Click the gear icon next to "Select type" > Choose "Web App"
// 7. Configure:
//    - Description: Expense Tracker Web App
//    - Execute as: "Me (your-email@gmail.com)"
//    - Who has access: "Anyone"
// 8. Click "Deploy"
// 9. Google will ask for Authorization. Click "Authorize Access", select your Google account, click "Advanced" (bottom left), then click "Go to Expense Tracker (unsafe)", and click "Allow".
// 10. Copy the "Web App URL" (ends with /exec).
// 11. Open your Expense Tracker Settings page and paste the URL.
// =====================================================

const SHEET_NAME = 'Sheet1';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'append') {
      appendRow(data.row);
    } else if (data.action === 'clearAndSync') {
      clearAndSync(data.rows);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
    const lastRow = sheet.getLastRow();
    
    let rows = [];
    if (lastRow > 1) {
      const rawValues = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      rows = rawValues.map(row => {
        let dateVal = row[0];
        if (dateVal instanceof Date) {
          dateVal = Utilities.formatDate(dateVal, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else if (dateVal) {
          try {
            const d = new Date(dateVal);
            if (!isNaN(d.getTime())) {
              dateVal = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
            }
          } catch(e) {}
        }
        return [dateVal, row[1], row[2], row[3], row[4]];
      });
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: rows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function clearAndSync(rowsData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 5).clearContent();
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date', 'Title', 'Category', 'Bank', 'Amount']);
  }
  
  if (rowsData && rowsData.length > 0) {
    sheet.getRange(2, 1, rowsData.length, 5).setValues(rowsData);
  }
}

function appendRow(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

  // Ensure header row exists
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date', 'Title', 'Category', 'Bank', 'Amount']);
  }

  sheet.appendRow(row);
}
