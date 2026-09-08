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
const DEBTS_SHEET_NAME = 'Borrow/Lent';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'append') {
      appendRow(data.row);
    } else if (data.action === 'clearAndSync') {
      clearAndSync(data.rows, data.debts);
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

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Fetch Main Transactions
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

    // Fetch Debts
    let debtsRows = [];
    const debtsSheet = ss.getSheetByName(DEBTS_SHEET_NAME);
    if (debtsSheet) {
      const debtsLastRow = debtsSheet.getLastRow();
      if (debtsLastRow > 1) {
        const rawDebts = debtsSheet.getRange(2, 1, debtsLastRow - 1, 6).getValues();
        debtsRows = rawDebts.map(row => {
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
          return [dateVal, row[1], row[2], row[3], row[4], row[5]];
        });
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', data: { transactions: rows, debts: debtsRows } }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function clearAndSync(rowsData, debtsData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Sync Transactions
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

  // Sync Debts
  if (debtsData) {
    const debtsSheet = getOrCreateSheet(ss, DEBTS_SHEET_NAME);
    const debtsLastRow = debtsSheet.getLastRow();
    if (debtsLastRow > 1) {
      debtsSheet.getRange(2, 1, debtsLastRow - 1, 6).clearContent();
    }
    if (debtsSheet.getLastRow() === 0) {
      debtsSheet.appendRow(['Date', 'Name', 'Action', 'Bank', 'Amount', 'Remark']);
    }
    if (debtsData.length > 0) {
      debtsSheet.getRange(2, 1, debtsData.length, 6).setValues(debtsData);
    }
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
