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

// GET /invoices/download/:saleId
exports.getInvoiceDownload = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(403).send('Admin not found');

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found');

    const localFormatCurrency = (amount) => {
      const num = typeof amount === 'number' ? amount : parseFloat(amount);
      return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true, info: { Title: `Invoice - ${saleId.slice(-8)}`, Author: admin.businessName || 'Shed' } });
    const filename = `invoice-${saleId.slice(-8)}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    const palette = { primary: '#1A1A1A', accent: '#2E8B57', muted: '#71717A', bgLight: '#F8F9FA', border: '#E4E4E7' };
    let y = 50;

    const logoFullPath = admin.logo ? path.join(__dirname, '..', 'public', admin.logo) : null;
    const hasValidLogo = logoFullPath && fs.existsSync(logoFullPath);

    if (hasValidLogo) {
      doc.image(logoFullPath, 50, y, { width: 90, fit: [90, 90] });
      y += 100;
    } else {
      doc.fontSize(24).font('Helvetica-Bold').fillColor(palette.primary).text((admin.businessName || 'BUSINESS').toUpperCase(), 50, y);
      y += 50;
    }

    doc.fontSize(28).font('Helvetica-Bold').fillColor(palette.primary).text('INVOICE', 350, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica-Bold').fillColor(palette.muted).text('INVOICE NO:', 400, 90, { continued: true }).font('Helvetica').fillColor(palette.primary).text(` #${saleId.slice(-8).toUpperCase()}`, { align: 'right' });
    doc.font('Helvetica-Bold').fillColor(palette.muted).text('DATE:', 400, 105, { continued: true }).font('Helvetica').fillColor(palette.primary).text(` ${new Date(sale.date).toLocaleDateString()}`, { align: 'right' });

    y = Math.max(y, 160);
    doc.rect(50, y, 500, 1).fill(palette.border);
    y += 20;

    doc.fontSize(9).font('Helvetica-Bold').fillColor(palette.accent).text('FROM', 50, y);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(palette.primary).text(admin.businessName || '', 50, y + 15);
    doc.fontSize(9).font('Helvetica').fillColor(palette.muted).text(admin.address || '', 50, y + 30, { width: 200 }).text(admin.email || '').text(admin.phone || '');

    doc.fontSize(9).font('Helvetica-Bold').fillColor(palette.accent).text('BILL TO', 350, y, { align: 'right' });
    doc.fontSize(11).font('Helvetica-Bold').fillColor(palette.primary).text(sale.customerName || '', 350, y + 15, { align: 'right' });
    doc.fontSize(9).font('Helvetica').fillColor(palette.muted).text(sale.email || '', 350, y + 30, { width: 200, align: 'right' }).text(sale.phoneNumber || '', { align: 'right' });

    y += 85;
    const colX = [50, 80, 280, 350, 450];
    doc.rect(50, y, 500, 25).fill(palette.primary);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('#', colX[0] + 5, y + 8);
    doc.text('DESCRIPTION', colX[1], y + 8);
    doc.text('QTY', colX[2], y + 8, { width: 50, align: 'right' });
    doc.text('RATE', colX[3], y + 8, { width: 80, align: 'right' });
    doc.text('TOTAL', colX[4], y + 8, { width: 100, align: 'right' });

    y += 25;
    doc.font('Helvetica').fontSize(10).fillColor(palette.primary);

    (sale.items || []).forEach((item, i) => {
      const itemName = item.itemName || 'Item Description';
      const itemHeight = Math.max(30, doc.heightOfString(itemName, { width: 180 }) + 15);
      if (y + itemHeight > 730) { doc.addPage(); y = 50; }
      if (i % 2 === 0) doc.rect(50, y, 500, itemHeight).fill(palette.bgLight);
      doc.fillColor(palette.primary);
      doc.text(i + 1, colX[0] + 5, y + 10);
      doc.text(itemName, colX[1], y + 10, { width: 180 });
      doc.text(String(item.quantity || 0), colX[2], y + 10, { width: 50, align: 'right' });
      doc.text(localFormatCurrency(item.unitCost), colX[3], y + 10, { width: 80, align: 'right' });
      doc.text(localFormatCurrency(item.totalCost), colX[4], y + 10, { width: 100, align: 'right' });
      y += itemHeight;
    });

    if (y > 600) { doc.addPage(); y = 50; }
    y += 20;
    const totalsX = 350;

    const drawTotalRow = (label, value, isBold = false) => {
      doc.fontSize(isBold ? 12 : 10).font(isBold ? 'Helvetica-Bold' : 'Helvetica').fillColor(isBold ? palette.primary : palette.muted).text(label, totalsX, y);
      doc.fillColor(palette.primary).text(`${admin.currency || '$'} ${localFormatCurrency(value)}`, 450, y, { width: 100, align: 'right' });
      y += 20;
    };

    drawTotalRow('Subtotal', sale.subtotalAmount || sale.totalAmount);
    if (sale.totalVatAmount > 0) drawTotalRow(`VAT (${sale.vatRate || 0}%)`, sale.totalVatAmount);
    y += 5;
    doc.rect(totalsX - 10, y, 210, 30).fill(palette.bgLight);
    y += 8;
    drawTotalRow('TOTAL DUE', sale.totalAmount, true);

    y += 30;
    const infoBoxY = y;
    doc.rect(50, infoBoxY, 240, 75).fill(palette.bgLight).stroke(palette.border);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(palette.accent).text('PAYMENT INFO', 60, infoBoxY + 10);
    doc.fontSize(8).font('Helvetica').fillColor(palette.primary)
      .text(`Bank: ${sale.bankDetails?.bankName || admin.bankName || 'N/A'}`, 60, infoBoxY + 22)
      .text(`A/C Name: ${sale.bankDetails?.bankAccountName || admin.businessName || 'N/A'}`, 60, infoBoxY + 34)
      .text(`A/C No: ${sale.bankDetails?.accountNumber || admin.accountNumber || 'N/A'}`, 60, infoBoxY + 46);

    if (sale.additionalComments) {
      doc.rect(310, infoBoxY, 240, 75).fill(palette.bgLight).stroke(palette.border);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(palette.accent).text('NOTES', 320, infoBoxY + 10);
      doc.fontSize(7).font('Helvetica').fillColor(palette.muted).text(sale.additionalComments, 320, infoBoxY + 22, { width: 220 });
    }

    const drawFooter = () => {
      const pageHeight = doc.page.height;
      const bottomMargin = 50;
      const fY = pageHeight - bottomMargin - 38;
      const pW = doc.page.width;
      const m = 50;
      const fSize = 7;
      const fText = 'Shed.ng Inventory & Invoicing  •  Create professional invoices at shed.ng/invoices  •  Computer generated document.';
      const lPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
      const hasFooterLogo = fs.existsSync(lPath);
      const logoWidth = 15;
      const spacing = 6;
      let textWidth = 0;
      try { textWidth = doc.widthOfString(fText, { size: fSize }) || 0; } catch (e) { textWidth = fText.length * 4.2; }
      const totalWidth = (hasFooterLogo ? logoWidth + spacing : 0) + textWidth;
      let centerX = (pW - totalWidth) / 2;
      if (isNaN(centerX) || centerX < 20 || centerX > pW) centerX = 80;
      doc.moveTo(m, fY).lineTo(pW - m, fY).strokeColor(palette.border).lineWidth(0.5).stroke();
      let currentX = centerX;
      if (hasFooterLogo) { doc.image(lPath, currentX, fY + 6, { width: logoWidth }); currentX += logoWidth + spacing; }
      doc.fontSize(fSize).font('Helvetica').fillColor(palette.muted).text(fText, currentX, fY + 9, { lineBreak: false });
    };

    drawFooter();
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

    const localFormatCurrency = (amount) => {
      const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if (!sale) return res.status(404).send('Invoice not found');

    const admin = await db.collection('admins').findOne({ _id: sale.adminId });

    // Build a styled PDF (abbreviated for readability — same as original)
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filename = `invoice-${saleId}.pdf`;
    res.setHeader('Content-disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    const primaryColor = '#2c5530';
    const textColor = '#333333';
    const borderColor = '#cccccc';
    const highlightColor = '#f8f9fa';

    doc.fillColor(primaryColor).fontSize(24).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right' });
    doc.fillColor(textColor).fontSize(16).font('Helvetica-Bold').text('SHED', 50, 50, { align: 'left' });
    doc.fillColor(textColor).fontSize(8).font('Helvetica').text('Inventory, Invoices and More', 50, 68);

    if (admin?.logo && fs.existsSync(path.join(__dirname, '..', 'public', admin.logo))) {
      try { doc.image(path.join(__dirname, '..', 'public', admin.logo), 450, 50, { width: 80, height: 80, fit: [80, 80] }); } catch (e) {}
    }

    doc.moveTo(50, 90).lineTo(550, 90).strokeColor(primaryColor).lineWidth(2).stroke();
    let currentY = 110;

    doc.rect(50, currentY, 230, 60).fill('#8fb996');
    doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text('FROM:', 60, currentY + 10);
    doc.font('Helvetica').text(admin?.businessName || 'Business Name', 60, currentY + 25).text(admin?.email || 'N/A', 60, currentY + 38).text(admin?.phone || 'N/A', 60, currentY + 51);

    doc.rect(300, currentY, 250, 60).fill('#8fb996');
    doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text('INVOICE DETAILS:', 310, currentY + 10);
    doc.font('Helvetica').text(`Invoice #: ${saleId.slice(-8)}`, 310, currentY + 25).text(`Date: ${new Date(sale.date).toLocaleDateString()}`, 310, currentY + 38).text(`Due: ${new Date(sale.date).toLocaleDateString()}`, 310, currentY + 51);

    currentY += 80;
    doc.rect(50, currentY, 500, 50).fill(highlightColor);
    doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text('BILL TO:', 60, currentY + 10);
    doc.font('Helvetica').text(sale.customerName, 60, currentY + 25).text(sale.phoneNumber || 'N/A', 60, currentY + 38).text(sale.email || 'N/A', 200, currentY + 38);

    currentY += 70;
    doc.rect(50, currentY, 500, 25).fill(primaryColor);
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold').text('ITEMS DETAILS', 50, currentY + 7, { width: 500, align: 'center' });
    currentY += 30;

    const colWidths = [220, 70, 80, 70, 60];
    doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
    doc.text('Description', 50, currentY);
    doc.text('Qty', 270, currentY, { width: colWidths[1], align: 'center' });
    doc.text('Unit Price', 340, currentY, { width: colWidths[2], align: 'right' });
    doc.text('VAT', 420, currentY, { width: colWidths[3], align: 'right' });
    doc.text('Amount', 490, currentY, { width: colWidths[4], align: 'right' });

    doc.moveTo(50, currentY + 12).lineTo(550, currentY + 12).strokeColor(borderColor).lineWidth(1).stroke();
    currentY += 20;

    doc.fillColor(textColor).font('Helvetica').fontSize(9);
    let itemsY = currentY;

    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach((item, index) => {
        if (index % 2 === 0) doc.rect(50, itemsY - 5, 500, 20).fill(highlightColor).opacity(0.3);
        doc.fillColor(textColor).text(item.itemName || 'N/A', 55, itemsY, { width: colWidths[0] - 10 });
        doc.text(String(item.quantity || 0), 270, itemsY, { width: colWidths[1], align: 'center' });
        doc.text(`${admin?.currency || '$'} ${localFormatCurrency(item.unitCost)}`, 340, itemsY, { width: colWidths[2], align: 'right' });
        if (item.isVatable && item.vatAmount > 0) doc.fillColor('#4a7c59').text(`${item.vatRate}%`, 420, itemsY, { width: colWidths[3], align: 'right' });
        else doc.fillColor('#666666').text('N/A', 420, itemsY, { width: colWidths[3], align: 'right' });
        doc.fillColor(textColor).text(`${admin?.currency || '$'} ${localFormatCurrency(item.totalCost)}`, 490, itemsY, { width: colWidths[4], align: 'right' });
        itemsY += 20;
      });
    }

    doc.moveTo(50, itemsY + 5).lineTo(550, itemsY + 5).strokeColor(borderColor).lineWidth(1).stroke();
    currentY = itemsY + 20;

    const totalsLeft = 350;
    const subtotal = sale.subtotalAmount || sale.totalAmount || 0;
    const vatTotal = sale.totalVatAmount || 0;
    const finalTotal = sale.totalAmount || 0;

    doc.fillColor(textColor).fontSize(9).font('Helvetica').text('Subtotal:', totalsLeft, currentY, { width: 100, align: 'right' });
    doc.text(`${admin?.currency || '$'} ${localFormatCurrency(subtotal)}`, totalsLeft + 120, currentY, { width: 80, align: 'right' });
    currentY += 15;

    if (vatTotal > 0) {
      doc.fillColor('#4a7c59').font('Helvetica-Bold').text(`VAT (${sale.vatRate || 0}%):`, totalsLeft, currentY, { width: 100, align: 'right' });
      doc.text(`${admin?.currency || '$'} ${localFormatCurrency(vatTotal)}`, totalsLeft + 120, currentY, { width: 80, align: 'right' });
      currentY += 15;
    }

    doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('TOTAL:', totalsLeft, currentY, { width: 100, align: 'right' });
    doc.text(`${admin?.currency || '$'} ${localFormatCurrency(finalTotal)}`, totalsLeft + 120, currentY, { width: 80, align: 'right' });
    currentY += 30;

    doc.rect(50, currentY, 500, 60).fill(highlightColor);
    doc.fillColor(textColor).fontSize(10).font('Helvetica-Bold').text('PAYMENT INFORMATION:', 60, currentY + 10);
    doc.font('Helvetica').text(`Method: ${sale.paymentMethod || 'N/A'}`, 60, currentY + 25).text(`Status: ${sale.paymentStatus || 'Pending'}`, 60, currentY + 38).text(`Date: ${new Date(sale.date).toLocaleDateString()}`, 60, currentY + 51);

    const footerY = 750;
    doc.moveTo(50, footerY).lineTo(550, footerY).strokeColor(borderColor).lineWidth(0.5).stroke();
    doc.fillColor('#666666').fontSize(8).font('Helvetica')
      .text('Thank you for your business!', 50, footerY + 10, { align: 'center' })
      .text(`Generated on: ${new Date().toLocaleString()}`, 50, footerY + 22, { align: 'center' })
      .text('For questions, please contact us at the email above', 50, footerY + 34, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating public invoice:', error);
    res.status(500).send('Error generating invoice');
  }
};
