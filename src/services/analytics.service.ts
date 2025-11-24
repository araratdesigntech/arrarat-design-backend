import { NextFunction, Request, Response } from 'express';
import createHttpError, { InternalServerError } from 'http-errors';
import mongoose from 'mongoose';

import { AuthenticatedRequestBody, IUser } from '@src/interfaces';
import { customResponse } from '@src/utils';
import Order from '@src/models/Order.model';
import Product from '@src/models/Product.model';
import User from '@src/models/User.model';
import { orderStatus } from '@src/constants/order';

// Get dashboard overview stats
export const getDashboardStatsService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get total revenue (sum of all order amounts for confirmed/completed payments)
    // Orders with payment_confirmed or completed status are considered paid
    const revenueResult = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: [orderStatus.paymentConfirmed, orderStatus.completed] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
        },
      },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // Get total products count
    const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });

    // Get total orders count
    const totalOrders = await Order.countDocuments();

    // Get awaiting payment orders count
    const awaitingPayment = await Order.countDocuments({ orderStatus: 'awaiting_payment' });

    // Get total customers
    const totalCustomers = await User.countDocuments({ role: 'client', isDeleted: { $ne: true } });

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRevenueResult = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: [orderStatus.paymentConfirmed, orderStatus.completed] },
          createdAt: { $gte: today },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
        },
      },
    ]);
    const todayRevenue = todayRevenueResult[0]?.total || 0;
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });

    // Get this month's stats
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthRevenueResult = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: [orderStatus.paymentConfirmed, orderStatus.completed] },
          createdAt: { $gte: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
        },
      },
    ]);
    const monthRevenue = monthRevenueResult[0]?.total || 0;
    const monthOrders = await Order.countDocuments({ createdAt: { $gte: thisMonth } });

    // Get last month for comparison
    const lastMonth = new Date(thisMonth);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthRevenueResult = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: [orderStatus.paymentConfirmed, orderStatus.completed] },
          createdAt: { $gte: lastMonth, $lt: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
        },
      },
    ]);
    const lastMonthRevenue = lastMonthRevenueResult[0]?.total || 0;
    const lastMonthOrders = await Order.countDocuments({
      createdAt: { $gte: lastMonth, $lt: thisMonth },
    });

    // Calculate growth percentages
    const revenueGrowth =
      lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
    const ordersGrowth =
      lastMonthOrders > 0 ? ((monthOrders - lastMonthOrders) / lastMonthOrders) * 100 : 0;

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        status: 200,
        message: 'Dashboard stats fetched successfully',
        data: {
          overview: {
            totalRevenue,
            totalProducts,
            totalOrders,
            awaitingPayment,
            totalCustomers,
          },
          today: {
            revenue: todayRevenue,
            orders: todayOrders,
          },
          thisMonth: {
            revenue: monthRevenue,
            orders: monthOrders,
          },
          growth: {
            revenueGrowth: Number(revenueGrowth.toFixed(2)),
            ordersGrowth: Number(ordersGrowth.toFixed(2)),
          },
        },
      })
    );
  } catch (error) {
    console.error('Error in getDashboardStatsService:', error);
    return next(InternalServerError);
  }
};

// Get revenue trends (daily, weekly, monthly)
export const getRevenueTrendsService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { period = 'monthly' } = req.query;

    let groupBy: Record<string, unknown>;
    let startDate: Date;

    const now = new Date();

    if (period === 'daily') {
      // Last 30 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
    } else if (period === 'weekly') {
      // Last 12 weeks
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 84); // 12 weeks
      groupBy = {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' },
      };
    } else {
      // Monthly - last 12 months
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 12);
      groupBy = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
    }

    const trends = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: [orderStatus.paymentConfirmed, orderStatus.completed] },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.day': 1 },
      },
    ]);

    // Format the data for charts
    const formattedTrends = trends.map((item) => {
      let label = '';
      if (period === 'daily') {
        label = `${item._id.day}/${item._id.month}/${item._id.year}`;
      } else if (period === 'weekly') {
        label = `Week ${item._id.week}, ${item._id.year}`;
      } else {
        const monthNames = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        label = `${monthNames[item._id.month - 1]} ${item._id.year}`;
      }

      return {
        label,
        revenue: item.revenue,
        orders: item.orders,
      };
    });

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        status: 200,
        message: 'Revenue trends fetched successfully',
        data: {
          period,
          trends: formattedTrends,
        },
      })
    );
  } catch (error) {
    console.error('Error in getRevenueTrendsService:', error);
    return next(InternalServerError);
  }
};

// Get orders by location (country/state)
export const getOrdersByLocationService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { groupBy = 'country' } = req.query; // 'country' or 'state'

    const locationField = groupBy === 'state' ? 'shippingInfo.city' : 'shippingInfo.country';

    const ordersByLocation = await Order.aggregate([
      {
        $group: {
          _id: { $toLower: `$${locationField}` },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      {
        $sort: { revenue: -1 },
      },
      {
        $limit: 10, // Top 10 locations
      },
    ]);

    const formatted = ordersByLocation.map((item, index) => ({
      location: item._id
        ? item._id
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        : 'Unknown',
      count: item.count,
      revenue: item.revenue,
      percentage: 0, // Will be calculated on frontend
    }));

    // Calculate total for percentage
    const totalRevenue = formatted.reduce((sum, item) => sum + item.revenue, 0);
    const formattedWithPercentage = formatted.map((item) => ({
      ...item,
      percentage: totalRevenue > 0 ? Number(((item.revenue / totalRevenue) * 100).toFixed(2)) : 0,
    }));

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        status: 200,
        message: 'Orders by location fetched successfully',
        data: {
          groupBy,
          locations: formattedWithPercentage,
        },
      })
    );
  } catch (error) {
    console.error('Error in getOrdersByLocationService:', error);
    return next(InternalServerError);
  }
};

// Get orders by status distribution
export const getOrdersByStatusService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const ordersByStatus = await Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const totalOrders = ordersByStatus.reduce((sum, item) => sum + item.count, 0);

    const formatted = ordersByStatus.map((item) => {
      const statusLabel = item._id
        ? item._id
            .split('_')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        : 'Unknown';

      return {
        status: item._id || 'unknown',
        label: statusLabel,
        count: item.count,
        revenue: item.revenue,
        percentage: totalOrders > 0 ? Number(((item.count / totalOrders) * 100).toFixed(2)) : 0,
      };
    });

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        status: 200,
        message: 'Orders by status fetched successfully',
        data: {
          statuses: formatted,
          total: totalOrders,
        },
      })
    );
  } catch (error) {
    console.error('Error in getOrdersByStatusService:', error);
    return next(InternalServerError);
  }
};

// Get top products
export const getTopProductsService = async (
  req: AuthenticatedRequestBody<IUser>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { limit = 10 } = req.query;

    const topProducts = await Order.aggregate([
      {
        $unwind: '$orderItems',
      },
      {
        $group: {
          _id: '$orderItems.product',
          quantitySold: { $sum: '$orderItems.quantity' },
          revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } },
          orderCount: { $sum: 1 },
        },
      },
      {
        $sort: { revenue: -1 },
      },
      {
        $limit: Number(limit),
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const formatted = topProducts.map((item) => ({
      productId: item._id,
      productName: item.product?.name || 'Unknown Product',
      quantitySold: item.quantitySold,
      revenue: item.revenue,
      orderCount: item.orderCount,
      image: item.product?.productImage || item.product?.productImages?.[0]?.url || null,
    }));

    return res.status(200).send(
      customResponse({
        success: true,
        error: false,
        status: 200,
        message: 'Top products fetched successfully',
        data: {
          products: formatted,
        },
      })
    );
  } catch (error) {
    console.error('Error in getTopProductsService:', error);
    return next(InternalServerError);
  }
};

