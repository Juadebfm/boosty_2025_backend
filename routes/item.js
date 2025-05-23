const express = require("express");
const mongoose = require("mongoose");
const Item = require("../models/Item");
const { verifyTokenAndAdmin } = require("../middleware/verifyToken");

const router = express.Router();

// Update item by ID
router.put("/:id", verifyTokenAndAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    // Update item
    const updatedItem = await Item.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!updatedItem) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.status(200).json(updatedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete item by ID
router.delete("/:id", verifyTokenAndAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    // Delete item
    const deletedItem = await Item.findByIdAndDelete(id);
    if (!deletedItem) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single item by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate item ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    // Find item
    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.status(200).json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all items from database
router.get("/", async (req, res) => {
  const query = req.query.new;
  try {
    const items = query
      ? await Item.find().sort({ _id: -1 }).limit(5)
      : await Item.find();

    res.status(200).json(items);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
