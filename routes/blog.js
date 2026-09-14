const express = require('express');
const router  = express.Router();
const { isSuperAdmin, isAuthenticated } = require('../middleware/auth');
const blogController = require('../controllers/blogController');
const { upload } = require('../config/multer');

// ── Public routes ──────────────────────────────────────────────────────────────
router.get('/blog',        blogController.getBlogs);
router.get('/blog/:slug',  blogController.getBlogPost);
router.get('/contact',     blogController.getContact);
router.post('/contact',    blogController.postContact);

// ── Superadmin blog management ─────────────────────────────────────────────────
router.get('/superadmin/blog',              isAuthenticated, isSuperAdmin, blogController.adminGetBlogs);
router.get('/superadmin/blog/new',          isAuthenticated, isSuperAdmin, blogController.adminNewPost);
router.get('/superadmin/blog/:id/edit',     isAuthenticated, isSuperAdmin, blogController.adminEditPost);
router.post('/superadmin/blog',             isAuthenticated, isSuperAdmin, upload.single('coverImage'), blogController.adminCreatePost);
router.post('/superadmin/blog/:id/update',  isAuthenticated, isSuperAdmin, upload.single('coverImage'), blogController.adminUpdatePost);
router.post('/superadmin/blog/:id/delete',  isAuthenticated, isSuperAdmin, blogController.adminDeletePost);
router.post('/superadmin/blog/:id/toggle',  isAuthenticated, isSuperAdmin, blogController.adminTogglePublish);

module.exports = router;
