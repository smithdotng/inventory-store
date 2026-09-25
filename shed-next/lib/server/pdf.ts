import 'server-only';
import PDFDocument from 'pdfkit';
import { resolvePublicFile } from './uploads';

/**
 * Branded invoice / receipt PDF (port of buildInvoicePDF in invoiceController.js).
 * Paid sales render as a RECEIPT, unpaid as an INVOICE. Returns a Buffer.
 */
export async function renderInvoicePdf(sale: any, admin: any): Promise<{ buffer: Buffer; filename: string; title: string }> {
  const saleId = String(sale._id);
  const isPaid = sale.paymentStatus === 'Paid';
  const docWord = isPaid ? 'Receipt' : 'Invoice';
  const logoFile = await resolvePublicFile(admin?.logo);

  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, info: { Title: `${docWord} ${saleId.slice(-8)}`, Author: admin?.businessName || 'Shed' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  draw(doc, sale, admin || {}, saleId, logoFile);
  doc.end();
  await done;
  return { buffer: Buffer.concat(chunks), filename: `${docWord.toLowerCase()}-${saleId.slice(-8)}.pdf`, title: docWord };
}

export function pdfResponse(pdf: { buffer: Buffer; filename: string }, download = false) {
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function draw(doc: PDFKit.PDFDocument, sale: any, admin: any, saleId: string, logoFile: string | null) {
  const fmt = (amount: any) => {
    const n = typeof amount === 'number' ? amount : parseFloat(amount);
    return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const numToWords = (n: number) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const conv = (x: number): string => {
      if (x === 0) return '';
      if (x < 20) return ones[x] + ' ';
      if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '') + ' ';
      if (x < 1e3) return ones[Math.floor(x / 100)] + ' Hundred ' + conv(x % 100);
      if (x < 1e6) return conv(Math.floor(x / 1e3)) + 'Thousand ' + conv(x % 1e3);
      if (x < 1e9) return conv(Math.floor(x / 1e6)) + 'Million ' + conv(x % 1e6);
      return conv(Math.floor(x / 1e9)) + 'Billion ' + conv(x % 1e9);
    };
    const i = Math.round(n || 0);
    return i === 0 ? 'Zero' : conv(i).replace(/\s+/g, ' ').trim();
  };
  const underline = (text: string, x: number, y: number, size: number, font: string, color: string) => {
    doc.fontSize(size).font(font).fillColor(color).text(text, x, y);
    const w = doc.widthOfString(text);
    doc.moveTo(x, y + size + 2).lineTo(x + w, y + size + 2).strokeColor(color).lineWidth(0.75).stroke();
  };

  const C = { orange: '#FF9800', dark: '#1A1A1A', text: '#333333', muted: '#888888', border: '#CCCCCC', white: '#FFFFFF' };
  const PW = doc.page.width;
  const PH = doc.page.height;
  const M = 50;
  const cW = PW - 2 * M;
  // Standard PDF fonts can't draw ₦, so print the ISO code instead.
  const rawCur = admin.currency || '₦';
  const cur = rawCur === '₦' ? 'NGN ' : rawCur;
  const bk = sale.bankDetails || {};
  const isPaid = sale.paymentStatus === 'Paid';
  const docLabel = isPaid ? 'RECEIPT' : 'INVOICE';
  const ref = `${isPaid ? 'RCT' : 'INV'}-${saleId.slice(-8).toUpperCase()}`;
  const date = new Date(sale.date || sale.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const pad = 8;

  // Header
  let drewLogo = false;
  if (logoFile && /\.(png|jpe?g)$/i.test(logoFile)) {
    try {
      doc.image(logoFile, M, 14, { height: 50, fit: [190, 50] });
      drewLogo = true;
    } catch {
      /* unsupported image */
    }
  }
  if (!drewLogo) {
    doc.rect(M, 16, 30, 30).fill(C.orange);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.white).text(String(admin.businessName || 'Shed').split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase(), M, 26, { width: 30, align: 'center' });
    doc.fontSize(15).font('Helvetica-Bold').fillColor(C.dark).text(admin.businessName || 'Business', M + 38, 22);
  }
  const contact = [admin.phone, admin.businessWebsite || 'shed.ng', admin.email].filter(Boolean);
  doc.fontSize(8).font('Helvetica').fillColor(C.muted).text(contact.join('   '), 0, 28, { align: 'right', width: PW - M });
  doc.moveTo(M, 72).lineTo(PW - M, 72).strokeColor(C.border).lineWidth(0.5).stroke();

  let y = 88;
  if (sale.isUpdated) {
    const upd = new Date(sale.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.rect(M, 76, cW, 22).fill('#FFF3E0');
    doc.rect(M, 76, 5, 22).fill(C.orange);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#7A4100').text(`REVISED INVOICE  —  Updated: ${upd}  (Revision #${sale.updateCount || 1})`, M + 11, 83, { width: cW - 18 });
    y = 106;
  }

  const leftW = 270;
  const rightX = M + leftW + 20;
  const rightW = PW - M - rightX;
  doc.fontSize(30).font('Helvetica').fillColor(C.dark).text(docLabel, M, y);
  if (isPaid) {
    const hw = doc.widthOfString(docLabel);
    doc.roundedRect(M + hw + 14, y + 6, 52, 20, 4).fill('#1E8449');
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.white).text('PAID', M + hw + 14, y + 12, { width: 52, align: 'center' });
  }
  y += 40;
  doc.fontSize(10).font('Helvetica').fillColor(C.text).text(`Date: ${date}`, M, y);
  y += 16;
  doc.text(`${isPaid ? 'Receipt' : 'Invoice'} Number: ${ref}`, M, y);
  y += 18;
  if (sale.description || sale.subject) {
    const subj = `(${String(sale.description || sale.subject).toUpperCase()})`;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C.dark).text(subj, M, y, { width: leftW });
    y += doc.heightOfString(subj, { width: leftW }) + 10;
  }
  doc.fontSize(10).font('Helvetica').fillColor(C.text).text(isPaid ? `Payment Status: Paid${sale.paymentMethod ? ' via ' + sale.paymentMethod : ''}` : 'Due Date: Upon Receipt', M, y);
  y += 16;

  const btY0 = 128;
  doc.fontSize(10).font('Helvetica').fillColor(C.text).text('Bill To:', rightX, btY0);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark).text(sale.customerName || 'N/A', rightX, btY0 + 18, { width: rightW });
  let btY = btY0 + 36;
  doc.fontSize(10).font('Helvetica').fillColor(C.text);
  if (sale.email && sale.email !== 'N/A') {
    doc.text(sale.email, rightX, btY, { width: rightW });
    btY += 16;
  }
  if (sale.phoneNumber && sale.phoneNumber !== 'N/A') {
    doc.text(sale.phoneNumber, rightX, btY, { width: rightW });
    btY += 16;
  }
  y = Math.max(y, btY) + 18;

  underline('Order Summary', M, y, 10, 'Helvetica', C.dark);
  y += 22;

  const tc = { dX: M, dW: 230, rX: M + 230, rW: 95, qX: M + 325, qW: 60, aX: M + 385, aW: PW - M - (M + 385) };
  const cell = (x: number, w: number, yy: number, h: number, text: string | null, bold = false, align: 'left' | 'center' | 'right' = 'left', bg?: string) => {
    if (bg) doc.rect(x, yy, w, h).fill(bg);
    doc.rect(x, yy, w, h).lineWidth(0.5).stroke(C.border);
    if (text) doc.fontSize(9.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(C.dark).text(text, x + pad, yy + Math.max(0, (h - 10) / 2), { width: w - 2 * pad, align });
  };
  const head = (x: number, w: number, text: string, align: 'left' | 'center' | 'right' = 'left') => {
    doc.rect(x, y, w, 28).fill(C.dark);
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.white).text(text, x + pad, y + 9, { width: w - 2 * pad, align });
  };
  head(tc.dX, tc.dW, 'Description');
  head(tc.rX, tc.rW, 'Unit Price');
  head(tc.qX, tc.qW, 'Quantity', 'center');
  head(tc.aX, tc.aW, 'Amount', 'right');
  y += 28;

  (sale.items || []).forEach((item: any, idx: number) => {
    const name = item.itemName || 'Item';
    const rH = Math.max(28, doc.fontSize(9.5).heightOfString(name, { width: tc.dW - 2 * pad }) + 16);
    if (y + rH > 720) {
      doc.addPage();
      y = 50;
    }
    const bg = idx % 2 === 0 ? C.white : '#FFF3E0';
    doc.rect(tc.dX, y, cW, rH).fill(bg);
    doc.rect(tc.dX, y, tc.dW, rH).lineWidth(0.5).stroke(C.border);
    doc.fontSize(9.5).font('Helvetica').fillColor(C.dark).text(name, tc.dX + pad, y + 8, { width: tc.dW - 2 * pad });
    cell(tc.rX, tc.rW, y, rH, `${cur}${fmt(item.unitCost)}`, false, 'left', bg);
    cell(tc.qX, tc.qW, y, rH, String(item.quantity || 0), false, 'center', bg);
    cell(tc.aX, tc.aW, y, rH, `${cur}${fmt(item.totalCost)}`, false, 'right', bg);
    y += rH;
  });
  if (sale.totalVatAmount > 0) {
    cell(tc.dX, tc.dW, y, 26, `VAT (${sale.vatRate || 0}%)`);
    cell(tc.rX, tc.rW, y, 26, null);
    cell(tc.qX, tc.qW, y, 26, null);
    cell(tc.aX, tc.aW, y, 26, `${cur}${fmt(sale.totalVatAmount)}`, false, 'right');
    y += 26;
  }
  doc.rect(tc.dX, y, cW, 28).fill(C.orange);
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.dark).text('Total', tc.dX + pad, y + 9, { width: tc.dW - 2 * pad });
  doc.text(`${cur}${fmt(sale.totalAmount)}`, tc.aX + pad, y + 9, { width: tc.aW - 2 * pad, align: 'right' });
  [tc.dX, tc.rX, tc.qX, tc.aX].forEach((x, i) => doc.rect(x, y, [tc.dW, tc.rW, tc.qW, tc.aW][i], 28).lineWidth(0.5).stroke(C.border));
  y += 50;

  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 16;
  const words = numToWords(Math.round(parseFloat(sale.totalAmount) || 0));
  const due = `Total Amount ${isPaid ? 'Paid' : 'Due'}: ${cur}${fmt(sale.totalAmount)} (${words} ${rawCur === '₦' ? 'Naira' : 'Units'} Only)`;
  doc.fontSize(10).font('Helvetica').fillColor(C.dark).text(due, M, y, { width: cW });
  y += doc.heightOfString(due, { width: cW }) + 14;
  if (sale.additionalComments) {
    const note = `Note: ${sale.additionalComments}`;
    doc.fontSize(10).font('Helvetica').fillColor(C.text).text(note, M, y, { width: cW });
    y += doc.heightOfString(note, { width: cW }) + 16;
  }

  if (y > 650) {
    doc.addPage();
    y = 50;
  }
  if (isPaid) {
    underline('Thank You', M, y, 10, 'Helvetica', C.dark);
    y += 22;
    doc.fontSize(10).font('Helvetica').fillColor(C.dark).text('Payment received in full. This receipt confirms your order has been paid for.', M, y, { width: cW });
    y += 36;
  } else {
    underline('Payment Instructions', M, y, 10, 'Helvetica', C.dark);
    y += 22;
    doc.fontSize(10).font('Helvetica').fillColor(C.dark);
    const bankName = bk.bankName || admin.bankName || admin.primaryBankName || admin.primaryAccount?.bankName;
    const accName = bk.bankAccountName || admin.primaryBankAccountName || admin.primaryAccount?.bankAccountName || admin.businessName;
    const accNo = bk.accountNumber || admin.accountNumber || admin.primaryAccountNumber || admin.primaryAccount?.accountNumber;
    if (bankName || accNo) {
      doc.text(`Bank: ${bankName || 'N/A'}`, M, y);
      y += 16;
      doc.text(`Account Name: ${accName || 'N/A'}`, M, y);
      y += 16;
      doc.text(`Account Number: ${accNo || 'N/A'}`, M, y);
      y += 24;
    }
    if (admin.paymentInstructions) {
      doc.text(admin.paymentInstructions, M, y, { width: cW });
      y += doc.heightOfString(admin.paymentInstructions, { width: cW }) + 12;
    }
    y += 12;
  }

  doc.moveTo(M, y).lineTo(M + 110, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 10;
  doc.fontSize(11).font('Helvetica-Bold').fillColor(C.dark).text(admin.ownerName || admin.businessName || 'Authorized Signatory', M, y);
  y += 16;
  doc.fontSize(9).font('Helvetica').fillColor(C.muted).text(`CEO / ${admin.businessName || 'Business'}`, M, y);

  const fH = 56;
  const fY = PH - fH;
  doc.rect(0, fY, PW, fH).fill(C.dark);
  doc.moveTo(0, fY).lineTo(PW, fY).strokeColor(C.orange).lineWidth(3).stroke();
  const items = [admin.phone, admin.businessWebsite || 'shed.ng', admin.email].filter(Boolean) as string[];
  const slotW = cW / Math.max(items.length, 1);
  items.forEach((t, i) => {
    const iconX = M + i * slotW + slotW / 2 - 52;
    doc.circle(iconX + 10, fY + fH / 2, 10).fill(C.orange);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.white).text(t, iconX + 24, fY + fH / 2 - 6, { width: slotW - 30, lineBreak: false });
  });
}
