const { ObjectId } = require('mongodb');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const { formatCurrency, getPaymentMethodIcon } = require('../utils/helpers');

// GET /invoices
exports.getInvoices = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customers = await db.collection('customers').find({ adminId: admin._id }).toArray();
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
    const sales = await db.collection('sales').find({ adminId: admin._id }).toArray();
    const processedSales = sales.map(sale => ({
      ...sale,
      totalAmount: typeof sale.totalAmount === 'number' ? sale.totalAmount : 0
    }));

    const error = req.session.error || null;
    const formData = req.session.formData || { items: { itemId: [], quantity: [], newProductName: [], newProductCost: [], newProductStock: [] } };
    delete req.session.error;
    delete req.session.formData;

    res.render('invoices', {
      username: req.session.admin,
      admin,
      sales: processedSales,
      customers,
      inventory,
      formatCurrency,
      error,
      formData,
      getPaymentMethodIcon
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /invoices/create
exports.postCreateInvoice = async (req, res) => {
  const { customerId: rawCustomerId, newCustomerName, newCustomerPhone, newCustomerEmail, items, paymentMethod, bankName, bankAccountName, accountNumber, additionalComments } = req.body;
  const customerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId;

  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found. Please log in again.';
      await req.session.save();
      return res.redirect('/admin-login');
    }

    if (!items || !paymentMethod) {
      req.session.error = 'Items and payment method are required.';
      req.session.formData = req.body;
      await req.session.save();
      return res.redirect('/invoices');
    }

    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];
    const newProductNames = Array.isArray(items.newProductName) ? items.newProductName : [items.newProductName].filter(Boolean);
    const newProductCosts = Array.isArray(items.newProductCost) ? items.newProductCost : [items.newProductCost].filter(Boolean);
    const newProductStocks = Array.isArray(items.newProductStock) ? items.newProductStock : [items.newProductStock].filter(Boolean);

    if (itemIds.length !== quantities.length) {
      req.session.error = 'Mismatch between items and quantities.';
      req.session.formData = req.body;
      await req.session.save();
      return res.redirect('/invoices');
    }

    const saleItems = [];
    let totalOrderAmount = 0;
    let totalVatAmount = 0;
    let subtotalAmount = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);

      if (isNaN(qty) || qty <= 0) {
        req.session.error = `Invalid quantity for item ${i + 1}.`;
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      let item;

      if ((itemId === 'new' || itemId.startsWith('new_')) && newProductNames[i] && newProductCosts[i] && newProductStocks[i]) {
        const cost = parseFloat(newProductCosts[i]) || 0;
        const stock = parseInt(newProductStocks[i]) || 0;

        if (cost <= 0 || stock < qty) {
          req.session.error = `Invalid cost or insufficient stock for new product "${newProductNames[i]}".`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        item = {
          adminId: admin._id,
          name: newProductNames[i],
          cost: cost,
          stock: stock,
          isVatable: admin.applyVat,
          createdAt: new Date()
        };

        const result = await db.collection('inventory').insertOne(item);
        item._id = result.insertedId;
        await db.collection('inventory').updateOne({ _id: item._id }, { $inc: { stock: -qty } });

      } else if (itemId && itemId !== 'new' && !itemId.startsWith('new_')) {
        if (typeof itemId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(itemId)) {
          req.session.error = `Invalid item ID format for item ${i + 1}.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        try {
          item = await db.collection('inventory').findOne({ _id: new ObjectId(itemId), adminId: admin._id });
        } catch (err) {
          req.session.error = `Invalid item ID for item ${i + 1}.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        if (!item) {
          req.session.error = `Item with ID ${itemId} not found in inventory.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        if (item.stock < qty) {
          req.session.error = `Insufficient stock for ${item.name}. Only ${item.stock} available.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        await db.collection('inventory').updateOne({ _id: item._id }, { $inc: { stock: -qty } });
      } else {
        req.session.error = `Invalid item data at position ${i + 1}.`;
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      const unitCost = item.cost;
      const totalCost = unitCost * qty;

      let vatAmount = 0;
      let vatRate = 0;
      let isVatable = false;
      let itemTotalWithVat = totalCost;

      if (admin.applyVat && item.isVatable) {
        vatRate = admin.vatRate || 0;
        vatAmount = (totalCost * vatRate) / 100;
        isVatable = true;
        itemTotalWithVat = totalCost + vatAmount;
        totalVatAmount += vatAmount;
      }

      subtotalAmount += totalCost;
      totalOrderAmount += itemTotalWithVat;

      saleItems.push({
        itemId: item._id,
        itemName: item.name,
        quantity: qty,
        unitCost: unitCost,
        totalCost: totalCost,
        isVatable: isVatable,
        vatRate: vatRate,
        vatAmount: vatAmount,
        itemTotalWithVat: itemTotalWithVat
      });
    }

    let customer;
    if (customerId === 'new' && newCustomerName) {
      const newCustomer = { adminId: admin._id, name: newCustomerName, phone: newCustomerPhone || 'N/A', email: newCustomerEmail || 'N/A', createdAt: new Date() };
      const result = await db.collection('customers').insertOne(newCustomer);
      customer = { _id: result.insertedId, ...newCustomer };
    } else if (customerId && customerId !== 'new') {
      if (!/^[0-9a-fA-F]{24}$/.test(customerId)) {
        req.session.error = 'Invalid customer ID format.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      try {
        customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
      } catch (err) {
        req.session.error = 'Invalid customer ID.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      if (!customer) {
        req.session.error = 'Customer not found or invalid.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }
    } else {
      req.session.error = 'Invalid customer details.';
      req.session.formData = req.body;
      await req.session.save();
      return res.redirect('/invoices');
    }

    let processedComments = '';
    if (additionalComments) {
      processedComments = additionalComments.trim();
      if (processedComments.length > 1000) processedComments = processedComments.substring(0, 1000) + '...';
    }

    const sale = {
      adminId: admin._id,
      customerId: customer._id,
      customerName: customer.name,
      phoneNumber: customer.phone,
      email: customer.email,
      items: saleItems,
      subtotalAmount,
      totalVatAmount,
      totalAmount: totalOrderAmount,
      paymentMethod: paymentMethod || 'N/A',
      paymentStatus: 'Pending',
      date: new Date(),
      vatApplied: admin.applyVat,
      vatRate: admin.vatRate || 0,
      additionalComments: processedComments,
      formattedTotal: totalOrderAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    };

    if (paymentMethod === 'Bank Transfer') {
      if (!bankName || !bankAccountName || !accountNumber) {
        req.session.error = 'Bank details required for bank transfers.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }
      sale.bankDetails = { bankName, bankAccountName, accountNumber };
    }

    await db.collection('sales').insertOne(sale);

    if (req.session.formData) {
      delete req.session.formData;
      await req.session.save();
    }

    res.redirect('/invoices');
  } catch (error) {
    console.error('Error creating invoice:', error);
    req.session.error = 'An unexpected error occurred. Please try again.';
    req.session.formData = req.body;
    await req.session.save();
    res.redirect('/invoices');
  }
};

// GET /invoices/upload
exports.getInvoiceUpload = (req, res) => {
  res.render('invoices-upload', { username: req.session.admin });
};

// POST /invoices/upload
exports.postInvoiceUpload = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(401).send('Unauthorized');
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    if (!filePath) return res.status(400).send('No file uploaded');
    console.log('File uploaded:', filePath);
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /invoices/share
exports.postInvoiceShare = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(401).send('Unauthorized');
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    if (!filePath) return res.status(400).send('No file uploaded');
    console.log('File shared:', filePath);
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error sharing file:', error);
    res.status(500).send('Internal Server Error');
  }
};

// ── Shared PDF invoice renderer ───────────────────────────────────────────────
function buildInvoicePDF(doc, sale, admin, saleId) {
  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt = (amount) => {
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Convert integer to English words
  const numToWords = (n) => {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                  'Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const conv = (x) => {
      if (x === 0) return '';
      if (x < 20)  return ones[x] + ' ';
      if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '') + ' ';
      if (x < 1e3) return ones[Math.floor(x/100)] + ' Hundred ' + conv(x%100);
      if (x < 1e6) return conv(Math.floor(x/1e3)) + 'Thousand ' + conv(x%1e3);
      if (x < 1e9) return conv(Math.floor(x/1e6)) + 'Million '  + conv(x%1e6);
      return conv(Math.floor(x/1e9)) + 'Billion ' + conv(x%1e9);
    };
    const i = Math.round(parseFloat(n) || 0);
    return i === 0 ? 'Zero' : conv(i).replace(/\s+/g, ' ').trim();
  };

  // Draw underlined heading
  const underline = (text, x, y, fontSize, font, color) => {
    doc.fontSize(fontSize).font(font).fillColor(color).text(text, x, y);
    const w = doc.widthOfString(text, { fontSize, font });
    doc.moveTo(x, y + fontSize + 2).lineTo(x + w, y + fontSize + 2)
       .strokeColor(color).lineWidth(0.75).stroke();
  };

  const C = {
    orange: '#FF9800',
    dark:   '#1A1A1A',
    text:   '#333333',
    muted:  '#888888',
    border: '#CCCCCC',
    white:  '#FFFFFF',
  };

  const PW  = doc.page.width;   // 595.28
  const PH  = doc.page.height;  // 841.89
  const M   = 50;
  const cW  = PW - 2 * M;
  const cur = admin.currency || '₦';
  const bk  = sale.bankDetails || {};
  // Paid orders read as a receipt (proof of payment); unpaid ones read as an
  // invoice (a bill still awaiting payment).
  const isPaid      = sale.paymentStatus === 'Paid';
  const docLabel    = isPaid ? 'RECEIPT' : 'INVOICE';
  const invoiceRef  = `${isPaid ? 'RCT' : 'INV'}-${saleId.slice(-8).toUpperCase()}`;
  const invoiceDate = new Date(sale.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const pad = 8; // table cell padding

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Logo / business name (top-left)
  const logoPath = admin.logo ? path.join(__dirname, '..', 'public', admin.logo) : null;
  const hasLogo  = logoPath && fs.existsSync(logoPath);
  if (hasLogo) {
    try { doc.image(logoPath, M, 14, { height: 50, fit: [190, 50] }); } catch (e) {}
  } else {
    // Orange square accent + bold business name (Shedfactory logo style)
    doc.rect(M, 16, 30, 30).fill(C.orange);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.white)
       .text((admin.businessName || 'SHED').slice(0, 4).toUpperCase(), M, 24, { width: 30, align: 'center' });
    doc.fontSize(15).font('Helvetica-Bold').fillColor(C.dark)
       .text(admin.businessName || 'Business', M + 38, 22);
  }

  // Contact info — small text top-right
  const contactParts = [admin.phone, admin.businessWebsite || 'shed.ng', admin.email].filter(Boolean);
  doc.fontSize(8).font('Helvetica').fillColor(C.muted)
     .text(contactParts.join('   '), 0, 28, { align: 'right', width: PW - M });

  // Thin divider below header
  doc.moveTo(M, 72).lineTo(PW - M, 72).strokeColor(C.border).lineWidth(0.5).stroke();

  let y = 88;

  // ── REVISED INVOICE BANNER (shown when invoice has been updated) ──────────
  if (sale.isUpdated) {
    const bannerY = 76;
    const bannerH = 22;
    const updDate = new Date(sale.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const revText = `REVISED INVOICE  —  Updated: ${updDate}  (Revision #${sale.updateCount || 1})`;
    doc.rect(M, bannerY, cW, bannerH).fill('#FFF3E0');
    doc.rect(M, bannerY, 5, bannerH).fill(C.orange);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#7A4100')
       .text(revText, M + 11, bannerY + 7, { width: cW - 18 });
    y = bannerY + bannerH + 8; // push content below banner
  }

  // ── TWO-COLUMN: Invoice details LEFT | Bill To RIGHT ──────────────────────
  const leftW  = 270;
  const rightX = M + leftW + 20;
  const rightW = PW - M - rightX;

  // Left — large light "INVOICE" / "RECEIPT" heading, with a green PAID
  // badge next to it when the order has actually been paid for.
  doc.fontSize(30).font('Helvetica').fillColor(C.dark).text(docLabel, M, y);
  if (isPaid) {
    const headingW = doc.widthOfString(docLabel, { fontSize: 30, font: 'Helvetica' });
    doc.roundedRect(M + headingW + 14, y + 6, 52, 20, 4).fill('#1E8449');
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.white).text('PAID', M + headingW + 14, y + 12, { width: 52, align: 'center' });
  }
  y += 40;

  doc.fontSize(10).font('Helvetica').fillColor(C.text).text(`Date: ${invoiceDate}`, M, y);
  y += 16;
  doc.text(`${isPaid ? 'Receipt' : 'Invoice'} Number: ${invoiceRef}`, M, y);
  y += 18;

  // Sale subject / description bold in parentheses (if present)
  if (sale.description || sale.subject) {
    const subj = `(${(sale.description || sale.subject).toUpperCase()})`;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.dark).text(subj, M, y, { width: leftW });
    y += doc.heightOfString(subj, { width: leftW, fontSize: 10, font: 'Helvetica-Bold' }) + 10;
  }

  doc.fontSize(10).font('Helvetica').fillColor(C.text)
     .text(isPaid ? `Payment Status: Paid${sale.paymentMethod ? ' via ' + sale.paymentMethod : ''}` : 'Due Date: Upon Receipt', M, y);
  y += 16;

  // Right — "Bill To:" plain, no box
  const btY0 = 88 + 40; // aligned with first line below INVOICE heading
  doc.fontSize(10).font('Helvetica').fillColor(C.text).text('Bill To:', rightX, btY0);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark)
     .text(sale.customerName || 'N/A', rightX, btY0 + 18, { width: rightW });
  let btY = btY0 + 36;
  doc.fontSize(10).font('Helvetica').fillColor(C.text);
  if (sale.email && sale.email !== 'N/A')             { doc.text(sale.email,       rightX, btY, { width: rightW }); btY += 16; }
  if (sale.phoneNumber && sale.phoneNumber !== 'N/A') { doc.text(sale.phoneNumber, rightX, btY, { width: rightW }); btY += 16; }

  // y must be below both columns
  y = Math.max(y, btY) + 18;

  // ── SERVICE SUMMARY ───────────────────────────────────────────────────────
  underline('Service Summary', M, y, 10, 'Helvetica', C.dark);
  y += 22;
  doc.fontSize(10).font('Helvetica').fillColor(C.text).text(`Billing Period: ${invoiceDate}`, M, y);
  y += 22;

  // ── ITEMS TABLE ───────────────────────────────────────────────────────────
  // Columns: Description | Unit Price | Quantity | Amount
  const tc = {
    dX: M,       dW: 230,
    rX: M + 230, rW: 95,
    qX: M + 325, qW: 60,
    aX: M + 385, aW: PW - M - (M + 385),
  };
  const hH = 28;

  // drawCell: fill bg first, then border, then text
  const drawCell = (x, w, yRow, h, text, bold = false, align = 'left', bg = null) => {
    if (bg) doc.rect(x, yRow, w, h).fill(bg);
    doc.rect(x, yRow, w, h).lineWidth(0.5).stroke(C.border);
    if (text !== null && text !== undefined && String(text).length > 0) {
      doc.fontSize(9.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(C.dark)
         .text(String(text), x + pad, yRow + Math.max(0, (h - 10) / 2), { width: w - 2 * pad, align });
    }
  };

  // Header row — black background, white bold text (Shed dark brand)
  const drawHeaderCell = (x, w, yRow, h, text, align = 'left') => {
    doc.rect(x, yRow, w, h).fill(C.dark);
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.white)
       .text(text, x + pad, yRow + Math.max(0, (h - 10) / 2), { width: w - 2 * pad, align });
  };
  drawHeaderCell(tc.dX, tc.dW, y, hH, 'Description');
  drawHeaderCell(tc.rX, tc.rW, y, hH, 'Unit Price');
  drawHeaderCell(tc.qX, tc.qW, y, hH, 'Quantity',  'center');
  drawHeaderCell(tc.aX, tc.aW, y, hH, 'Amount',    'right');
  y += hH;

  // Item rows — banded: white / light orange
  const bandColor = '#FFF3E0'; // very light orange tint (Shed brand)
  (sale.items || []).forEach((item, idx) => {
    const name  = item.itemName || 'Item';
    const nameH = doc.heightOfString(name, { width: tc.dW - 2 * pad, fontSize: 9.5, font: 'Helvetica' });
    const rH    = Math.max(28, nameH + 16);
    if (y + rH > 720) { doc.addPage(); y = 50; }

    const bg = idx % 2 === 0 ? C.white : bandColor;
    // Fill entire row first, then draw cells over it
    doc.rect(tc.dX, y, cW, rH).fill(bg);
    doc.rect(tc.dX, y, tc.dW, rH).lineWidth(0.5).stroke(C.border);
    doc.fontSize(9.5).font('Helvetica').fillColor(C.dark)
       .text(name, tc.dX + pad, y + 8, { width: tc.dW - 2 * pad });
    drawCell(tc.rX, tc.rW, y, rH, `${cur}${fmt(item.unitCost)}`,     false, 'left',   bg);
    drawCell(tc.qX, tc.qW, y, rH, String(item.quantity || 0),        false, 'center', bg);
    drawCell(tc.aX, tc.aW, y, rH, `${cur}${fmt(item.totalCost)}`,    false, 'right',  bg);
    y += rH;
  });

  // VAT row
  if (sale.totalVatAmount > 0) {
    const vH = 26;
    drawCell(tc.dX, tc.dW, y, vH, `VAT (${sale.vatRate || 0}%)`);
    drawCell(tc.rX, tc.rW, y, vH, null);
    drawCell(tc.qX, tc.qW, y, vH, null);
    drawCell(tc.aX, tc.aW, y, vH, `${cur}${fmt(sale.totalVatAmount)}`, false, 'right');
    y += vH;
  }

  // Total row — orange background, bold dark text (Shed accent)
  const tH = 28;
  doc.rect(tc.dX, y, cW, tH).fill(C.orange);
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.dark)
     .text('Total', tc.dX + pad, y + Math.max(0, (tH - 10) / 2), { width: tc.dW - 2 * pad });
  doc.text(`${cur}${fmt(sale.totalAmount)}`, tc.aX + pad, y + Math.max(0, (tH - 10) / 2),
     { width: tc.aW - 2 * pad, align: 'right' });
  // draw border outlines on total row cells
  [tc.dX, tc.rX, tc.qX, tc.aX].forEach((x, i) => {
    const w = [tc.dW, tc.rW, tc.qW, tc.aW][i];
    doc.rect(x, y, w, tH).lineWidth(0.5).stroke(C.border);
  });
  y += tH + 22;

  // ── DIVIDER ────────────────────────────────────────────────────────────────
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 16;

  // ── TOTAL AMOUNT DUE (with amount in words) ────────────────────────────────
  const words    = numToWords(Math.round(parseFloat(sale.totalAmount) || 0));
  const curName  = cur === '₦' ? 'Naira' : 'Units';
  const dueText  = `Total Amount ${isPaid ? 'Paid' : 'Due'}: ${cur}${fmt(sale.totalAmount)} (${words} ${curName} Only)`;
  doc.fontSize(10).font('Helvetica').fillColor(C.dark).text(dueText, M, y, { width: cW });
  y += doc.heightOfString(dueText, { width: cW, fontSize: 10, font: 'Helvetica' }) + 14;

  // Notes / additional comments
  if (sale.additionalComments) {
    const noteText = `Note: ${sale.additionalComments}`;
    doc.fontSize(10).font('Helvetica').fillColor(C.text).text(noteText, M, y, { width: cW });
    y += doc.heightOfString(noteText, { width: cW, fontSize: 10, font: 'Helvetica' }) + 16;
  }

  // ── PAYMENT INSTRUCTIONS (unpaid) / THANK YOU (paid) ───────────────────────
  if (y > 650) { doc.addPage(); y = 50; }
  if (isPaid) {
    underline('Thank You', M, y, 10, 'Helvetica', C.dark);
    y += 22;
    doc.fontSize(10).font('Helvetica').fillColor(C.dark)
       .text('Payment received in full. This receipt confirms your order has been paid for.', M, y, { width: cW });
    y += 36;
  } else {
    underline('Payment Instructions', M, y, 10, 'Helvetica', C.dark);
    y += 22;

    doc.fontSize(10).font('Helvetica').fillColor(C.dark);
    doc.text(`Bank: ${bk.bankName      || admin.bankName      || 'N/A'}`,             M, y); y += 16;
    doc.text(`Account Name: ${bk.bankAccountName || admin.businessName || 'N/A'}`,    M, y); y += 16;
    doc.text(`Account Number: ${bk.accountNumber || admin.accountNumber || 'N/A'}`,   M, y); y += 36;
  }

  // ── SIGNATURE ─────────────────────────────────────────────────────────────
  doc.moveTo(M, y).lineTo(M + 110, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 10;
  doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark)
     .text(admin.ownerName || admin.businessName || 'Authorized Signatory', M, y);
  y += 16;
  doc.fontSize(9).font('Helvetica').fillColor(C.muted)
     .text(`CEO / ${admin.businessName || 'Business'}`, M, y);

  // ── FOOTER — Shed brand: black band, orange top stripe, white text ────────
  const fH  = 56;
  const fY  = PH - fH;
  // Black footer band
  doc.rect(0, fY, PW, fH).fill(C.dark);
  // Orange top border on footer
  doc.moveTo(0, fY).lineTo(PW, fY).strokeColor(C.orange).lineWidth(3).stroke();

  // Three contact items with filled orange circles
  const footItems = [
    { text: admin.phone || '' },
    { text: admin.businessWebsite || 'shed.ng' },
    { text: admin.email || '' },
  ].filter(f => f.text);

  const slotW = cW / Math.max(footItems.length, 1);
  footItems.forEach((item, i) => {
    const midX  = M + i * slotW + slotW / 2;
    const iconX = midX - 52;
    const textX = iconX + 24;
    // Filled orange circle icon
    doc.circle(iconX + 10, fY + fH / 2, 10).fill(C.orange);
    // Contact text in white
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.white)
       .text(item.text, textX, fY + fH / 2 - 6, { width: slotW - 30 });
  });
}

// GET /invoices/download/:saleId
exports.getInvoiceDownload = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(403).send('Admin not found');

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found');

    const docWord = sale.paymentStatus === 'Paid' ? 'Receipt' : 'Invoice';
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, info: { Title: `${docWord} ${saleId.slice(-8)}`, Author: admin.businessName || 'Shed' } });
    res.setHeader('Content-disposition', `attachment; filename="${docWord.toLowerCase()}-${saleId.slice(-8)}.pdf"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);
    buildInvoicePDF(doc, sale, admin, saleId);
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    if (!res.headersSent) res.status(500).send('Error generating invoice');
  }
};

// GET /shopper/orders/:saleId/invoice — a shopper viewing/downloading their own
// order's invoice/receipt. Matches on shopperId (cart checkout orders) or the
// shopper's email (older guest-checkout orders made before they had an account).
exports.getShopperInvoice = async (req, res) => {
  try {
    const db = getDb();
    const { saleId } = req.params;
    if (!ObjectId.isValid(saleId)) return res.status(404).render('404', { message: 'Order not found' });

    const shopper = req.session.shopper;
    const sale = await db.collection('sales').findOne({
      _id: new ObjectId(saleId),
      source: 'storefront',
      $or: [
        { shopperId: ObjectId.isValid(shopper.id) ? new ObjectId(shopper.id) : null },
        { email: shopper.email }
      ]
    });
    if (!sale) return res.status(404).render('404', { message: 'Order not found' });

    const admin = await db.collection('admins').findOne({ _id: sale.adminId });
    if (!admin) return res.status(404).render('404', { message: 'Store not found' });

    const download = req.query.download === '1';
    const docWord = sale.paymentStatus === 'Paid' ? 'Receipt' : 'Invoice';
    const doc = new PDFDocument({
      margin: 0, size: 'A4', bufferPages: true,
      info: { Title: `${docWord} ${saleId.slice(-8)}`, Author: admin.businessName || 'Shed' }
    });
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${docWord.toLowerCase()}-${saleId.slice(-8)}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    buildInvoicePDF(doc, sale, admin, saleId);
    doc.end();
  } catch (error) {
    console.error('Shopper invoice error:', error);
    if (!res.headersSent) res.status(500).render('500', { message: 'Error generating invoice' });
  }
};

// POST /invoices/mark-paid/:saleId
exports.postMarkPaid = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const result = await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId), adminId: admin._id },
      { $set: { paymentStatus: 'Paid' } }
    );
    if (result.matchedCount === 0) return res.status(404).send('Invoice not found');
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /invoices/preview/:saleId — authenticated, inline (opens in browser tab)
exports.getInvoicePreview = async (req, res) => {
  try {
    const db     = getDb();
    const saleId = req.params.saleId;
    const admin  = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(403).send('Unauthorized');
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Invoice not found');

    const docWord = sale.paymentStatus === 'Paid' ? 'Receipt' : 'Invoice';
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, info: { Title: `${docWord} ${saleId.slice(-8)}`, Author: admin.businessName || 'Shed' } });
    res.setHeader('Content-Disposition', `inline; filename="${docWord.toLowerCase()}-${saleId.slice(-8)}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    buildInvoicePDF(doc, sale, admin, saleId);
    doc.end();
  } catch (error) {
    console.error('Preview error:', error);
    if (!res.headersSent) res.status(500).send('Error generating preview');
  }
};

// POST /invoices/update/:saleId — update invoice fields, mark as revised
exports.postUpdateInvoice = async (req, res) => {
  const saleId = req.params.saleId;
  const { customerName, phoneNumber, email, paymentMethod, bankName, bankAccountName, accountNumber, additionalComments, items } = req.body;

  try {
    const db    = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    const existing = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    // Parse items arrays
    const itemNames  = Array.isArray(items?.itemName)  ? items.itemName  : [items?.itemName].filter(Boolean);
    const unitCosts  = Array.isArray(items?.unitCost)  ? items.unitCost  : [items?.unitCost].filter(Boolean);
    const quantities = Array.isArray(items?.quantity)  ? items.quantity  : [items?.quantity].filter(Boolean);

    if (!itemNames.length) return res.status(400).json({ error: 'At least one item is required.' });

    let subtotalAmount   = 0;
    let totalVatAmount   = 0;
    let totalOrderAmount = 0;

    const saleItems = itemNames.map((name, i) => {
      const unitCost  = parseFloat(unitCosts[i])  || 0;
      const qty       = Math.max(1, parseInt(quantities[i]) || 1);
      const totalCost = unitCost * qty;
      const isVatable = !!admin.applyVat;
      const vatRate   = admin.vatRate || 0;
      const vatAmount = isVatable ? (totalCost * vatRate) / 100 : 0;
      const itemTotal = totalCost + vatAmount;

      subtotalAmount   += totalCost;
      totalVatAmount   += vatAmount;
      totalOrderAmount += itemTotal;

      return { itemId: null, itemName: String(name).trim(), quantity: qty, unitCost, totalCost, isVatable, vatRate, vatAmount, itemTotalWithVat: itemTotal };
    });

    const updateDoc = {
      customerName:       (customerName || '').trim(),
      phoneNumber:        (phoneNumber  || '').trim(),
      email:              (email        || '').trim(),
      items:              saleItems,
      subtotalAmount,
      totalVatAmount,
      totalAmount:        totalOrderAmount,
      paymentMethod:      paymentMethod || existing.paymentMethod,
      additionalComments: (additionalComments || '').trim().slice(0, 1000),
      isUpdated:          true,
      updatedAt:          new Date(),
      updateCount:        (existing.updateCount || 0) + 1,
      formattedTotal:     totalOrderAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    };

    if (paymentMethod === 'Bank Transfer') {
      updateDoc.bankDetails = { bankName: bankName || '', bankAccountName: bankAccountName || '', accountNumber: accountNumber || '' };
    }

    await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId), adminId: admin._id },
      { $set: updateDoc }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Update invoice error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /public-invoice/:saleId
exports.getPublicInvoice = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId) });
    if (!sale) return res.status(404).send('Invoice not found');
    const admin = await db.collection('admins').findOne({ _id: sale.adminId });

    const doc = new PDFDocument({ margin: 0, size: 'A4', info: { Title: `Invoice ${saleId.slice(-8)}`, Author: admin?.businessName || 'Shed' } });
    res.setHeader('Content-disposition', `inline; filename="invoice-${saleId.slice(-8)}.pdf"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);
    buildInvoicePDF(doc, sale, admin || {}, saleId);
    doc.end();
  } catch (error) {
    console.error('Error generating public invoice:', error);
    res.status(500).send('Error generating invoice');
  }
};
