const { ObjectId } = require('mongodb');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const { formatCurrency } = require('../utils/helpers');

// GET /pos-debug
exports.getPosDebug = (req, res) => {
  console.log('=== POS-DEBUG ROUTE ===');
  console.log('Session:', req.session);
  console.log('req.user:', req.user);
  res.send(`
    <h1>POS Debug</h1>
    <pre>Session: ${JSON.stringify(req.session, null, 2)}</pre>
    <pre>req.user: ${JSON.stringify(req.user, null, 2)}</pre>
    <a href="/pos">Try real POS</a>
  `);
};

// GET /pos
exports.getPos = async (req, res) => {
  try {
    const db = getDb();
    console.log('=== POS ROUTE HIT ===');
    console.log('req.user:', req.user);
    console.log('Session:', req.session);

    let admin = null;

    if (req.user.type === 'business_user') {
      if (req.user.adminDetails) {
        admin = {
          _id: new ObjectId(req.user.adminId),
          username: req.user.adminDetails.username || 'admin',
          businessName: req.user.adminDetails.businessName,
          logo: req.user.adminDetails.logo,
          currency: req.user.adminDetails.currency,
          country: req.user.adminDetails.country,
          applyVat: req.user.adminDetails.applyVat,
          vatRate: req.user.adminDetails.vatRate
        };
      } else if (req.user.adminId) {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
      }
    } else if (req.user.type === 'admin') {
      admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
    }

    if (!admin) {
      console.error('Admin not found for POS');
      req.session.destroy();
      return res.redirect('/admin-login?error=Business account not found. Please contact administrator.');
    }

    const inventory = await db.collection('inventory').find({
      adminId: admin._id,
      stock: { $gt: 0 }
    }).toArray();

    const username = req.user.username;

    res.render('pos', {
      inventory,
      admin,
      username,
      formatCurrency,
      currentRole: req.user.role
    });
  } catch (error) {
    console.error('POS ROUTE ERROR:', error.message, error.stack);
    res.status(500).render('error', {
      message: 'Error loading POS system. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
};

// POST /admin/sales-form
exports.postSalesForm = async (req, res) => {
  const { customerName, phoneNumber, email, items, paymentMethod } = req.body;
  try {
    const db = getDb();
    if (!customerName || !items || !paymentMethod) return res.status(400).send('Customer name, items, and payment method are required.');

    let admin;
    if (req.user) {
      if (req.user.type === 'admin') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
      } else if (req.user.type === 'business_user') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
      }
    } else if (req.session.admin) {
      admin = await db.collection('admins').findOne({ username: req.session.admin });
    }

    if (!admin) return res.status(404).send('Admin not found. Please log in again.');

    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];
    if (itemIds.length !== quantities.length) return res.status(400).send('Mismatch between items and quantities.');

    const saleItems = [];
    let totalOrderAmount = 0;
    let totalVatAmount = 0;
    let subtotalAmount = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);
      if (isNaN(qty)) return res.status(400).send(`Invalid quantity for item ${itemId}.`);
      const objectId = new ObjectId(itemId);
      const item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });
      if (!item) return res.status(404).send(`Item with ID ${itemId} not found in inventory.`);
      if (item.stock < qty || qty <= 0) return res.status(400).send(`Invalid quantity or insufficient stock for ${item.name}.`);

      const unitCost = item.cost;
      const totalCost = unitCost * qty;

      let vatAmount = 0;
      let vatRate = 0;
      let isVatable = false;

      if (admin.applyVat && item.isVatable) {
        vatRate = admin.vatRate || 0;
        vatAmount = (totalCost * vatRate) / 100;
        isVatable = true;
        totalVatAmount += vatAmount;
      }

      const itemTotalWithVat = totalCost + vatAmount;

      saleItems.push({
        itemId: objectId,
        itemName: item.name,
        quantity: qty,
        unitCost: unitCost,
        totalCost: totalCost,
        isVatable: isVatable,
        vatRate: vatRate,
        vatAmount: vatAmount,
        itemTotalWithVat: itemTotalWithVat
      });

      subtotalAmount += totalCost;
      totalOrderAmount += itemTotalWithVat;
    }

    res.render('confirm-transaction', {
      username: req.user?.username || req.session.admin,
      admin,
      customerName,
      phoneNumber: phoneNumber || 'N/A',
      email: email || 'N/A',
      saleItems,
      subtotalAmount,
      totalVatAmount,
      totalOrderAmount,
      paymentMethod,
      currency: admin.currency || '$',
      formatCurrency,
      calculateVat: (price, vatRate) => (price * vatRate) / 100,
      getPriceWithVat: (price, vatRate) => price + ((price * vatRate) / 100)
    });
  } catch (error) {
    console.error('Error processing transaction:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /payment-sales-confirmation/:saleId
exports.getPaymentConfirmation = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');
    res.render('payment-sales-confirmation', { sale, admin, username: req.session.admin, formatCurrency });
  } catch (error) {
    console.error('Error fetching sale details:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /confirm-sale
exports.postConfirmSale = async (req, res) => {
  try {
    const db = getDb();
    const { customerName, phoneNumber, email, saleItems, totalOrderAmount, paymentMethod } = req.body;

    const missingFields = [];
    if (!customerName) missingFields.push('customerName');
    if (!saleItems) missingFields.push('saleItems');
    if (!totalOrderAmount) missingFields.push('totalOrderAmount');
    if (!paymentMethod) missingFields.push('paymentMethod');

    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    let parsedSaleItems;
    try {
      if (typeof saleItems === 'string') {
        parsedSaleItems = JSON.parse(saleItems);
        if (!Array.isArray(parsedSaleItems)) parsedSaleItems = [parsedSaleItems];
      } else if (Array.isArray(saleItems)) {
        parsedSaleItems = saleItems;
      } else {
        throw new Error('Invalid sale items format');
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid sale items data' });
    }

    if (parsedSaleItems.length === 0) return res.status(400).json({ error: 'No items in sale' });

    for (const item of parsedSaleItems) {
      if (!item.itemId || !item.quantity || !item.unitCost) return res.status(400).json({ error: 'Invalid sale item format' });
      if (item.quantity <= 0) return res.status(400).json({ error: `Invalid quantity for ${item.itemName || 'item'}` });
      if (!ObjectId.isValid(item.itemId)) return res.status(400).json({ error: `Invalid item ID: ${item.itemId}` });
    }

    let admin;
    if (req.user) {
      if (req.user.type === 'admin') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
      } else if (req.user.type === 'business_user') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
      }
    } else if (req.session.admin) {
      admin = await db.collection('admins').findOne({ username: req.session.admin });
    }

    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const item of parsedSaleItems) {
          const inventoryItem = await db.collection('inventory').findOne(
            { _id: new ObjectId(item.itemId), adminId: admin._id }, { session }
          );
          if (!inventoryItem) throw new Error(`Item not found: ${item.itemName || item.itemId}`);
          if (inventoryItem.stock < item.quantity) throw new Error(`Insufficient stock for ${inventoryItem.name}`);
          await db.collection('inventory').updateOne(
            { _id: new ObjectId(item.itemId) },
            { $inc: { stock: -item.quantity } },
            { session }
          );
        }

        const customer = {
          adminId: admin._id,
          name: customerName.trim(),
          phone: phoneNumber ? phoneNumber.trim() : 'N/A',
          email: email ? email.trim().toLowerCase() : 'N/A',
          createdAt: new Date()
        };
        const customerResult = await db.collection('customers').insertOne(customer, { session });

        const sale = {
          adminId: admin._id,
          customerId: customerResult.insertedId,
          customerName: customerName.trim(),
          phoneNumber: phoneNumber ? phoneNumber.trim() : 'N/A',
          email: email ? email.trim().toLowerCase() : 'N/A',
          items: parsedSaleItems.map(item => ({
            itemId: new ObjectId(item.itemId),
            itemName: item.itemName || 'Unknown',
            quantity: item.quantity,
            unitCost: parseFloat(item.unitCost),
            totalCost: parseFloat(item.unitCost) * item.quantity,
            isVatable: item.isVatable || false,
            vatRate: item.vatRate || 0,
            vatAmount: item.vatAmount || 0,
            itemTotalWithVat: item.itemTotalWithVat || (parseFloat(item.unitCost) * item.quantity)
          })),
          subtotalAmount: parseFloat(req.body.subtotalAmount) || 0,
          totalVatAmount: parseFloat(req.body.totalVatAmount) || 0,
          totalAmount: parseFloat(totalOrderAmount),
          paymentMethod: paymentMethod || 'N/A',
          paymentStatus: 'Confirmed',
          date: new Date(),
          source: 'pos',
          status: 'completed'
        };
        const result = await db.collection('sales').insertOne(sale, { session });
        res.redirect(`/sale-success/${result.insertedId}`);
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Error confirming sale:', error.message, error.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// POST /admin/confirm-sale
exports.postAdminConfirmSale = async (req, res) => {
  const { customerName, phoneNumber, email, itemId, quantity } = req.body;
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const item = await db.collection('inventory').findOne({ _id: new ObjectId(itemId), adminId: admin._id });
    if (!item) return res.status(404).send('Item not found in inventory.');
    if (item.stock < parseInt(quantity) || parseInt(quantity) <= 0) return res.status(400).send('Invalid quantity or insufficient stock.');

    await db.collection('inventory').updateOne(
      { _id: new ObjectId(itemId) },
      { $inc: { stock: -parseInt(quantity) } }
    );

    const sale = {
      adminId: admin._id,
      customerName, phoneNumber, email,
      itemId: new ObjectId(itemId),
      itemName: item.name,
      quantity: parseInt(quantity),
      cost: item.cost,
      totalAmount: item.cost * parseInt(quantity),
      date: new Date()
    };

    const result = await db.collection('sales').insertOne(sale);
    if (result.insertedId) res.render('receipt', { sale, admin, formatCurrency });
    else res.status(500).send('Failed to record sale.');
  } catch (error) {
    console.error('Error processing sale:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /sale-success/:saleId
exports.getSaleSuccess = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;

    let admin;
    if (req.user) {
      if (req.user.type === 'admin') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
      } else if (req.user.type === 'business_user') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
      }
    } else if (req.session.admin) {
      admin = await db.collection('admins').findOne({ username: req.session.admin });
    }

    if (!admin) return res.status(404).send('Admin not found. Please log in again.');

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');

    res.render('sale-success', {
      sale, admin,
      username: req.user?.username || req.session.admin,
      saleId
    });
  } catch (error) {
    console.error('Error loading sale success page:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /send-receipt-email/:saleId
exports.postSendReceiptEmail = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const { email } = req.body;
    if (!email) {
      req.flash('error', 'Recipient email is required.');
      return res.redirect(`/sale-success/${saleId}`);
    }

    let admin;
    if (req.user) {
      if (req.user.type === 'admin') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
      } else if (req.user.type === 'business_user') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
      }
    } else if (req.session.admin) {
      admin = await db.collection('admins').findOne({ username: req.session.admin });
    }

    if (!admin) {
      req.flash('error', 'Admin not found.');
      return res.redirect(`/sale-success/${saleId}`);
    }

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) {
      req.flash('error', 'Sale not found.');
      return res.redirect(`/sale-success/${saleId}`);
    }

    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Receipt for Your Purchase from ${admin.businessName || 'Shed'}`,
        html: `
          <h1>Thank You for Your Purchase!</h1>
          <p>Dear ${sale.customerName || 'Customer'},</p>
          <p>Please find your receipt attached for your recent purchase.</p>
          <p>Business: ${admin.businessName || 'N/A'}</p>
          <p>Date: ${new Date(sale.date).toLocaleDateString()}</p>
          <p>Total Amount: ${admin.currency || '$'}${parseFloat(sale.totalAmount || 0).toFixed(2)}</p>
          <p>Best regards,</p>
          <p>The Business Team</p>
          <a href="https://shed.ng">Shed: Sell Everywhere. Manage Everything</a>
        `,
        attachments: [{ filename: `receipt-${saleId}.pdf`, content: pdfData, contentType: 'application/pdf' }]
      };

      try {
        await transporter.sendMail(mailOptions);
        req.flash('success', 'Receipt email sent successfully.');
        res.redirect(`/sale-success/${saleId}`);
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        req.flash('error', 'Failed to send receipt email. Please try again.');
        res.redirect(`/sale-success/${saleId}`);
      }
    });

    doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    if (admin.logo && fs.existsSync(path.join(__dirname, '..', 'public', admin.logo))) {
      doc.image(path.join(__dirname, '..', 'public', admin.logo), 50, doc.y, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(16).text('Receipt', { align: 'right' });
    doc.moveDown();
    doc.fontSize(14).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(12).text('Items:', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [200, 70, 100, 100];
    const rowHeight = 20;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', tableLeft, tableTop, { width: colWidths[0], align: 'left' });
    doc.text('Quantity', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
    doc.text('Unit Cost', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('Total Cost', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });
    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), tableTop + 15).stroke();
    doc.font('Helvetica');

    let y = tableTop + rowHeight;

    if (sale.items && sale.items.length > 0) {
      sale.items.forEach(item => {
        const unitCost = parseFloat(item.unitCost) || 0;
        const totalCost = unitCost * (parseInt(item.quantity) || 0);
        doc.text(item.itemName || 'N/A', tableLeft, y, { width: colWidths[0], align: 'left' });
        doc.text((item.quantity || 0).toString(), tableLeft + colWidths[0], y, { width: colWidths[1], align: 'right' });
        doc.text(`${admin.currency} ${unitCost.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
        doc.text(`${admin.currency} ${totalCost.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
        y += rowHeight;
      });
    }

    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', tableLeft + colWidths[0] + colWidths[1] - 50, y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency} ${(parseFloat(sale.totalAmount) || 0).toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');

    doc.moveDown(1);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, { align: 'left' });
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, { align: 'left' });

    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
    doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, footerY + 10, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error sending receipt email:', error);
    req.flash('error', 'An unexpected error occurred while sending the receipt. Please try again.');
    res.redirect(`/sale-success/${req.params.saleId}`);
  }
};

// GET /receipt/:saleId
exports.getReceipt = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;

    let admin;
    if (req.user) {
      if (req.user.type === 'admin') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
      } else if (req.user.type === 'business_user') {
        admin = await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
      }
    } else if (req.session.admin) {
      admin = await db.collection('admins').findOne({ username: req.session.admin });
    }

    if (!admin) return res.status(403).send('Admin not found');

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');

    const doc = new PDFDocument({ margin: 50 });
    const filename = `receipt-${saleId}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    const drawFooter = () => {
      const footerY = doc.page.height - 50;
      doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
      doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, footerY + 10, { align: 'center' });
    };

    doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    if (admin.logo && fs.existsSync(path.join(__dirname, '..', 'public', admin.logo))) {
      doc.image(path.join(__dirname, '..', 'public', admin.logo), 50, doc.y, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(16).text('Receipt', { align: 'right' });
    doc.moveDown(3);
    doc.fontSize(14).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(12).text('Items:', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [200, 70, 100, 100];
    const rowHeight = 20;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', tableLeft, tableTop, { width: colWidths[0], align: 'left' });
    doc.text('Quantity', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
    doc.text('Unit Cost', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('Total Cost', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });
    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), tableTop + 15).stroke();
    doc.font('Helvetica');

    let y = tableTop + rowHeight;

    if (sale.items && sale.items.length > 0) {
      sale.items.forEach(item => {
        const unitCost = parseFloat(item.unitCost) || 0;
        const totalCost = unitCost * (parseInt(item.quantity) || 0);
        doc.text(item.itemName || 'N/A', tableLeft, y, { width: colWidths[0], align: 'left' });
        doc.text((item.quantity || 0).toString(), tableLeft + colWidths[0], y, { width: colWidths[1], align: 'right' });
        doc.text(`${admin.currency || '$'} ${formatCurrency(unitCost)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
        doc.text(`${admin.currency || '$'} ${formatCurrency(totalCost)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
        y += rowHeight;
        if (doc.y + rowHeight > doc.page.height - 100) {
          doc.addPage();
          y = doc.y;
        }
      });
    } else {
      doc.text('No items found', tableLeft, y, { width: colWidths[0], align: 'left' });
      y += rowHeight;
    }

    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', tableLeft + colWidths[0] + colWidths[1] - 50, y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency || '$'} ${formatCurrency(parseFloat(sale.totalAmount) || 0)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');

    doc.moveDown(1);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, { align: 'left' });
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, { align: 'left' });

    if (doc.y < doc.page.height - 100) drawFooter();
    else { doc.addPage(); drawFooter(); }

    doc.end();
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).send('Error generating receipt');
  }
};

// GET /transactions
exports.getTransactions = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { startDate, endDate, search } = req.query;
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();

    const filter = {
      $or: [
        { adminId: admin._id },
        { 'outlet.adminId': admin._id }
      ]
    };

    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(`${endDate}T23:59:59.999Z`) };
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$and = [
        { $or: [{ customerName: searchRegex }, { 'items.itemName': searchRegex }, { itemName: searchRegex }] },
        { $or: [{ adminId: admin._id }, { 'outlet.adminId': admin._id }] }
      ];
      delete filter.$or;
    }

    const transactions = await db.collection('sales').aggregate([
      { $match: filter },
      { $lookup: { from: 'outlets', localField: 'outletId', foreignField: '_id', as: 'outlet' } },
      { $unwind: { path: '$outlet', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 } }
    ]).toArray();

    const validTransactions = transactions.map(sale => ({
      ...sale,
      totalAmount: sale.totalAmount || 0,
      items: sale.items || [],
      outletName: sale.outlet ? sale.outlet.name : null
    }));

    res.render('transactions', {
      transactions: validTransactions,
      admin,
      username: req.session.admin,
      inventory,
      startDate: startDate || '',
      endDate: endDate || '',
      search: search || '',
      error: null,
      success: null,
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.render('transactions', {
      transactions: [],
      admin: req.session.admin ? { username: req.session.admin, currency: '₦' } : { currency: '₦' },
      username: req.session.admin || '',
      inventory: [],
      startDate: '',
      endDate: '',
      search: '',
      error: 'Failed to load transactions. Please try again.',
      success: null,
      formatCurrency
    });
  }
};

// POST /transactions/mark-paid/:saleId
exports.postMarkPaid = async (req, res) => {
  try {
    const db = getDb();
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId), adminId: admin._id },
      { $set: { paymentStatus: 'Paid' } }
    );
    res.redirect('/transactions');
  } catch (error) {
    console.error('Error marking transaction as paid:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /commission-reports
exports.getCommissionReports = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    const commissionSummary = await db.collection('commissions').aggregate([
      { $match: { adminId: admin._id } },
      { $group: { _id: '$status', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray();

    const recentPayments = await db.collection('commission_payments')
      .find({ adminId: admin._id })
      .sort({ datePaid: -1 })
      .limit(10)
      .toArray();

    const outletsWithCommissions = await db.collection('outlets').aggregate([
      { $match: { adminId: admin._id } },
      { $lookup: { from: 'commissions', localField: '_id', foreignField: 'outletId', as: 'commissions', pipeline: [{ $match: { status: 'pending' } }] } },
      { $addFields: { pendingCommission: { $sum: '$commissions.amount' } } },
      { $match: { pendingCommission: { $gt: 0 } } }
    ]).toArray();

    res.render('commission-reports', {
      admin,
      username: req.session.admin,
      summary: commissionSummary,
      payments: recentPayments,
      outlets: outletsWithCommissions,
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching commission reports:', error);
    res.status(500).send('Internal Server Error');
  }
};
