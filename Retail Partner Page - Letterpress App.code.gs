// =============================================================================
// PRINTS BY ANGEL — Retailer Page Backend
// This Code.gs lives in the SEPARATE "Letterpress Cards Retail Partner Page"
// Apps Script project. It only contains public-facing functions.
// Points to the same spreadsheet as the admin app.
// =============================================================================

const SPREADSHEET_ID = '1FiDZXPV6aimKpKUvzDCQczq01nCdvMZLzRhWq-DB50U';
const SPREADSHEET    = SpreadsheetApp.openById(SPREADSHEET_ID);

const VA_SALES_TAX = 0.053;

const WHOLESALE_PRICES = {
  'Folded Card':    3.00,
  'Folded':         3.00,
  'Flat':           2.00,
  'Note Card':      2.00,
  'Postcard':       2.00,
  '2-Notecard Set': 4.00,
  'Set':            4.00,
};

// =============================================================================
// ROUTER
// =============================================================================

// doGet — serves retailer.html when visited in a browser,
// OR returns JSON data when called with ?action=...
function doGet(e) {
  const action = e.parameter.action;

  // If no action param, serve the retailer HTML page
  if (!action) {
    return HtmlService
      .createHtmlOutputFromFile('retailer')
      .setTitle('Prints by Angel — Retail Partner Stock')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Otherwise handle API calls
  let result;
  switch (action) {
    case 'getPublicStock':   result = getPublicStock();                              break;
    case 'getTags':          result = getTags();                                     break;
    case 'searchRetailers':  result = searchRetailers(e.parameter.query);            break;
    default:
      result = { success: false, error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// doPost — handles form submissions (verify, submit order, partner request)
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Invalid JSON.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  let result;
  switch (payload.action) {
    case 'verifyRetailer':       result = verifyRetailer(payload.locationId, payload.email, payload.phone); break;
    case 'submitOrder':          result = submitOrder(payload.orderData);                                    break;
    case 'submitPartnerRequest': result = submitPartnerRequest(payload.requestData);                        break;
    default:
      result = { success: false, error: 'Unknown action: ' + payload.action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


// =============================================================================
// ITEMS — read only, used by getPublicStock
// =============================================================================

function getItems() {
  try {
    const sheet = SPREADSHEET.getSheetByName('Items');
    if (!sheet) return { success: false, error: 'Items sheet not found.' };
    const data    = sheet.getDataRange().getValues();
    const headers = data.shift();
    const items   = data.map(row => {
      const item = {};
      headers.forEach((h, i) => { item[h] = row[i]; });
      return item;
    }).filter(item => item.ItemID);
    return { success: true, items };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getItemTagsMap() {
  try {
    const sheet = SPREADSHEET.getSheetByName('ItemTags');
    if (!sheet) return {};
    const data = sheet.getDataRange().getValues();
    data.shift();
    const map = {};
    data.forEach(row => {
      const id = String(row[0]);
      if (!map[id]) map[id] = [];
      map[id].push(row[1]);
    });
    return map;
  } catch (e) {
    return {};
  }
}

// Returns map of itemId → total pending qty from unfulfilled orders
function getPendingStockMap() {
  try {
    const sheet = SPREADSHEET.getSheetByName('Orders');
    if (!sheet) return {};
    const data    = sheet.getDataRange().getValues();
    const headers = data.shift();
    const statusIdx = headers.indexOf('Status');
    const itemsIdx  = headers.indexOf('ItemsJSON');
    const map = {};
    data.forEach(row => {
      if (row[statusIdx] === 'Pending' || row[statusIdx] === 'In Progress') {
        try {
          JSON.parse(row[itemsIdx] || '[]').forEach(item => {
            const id = String(item.itemId);
            map[id] = (map[id] || 0) + parseInt(item.qty || 0);
          });
        } catch (e) {}
      }
    });
    return map;
  } catch (e) {
    return {};
  }
}

function getWholesalePrice(productType) {
  if (!productType) return 2.00;
  for (const [key, price] of Object.entries(WHOLESALE_PRICES)) {
    if (productType.toLowerCase().includes(key.toLowerCase())) return price;
  }
  return 2.00;
}

// Main public stock endpoint — what the retailer page loads
function getPublicStock() {
  try {
    const itemsResult = getItems();
    if (!itemsResult.success) return itemsResult;

    const tagMap     = getItemTagsMap();
    const pendingMap = getPendingStockMap();

    const stockItems = itemsResult.items
      .filter(item => (item.Active === true || item.Active === 'TRUE') && item.Status !== 'Retired')
      .map(item => {
        const pending   = pendingMap[String(item.ItemID)] || 0;
        const available = Math.max(0, (parseInt(item.StartingAtHome) || 0) - pending);
        return {
          itemId:         item.ItemID,
          displayName:    item.DisplayName || item.Name,
          photo:          item.Photo || '',
          productType:    item.ProductType || '',
          unitPrice:      item.UnitPrice || 0,
          totalStock:     parseInt(item.StartingAtHome) || 0,
          pending,
          available,
          tags:           tagMap[String(item.ItemID)] || [],
          wholesalePrice: getWholesalePrice(item.ProductType),
          createdAt:      item.CreatedAt || '',
          status:         item.Status || 'Open',
        };
      })
      .filter(item => item.totalStock > 0);

    return { success: true, items: stockItems };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// =============================================================================
// TAGS — for filter panel on retailer page
// =============================================================================

function getTags() {
  try {
    const sheet = SPREADSHEET.getSheetByName('Tags');
    if (!sheet) return { success: true, tags: [] };
    const data    = sheet.getDataRange().getValues();
    const headers = data.shift();
    const tags    = data.map(row => {
      const t = {};
      headers.forEach((h, i) => { t[h] = row[i]; });
      return t;
    }).filter(t => t.TagID && t.Active !== false);
    return { success: true, tags };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// =============================================================================
// PARTNER SEARCH — typeahead on retailer page
// =============================================================================

function getRetailPartners() {
  try {
    const sheet = SPREADSHEET.getSheetByName('Locations');
    if (!sheet) return { success: false, error: 'Locations sheet not found.' };
    const data    = sheet.getDataRange().getValues();
    const headers = data.shift();
    const idx     = {};
    headers.forEach((h, i) => { idx[h] = i; });

    const partners = data
      .map(row => ({
        value:       row[idx['LocationID']],
        label:       row[idx['DisplayName']],
        city:        row[idx['City']],
        partnerType: row[idx['PartnerType']] || row[idx['LocationType']] || 'consignment',
        active:      row[idx['Active']],
      }))
      .filter(p => p.active === true && p.value);

    return { success: true, partners };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function searchRetailers(query) {
  try {
    if (!query || query.length < 2) return { success: true, partners: [] };
    const result = getRetailPartners();
    if (!result.success) return result;
    const q = query.toLowerCase();
    const matches = result.partners.filter(p =>
      (p.label || '').toLowerCase().includes(q) ||
      (p.city  || '').toLowerCase().includes(q)
    );
    return { success: true, partners: matches.slice(0, 6) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// =============================================================================
// VERIFICATION — checks owner identity before submitting order
// =============================================================================

function verifyRetailer(locationId, email, phone) {
  try {
    const sheet = SPREADSHEET.getSheetByName('RetailerAuth');
    if (!sheet) return { success: true, verified: false };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(locationId)) {
        const storedEmail = String(data[i][1]).trim().toLowerCase();
        const storedPhone = String(data[i][2]).trim().replace(/\D/g, '');
        const inputEmail  = String(email || '').trim().toLowerCase();
        const inputPhone  = String(phone || '').trim().replace(/\D/g, '');

        const emailMatch = inputEmail && storedEmail && inputEmail === storedEmail;
        const phoneMatch = inputPhone && storedPhone && inputPhone === storedPhone;

        return { success: true, verified: emailMatch || phoneMatch };
      }
    }
    return { success: true, verified: false };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// =============================================================================
// ORDER SUBMISSION
// =============================================================================

function submitOrder(orderData) {
  try {
    let sheet = SPREADSHEET.getSheetByName('Orders');
    if (!sheet) {
      sheet = SPREADSHEET.insertSheet('Orders');
      sheet.appendRow([
        'OrderID','SubmittedAt','LocationID','PartnerName','PartnerType',
        'SubmitterName','SubmitterEmail','ItemsJSON','SubTotal','TaxAmount',
        'EstTotal','Status','Notes','FulfilledAt'
      ]);
    }

    const now        = new Date();
    const orderId    = 'ORD-' + now.getTime();
    const isWholesale = orderData.partnerType === 'wholesale';

    let subTotal = 0;
    if (isWholesale) {
      orderData.items.forEach(item => {
        subTotal += (item.wholesalePrice || 2) * item.qty;
      });
    }
    const taxAmount = isWholesale ? subTotal * VA_SALES_TAX : 0;
    const estTotal  = subTotal + taxAmount;

    sheet.appendRow([
      orderId,
      now.toISOString(),
      orderData.locationId,
      orderData.partnerName,
      orderData.partnerType,
      orderData.submitterName,
      orderData.submitterEmail,
      JSON.stringify(orderData.items),
      isWholesale ? subTotal.toFixed(2) : '',
      isWholesale ? taxAmount.toFixed(2) : '',
      isWholesale ? estTotal.toFixed(2) : '',
      'Pending',
      orderData.notes || '',
      ''
    ]);

    sendOrderNotification(orderId, orderData, subTotal, taxAmount, estTotal);
    sendRetailerConfirmation(orderId, orderData, subTotal, taxAmount, estTotal);

    return { success: true, orderId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// =============================================================================
// PARTNER ACCOUNT REQUESTS
// =============================================================================

function submitPartnerRequest(requestData) {
  try {
    let sheet = SPREADSHEET.getSheetByName('PartnerRequests');
    if (!sheet) {
      sheet = SPREADSHEET.insertSheet('PartnerRequests');
      sheet.appendRow([
        'RequestID','SubmittedAt','PersonName','StoreName','Address',
        'AccountType','Region','Email','Phone','Status','Notes'
      ]);
    }

    const now       = new Date();
    const requestId = 'REQ-' + now.getTime();

    sheet.appendRow([
      requestId,
      now.toISOString(),
      requestData.personName,
      requestData.storeName,
      requestData.address || '',
      requestData.accountType,
      requestData.region || '',
      requestData.email,
      requestData.phone,
      'New',
      ''
    ]);

    try {
      MailApp.sendEmail({
        to:       Session.getActiveUser().getEmail(),
        subject:  '🆕 New Partner Request — ' + requestData.storeName,
        htmlBody: `
          <h2>New Partner Account Request</h2>
          <p><strong>Store:</strong> ${requestData.storeName}</p>
          <p><strong>Contact:</strong> ${requestData.personName}</p>
          <p><strong>Type:</strong> ${requestData.accountType}</p>
          <p><strong>Region:</strong> ${requestData.region || 'N/A'}</p>
          <p><strong>Email:</strong> ${requestData.email}</p>
          <p><strong>Phone:</strong> ${requestData.phone}</p>
        `
      });
    } catch (e) {}

    return { success: true, requestId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// =============================================================================
// EMAIL NOTIFICATIONS
// =============================================================================

function sendOrderNotification(orderId, orderData, subTotal, taxAmount, estTotal) {
  try {
    const isWholesale = orderData.partnerType === 'wholesale';
    const itemsHtml   = orderData.items.map(item => `
      <tr>
        <td style="padding:6px;">${item.itemId}</td>
        <td style="padding:6px;">${item.designName}</td>
        <td style="padding:6px;text-align:center;">${item.qty}</td>
        ${isWholesale ? `<td style="padding:6px;text-align:right;">$${((item.wholesalePrice || 2) * item.qty).toFixed(2)}</td>` : ''}
      </tr>`).join('');

    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: isWholesale
        ? `🛒 New Wholesale Order — ${orderData.partnerName}`
        : `📦 New Restock Request — ${orderData.partnerName}`,
      htmlBody: `
        <h2>${isWholesale ? 'Wholesale Order' : 'Consignment Restock Request'}</h2>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Partner:</strong> ${orderData.partnerName}</p>
        <p><strong>Submitted by:</strong> ${orderData.submitterName} (${orderData.submitterEmail})</p>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
          <tr style="background:#4AABAB;color:white;">
            <th>Design #</th><th>Name</th><th>Qty</th>
            ${isWholesale ? '<th>Line Total</th>' : ''}
          </tr>
          ${itemsHtml}
        </table>
        ${isWholesale ? `
          <p><strong>Subtotal:</strong> $${subTotal.toFixed(2)}</p>
          <p><strong>Tax (5.3%):</strong> $${taxAmount.toFixed(2)}</p>
          <p><strong>Est. Total:</strong> $${estTotal.toFixed(2)}</p>
          <p><em>Adjust in the admin app before fulfilling.</em></p>
        ` : ''}
      `
    });
  } catch (e) {}
}

function sendRetailerConfirmation(orderId, orderData, subTotal, taxAmount, estTotal) {
  try {
    if (!orderData.submitterEmail) return;
    const isWholesale = orderData.partnerType === 'wholesale';
    const itemsHtml   = orderData.items.map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.itemId}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${item.designName}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
        ${isWholesale ? `<td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${((item.wholesalePrice || 2) * item.qty).toFixed(2)}</td>` : ''}
      </tr>`).join('');

    MailApp.sendEmail({
      to:      orderData.submitterEmail,
      subject: `Your ${isWholesale ? 'wholesale order' : 'restock request'} — Prints by Angel`,
      htmlBody: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#3D2B1F;">
          <div style="background:#2C1F17;padding:24px;text-align:center;">
            <h1 style="color:#F0E6D3;margin:0;">✦ Prints by Angel</h1>
            <p style="color:#C4A882;margin:4px 0 0;">
              ${isWholesale ? 'Wholesale Order Confirmation' : 'Restock Request Received'}
            </p>
          </div>
          <div style="padding:24px;background:#F5F0E4;">
            <p>Hi ${orderData.submitterName},</p>
            <p>We've received your ${isWholesale ? 'wholesale order' : 'restock request'} for
               <strong>${orderData.partnerName}</strong>. We'll be in touch soon!</p>
            <p style="font-size:12px;color:#A07860;"><strong>Order ID:</strong> ${orderId}</p>
            <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#4AABAB;color:white;">
                  <th style="padding:10px;text-align:left;">Design #</th>
                  <th style="padding:10px;text-align:left;">Name</th>
                  <th style="padding:10px;text-align:center;">Qty</th>
                  ${isWholesale ? '<th style="padding:10px;text-align:right;">Total</th>' : ''}
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            ${isWholesale ? `
              <div style="margin-top:16px;text-align:right;">
                <p>Subtotal: <strong>$${subTotal.toFixed(2)}</strong></p>
                <p>Tax (5.3%): <strong>$${taxAmount.toFixed(2)}</strong></p>
                <p style="font-size:18px;">Est. Total: <strong>$${estTotal.toFixed(2)}</strong></p>
                <p style="font-size:11px;color:#A07860;">*Estimate only — final invoice reflects fulfilled quantities.</p>
              </div>
            ` : '<p><em>Consignment restock — no payment required at this time.</em></p>'}
            <p style="margin-top:24px;">Thanks for partnering with us! 🖤</p>
            <p>— Angel, Prints by Angel</p>
          </div>
        </div>
      `
    });
  } catch (e) {}
}