const express = require('express');
const { MongoClient } = require('mongodb');
require('dotenv').config();
const app = express();
const port = 3000;

// MongoDB connection details from .env
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;
let db;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Connect to MongoDB
async function connectToMongo() {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);

    // Seed initial data (optional)
    const inventoryCollection = db.collection('inventory');
    const count = await inventoryCollection.countDocuments();
    if (count === 0) {
      const initialInventory = [
        { id: 1, name: 'Hoodies', stock: 10 },
        { id: 2, name: 'T-shirt', stock: 15 },
        { id: 3, name: 'Sweatshirt', stock: 8 },
        { id: 4, name: 'Cap', stock: 20 },
        { id: 5, name: 'Phone case', stock: 25 },
        { id: 6, name: 'Mugs', stock: 12 },
        { id: 7, name: 'Felt Product', stock: 5 },
      ];
      await inventoryCollection.insertMany(initialInventory);
      console.log('Initial inventory seeded');
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

// Routes
// Update Stock Page
app.get('/update-stock', async (req, res) => {
  try {
    const inventory = await db.collection('inventory').find().toArray();
    res.render('update-stock', { inventory });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching inventory');
  }
});

app.post('/update-stock', async (req, res) => {
  try {
    const { id, stock } = req.body;
    await db.collection('inventory').updateOne(
      { id: parseInt(id) },
      { $set: { stock: parseInt(stock) } }
    );
    res.redirect('/update-stock');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating stock');
  }
});

// Store View & Dispense Page
app.get('/store-view', async (req, res) => {
  try {
    const inventory = await db.collection('inventory').find().toArray();
    res.render('store-view', { inventory });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching inventory');
  }
});

app.post('/dispense', async (req, res) => {
  try {
    const { id, quantity } = req.body;
    const qty = parseInt(quantity);
    const item = await db.collection('inventory').findOne({ id: parseInt(id) });
    if (item && item.stock >= qty && qty > 0) {
      await db.collection('inventory').updateOne(
        { id: parseInt(id) },
        { $inc: { stock: -qty } }
      );
    }
    res.redirect('/store-view');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error dispensing item');
  }
});

// Reset Inventory to 0
app.post('/reset-inventory', async (req, res) => {
  try {
    await db.collection('inventory').updateMany(
      {},
      { $set: { stock: 0 } }
    );
    res.redirect('/update-stock');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error resetting inventory');
  }
});

// Add New Product
app.post('/add-product', async (req, res) => {
  try {
    const { name, stock } = req.body;
    const inventoryCollection = db.collection('inventory');
    const maxId = await inventoryCollection.find().sort({ id: -1 }).limit(1).toArray();
    const newId = maxId.length > 0 ? maxId[0].id + 1 : 1;
    await inventoryCollection.insertOne({
      id: newId,
      name: name.trim(),
      stock: parseInt(stock) || 0
    });
    res.redirect('/update-stock');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding product');
  }
});

// Start server and connect to MongoDB
async function startServer() {
  await connectToMongo();
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
