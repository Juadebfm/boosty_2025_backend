const express = require('express');
const axios = require('axios');
const Order = require('../models/Order');

const APIKEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const router = express.Router();

// One-time full payment
router.post('/pay', async (req, res) => {
  try {
    const { email, amount, orderId } = req.body;

    if (!email || !amount || !orderId) {
      return res.status(400).json({
        status: false,
        message: 'Email, amount and orderId are required'
      });
    }

    // Verify order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: false,
        message: 'Order not found'
      });
    }

    const reference = `ORDER_${orderId}_${Date.now()}`;
    
    const params = {
      email,
      amount: amount * 100, // Convert to kobo
      callback_url: 'http://boosty-backend.vercel.app/payment/callback',
      reference
    };

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`, 
      params,
      {
        headers: {
          Authorization: `Bearer ${APIKEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update order with payment reference
    await Order.findByIdAndUpdate(orderId, {
      paymentReference: reference
    });

    res.status(200).json({
      status: true,
      data: response.data.data
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.response?.data?.message || error.message
    });
  }
});

// Installmental payment
router.post('/pay-installment', async (req, res) => {
  try {
    const { email, totalAmount, installments, orderId, interval } = req.body;

    // Input validation
    if (!email || !totalAmount || !installments || !orderId || !interval) {
      return res.status(400).json({
        status: false,
        message: 'Email, totalAmount, installments, orderId, and interval are required',
      });
    }

    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
      return res.status(400).json({
        status: false,
        message: 'totalAmount must be a positive number',
      });
    }

    if (!Number.isInteger(installments) || installments <= 0) {
      return res.status(400).json({
        status: false,
        message: 'installments must be a positive integer',
      });
    }

    // Validate interval
    const validIntervals = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({
        status: false,
        message: 'interval must be one of: daily, weekly, monthly, yearly',
      });
    }

    // Verify order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: false,
        message: 'Order not found',
      });
    }

    // Check order status
    if (order.status !== 'pending') {
      return res.status(400).json({
        status: false,
        message: 'Order is not eligible for payment',
      });
    }

    // Calculate installment amount
    const installmentAmount = Math.ceil(totalAmount / installments);
    const reference = `INSTALL_${orderId}_${Date.now()}`;

    // Create payment plan
    const planParams = {
      name: `Installment Plan-${Date.now()}`,
      interval: interval,
      amount: installmentAmount * 100, // Convert to kobo
      send_invoices: true,
      send_sms: true,
    };

    const planResponse = await axios.post(
      `${process.env.PAYSTACK_BASE_URL}/plan`,
      planParams,
      {
        headers: {
          Authorization: `Bearer ${process.env.APIKEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Initialize transaction with payment plan
    const transactionParams = {
      email,
      amount: installmentAmount * 100,
      plan: planResponse.data.data.plan_code,
      callback_url: 'http://boosty-backend.vercel.app/payment/callback',
      reference,
    };

    const response = await axios.post(
      `${process.env.PAYSTACK_BASE_URL}/transaction/initialize`,
      transactionParams,
      {
        headers: {
          Authorization: `Bearer ${process.env.APIKEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Update order with payment reference
    await Order.findByIdAndUpdate(orderId, {
      paymentReference: reference,
    });

    res.status(200).json({
      status: true,
      data: response.data.data,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.response?.data?.message || error.message,
    });
  }
});

// Verify payment
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        status: false,
        message: 'Reference is required'
      });
    }

    const verification = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${APIKEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Find and update order if verification is successful
    if (verification.data.data.status === 'success') {
      const order = await Order.findOneAndUpdate(
        { paymentReference: reference },
        { status: 'paid' },
        { new: true }
      );

      if (order) {
        return res.status(200).json({
          status: true,
          data: {
            order,
            payment: verification.data.data
          }
        });
      }
    }

    res.status(200).json({
      status: true,
      data: verification.data.data
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.response?.data?.message || error.message
    });
  }
});

// Payment callback
router.post('/callback', async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        status: false,
        message: 'No reference provided'
      });
    }

    const verification = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${APIKEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const paymentData = verification.data.data;

    if (paymentData.status === 'success') {
      // Find and update the order
      const order = await Order.findOneAndUpdate(
        { paymentReference: reference },
        { status: 'paid' },
        { new: true }
      );

      if (!order) {
        return res.status(404).json({
          status: false,
          message: 'Order not found with this payment reference'
        });
      }

      return res.status(200).json({
        status: true,
        message: 'Payment verified successfully',
        data: {
          order,
          payment: paymentData
        }
      });
    }

    return res.status(400).json({
      status: false,
      message: 'Payment verification failed',
      reason: paymentData.gateway_response
    });

  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        status: false,
        message: 'Payment verification failed',
        error: error.response.data.message || 'Unknown error occurred'
      });
    }

    res.status(500).json({
      status: false,
      message: 'Internal server error during payment verification',
      error: error.message
    });
  }
});

module.exports = router;
