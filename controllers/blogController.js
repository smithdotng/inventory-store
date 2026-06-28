const { getDb } = require('../config/db');
const { ObjectId } = require('mongodb');

// Slugify helper
function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// GET /blog
exports.getBlogs = async (req, res) => {
  try {
    const db = getDb();
    const page  = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip  = (page - 1) * limit;
    const tag   = req.query.tag || null;

    const filter = { published: true };
    if (tag) filter.tags = tag;

    const [posts, total] = await Promise.all([
      db.collection('blog_posts')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('blog_posts').countDocuments(filter)
    ]);

    // Get all unique tags for filtering
    const allTags = await db.collection('blog_posts').distinct('tags', { published: true });

    res.render('blog', {
      posts,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
      tag,
      allTags,
      error: null
    });
  } catch (err) {
    console.error('Blog list error:', err);
    res.render('blog', { posts: [], total: 0, page: 1, pages: 0, limit: 9, tag: null, allTags: [], error: 'Could not load posts.' });
  }
};

// GET /blog/:slug
exports.getBlogPost = async (req, res) => {
  try {
    const db   = getDb();
    const post = await db.collection('blog_posts').findOne({ slug: req.params.slug, published: true });
    if (!post) return res.status(404).render('404', { message: 'Post not found.' });

    // Related posts (same tags, excluding current)
    const related = await db.collection('blog_posts')
      .find({ published: true, tags: { $in: post.tags || [] }, _id: { $ne: post._id } })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();

    // Increment view count
    await db.collection('blog_posts').updateOne({ _id: post._id }, { $inc: { views: 1 } });

    res.render('blog-post', { post, related, error: null });
  } catch (err) {
    console.error('Blog post error:', err);
    res.status(500).render('404', { message: 'Could not load post.' });
  }
};

// GET /contact
exports.getContact = (req, res) => {
  res.render('contact', {
    success: req.query.sent === '1',
    error: null
  });
};

// POST /contact
exports.postContact = async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  const db = getDb();
  try {
    if (!name || !email || !message) {
      return res.render('contact', { success: false, error: 'Please fill in all required fields.' });
    }

    await db.collection('contact_messages').insertOne({
      name, email, phone: phone || '', subject: subject || 'General Inquiry', message,
      read: false,
      createdAt: new Date()
    });

    // Try to send email notification — non-blocking
    const { transporter } = require('../config/mailer');
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'hello@shed.ng',
      replyTo: email,
      subject: `[Shed Contact] ${subject || 'New message'} — from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#0d0d1a;">New contact message</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="white-space:pre-line;">${message}</p>
        </div>
      `
    }).catch(err => console.error('Contact mail failed:', err.message));

    return res.redirect('/contact?sent=1');
  } catch (err) {
    console.error('Contact form error:', err);
    res.render('contact', { success: false, error: 'Failed to send message. Please try again.' });
  }
};

// ── ADMIN (superadmin) CRUD ───────────────────────────────────────────────────

// GET /superadmin/blog
exports.adminGetBlogs = async (req, res) => {
  try {
    const db    = getDb();
    const posts = await db.collection('blog_posts').find({}).sort({ createdAt: -1 }).toArray();
    res.render('superadmin-blog', { posts, post: null, mode: 'list', error: null, success: req.query.success || null });
  } catch (err) {
    console.error('Admin blog list error:', err);
    res.render('superadmin-blog', { posts: [], post: null, mode: 'list', error: 'Failed to load posts.', success: null });
  }
};

// GET /superadmin/blog/new
exports.adminNewPost = (req, res) => {
  res.render('superadmin-blog', { posts: [], post: null, mode: 'new', error: null, success: null });
};

// GET /superadmin/blog/:id/edit
exports.adminEditPost = async (req, res) => {
  try {
    const db   = getDb();
    const post = await db.collection('blog_posts').findOne({ _id: new ObjectId(req.params.id) });
    if (!post) return res.redirect('/superadmin/blog');
    const posts = await db.collection('blog_posts').find({}).sort({ createdAt: -1 }).toArray();
    res.render('superadmin-blog', { posts, post, mode: 'edit', error: null, success: null });
  } catch (err) {
    res.redirect('/superadmin/blog');
  }
};

// POST /superadmin/blog (create)
exports.adminCreatePost = async (req, res) => {
  const db = getDb();
  try {
    const { title, content, excerpt, tags, published } = req.body;
    const slug = slugify(title) + '-' + Date.now().toString(36);
    const coverImage = req.file ? `/uploads/${req.file.filename}` : '/images/default-blog.jpg';
    await db.collection('blog_posts').insertOne({
      title, slug, content, excerpt,
      coverImage,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      published: published === 'on',
      views: 0,
      author: req.session.username || 'Shed Team',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    res.redirect('/superadmin/blog?success=Post+created');
  } catch (err) {
    console.error('Create post error:', err);
    const posts = await db.collection('blog_posts').find({}).sort({ createdAt: -1 }).toArray();
    res.render('superadmin-blog', { posts, post: null, mode: 'new', error: 'Failed to create post.', success: null });
  }
};

// POST /superadmin/blog/:id/update
exports.adminUpdatePost = async (req, res) => {
  const db = getDb();
  try {
    const { title, content, excerpt, tags, published } = req.body;
    const update = {
      title, content, excerpt,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      published: published === 'on',
      updatedAt: new Date()
    };
    if (req.file) update.coverImage = `/uploads/${req.file.filename}`;
    await db.collection('blog_posts').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );
    res.redirect('/superadmin/blog?success=Post+updated');
  } catch (err) {
    console.error('Update post error:', err);
    res.redirect('/superadmin/blog');
  }
};

// POST /superadmin/blog/:id/delete
exports.adminDeletePost = async (req, res) => {
  try {
    const db = getDb();
    await db.collection('blog_posts').deleteOne({ _id: new ObjectId(req.params.id) });
    res.redirect('/superadmin/blog?success=Post+deleted');
  } catch (err) {
    res.redirect('/superadmin/blog');
  }
};

// POST /superadmin/blog/:id/toggle-publish
exports.adminTogglePublish = async (req, res) => {
  try {
    const db   = getDb();
    const post = await db.collection('blog_posts').findOne({ _id: new ObjectId(req.params.id) });
    if (!post) return res.json({ ok: false });
    await db.collection('blog_posts').updateOne(
      { _id: post._id },
      { $set: { published: !post.published, updatedAt: new Date() } }
    );
    res.json({ ok: true, published: !post.published });
  } catch (err) {
    res.json({ ok: false });
  }
};
