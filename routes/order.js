const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const {
    verifyToken,
    verifyTokenAndAuthorization,
    verifyTokenAndAdmin,
} = require("../middleware/verifyToken");

const Order = require("../models/Order");

// Create order
router.post("/", verifyToken, async (req, res) => {
    const newOrder = new Order(req.body);
    try {
        const savedOrder = await newOrder.save();
        res.status(200).json(savedOrder);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Update order
router.put("/:id", verifyTokenAndAdmin, async (req, res) => {
    try {
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            {
                $set: req.body,
            },
            {
                new: true,
            }
        );
        res.status(200).json(updatedOrder);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Delete order
router.delete("/:id", verifyTokenAndAdmin, async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Order has been deleted...." });
    } catch (error) {
        res.status(500).json(error);
    }
});

// Get user's orders
router.get("/find/:userId", verifyTokenAndAuthorization, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.params.userId });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Get all orders (admin only)
router.get("/", verifyTokenAndAdmin, async (req, res) => {
    try {
        const orders = await Order.find();
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Checkout route
router.post("/checkout", verifyToken, async (req, res) => {
    try {
        const { orderId } = req.body;

        // Validate order ID
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        // Update order status to "completed"
        order.status = "completed";
        await order.save();

        // Send a success response
        res.status(200).json({ message: "Checkout successful", order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;