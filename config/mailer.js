const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});

transporter.verify((error, success) => {
  if (error) console.error('SMTP connection error:', error);
  else console.log('SMTP connection successful:', success);
});

module.exports = { transporter };
