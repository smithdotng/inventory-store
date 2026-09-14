const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});

// MongoDB connection
let db;
async function connectDB() {
  const client = new MongoClient(process.env.MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
  });
  await client.connect();
  db = client.db(process.env.DB_NAME);
  console.log('Connected to MongoDB for email broadcasting');
}

// Social update email template
async function sendSocialUpdateEmail(email, username) {
  const mailOptions = {
    from: `"Stanley [at] Shed" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🌟 New Feature: Social Media Integration!',
    html: `
      <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="https://img.shed.ng/status.jpg" alt="Shed" style="max-width: 250px;">
        </div>
        
        <h1 style="color: #466c7b; text-align: center;">Connect With Customers Like Never Before!</h1>
        
        <p style="font-size: 16px;">Hi ${username},</p>
        
        <p style="font-size: 16px;">We're excited to announce a powerful new way to grow your business - <strong>social media integration</strong> for your Shedfactory storefront!</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
          <h2 style="color: #466c7b; margin-top: 0;">✨ What's New:</h2>
          <ul style="padding-left: 20px;">
            <li><strong>Social Media Handles:</strong> Showcase your Facebook, Instagram, and Twitter profiles</li>
            <li><strong>One-Click Access:</strong> Customers can connect with you instantly</li>
            <li><strong>Boost Engagement:</strong> Turn shoppers into loyal followers</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <img src="https://img.shed.ng/social.jpg" alt="Social Media Integration Preview" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
        </div>
        
        <h2 style="color: #466c7b;">Why This Matters for Your Business:</h2>
        <p style="font-size: 16px;">This isn't just about adding icons - it's about:</p>
        <ul style="padding-left: 20px;">
          <li>Building stronger relationships with customers</li>
          <li>Driving traffic to your social promotions</li>
          <li>Creating a community around your brand</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.DOMAIN_URL || 'https://shed.ng'}/profile" style="display: inline-block; background: linear-gradient(135deg, #466c7b, #4CAF50); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">Update Your Profile Now</a>
        </div>
        
        <p style="font-size: 16px;">The best part? It takes just 2 minutes to set up:</p>
        <ol style="padding-left: 20px;">
          <li>Log in to your Shed</li>
          <li>Go to <strong>Profile</strong> on the Sidebar</li>
          <li>Add your social media links</li>
        </ol>
        
        <p style="font-size: 16px;">We can't wait to see how you'll use this to grow your business!</p>
        
        <p style="font-size: 16px;">Stanley,<br>
        <strong>Chief Relationship Officer</strong><br>
        Shedfactory</p>
        
        <div style="text-align: center; margin-top: 40px; color: #6c757d; font-size: 14px;">
          <a href="https://shed.ng" style="color: #466c7b; text-decoration: none;">shed.ng</a>
          
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Social update email sent to:', email);
    return true;
  } catch (error) {
    console.error('Error sending social update email:', error);
    return false;
  }
}

// Broadcast to all users with rate limiting
async function broadcastSocialUpdate() {
  try {
    if (!db) await connectDB();
    
    const users = await db.collection('admins').find({}).toArray();
    let successCount = 0;
    let failCount = 0;

    console.log(`Starting broadcast to ${users.length} users...`);

    for (const user of users) {
      try {
        if (user.email) { // Only send to users with email
          const sent = await sendSocialUpdateEmail(user.email, user.username);
          if (sent) successCount++;
          else failCount++;
          
          // Rate limiting: 1 email per second
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log(`Skipping user ${user.username} - no email address`);
          failCount++;
        }
      } catch (err) {
        console.error(`Failed to send to ${user.email}:`, err.message);
        failCount++;
      }
    }

    console.log(`Broadcast completed. Success: ${successCount}, Failed: ${failCount}`);
    return { successCount, failCount };
  } catch (err) {
    console.error('Broadcast failed:', err);
    throw err;
  }
}

// Manual trigger endpoint (add this to your routes)
function setupBroadcastRoute(app) {
  app.post('/admin/broadcast-social-update', async (req, res) => {
    try {
      const result = await broadcastSocialUpdate();
      res.json({
        success: true,
        message: `Broadcast completed successfully to ${result.successCount} users`,
        ...result
      });
    } catch (err) {
      console.error('Broadcast route error:', err);
      res.status(500).json({
        success: false,
        message: 'Broadcast failed',
        error: err.message
      });
    }
  });
}

module.exports = {
  sendSocialUpdateEmail,
  broadcastSocialUpdate,
  setupBroadcastRoute
};