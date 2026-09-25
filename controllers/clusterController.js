const { getDb } = require('../config/db');
const { isAccountLocked } = require('../utils/subscription');

const formatCurrency = (amount) => Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// GET /clusters — directory of every active market cluster
exports.getClusterIndex = async (req, res) => {
  try {
    const db = getDb();
    const clusters = await db.collection('market_clusters').aggregate([
      { $match: { isActive: true } },
      { $sort: { name: 1 } },
      { $lookup: {
        from: 'admins',
        // Governance: only verified stores count publicly — an unverified
        // store's cluster pick stays inert until superadmin approves it.
        let: { cid: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$clusterId', '$$cid'] }, { $eq: ['$isVerified', true] }] } } }, { $count: 'n' }],
        as: 'storeCount'
      } },
      { $addFields: { storeCount: { $ifNull: [{ $arrayElemAt: ['$storeCount.n', 0] }, 0] } } }
    ]).toArray();

    res.render('cluster-index', { clusters, shopper: req.session.shopper || null });
  } catch (error) {
    console.error('Error loading cluster index:', error);
    res.status(500).render('500', { message: 'Error loading market clusters', error: process.env.NODE_ENV === 'development' ? error : undefined });
  }
};

// GET /cluster/:slug — a single market cluster: its stores + a searchable
// product grid scoped to just those stores.
exports.getClusterView = async (req, res) => {
  try {
    const db = getDb();
    const cluster = await db.collection('market_clusters').findOne({ slug: { $regex: `^${req.params.slug}$`, $options: 'i' }, isActive: true });
    if (!cluster) return res.status(404).render('404', { message: 'Market cluster not found' });

    // Governance: a store must be verified by superadmin to actually show up
    // in its market cluster — selecting a cluster on your profile is just a
    // request until that happens.
    const allStores = await db.collection('admins')
      .find({ clusterId: cluster._id, isVerified: true })
      .project({ username: 1, businessName: 1, logo: 1, description: 1, category: 1, country: 1, subscription: 1, isVerified: 1 })
      .toArray();

    // Locked stores (lapsed trial/subscription) shouldn't show up in a
    // public browsing page either.
    const stores = allStores.filter(s => !isAccountLocked(s));
    const storeIds = stores.map(s => s._id);

    const query = (req.query && req.query.q) ? String(req.query.q).trim() : '';
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = 24;
    const skip = (page - 1) * limit;

    let products = [];
    let totalProducts = 0;

    if (storeIds.length > 0) {
      const productMatch = { adminId: { $in: storeIds }, stock: { $gt: 0 } };
      if (query) {
        productMatch.$or = [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ];
      }

      totalProducts = await db.collection('inventory').countDocuments(productMatch);
      products = await db.collection('inventory').aggregate([
        { $match: productMatch },
        { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
        { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, name: 1, cost: 1, images: 1, stock: 1, description: 1, storeName: '$store.businessName', storeUsername: '$store.username', storeLogo: '$store.logo' } },
        { $sort: { name: 1 } },
        { $skip: skip },
        { $limit: limit }
      ]).toArray();
    }

    res.render('cluster-view', {
      cluster,
      stores,
      products,
      totalProducts,
      totalPages: Math.max(Math.ceil(totalProducts / limit), 1),
      page,
      query,
      formatCurrency,
      shopper: req.session.shopper || null
    });
  } catch (error) {
    console.error('Error loading cluster page:', error);
    res.status(500).render('500', { message: 'Error loading market cluster', error: process.env.NODE_ENV === 'development' ? error : undefined });
  }
};
