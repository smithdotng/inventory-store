const { ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');

const countryCodes = require('country-code-lookup');
const { countries } = require('country-data');
const { isAccountLocked } = require('../utils/subscription');
const { BUSINESS_CATEGORIES } = require('../utils/categories');

// Helper: build public store view
function buildPublicStore(admin) {
  let whatsappNumber = '';
  if (admin.publicPhone && admin.phone) {
    let phone = String(admin.phone).replace(/\D/g, '');
    if (!phone.startsWith('+')) {
      let countryCode = '+234';
      if (admin.country) {
        try {
          const country = countryCodes.byIso(admin.country) || countryCodes.byCountry(admin.country);
          if (country && country.countryCallingCodes && country.countryCallingCodes.length > 0) {
            countryCode = '+' + country.countryCallingCodes[0].replace(/\D/g, '');
          }
        } catch (e) {}
      }
      phone = phone.replace(/^0+/, '');
      whatsappNumber = countryCode + phone;
    } else {
      whatsappNumber = '+' + phone;
    }
    if (whatsappNumber.length < 10 || whatsappNumber.length > 15) whatsappNumber = '';
  }
  return {
    _id: admin._id,
    username: admin.username,
    businessName: admin.businessName || admin.username,
    logo: admin.logo || null,
    currency: admin.currency || '₦',
    country: admin.country || null,
    description: admin.description || '',
    paymentInstructions: admin.paymentInstructions || '',
    whatsappNumber,
    social: {
      instagram: admin.instagram || admin.social?.instagram || null,
      twitter: admin.twitter || admin.social?.twitter || null,
      facebook: admin.facebook || admin.social?.facebook || null,
      website: admin.website || admin.social?.website || null,
    },
  };
}

function publicProduct(item) {
  return {
    _id: item._id,
    name: item.name,
    cost: Number(item.cost) || 0,
    stock: Number(item.stock) || 0,
    images: Array.isArray(item.images) ? item.images : [],
    description: item.description || '',
    category: item.category || null,
  };
}

async function findStoreByUsername(username) {
  const db = getDb();
  return db.collection('admins').findOne({
    username: { $regex: `^${username}$`, $options: 'i' },
  });
}

// Helper: generate PDF invoice for store checkout
async function generatePDFInvoice(res, sale, admin) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const filename = `invoice-${sale._id}.pdf`;
  res.setHeader('Content-disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  const formatCurrency = (amount) => Number(amount || 0).toFixed(2);

  try {
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    if (admin.logo && fs.existsSync(path.join(__dirname, '..', 'public', admin.logo))) {
      try {
        doc.image(path.join(__dirname, '..', 'public', admin.logo), 50, 60, { width: 100 });
        doc.moveDown(5);
      } catch (err) {
        console.error('Error loading logo:', err);
      }
    }

    doc.fontSize(20).text('INVOICE', { align: 'right' });
    doc.fontSize(10).text(`Invoice #: ${sale._id}`, { align: 'right' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text(admin.businessName || 'Business Name', { align: 'left' });
    if (admin.businessAddress) doc.text(admin.businessAddress, { align: 'left' });
    if (admin.businessPhone) doc.text(`Phone: ${admin.businessPhone}`, { align: 'left' });
    if (admin.email) doc.text(`Email: ${admin.email}`, { align: 'left' });
    doc.moveDown(2);

    doc.fontSize(12).text('BILL TO:', { underline: true });
    doc.text(sale.customerName || 'Customer');
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown(2);

    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [250, 80, 100, 100];
    const rowHeight = 20;

    doc.font('Helvetica-Bold');
    doc.text('Description', tableLeft, tableTop);
    doc.text('Qty', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
    doc.text('Unit Price', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('Amount', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });
    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), tableTop + 15).stroke();
    doc.font('Helvetica');

    let y = tableTop + rowHeight;
    (sale.items || []).forEach(item => {
      doc.text(item.itemName, tableLeft, y);
      doc.text(String(item.quantity), tableLeft + colWidths[0], y, { width: colWidths[1], align: 'right' });
      doc.text(`${admin.currency || '$'} ${formatCurrency(item.unitCost)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
      doc.text(`${admin.currency || '$'} ${formatCurrency(item.totalCost)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
      y += rowHeight;
    });

    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('TOTAL', tableLeft + colWidths[0] + colWidths[1], y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency || '$'} ${formatCurrency(sale.totalAmount)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(3);

    if (admin.paymentInstructions) {
      doc.fontSize(12).text('PAYMENT INSTRUCTIONS:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(admin.paymentInstructions);
      doc.moveDown();
    }

    const hasBankDetails = admin.primaryAccount || admin.secondaryAccount;
    if (hasBankDetails) {
      doc.fontSize(12).text('BANK DETAILS:', { underline: true });
      doc.moveDown(0.5);
      const leftX = 50;
      const rightX = 300;
      const startY = doc.y;

      if (admin.primaryAccount) {
        doc.fontSize(10).font('Helvetica-Bold').text('Primary Account:', leftX, startY);
        doc.font('Helvetica');
        if (admin.primaryAccount.bankAccountName) doc.text(`Account Name: ${admin.primaryAccount.bankAccountName}`, leftX, doc.y);
        if (admin.primaryAccount.accountNumber) doc.text(`Account Number: ${admin.primaryAccount.accountNumber}`, leftX, doc.y);
        if (admin.primaryAccount.bankName) doc.text(`Bank: ${admin.primaryAccount.bankName}`, leftX, doc.y);
      }

      if (admin.secondaryAccount) {
        doc.fontSize(10).font('Helvetica-Bold').text('Secondary Account:', rightX, startY);
        doc.font('Helvetica');
        let y2 = startY + 12;
        if (admin.secondaryAccount.bankAccountName) { doc.text(`Account Name: ${admin.secondaryAccount.bankAccountName}`, rightX, y2); y2 = doc.y; }
        if (admin.secondaryAccount.accountNumber) { doc.text(`Account Number: ${admin.secondaryAccount.accountNumber}`, rightX, doc.y); y2 = doc.y; }
        if (admin.secondaryAccount.bankName) doc.text(`Bank: ${admin.secondaryAccount.bankName}`, rightX, doc.y);
      }

      doc.moveDown();
    }

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) res.status(500).send('Error generating PDF invoice');
    doc.end();
  }
}

// GET /store/:adminUsername
exports.getStore = async (req, res) => {
  try {
    const db = getDb();
    const adminUsername = req.params.adminUsername;
    const saleId = req.query.saleId;

    const admin = await db.collection('admins').findOne({
      username: { $regex: `^${adminUsername}$`, $options: 'i' }
    });
    if (!admin) return res.status(404).render('404', { message: 'Store not found' });
    if (isAccountLocked(admin)) {
      return res.status(503).render('account-locked', { businessName: admin.businessName || admin.username, forBusinessUser: false });
    }

    let sale = null;
    if (saleId && ObjectId.isValid(saleId)) {
      sale = await db.collection('sales').findOne({
        _id: new ObjectId(saleId),
        adminId: admin._id,
        source: 'storefront'
      });
    }

    const inventory = await db.collection('inventory')
      .find({ adminId: admin._id, stock: { $gt: 0 } })
      .toArray();

    let whatsappNumber = '';
    if (admin.publicPhone && admin.phone) {
      let phone = admin.phone.replace(/\D/g, '');
      if (!phone.startsWith('+')) {
        let countryCode = '+234';
        if (admin.country) {
          try {
            const country = countryCodes.byIso(admin.country) || countryCodes.byCountry(admin.country);
            if (country && country.countryCallingCodes && country.countryCallingCodes.length > 0) {
              countryCode = '+' + country.countryCallingCodes[0].replace(/\D/g, '');
            }
          } catch (error) {}
        }
        phone = phone.replace(/^0+/, '');
        whatsappNumber = countryCode + phone;
      } else {
        whatsappNumber = '+' + phone;
      }
      if (whatsappNumber.length < 10 || whatsappNumber.length > 15) whatsappNumber = '';
    }

    const getSocialHandle = (url, platform) => {
      try {
        if (!url) return 'N/A';
        const urlObj = new URL(url);
        const pathStr = urlObj.pathname;
        let handle = pathStr.split('/').filter(segment => segment).pop() || 'N/A';
        if (platform === 'twitter') handle = '@' + handle;
        return handle;
      } catch (e) { return 'N/A'; }
    };

    const formatCurrency = (amount) => {
      if (!amount) return '0.00';
      return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const featuredAds = await db.collection('featured_ads')
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .toArray();

    const host = process.env.BASE_URL || req.get('host') || 'localhost:3000';
    const buyerProfile = req.session.buyer || null;
    const templateData = { admin, outlet: undefined, inventory, currency: admin.currency || '$', whatsappNumber, host, formatCurrency, getSocialHandle, featuredAds, buyerProfile, shopper: req.session.shopper || null };

    if (sale) {
      Object.assign(templateData, {
        saleId: sale._id,
        customerName: sale.customerName,
        phoneNumber: sale.phoneNumber,
        email: sale.email,
        saleItems: sale.items,
        totalAmount: sale.totalAmount,
        invoiceUrl: `/store/${adminUsername}/confirmation/${sale._id}?token=${req.query.token}&format=pdf`,
        paymentInstructions: admin.paymentInstructions
      });
    }

    res.render('storefront', templateData);
  } catch (error) {
    console.error('Error rendering storefront:', error);
    res.status(500).render('500', { message: 'Error loading store', error: process.env.NODE_ENV === 'development' ? error : undefined });
  }
};

// GET /store/:adminUsername/product/:productId
exports.getStoreProduct = async (req, res) => {
  try {
    const db = getDb();
    const { adminUsername, productId } = req.params;

    if (!ObjectId.isValid(productId)) return res.status(404).render('404', { message: 'Product not found' });

    const admin = await db.collection('admins').findOne({ username: { $regex: `^${adminUsername}$`, $options: 'i' } });
    if (!admin) return res.status(404).render('404', { message: 'Store not found' });
    if (isAccountLocked(admin)) {
      return res.status(503).render('account-locked', { businessName: admin.businessName || admin.username, forBusinessUser: false });
    }

    const product = await db.collection('inventory').findOne({ _id: new ObjectId(productId), adminId: admin._id, stock: { $gt: 0 } });
    if (!product) return res.status(404).render('404', { message: 'Product not found or out of stock' });

    const formatCurrency = (amount) => {
      if (!amount) return '0.00';
      return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    res.render('product', { admin, product, currency: admin.currency || '$', formatCurrency, shopper: req.session.shopper || null });
  } catch (error) {
    console.error('Error rendering product page:', error);
    res.status(500).render('500', { message: 'Error loading product page', error: process.env.NODE_ENV === 'development' ? error : undefined });
  }
};

// POST /store/:adminUsername/checkout
exports.postCheckout = async (req, res) => {
  try {
    const db = getDb();
    const adminUsername = req.params.adminUsername;
    const { customerName, phoneNumber, email, cartItems } = req.body;

    const missingFields = [];
    if (!customerName) missingFields.push('customerName');
    if (!phoneNumber) missingFields.push('phoneNumber');
    if (!email) missingFields.push('email');
    if (!cartItems) missingFields.push('cartItems');

    if (missingFields.length > 0) return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (!/^\+?[\d\s-]{6,}$/.test(phoneNumber)) return res.status(400).json({ error: 'Invalid phone number format' });

    const admin = await db.collection('admins').findOne({ username: adminUsername });
    if (!admin) return res.status(404).json({ error: 'Store not found' });
    if (isAccountLocked(admin)) return res.status(503).json({ error: 'This store is temporarily unavailable.' });

    let parsedCart;
    try {
      parsedCart = JSON.parse(cartItems);
      if (!Array.isArray(parsedCart)) throw new Error('Invalid cart items format');
    } catch (err) {
      return res.status(400).json({ error: 'Invalid cart items data' });
    }

    if (parsedCart.length === 0) return res.status(400).json({ error: 'No items in cart' });

    for (const item of parsedCart) {
      if (!item.id || !item.quantity) return res.status(400).json({ error: 'Invalid cart item format' });
      if (item.quantity <= 0) return res.status(400).json({ error: `Invalid quantity for ${item.name || 'item'}` });
      if (!ObjectId.isValid(item.id)) return res.status(400).json({ error: `Invalid item ID: ${item.id}` });
    }

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const customer = {
          adminId: admin._id,
          name: customerName.trim(),
          phone: phoneNumber.trim(),
          email: email.trim().toLowerCase(),
          createdAt: new Date()
        };
        const customerResult = await db.collection('customers').insertOne(customer, { session });

        const saleItemsArray = [];
        let totalAmount = 0;

        for (const cartItem of parsedCart) {
          const item = await db.collection('inventory').findOne({ _id: new ObjectId(cartItem.id), adminId: admin._id }, { session });
          if (!item) throw new Error(`Item not found: ${cartItem.name || cartItem.id}`);
          if (item.stock < cartItem.quantity) throw new Error(`Insufficient stock for ${item.name}`);

          const totalCost = parseFloat(cartItem.cost || item.cost) * cartItem.quantity;
          saleItemsArray.push({ itemId: item._id, itemName: item.name, quantity: cartItem.quantity, unitCost: parseFloat(cartItem.cost || item.cost), totalCost });
          totalAmount += totalCost;

          await db.collection('inventory').updateOne({ _id: item._id }, { $inc: { stock: -cartItem.quantity } }, { session });
        }

        const sale = {
          adminId: admin._id,
          customerId: customerResult.insertedId,
          customerName: customer.name,
          phoneNumber: customer.phone,
          email: customer.email,
          items: saleItemsArray,
          totalAmount,
          paymentMethod: 'Online',
          paymentStatus: 'Pending',
          date: new Date(),
          source: 'storefront',
          status: 'completed'
        };

        const saleResult = await db.collection('sales').insertOne(sale, { session });

        const transaction = {
          adminId: admin._id,
          type: 'sale',
          amount: totalAmount,
          date: new Date(),
          description: `Online store sale #${saleResult.insertedId}`,
          reference: `SALE-${saleResult.insertedId}`,
          balanceImpact: 1
        };
        await db.collection('transactions').insertOne(transaction, { session });

        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;
        await db.collection('invoice_tokens').insertOne({ saleId: saleResult.insertedId, token, expires }, { session });

        let systemAdmin = await db.collection('admins').findOne({ username: 'System', role: 'superadmin' }, { session });
        if (!systemAdmin) {
          const saResult = await db.collection('admins').insertOne({ username: 'System', email: 'system@shed.ng', password: 'N/A', role: 'superadmin', createdAt: new Date() }, { session });
          systemAdmin = { _id: saResult.insertedId };
        }

        const itemsText = saleItemsArray.map(item =>
          `- ${item.itemName || 'N/A'}: ${item.quantity} x ${admin.currency || '$'}${parseFloat(item.unitCost || 0).toFixed(2)} = ${admin.currency}${parseFloat(item.totalCost || 0).toFixed(2)}`
        ).join('\n');

        const notificationText = `New Transaction Notification\nA new transaction has been completed on your online store.\n\nTransaction Details:\n- Sale ID: ${saleResult.insertedId}\n- Customer Name: ${customerName || 'N/A'}\n- Customer Email: ${email || 'N/A'}\n- Customer Phone: ${phoneNumber || 'N/A'}\n- Date: ${new Date(sale.date).toLocaleString()}\n- Total Amount: ${admin.currency || '$'}${parseFloat(totalAmount || 0).toFixed(2)}\n\nItems Purchased:\n${itemsText}\n\nPayment Method: ${sale.paymentMethod || 'N/A'}\nPayment Status: ${sale.paymentStatus || 'Pending'}`;

        await db.collection('messages').insertOne({
          senderId: systemAdmin._id,
          subject: `New Transaction: Sale #${saleResult.insertedId}`,
          content: `<pre>${notificationText}</pre>`,
          recipientId: admin._id,
          createdAt: new Date(),
          read: false,
          readAt: null,
          isHtml: true
        }, { session });

        if (admin.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
          const mailOptions = {
            from: process.env.BUSINESS_USER || 'stanley@shed.ng',
            to: admin.email,
            subject: `New Transaction on Your Store: Sale #${saleResult.insertedId}`,
            html: `<h1>New Transaction Notification</h1><p>Dear ${admin.username || 'Store Owner'},</p><p>A new transaction has been completed on your online store.</p><p>Total Amount: ${admin.currency || '$'}${parseFloat(totalAmount || 0).toFixed(2)}</p><p>View full details: <a href="https://${process.env.BASE_URL || req.get('host')}/sales/${saleResult.insertedId}">Sale Details</a></p>`
          };
          transporter.sendMail(mailOptions).catch(err => console.error('Error sending notification email:', err));
        }

        // Upsert buyer profile so order appears in their dashboard
        await db.collection('buyer_profiles').updateOne(
          { email: customer.email },
          {
            $set:     { name: customer.name, phone: customer.phone, lastPurchase: new Date() },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true, session }
        );

        const invoiceUrl = `/store/${adminUsername}/confirmation/${saleResult.insertedId}?token=${token}`;
        return res.json({ success: true, invoiceUrl, saleId: saleResult.insertedId.toString() });
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Error processing your order', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

// GET /store/:adminUsername/confirmation/:saleId
exports.getStoreConfirmation = async (req, res) => {
  try {
    const db = getDb();
    const { adminUsername, saleId } = req.params;
    const { token } = req.query;

    if (!ObjectId.isValid(saleId)) return res.status(400).json({ error: 'Invalid sale ID' });

    const tokenEntry = await db.collection('invoice_tokens').findOne({ saleId: new ObjectId(saleId), token });
    if (!tokenEntry || tokenEntry.expires < Date.now()) return res.status(403).json({ error: 'This confirmation link is invalid or has expired' });

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), source: 'storefront' });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const admin = await db.collection('admins').findOne({ username: adminUsername });
    if (!admin) return res.status(404).json({ error: 'Store not found' });

    if (req.query.format === 'pdf') {
      return generatePDFInvoice(res, sale, admin);
    }

    const formatCurrency = (amount) => Number(amount).toFixed(2);

    res.render('storefront-confirmation', {
      saleId: sale._id,
      adminEmail: admin.email || 'N/A',
      email: sale.email || 'N/A',
      phoneNumber: sale.phoneNumber || 'N/A',
      admin,
      customerName: sale.customerName || 'N/A',
      saleItems: sale.items || [],
      totalAmount: sale.totalAmount || 0,
      currency: admin.currency || '$',
      formatCurrency,
      invoiceUrl: `/store/${adminUsername}/confirmation/${sale._id}?token=${token}&format=pdf`
    });
  } catch (error) {
    console.error('Confirmation error:', error);
    return res.status(500).json({ error: 'Error rendering confirmation', details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
};

// GET /search
exports.getSearch = async (req, res) => {
  const db = getDb();
  const category = (req.query && req.query.category && BUSINESS_CATEGORIES.includes(req.query.category)) ? req.query.category : '';
  const clusterSlug = (req.query && req.query.cluster) ? String(req.query.cluster).trim() : '';

  // Filter dropdown data — cheap, small collections, safe to load on every
  // search request regardless of whether a query was typed.
  const clusters = await db.collection('market_clusters').find({ isActive: true }).sort({ name: 1 }).toArray();

  try {
    const query = (req.query && req.query.q) ? String(req.query.q).trim() : '';
    const type = (req.query && req.query.type) ? String(req.query.type) : 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    let stores = [];
    let products = [];
    let totalStores = 0;
    let totalProducts = 0;

    let selectedCluster = null;
    if (clusterSlug) {
      selectedCluster = clusters.find(c => c.slug === clusterSlug) || null;
    }

    // Category/cluster act as filters on top of (or instead of) a text
    // search — browsing "/search?category=Electricals" with no query still
    // returns every store in that category.
    const hasFilters = query.length > 0 || category || selectedCluster;

    if (hasFilters) {
      const storeClauses = [];
      if (query) {
        storeClauses.push({
          $or: [
            { businessName: { $regex: query, $options: 'i' } },
            { username: { $regex: query, $options: 'i' } }
          ]
        });
      }
      if (category) storeClauses.push({ category });
      // Governance: filtering by cluster only surfaces verified stores —
      // an unverified store's cluster pick is inert until superadmin approves it.
      if (selectedCluster) storeClauses.push({ clusterId: selectedCluster._id, isVerified: true });
      const storeQuery = storeClauses.length ? { $and: storeClauses } : {};

      if (type === 'all' || type === 'stores') {
        totalStores = await db.collection('admins').countDocuments(storeQuery);
        stores = await db.collection('admins').find(storeQuery)
          .project({ businessName: 1, username: 1, logo: 1, description: 1, country: 1, category: 1, isVerified: 1 })
          .skip(skip).limit(limit).toArray();
      }

      if (type === 'all' || type === 'products') {
        const productClauses = [];
        if (query) {
          productClauses.push({
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } }
            ]
          });
        }
        // Products don't carry the store's business category/cluster
        // directly, so resolve matching store IDs first when either filter
        // is active.
        if (category || selectedCluster) {
          const storeFilter = {};
          if (category) storeFilter.category = category;
          if (selectedCluster) { storeFilter.clusterId = selectedCluster._id; storeFilter.isVerified = true; }
          const matchingStoreIds = await db.collection('admins').find(storeFilter).project({ _id: 1 }).toArray();
          productClauses.push({ adminId: { $in: matchingStoreIds.map(s => s._id) } });
        }
        const productQuery = productClauses.length ? { $and: productClauses } : {};

        totalProducts = await db.collection('inventory').countDocuments(productQuery);
        products = await db.collection('inventory').aggregate([
          { $match: productQuery },
          { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
          { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, name: 1, cost: 1, images: 1, stock: 1, storeName: '$store.businessName', storeUsername: '$store.username', storeLogo: '$store.logo' } },
          { $skip: skip },
          { $limit: limit }
        ]).toArray();
      }
    }

    const totalResults = totalStores + totalProducts;
    const totalPages = Math.ceil(totalResults / limit);

    const templateData = {
      query,
      type,
      stores,
      products,
      totalStores,
      totalProducts,
      totalResults,
      page,
      totalPages,
      error: null,
      category,
      categories: BUSINESS_CATEGORIES,
      clusters,
      clusterSlug,
      formatCurrency: (amount) => `₦${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      formatDate: (date) => date ? new Date(date).toLocaleDateString() : '',
      truncateText: (text) => text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '',
      shopper: req.session.shopper || null
    };

    res.render('search-results', templateData);
  } catch (error) {
    console.error('Error in search route:', error);
    res.status(500).render('search-results', {
      query: req.query?.q || '',
      type: req.query?.type || 'all',
      stores: [],
      products: [],
      totalStores: 0,
      totalProducts: 0,
      totalResults: 0,
      page: 1,
      totalPages: 1,
      error: 'An error occurred while searching. Please try again.',
      category,
      categories: BUSINESS_CATEGORIES,
      clusters,
      clusterSlug,
      formatCurrency: (amount) => `₦${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      formatDate: (date) => date ? new Date(date).toLocaleDateString() : '',
      truncateText: (text) => text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : ''
    });
  }
};

// Export helpers for use in apiController
exports.buildPublicStore = buildPublicStore;
exports.publicProduct = publicProduct;
exports.findStoreByUsername = findStoreByUsername;
exports.generatePDFInvoice = generatePDFInvoice;
