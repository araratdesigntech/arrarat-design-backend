import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

import { OrderT } from '@src/interfaces';
import { ensureDirectoryExists } from './ensureDirectoryExists';
import { cloudinary } from '@src/middlewares';

type GenerateInvoicePdfParams = {
  order: OrderT;
  invoiceNumber: string;
};

type GenerateInvoicePdfResult = {
  absolutePath: string | null;
  relativePath: string;
  documentUrl: string;
};

// Company information
const COMPANY_NAME = 'Ararat Designs Store';
const COMPANY_ADDRESS = 'Lagos, Nigeria';
const COMPANY_PHONE = '+2348100474601';
const COMPANY_EMAIL = 'Araratdesignltd@Gmail.Com';

// Colors (RGB values for PDFKit)
const PRIMARY_COLOR = { r: 255, g: 140, b: 0 }; // Orange/Gold color
const DARK_COLOR = { r: 0, g: 0, b: 0 }; // Black
const LIGHT_GRAY = { r: 240, g: 240, b: 240 }; // Light gray for table rows
const DARK_GRAY = { r: 50, g: 50, b: 50 }; // Dark gray for table header

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper function to format date
const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month}, ${year}`;
};

// Type for PDFDocument instance
type PDFDoc = InstanceType<typeof PDFDocument>;

// Helper function to draw a rectangle
const drawRect = (doc: PDFDoc, x: number, y: number, width: number, height: number, color: { r: number; g: number; b: number }) => {
  doc.rect(x, y, width, height).fillColor(`rgb(${color.r}, ${color.g}, ${color.b})`).fill();
};

// Helper function to build professional PDF content
const buildPdfContent = (pdfDoc: PDFDoc, order: OrderT, invoiceNumber: string) => {
  const pageWidth = pdfDoc.page.width;
  const pageHeight = pdfDoc.page.height;
  const margin = 50;
  let yPosition = margin;

  // Header Section - Company Logo and Address (Left Side)
  pdfDoc.fontSize(24).fillColor(`rgb(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b})`);
  pdfDoc.text('ADL', margin, yPosition, { width: 200 });
  yPosition += 30;

  pdfDoc.fontSize(10).fillColor(`rgb(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b})`);
  pdfDoc.text(COMPANY_ADDRESS, margin, yPosition, { width: 200 });
  yPosition += 50;

  // Invoice Details (Right Side) - Orange/Gold color
  const rightX = pageWidth - margin - 200;
  pdfDoc.fontSize(10).fillColor(`rgb(${PRIMARY_COLOR.r}, ${PRIMARY_COLOR.g}, ${PRIMARY_COLOR.b})`);
  
  // Get issue date from order createdAt or current date
  const orderDoc = order as any;
  const issueDate = (orderDoc.createdAt || orderDoc.created_at || new Date()) instanceof Date 
    ? formatDate(orderDoc.createdAt || orderDoc.created_at || new Date())
    : formatDate(new Date());
  
  pdfDoc.text(`Issue Date: ${issueDate}`, rightX, margin, { width: 200 });
  pdfDoc.text(`Invoice No: ${invoiceNumber}`, rightX, margin + 15, { width: 200 });
  pdfDoc.text(`Email: ${order.user?.email || 'N/A'}`, rightX, margin + 30, { width: 200 });

  // Invoice Title - Centered
  yPosition = margin + 80;
  pdfDoc.fontSize(32).fillColor(`rgb(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b})`);
  pdfDoc.text('INVOICE', 0, yPosition, { align: 'center', width: pageWidth });
  yPosition += 50;

  // Table Header
  const tableTop = yPosition;
  const colWidths = {
    number: 40,
    description: 250,
    price: 80,
    hours: 60,
    total: 100,
  };
  const tableLeft = margin;
  const rowHeight = 25;

  // Draw table header background
  drawRect(pdfDoc, tableLeft, tableTop, pageWidth - 2 * margin, rowHeight, DARK_GRAY);

  // Table Header Text
  pdfDoc.fontSize(10).fillColor('white');
  pdfDoc.text('#', tableLeft + 5, tableTop + 8);
  pdfDoc.text('DESCRIPTION', tableLeft + colWidths.number + 5, tableTop + 8);
  pdfDoc.text('PRICE', tableLeft + colWidths.number + colWidths.description + 5, tableTop + 8);
  pdfDoc.text('QTY', tableLeft + colWidths.number + colWidths.description + colWidths.price + 5, tableTop + 8);
  pdfDoc.text('TOTAL', tableLeft + colWidths.number + colWidths.description + colWidths.price + colWidths.hours + 5, tableTop + 8);

  yPosition = tableTop + rowHeight;

  // Table Rows - Ensure orderItems exists and is an array
  const orderItems = order.orderItems || [];
  console.log('Generating PDF with orderItems:', orderItems.length, 'items');
  
  if (orderItems.length === 0) {
    // If no items, show a message
    pdfDoc.fontSize(10).fillColor(`rgb(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b})`);
    pdfDoc.text('No items in this order', tableLeft + 5, yPosition + 8);
    yPosition += rowHeight;
  } else {
    orderItems.forEach((item: any, index: number) => {
      // Check if we need a new page (leave room for total box and footer)
      if (yPosition + rowHeight > pageHeight - 150) {
        pdfDoc.addPage();
        yPosition = margin;
      }

      const isEven = index % 2 === 0;
      const rowColor = isEven ? LIGHT_GRAY : { r: 255, g: 255, b: 255 };

      // Draw row background
      drawRect(pdfDoc, tableLeft, yPosition, pageWidth - 2 * margin, rowHeight, rowColor);

      // Row content
      pdfDoc.fontSize(10).fillColor(`rgb(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b})`);
      pdfDoc.text(`${index + 1}`, tableLeft + 5, yPosition + 8);
      
      const productName = item?.nameSnapshot || item?.product?.name || `Item ${index + 1}`;
      pdfDoc.text(productName, tableLeft + colWidths.number + 5, yPosition + 8, { width: colWidths.description - 10 });
      
      const unitPrice = item?.unitPrice || item?.product?.price || 0;
      pdfDoc.text(formatCurrency(unitPrice), tableLeft + colWidths.number + colWidths.description + 5, yPosition + 8, { width: colWidths.price - 10 });
      
      const quantity = item?.quantity || 0;
      pdfDoc.text(`${quantity}`, tableLeft + colWidths.number + colWidths.description + colWidths.price + 5, yPosition + 8, { width: colWidths.hours - 10 });
      
      const lineTotal = unitPrice * quantity;
      pdfDoc.text(formatCurrency(lineTotal), tableLeft + colWidths.number + colWidths.description + colWidths.price + colWidths.hours + 5, yPosition + 8, { width: colWidths.total - 10 });

      yPosition += rowHeight;
    });
  }

  // Grand Total Box - Ensure it's on current page or add new page if needed
  if (yPosition + 80 > pageHeight - 150) {
    pdfDoc.addPage();
    yPosition = margin;
  }

  const totalBoxY = yPosition + 20;
  const totalBoxHeight = 40;
  const totalBoxWidth = 250;
  const totalBoxX = pageWidth - margin - totalBoxWidth;

  // Draw orange/gold background box
  drawRect(pdfDoc, totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight, PRIMARY_COLOR);

  // Grand Total Text
  pdfDoc.fontSize(14).fillColor('white');
  pdfDoc.text('Grand Total', totalBoxX + 10, totalBoxY + 12, { width: 150 });
  
  const grandTotal = order.totalAmount || 0;
  pdfDoc.fontSize(16).fillColor('white');
  pdfDoc.text(formatCurrency(grandTotal), totalBoxX + 10, totalBoxY + 30, { width: totalBoxWidth - 20, align: 'right' });

  // Footer Section - Always on last page
  const footerY = pageHeight - 80;
  pdfDoc.fontSize(9).fillColor(`rgb(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b})`);
  
  // Footer icons (represented as text symbols)
  pdfDoc.text('📍', margin, footerY);
  pdfDoc.text(`${COMPANY_NAME} ${COMPANY_ADDRESS}`, margin + 20, footerY, { width: 200 });
  
  pdfDoc.text('📞', margin, footerY + 15);
  pdfDoc.text(COMPANY_PHONE, margin + 20, footerY + 15, { width: 200 });
  
  pdfDoc.text('✉️', margin, footerY + 30);
  pdfDoc.text(COMPANY_EMAIL, margin + 20, footerY + 30, { width: 200 });

  // End the PDF - this must be called to finalize
  pdfDoc.end();
};

export const generateInvoicePdf = async ({ order, invoiceNumber }: GenerateInvoicePdfParams): Promise<GenerateInvoicePdfResult> => {
  // Check if running in serverless environment (Vercel)
  const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // In serverless, generate PDF in memory and upload to Cloudinary
    return new Promise<GenerateInvoicePdfResult>((resolve, reject) => {
      const pdfDoc = new PDFDocument({ 
        margin: 0,
        size: 'LETTER',
        layout: 'portrait'
      });
      const chunks: Buffer[] = [];
      let hasError = false;

      // Collect PDF chunks in memory
      pdfDoc.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      pdfDoc.on('end', async () => {
        if (hasError) return;
        
        try {
          console.log('PDF generation complete, chunks:', chunks.length, 'total size:', chunks.reduce((sum, chunk) => sum + chunk.length, 0));
          
          // Combine all chunks into a single buffer
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pdfBuffer = Buffer.concat(chunks as any);

          if (pdfBuffer.length === 0) {
            reject(new Error('Generated PDF buffer is empty'));
            return;
          }

          console.log('Uploading PDF to Cloudinary, size:', pdfBuffer.length);

          // Upload to Cloudinary
          const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((uploadResolve, uploadReject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'invoices',
                resource_type: 'raw',
                format: 'pdf',
                public_id: invoiceNumber, // Use invoice number as public ID
              },
              (error, result) => {
                if (error) {
                  console.error('Cloudinary upload error:', error);
                  uploadReject(error);
                } else if (result) {
                  console.log('Cloudinary upload successful:', result.secure_url);
                  uploadResolve(result);
                } else {
                  uploadReject(new Error('Cloudinary upload returned undefined result'));
                }
              }
            );
            uploadStream.end(pdfBuffer);
          });

          resolve({
            absolutePath: null, // No local file in serverless
            relativePath: uploadResult.secure_url, // Use Cloudinary URL as relative path for backward compatibility
            documentUrl: uploadResult.secure_url, // Cloudinary URL
          });
        } catch (uploadError) {
          console.error('Error in PDF end handler:', uploadError);
          reject(uploadError);
        }
      });

      pdfDoc.on('error', (error) => {
        console.error('PDF generation error:', error);
        hasError = true;
        reject(error);
      });

      try {
        // Build PDF content - this will call pdfDoc.end() at the end
        buildPdfContent(pdfDoc, order, invoiceNumber);
      } catch (buildError) {
        console.error('Error building PDF content:', buildError);
        hasError = true;
        reject(buildError);
      }
    });
  } else {
    // Local development: save to disk
    const invoicesDir = ensureDirectoryExists(path.resolve(process.cwd(), 'public', 'invoices'));
    const fileName = `${invoiceNumber}.pdf`;
    const absolutePath = path.resolve(invoicesDir, fileName);
    const relativePath = `/static/invoices/${fileName}`;

    const pdfDoc = new PDFDocument({ 
      margin: 0,
      size: 'LETTER',
      layout: 'portrait'
    });

    return new Promise<GenerateInvoicePdfResult>((resolve, reject) => {
      const stream = fs.createWriteStream(absolutePath);
      pdfDoc.pipe(stream);

      // Build PDF content
      buildPdfContent(pdfDoc, order, invoiceNumber);

      stream.on('finish', () =>
        resolve({
          absolutePath,
          relativePath,
          documentUrl: relativePath, // Use relative path as document URL in local dev
        })
      );
      stream.on('error', reject);
    });
  }
};

export default generateInvoicePdf;
