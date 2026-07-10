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
  const fmt = (amount) => {
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const underline = (text, x, y, fontSize, font, color) => {
    doc.fontSize(fontSize).font(font).fillColor(color).text(text, x, y);
    const w = doc.widthOfString(text, { fontSize, font });
    doc.moveTo(x, y + fontSize + 1).lineTo(x + w, y + fontSize + 1)
       .strokeColor(color).lineWidth(0.5).stroke();
  };

  // Shed brand palette: orange #FF9800, black, light grey
  const C = {
    orange:      '#FF9800',
    orangeLight: '#FFF3E0',
    dark:        '#000000',
    text:        '#1A1A1A',
    muted:       '#666666',
    border:      '#DDDDDD',
    borderLight: '#EEEEEE',
    bgAlt:       '#F2F2F2',
    white:       '#FFFFFF',
    paid:        '#2E7D32',
    unpaid:      '#C62828',
  };

  const PW = doc.page.width;
  const PH = doc.page.height;
  const M  = 50;
  const cW = PW - 2 * M;
  const cur = admin.currency || '₦';
  const invoiceRef  = `INV-${saleId.slice(-8).toUpperCase()}`;
  const invoiceDate = new Date(sale.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const isPaid      = sale.paymentStatus === 'Paid';
  const bk          = sale.bankDetails || {};
  const pad         = 6; // cell padding

  // ── HEADER: orange top stripe + logo ─────────────────────────────────────
  // Full-width orange band at top
  doc.rect(0, 0, PW, 8).fill(C.orange);
  // Subtle orange tint behind header area
  doc.rect(0, 8, PW, 72).fill(C.orangeLight);

  const logoPath = admin.logo ? path.join(__dirname, '..', 'public', admin.logo) : null;
  const hasLogo  = logoPath && fs.existsSync(logoPath);
  if (hasLogo) {
    try { doc.image(logoPath, M, 18, { height: 50, fit: [160, 50] }); } catch (e) {}
  } else {
    // Business name with orange square accent
    doc.rect(M, 22, 5, 26).fill(C.orange);
    doc.fontSize(18).font('Helvetica-Bold').fillColor(C.dark)
       .text((admin.businessName || 'BUSINESS').toUpperCase(), M + 12, 26);
  }

  // Contact line top-right
  const contactLine = [admin.phone, admin.businessWebsite || 'shed.ng', admin.email].filter(Boolean).join('   •   ');
  doc.fontSize(8).font('Helvetica').fillColor(C.muted)
     .text(contactLine, 0, 32, { align: 'right', width: PW - M });

  // Divider — orange line
  doc.moveTo(0, 80).lineTo(PW, 80).strokeColor(C.orange).lineWidth(1.5).stroke();

  let y = 96;

  // ── TWO-COLUMN: Invoice details (left) | Bill To (right) ─────────────────
  const leftW  = 260;
  const rightX = M + leftW + 20;
  const rightW = PW - M - rightX;

  // Left: INVOICE heading (large, thin weight, orange accent letter)
  doc.fontSize(28).font('Helvetica').fillColor(C.dark).text('INVOICE', M, y);
  // orange underline accent under "INVOICE"
  const invW = doc.widthOfString('INVOICE', { fontSize: 28, font: 'Helvetica' });
  doc.rect(M, y + 32, invW, 3).fill(C.orange);
  y += 44;
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.muted).text('DATE', M, y);
  doc.fontSize(9.5).font('Helvetica').fillColor(C.text).text(invoiceDate, M + 70, y);
  y += 14;
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.muted).text('INVOICE NO.', M, y);
  doc.fontSize(9.5).font('Helvetica').fillColor(C.orange).text(invoiceRef, M + 70, y);
  y += 14;
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.muted).text('DUE DATE', M, y);
  doc.fontSize(9.5).font('Helvetica').fillColor(C.text).text('Upon Receipt', M + 70, y);
  y += 14;
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.muted).text('PAYMENT', M, y);
  doc.fontSize(9.5).font('Helvetica').fillColor(C.text).text(sale.paymentMethod || 'N/A', M + 70, y);

  // Right: Bill To box with orange top accent
  const btTopY = 96;
  const btBoxW = rightW;
  doc.rect(rightX, btTopY, btBoxW, 4).fill(C.orange);
  doc.rect(rightX, btTopY + 4, btBoxW, 106).fill(C.bgAlt);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(C.orange)
     .text('BILL TO', rightX + 10, btTopY + 14);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(C.dark)
     .text(sale.customerName || 'N/A', rightX + 10, btTopY + 28, { width: btBoxW - 20 });
  doc.fontSize(9).font('Helvetica').fillColor(C.muted);
  let btY = btTopY + 50;
  if (sale.email && sale.email !== 'N/A')             { doc.text(sale.email,       rightX + 10, btY, { width: btBoxW - 20 }); btY += 14; }
  if (sale.phoneNumber && sale.phoneNumber !== 'N/A') { doc.text(sale.phoneNumber, rightX + 10, btY, { width: btBoxW - 20 }); }

  y += 24;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.borderLight).lineWidth(0.5).stroke();
  y += 20;

  // ── SERVICE SUMMARY ───────────────────────────────────────────────────────
  underline('Service Summary', M, y, 10, 'Helvetica-Bold', C.orange);
  y += 22;
  doc.fontSize(9).font('Helvetica').fillColor(C.muted)
     .text(`Billing Period: ${invoiceDate}`, M, y);
  y += 20;

  // ── ITEMS TABLE ───────────────────────────────────────────────────────────
  // Columns: Description | Unit Price | Qty | Amount
  const tc = {
    dX: M,       dW: 220,
    rX: M + 220, rW: 90,
    qX: M + 310, qW: 60,
    aX: M + 370, aW: PW - M - (M + 370),  // ≈ 125px
  };
  const hH = 26; // header row height

  // Draw header cells — black bg, white text (Shed dark brand)
  const drawCell = (x, w, yRow, h, text, bold = false, align = 'left', bg = null) => {
    if (bg) doc.rect(x, yRow, w, h).fill(bg);
    doc.rect(x, yRow, w, h).lineWidth(0.5).stroke(C.border);
    if (text) {
      doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(C.dark)
         .text(text, x + pad, yRow + (h - 9) / 2, { width: w - 2 * pad, align });
    }
  };
  const drawHeaderCell = (x, w, yRow, h, text, align = 'left') => {
    doc.rect(x, yRow, w, h).fill(C.dark);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.white)
       .text(text, x + pad, yRow + (h - 9) / 2, { width: w - 2 * pad, align });
  };

  drawHeaderCell(tc.dX, tc.dW, y, hH, 'Description');
  drawHeaderCell(tc.rX, tc.rW, y, hH, 'Unit Price');
  drawHeaderCell(tc.qX, tc.qW, y, hH, 'Quantity', 'center');
  drawHeaderCell(tc.aX, tc.aW, y, hH, 'Amount', 'right');
  y += hH;

  // Item rows — alternate light grey background
  (sale.items || []).forEach((item, idx) => {
    const name  = item.itemName || 'Item';
    const nameH = doc.heightOfString(name, { width: tc.dW - 2 * pad });
    const rH    = Math.max(26, nameH + 14);
    if (y + rH > 710) { doc.addPage(); y = 50; }

    const rowBg = idx % 2 === 0 ? C.white : C.bgAlt;
    doc.rect(tc.dX, y, cW, rH).fill(rowBg);
    doc.rect(tc.dX, y, tc.dW, rH).lineWidth(0.5).stroke(C.border);
    doc.fontSize(9).font('Helvetica').fillColor(C.text)
       .text(name, tc.dX + pad, y + 8, { width: tc.dW - 2 * pad });
    drawCell(tc.rX, tc.rW, y, rH, `${cur} ${fmt(item.unitCost)}`, false, 'left', rowBg);
    drawCell(tc.qX, tc.qW, y, rH, String(item.quantity || 0), false, 'center', rowBg);
    drawCell(tc.aX, tc.aW, y, rH, `${cur} ${fmt(item.totalCost)}`, false, 'right', rowBg);
    y += rH;
  });

  // VAT row (if applicable)
  if (sale.totalVatAmount > 0) {
    const vH = 24;
    drawCell(tc.dX, tc.dW, y, vH, `VAT (${sale.vatRate || 0}%)`, false);
    drawCell(tc.rX, tc.rW, y, vH, '');
    drawCell(tc.qX, tc.qW, y, vH, '');
    drawCell(tc.aX, tc.aW, y, vH, `${cur} ${fmt(sale.totalVatAmount)}`, false, 'right');
    y += vH;
  }

  // Total row — orange accent background
  const tH = 28;
  doc.rect(tc.dX, y, cW, tH).fill(C.orange);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark)
     .text('TOTAL', tc.dX + pad, y + (tH - 9) / 2, { width: tc.dW - 2 * pad });
  doc.text(`${cur} ${fmt(sale.totalAmount)}`, tc.aX + pad, y + (tH - 9) / 2,
     { width: tc.aW - 2 * pad, align: 'right' });
  y += tH + 18;

  // ── DIVIDER ────────────────────────────────────────────────────────────────
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 14;

  // ── TOTAL AMOUNT DUE ───────────────────────────────────────────────────────
  doc.fontSize(10).font('Helvetica').fillColor(C.dark)
     .text(`Total Amount Due: ${cur} ${fmt(sale.totalAmount)}`, M, y, { width: cW });
  y += 20;

  // Status note
  const statusColor = isPaid ? C.paid : C.unpaid;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(statusColor)
     .text(isPaid ? 'Status: PAID' : 'Status: PAYMENT PENDING', M, y);
  y += 20;

  // Notes / additional comments
  if (sale.additionalComments) {
    doc.fontSize(9).font('Helvetica').fillColor(C.text)
       .text(sale.additionalComments, M, y, { width: cW });
    y += doc.heightOfString(sale.additionalComments, { width: cW }) + 14;
  }

  // ── PAYMENT INSTRUCTIONS ──────────────────────────────────────────────────
  if (y > 660) { doc.addPage(); y = 50; }
  underline('Payment Instructions', M, y, 10, 'Helvetica-Bold', C.orange);
  y += 22;

  doc.fontSize(9).font('Helvetica').fillColor(C.text);
  doc.text(`Bank: ${bk.bankName || admin.bankName || 'N/A'}`, M, y);          y += 14;
  doc.text(`Account Name: ${bk.bankAccountName || admin.businessName || 'N/A'}`, M, y); y += 14;
  doc.text(`Account Number: ${bk.accountNumber || admin.accountNumber || 'N/A'}`, M, y); y += 30;

  // ── SIGNATURE LINE ─────────────────────────────────────────────────────────
  doc.moveTo(M, y).lineTo(M + 130, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 8;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(C.dark).text(admin.businessName || 'Authorized Signatory', M, y);
  y += 13;
  doc.fontSize(8).font('Helvetica').fillColor(C.muted).text('Authorized Signatory', M, y);

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  const fY = PH - 52;
  // Orange footer band
  doc.rect(0, fY, PW, 52).fill(C.dark);
  doc.moveTo(0, fY).lineTo(PW, fY).strokeColor(C.orange).lineWidth(2).stroke();

  // Three contact items centred
  const footerItems = [
    { label: admin.phone || '' },
    { label: admin.businessWebsite || 'shed.ng' },
    { label: admin.email || '' },
  ].filter(f => f.label);

  const slotW = cW / Math.max(footerItems.length, 1);
  footerItems.forEach((item, i) => {
    const fx = M + i * slotW;
    const cx = fx + slotW / 2;
    // Orange dot
    doc.circle(cx - 36, fY + 20, 5).fill(C.orange);
    doc.fontSize(8.5).font('Helvetica').fillColor(C.white)
       .text(item.label, cx - 28, fY + 15, { width: slotW - 10 });
  });

  // Powered-by text bottom
  doc.fontSize(7).font('Helvetica').fillColor('rgba(255,255,255,0.4)')
     .text('Powered by Shed · shed.ng', 0, fY + 36, { align: 'center', width: PW });
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

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, info: { Title: `Invoice ${saleId.slice(-8)}`, Author: admin.businessName || 'Shed' } });
    res.setHeader('Content-disposition', `attachment; filename="invoice-${saleId.slice(-8)}.pdf"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);
    buildInvoicePDF(doc, sale, admin, saleId);
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    if (!res.headersSent) res.status(500).send('Error generating invoice');
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
