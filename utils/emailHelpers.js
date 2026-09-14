const { transporter } = require('../config/mailer');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function sendWelcomeEmailToUser(email, firstName, businessName) {
  const mailOptions = {
    from: `"${businessName}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Welcome to ${businessName} on Shed!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <img src="${BASE_URL}/images/logo.png" alt="Shed Logo" style="width: 150px; margin-bottom: 20px;">
        <h1 style="color: #333;">Welcome to ${businessName}, ${firstName}!</h1>
        <p>Your account has been successfully activated on the Shed platform.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">You now have access to:</h3>
          <ul style="line-height: 1.6;">
            <li>Point of Sale (POS) system</li>
            <li>Inventory management</li>
            <li>Customer management</li>
            <li>Sales reporting</li>
            <li>Online store features</li>
          </ul>
        </div>
        <p>To get started, please log in using the email address this message was sent to.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${BASE_URL}/admin-login"
             style="display: inline-block; padding: 12px 24px; background: #eba611; color: #333; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Log in to Shed
          </a>
        </div>
        <p>If you have any questions or need assistance, please contact your business administrator.</p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from ${businessName}'s Shed account.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to business user: ${email}`);
  } catch (error) {
    console.error('Error sending welcome email to business user:', error);
  }
}

async function sendUserInvitationEmail(email, firstName, admin, token, tempPassword) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const setupLink = `${baseUrl}/setup-account/${token}`;

  const mailOptions = {
    from: `"${admin.businessName}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Invitation to join ${admin.businessName} on Shed`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <img src="${baseUrl}/images/logo.png" alt="Shed Logo" style="width: 150px; margin-bottom: 20px;">
        <h2 style="color: #333;">Welcome to ${admin.businessName}!</h2>
        <p>Hello ${firstName},</p>
        <p>You have been invited to join <strong>${admin.businessName}</strong> on Shed platform.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Your Login Details</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          <p><strong>Setup Link:</strong> <a href="${setupLink}">Click here to setup your account</a></p>
        </div>
        <p>For security reasons, please:</p>
        <ol>
          <li>Click the setup link above</li>
          <li>Change your password immediately</li>
          <li>Complete your profile setup</li>
        </ol>
        <p><strong>Important:</strong> This invitation link will expire in 7 days.</p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from ${admin.businessName}.
            If you believe you received this email in error, please ignore it.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Invitation email sent to ${email}`);
  } catch (error) {
    console.error('Error sending invitation email:', error);
  }
}

async function sendPasswordResetEmail(email, username, resetToken) {
  const domain = process.env.DOMAIN_URL || 'http://localhost:3000';
  const resetLink = `${domain}/reset-password/${resetToken}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset Request - Shed',
    html: `
      <h1>Password Reset Request</h1>
      <p>Hello, ${username},</p>
      <p>We received a request to reset your password for Shed. Click the link below to reset your password:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
      <p>Best regards,</p>
      <p>Stanley, Chief Relationship Officer, Shedfactory</p>
      <a href="https://shedfactory.co">shedfactory.co</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
}

module.exports = {
  sendWelcomeEmailToUser,
  sendUserInvitationEmail,
  sendPasswordResetEmail
};
