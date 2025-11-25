import { NextFunction, Response } from 'express';
import createHttpError, { InternalServerError } from 'http-errors';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

import { AuthenticatedRequestBody, IUser, OrderItemT, OrderT, ProcessingOrderT } from '@src/interfaces';
import { customResponse, generateInvoiceNumber, generateInvoicePdf, buildWhatsappMessageLink } from '@src/utils';
import Order from '@src/models/Order.model';
import User from '@src/models/User.model';
import Product from '@src/models/Product.model';
import Invoice from '@src/models/Invoice.model';
import { authorizationRoles, orderStatus } from '@src/constants';
import { getOrCreatePlatformSettings } from './settings.service';
import { sendNewOrderNotificationEmail, sendOrderConfirmationEmail } from '@src/utils/sendEmail';

export const getOrdersService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  try {
    const orders = await Order.find({ 'user.userId': req.user?._id })
      .populate(
        'user.userId',
        '-password -confirmPassword  -status -cart -role -status -isVerified -isDeleted -acceptTerms'
      )
      .populate('orderItems.product')
      .exec();

    const data = {
      orders,
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successful Found all your orders`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    console.error(error);
    return next(InternalServerError);
  }
};

export const getOrderService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId)
      .populate(
        'user.userId',
        '-password -confirmPassword  -status -cart -role -status -isVerified -isDeleted -acceptTerms'
      )
      .populate('orderItems.product')
      .exec();

    if (!order) {
      return next(new createHttpError.BadRequest());
    }

    if (order.user.userId._id.toString() !== req?.user?._id.toString()) {
      return next(createHttpError(403, `Auth Failed (Unauthorized)`));
    }

    const data = {
      order,
    };

    return res.status(200).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Successfully found order by ID ${orderId}`,
        status: 200,
        data,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const postOrderService = async (
  req: AuthenticatedRequestBody<ProcessingOrderT>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { shippingInfo, paymentMethod, textAmount = 0, shippingAmount = 0, totalAmount, orderItems } = req.body;

    // Validate required fields
    if (!shippingInfo) {
      return next(createHttpError(400, 'Shipping information is required'));
    }
    if (!shippingInfo.address || !shippingInfo.city || !shippingInfo.country || !shippingInfo.zipCode || !shippingInfo.phoneNo) {
      return next(createHttpError(400, 'Shipping information is incomplete. Required: address, city, country, zipCode, phoneNo'));
    }

    const authUser = await User.findById(req.user?._id)
      .select('-password -confirmPassword -status')
      .populate('cart.items.productId')
      .exec();

    if (!authUser) {
      return next(createHttpError(401, `Auth Failed`));
    }

    const requestedItems =
      orderItems && orderItems.length > 0
        ? orderItems.map((item) => ({ product: item.product, quantity: item.quantity }))
        : [];

    const cartItems =
      authUser.cart?.items?.map((item: { quantity: number; productId: { _id: string } }) => ({
        product: item.productId?._id || item.productId,
        quantity: item.quantity,
      })) || [];

    const itemsToProcess = requestedItems.length ? requestedItems : cartItems;

    console.log('Order processing:', {
      requestedItemsCount: requestedItems.length,
      cartItemsCount: cartItems.length,
      itemsToProcessCount: itemsToProcess.length,
      orderItems: orderItems ? orderItems.length : 0,
    });

    if (!itemsToProcess.length) {
      return next(createHttpError(402, `Order Failed (your cart is empty)`));
    }

    const finalItemsToOrder: OrderItemT[] = [];
    let subTotal = 0;

    for (const item of itemsToProcess) {
      if (!item.product) {
        console.error('Invalid item missing product ID:', item);
        return next(new createHttpError.BadRequest(`Invalid order item: product ID is required`));
      }
      
      const productDoc = await Product.findById(item.product);
      if (!productDoc) {
        console.error(`Product not found: ${item.product}`);
        return next(new createHttpError.BadRequest(`Product with id ${item.product} not found`));
      }
      
      const quantity = item.quantity || 1;
      if (quantity < 1) {
        return next(new createHttpError.BadRequest(`Invalid quantity for product ${item.product}: ${quantity}`));
      }
      
      const lineTotal = Number(productDoc.price) * quantity;
      subTotal += lineTotal;

      finalItemsToOrder.push({
        product: productDoc._id,
        quantity,
        unitPrice: productDoc.price,
        nameSnapshot: productDoc.name,
      });
    }

    const computedTotal = (totalAmount || subTotal + shippingAmount + textAmount).valueOf();

    // Ensure required fields are present
    const userAddress = authUser.address || shippingInfo.address || shippingInfo.street || '';
    if (!userAddress) {
      return next(createHttpError(400, 'User address is required'));
    }

    // Ensure we have valid user name and surname
    if (!authUser.name || !authUser.surname) {
      return next(createHttpError(400, 'User name and surname are required'));
    }

    console.log('Creating order with:', {
      shippingInfo,
      paymentMethod,
      orderItemsCount: finalItemsToOrder.length,
      subTotal,
      totalAmount: computedTotal,
    });

    const order = new Order({
      shippingInfo,
      paymentMethod: paymentMethod || 'bank-transfer',
      textAmount,
      shippingAmount,
      subTotal,
      totalAmount: computedTotal,
      user: {
        name: authUser.name,
        surname: authUser.surname,
        email: authUser.email,
        phone: authUser.mobileNumber || shippingInfo.phoneNo,
        address: userAddress,
        userId: authUser._id,
      },
      orderItems: finalItemsToOrder,
      statusHistory: [
        {
          status: orderStatus.awaitingPayment,
          note: 'Order created and waiting for payment confirmation',
          changedBy: authUser._id,
        },
      ],
    });

    console.log('Saving order to database...');
    let orderedItem;
    try {
      orderedItem = await order.save();
    } catch (saveError: any) {
      console.error('Error saving order:', saveError);
      if (saveError.name === 'ValidationError') {
        const validationErrors = Object.values(saveError.errors || {}).map((err: any) => err.message);
        return next(createHttpError(400, `Order validation failed: ${validationErrors.join(', ')}`));
      }
      throw saveError; // Re-throw to be caught by outer catch
    }
    await orderedItem.populate('orderItems.product');

    console.log('Order saved successfully:', orderedItem._id);

    const settings = await getOrCreatePlatformSettings();

    let invoiceNumber = generateInvoiceNumber();
    // Ensure uniqueness
    // eslint-disable-next-line no-await-in-loop
    let attempts = 0;
    while (await Invoice.exists({ invoiceNumber }) && attempts < 10) {
      invoiceNumber = generateInvoiceNumber(Math.floor(Math.random() * 9999));
      attempts++;
    }

    if (attempts >= 10) {
      console.error('Failed to generate unique invoice number after 10 attempts');
      return next(createHttpError(500, 'Failed to generate unique invoice number'));
    }

    console.log('Generating invoice PDF for order:', orderedItem._id);
    console.log('Order items count:', orderedItem.orderItems?.length || 0);
    console.log('Order items:', JSON.stringify(orderedItem.orderItems?.slice(0, 2) || [], null, 2));
    
    let invoicePdf;
    try {
      // Ensure orderItems is properly accessible
      const orderForPdf = {
        ...orderedItem.toObject(),
        orderItems: orderedItem.orderItems || [],
      } as unknown as OrderT;
      
      invoicePdf = await generateInvoicePdf({ order: orderForPdf, invoiceNumber });
    } catch (pdfError: any) {
      console.error('Error generating invoice PDF:', pdfError);
      return next(createHttpError(500, `Failed to generate invoice PDF: ${pdfError.message || 'Unknown error'}`));
    }

    const whatsappTemplate =
      settings.whatsappMessageTemplate ||
      'Hello, I just placed an order with invoice {invoiceNumber}. Can you confirm payment instructions?';
    const whatsappMessage = whatsappTemplate.replace('{invoiceNumber}', invoiceNumber);
    const whatsappUrl = buildWhatsappMessageLink(settings.adminWhatsappNumber, whatsappMessage);

    console.log('Creating invoice record for order:', orderedItem._id);
    let invoice;
    try {
      invoice = await Invoice.create({
        order: orderedItem._id,
        invoiceNumber,
        amountDue: computedTotal,
        currency: 'NGN',
        customer: {
          name: `${authUser.name} ${authUser.surname}`,
          email: authUser.email,
          phone: authUser.mobileNumber || shippingInfo.phoneNo,
        },
        documentPath: invoicePdf.absolutePath || null, // null in serverless
        documentUrl: invoicePdf.documentUrl, // Use documentUrl (Cloudinary URL in serverless, relative path in local)
        whatsappMessageUrl: whatsappUrl,
        adminWhatsappSnapshot: settings.adminWhatsappNumber,
        status: 'sent',
        sentAt: new Date(),
      });
      console.log('Invoice created successfully:', invoice._id);
    } catch (invoiceError: any) {
      console.error('Error creating invoice:', invoiceError);
      return next(createHttpError(500, `Failed to create invoice: ${invoiceError.message || 'Unknown error'}`));
    }

    orderedItem.invoice = invoice._id;
    orderedItem.invoiceNumber = invoiceNumber;
    orderedItem.whatsappMessageUrl = whatsappUrl;
    orderedItem.adminContactSnapshot = settings.adminWhatsappNumber;
    await orderedItem.save({ validateBeforeSave: false });

    // Always clear the cart after successful order creation
    // This ensures the cart is empty regardless of whether orderItems was provided
    try {
      await authUser.clearCart();
      console.log('Cart cleared successfully for user:', authUser._id);
    } catch (cartError) {
      console.error('Error clearing cart after order creation:', cartError);
      // Don't fail the order if cart clearing fails - order is already created
    }

    // Send admin notification email
    sendNewOrderNotificationEmail({
      adminEmail: settings.orderNotificationEmail,
      customerName: `${authUser.name} ${authUser.surname}`,
      customerPhone: authUser.mobileNumber || shippingInfo.phoneNo,
      invoiceNumber,
      orderId: orderedItem._id.toString(),
      totalAmount: computedTotal,
      whatsappUrl: whatsappUrl,
    }).catch((error) => console.error('Error sending admin notification email:', error));

    // Send customer order confirmation email
    const shippingAddressParts = [
      shippingInfo.address || shippingInfo.street || '',
      shippingInfo.city || '',
      shippingInfo.zipCode || '',
      shippingInfo.country || '',
    ].filter(Boolean);
    const shippingAddressText = shippingAddressParts.join(', ');

    sendOrderConfirmationEmail({
      customerEmail: authUser.email,
      customerName: `${authUser.name} ${authUser.surname}`,
      invoiceNumber,
      orderId: orderedItem._id.toString(),
      totalAmount: computedTotal,
      orderItems: finalItemsToOrder.map(item => ({
        name: item.nameSnapshot || 'Product',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      shippingAddress: shippingAddressText,
    }).catch((error) => console.error('Error sending customer order confirmation email:', error));

    const data = {
      order: orderedItem,
      invoice: {
        invoiceNumber,
        downloadUrl: invoice.documentUrl,
        whatsappUrl,
        adminWhatsappNumber: settings.adminWhatsappNumber,
      },
    };

    return res.status(201).send(
      customResponse<typeof data>({
        success: true,
        error: false,
        message: `Order received. An invoice has been generated and sent to your dashboard.`,
        status: 201,
        data,
      })
    );
  } catch (error: any) {
    console.error('Error in postOrderService:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code,
      errors: error?.errors,
    });
    
    // Check for validation errors
    if (error?.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
      return next(createHttpError(400, `Validation Error: ${validationErrors.join(', ')}`));
    }
    
    // Check for cast errors (invalid ObjectId, etc.)
    if (error?.name === 'CastError') {
      return next(createHttpError(400, `Invalid data format: ${error.message}`));
    }
    
    // Check for duplicate key errors
    if (error?.code === 11000) {
      return next(createHttpError(409, 'Duplicate entry detected'));
    }
    
    // Generic server error
    return next(InternalServerError);
  }
};

export const clearSingleOrderService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new createHttpError.BadRequest());
    }

    if (order.user.userId.toString() !== req?.user?._id.toString()) {
      return next(createHttpError(403, `Auth Failed (Unauthorized)`));
    }

    const isRemoved = await Order.findByIdAndRemove({
      _id: orderId,
    });

    if (!isRemoved) {
      return next(createHttpError(400, `Failed to delete order by given ID ${orderId}`));
    }

    return res.status(200).json(
      customResponse({
        data: null,
        success: true,
        error: false,
        message: `Successfully deleted order by ID ${orderId}`,
        status: 200,
      })
    );
  } catch (error) {
    return next(InternalServerError);
  }
};

export const clearAllOrdersService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    // Delete complete Order collection
    const dropCompleteCollection = await Order.deleteMany({ 'user.email': req.user?.email });

    if (dropCompleteCollection.deletedCount === 0) {
      return next(createHttpError(400, `Failed to Cleared orders`));
    }

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        message: `Successful Cleared all orders`,
        status: 200,
        data: { products: [] },
      })
    );
  } catch (error) {
    return next(error);
  }
};

export const getInvoicesService = async (req: AuthenticatedRequestBody<IUser>, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('user.userId').populate('orderItems.product').exec();

    if (!order) {
      return next(createHttpError(400, `No order found.`));
    }

    // Check if user is authorized to access this invoice
    // Allow access if:
    // 1. User is the order owner, OR
    // 2. User has admin role, OR
    // 3. User has client role
    
    // Check order owner - handle both populated and unpopulated user structure
    const orderUserId = order.user?.userId?._id?.toString() || order.user?.userId?.toString();
    const currentUserId = req?.user?._id?.toString();
    const isOrderOwner = orderUserId === currentUserId;
    
    // Check roles - normalize for comparison
    const userRole = String(req?.user?.role || '').toLowerCase().trim();
    const isAdmin = userRole === authorizationRoles?.admin.toLowerCase().trim();
    const isClient = userRole === authorizationRoles?.client.toLowerCase().trim();
    
    // Debug logging
    console.log('Invoice access check:', {
      orderId: orderId,
      userId: currentUserId,
      userRole: req?.user?.role,
      userRoleNormalized: userRole,
      orderUserId: orderUserId,
      isOrderOwner,
      isAdmin,
      isClient,
      authorizationRoles: {
        admin: authorizationRoles?.admin,
        client: authorizationRoles?.client
      }
    });
    
    if (!isOrderOwner && !isAdmin && !isClient) {
      console.error('Invoice access denied:', {
        orderId: orderId,
        userId: currentUserId,
        userRole: req?.user?.role,
        userRoleNormalized: userRole,
        orderUserId: orderUserId,
        isOrderOwner,
        isAdmin,
        isClient,
        authorizationRoles
      });
      return next(createHttpError(403, `Unauthorized`));
    }

    let invoice = await Invoice.findOne({ order: order._id });

    if (!invoice) {
      return next(createHttpError(404, 'Invoice not found for this order'));
    }

    // Check if invoice document exists (for local) or if documentUrl is missing (for serverless)
    const isServerless = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;
    const needsRegeneration = isServerless
      ? !invoice.documentUrl // In serverless, check if documentUrl exists
      : !invoice.documentPath || !fs.existsSync(invoice.documentPath); // In local, check if file exists

    if (needsRegeneration) {
      console.log('Regenerating invoice PDF for order:', order._id);
      console.log('Order items count:', order.orderItems?.length || 0);
      
      // Ensure orderItems is properly accessible
      const orderForPdf = {
        ...order.toObject(),
        orderItems: order.orderItems || [],
      } as unknown as OrderT;
      
      const regenerated = await generateInvoicePdf({
        order: orderForPdf,
        invoiceNumber: invoice.invoiceNumber,
      });
      invoice.documentPath = regenerated.absolutePath;
      invoice.documentUrl = regenerated.documentUrl;
      invoice = await invoice.save();
    }

    if (req.query?.download === 'false') {
      return res.status(200).send(
        customResponse({
          success: true,
          error: false,
          status: 200,
          message: 'Successfully fetched invoice metadata',
          data: { invoice },
        })
      );
    }

    // Handle PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);

    if (isServerless && invoice.documentUrl) {
      // In serverless, fetch PDF from Cloudinary URL and stream it
      try {
        const pdfUrl = new URL(invoice.documentUrl);
        const httpModule = pdfUrl.protocol === 'https:' ? https : http;
        const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
          httpModule
            .get(pdfUrl, (response) => {
              if (response.statusCode !== 200) {
                reject(new Error(`Failed to fetch PDF: ${response.statusCode}`));
                return;
              }
              const chunks: Buffer[] = [];
              response.on('data', (chunk: Buffer) => chunks.push(chunk));
              response.on('end', () => resolve(Buffer.concat(chunks)));
              response.on('error', reject);
            })
            .on('error', reject);
        });
        res.send(pdfBuffer);
      } catch (fetchError: any) {
        console.error('Error fetching invoice PDF from Cloudinary:', fetchError);
        return next(createHttpError(500, `Failed to fetch invoice PDF: ${fetchError.message || 'Unknown error'}`));
      }
    } else if (invoice.documentPath && fs.existsSync(invoice.documentPath)) {
      // Local development: read from disk
      const stream = fs.createReadStream(invoice.documentPath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } else {
      return next(createHttpError(404, 'Invoice PDF not found'));
    }
  } catch (error) {
    return next(InternalServerError);
  }
};
