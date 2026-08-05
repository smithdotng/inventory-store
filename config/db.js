const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;
let db;

async function connectToMongo() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);

    // Create indexes for subscriptions collection
    const subscriptionsCollection = db.collection('subscriptions');
    await subscriptionsCollection.createIndex({ email: 1 }, { unique: true });

    // Create indexes for business_users collection
    const businessUsersCollection = db.collection('business_users');
    try {
      await businessUsersCollection.createIndex({ email: 1 }, { unique: true });
      await businessUsersCollection.createIndex({ username: 1 }, { unique: true });
      await businessUsersCollection.createIndex({ adminId: 1 });
      await businessUsersCollection.createIndex({ role: 1 });
      await businessUsersCollection.createIndex({ status: 1 });
      await businessUsersCollection.createIndex({ invitationToken: 1 });
      await businessUsersCollection.createIndex({ adminId: 1, status: 1 });
      console.log('Business users indexes created');
    } catch (indexError) {
      console.warn('Some indexes may already exist:', indexError.message);
    }

    // Create login_logs collection with indexes
    const loginLogsCollection = db.collection('login_logs');
    try {
      await loginLogsCollection.createIndex({ userId: 1 });
      await loginLogsCollection.createIndex({ loginTime: -1 });
      await loginLogsCollection.createIndex({ role: 1 });
      await loginLogsCollection.createIndex({ userId: 1, loginTime: -1 });
    } catch (error) {
      console.warn('Login logs indexes:', error.message);
    }

    // Create admins collection with initial superadmin
    const adminCollection = db.collection('admins');
    if (await adminCollection.countDocuments() === 0) {
      const hashedPassword = await bcrypt.hash('superadmin123', 10);
      await adminCollection.insertOne({
        username: 'superadmin',
        password: hashedPassword,
        role: 'superadmin',
        businessName: 'Shed Administration',
        email: 'admin@shed.ng',
        firstName: 'Super',
        lastName: 'Admin',
        logo: '/images/logo.png',
        currency: '₦',
        country: 'NG',
        applyVat: false,
        vatRate: 0,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log('Initial superadmin account seeded');
    }

    // Create business_users collection with initial sample data (optional)
    if (await businessUsersCollection.countDocuments() === 0) {
      console.log('Business users collection is empty - ready for use');
    }

    // Create inventory collection
    const inventoryCollection = db.collection('inventory');
    try {
      await inventoryCollection.createIndex({ adminId: 1 });
      await inventoryCollection.createIndex({ name: 1 });
      await inventoryCollection.createIndex({ adminId: 1, name: 1 });
    } catch (error) {
      console.warn('Inventory indexes:', error.message);
    }

    // Create indexes for other collections
    const collections = [
      { name: 'outlets', indexes: [
        { key: { adminId: 1 } },
        { key: { username: 1 }, options: { unique: true } }
      ]},
      { name: 'sales', indexes: [
        { key: { adminId: 1 } },
        { key: { outletId: 1 } },
        { key: { date: -1 } },
        { key: { adminId: 1, date: -1 } }
      ]},
      { name: 'customers', indexes: [
        { key: { adminId: 1 } },
        { key: { email: 1 } },
        { key: { adminId: 1, email: 1 } }
      ]},
      { name: 'commissions', indexes: [
        { key: { adminId: 1 } },
        { key: { outletId: 1 } },
        { key: { status: 1 } }
      ]},
      { name: 'messages', indexes: [
        { key: { recipientId: 1 } },
        { key: { senderId: 1 } },
        { key: { createdAt: -1 } },
        { key: { recipientId: 1, read: 1 } }
      ]},
      { name: 'affiliates', indexes: [
        { key: { email: 1 }, options: { unique: true } },
        { key: { referralCode: 1 }, options: { unique: true } }
      ]},
      { name: 'referral_activities', indexes: [
        { key: { affiliateId: 1 } },
        { key: { date: -1 } }
      ]},
      { name: 'invoice_tokens', indexes: [
        { key: { saleId: 1 } },
        { key: { token: 1 } },
        { key: { expires: 1 } }
      ]},
      { name: 'password_resets', indexes: [
        { key: { token: 1 } },
        { key: { expires: 1 } }
      ]},
      { name: 'broadcast_logs', indexes: [
        { key: { initiatedBy: 1 } },
        { key: { startTime: -1 } },
        { key: { status: 1 } }
      ]},
      { name: 'shoppers', indexes: [
        { key: { email: 1 }, options: { unique: true } }
      ]},
      { name: 'shopper_verifications', indexes: [
        { key: { email: 1 }, options: { unique: true } },
        { key: { expiresAt: 1 } }
      ]},
      { name: 'carts', indexes: [
        { key: { shopperId: 1 }, options: { unique: true } }
      ]},
      { name: 'subscription_charges', indexes: [
        { key: { adminId: 1 } },
        { key: { createdAt: -1 } },
        { key: { flwRef: 1 } }
      ]},
      { name: 'pending_cart_orders', indexes: [
        { key: { txRef: 1 }, options: { unique: true } },
        { key: { shopperId: 1 } },
        { key: { createdAt: 1 } }
      ]}
    ];

    for (const collectionInfo of collections) {
      try {
        const collection = db.collection(collectionInfo.name);
        for (const index of collectionInfo.indexes) {
          await collection.createIndex(index.key, index.options || {});
        }
      } catch (error) {
        console.warn(`Index creation for ${collectionInfo.name}:`, error.message);
      }
    }

    console.log('All database collections and indexes initialized successfully');

  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    if (err.message.includes('not allowed to do action')) {
      console.error('Database user lacks necessary permissions.');
      console.error('Connection will continue with limited functionality.');
    } else {
      console.error('Retrying connection in 5 seconds...');
      setTimeout(connectToMongo, 5000);
    }
  }
}

function getDb() {
  return db;
}

module.exports = { connectToMongo, getDb };
