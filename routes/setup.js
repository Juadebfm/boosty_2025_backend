const express = require("express");
const Setup = require("../models/Setup");

const router = express.Router();

//create a setup
router.post("/",  async (req, res) => {
    const newSetup = new Setup(req.body);
  
    try {
      const savedSetup = await newSetup.save();
      res.status(200).json(savedSetup);
    } catch (error) {
      res.status(500).json(error);
    }
  });

//update setup
router.put("/:id", async (req, res) => {
    try {
      const updatedSetup = await Setup.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );
      res.status(200).json(updatedSetup);
    } catch (error) {
      res.status(500).json(error);
    }
  });

//delete setup
router.delete("/:id", async (req, res) => {
    try {
      await Setup.findByIdAndDelete(req.params.id);
      res.status(200).json("Setup has been deleted");
    } catch (error) {
      res.status(500).json(error);
    }
  });

//get setup
router.get("/:id", async (req, res) => {
    try {
      const setup = await Setup.findById(req.params.id);
      res.status(200).json(setup);
    } catch (error) {
      res.status(500).json(error);
    }
  });

//get all setups
router.get("/", async (req, res) => {
    try {
      const setups = await Setup.find();
      res.status(200).json(setups);
    } catch (error) {
      res.status(500).json(error);
    }
  });

  module.exports = router; // Export the router