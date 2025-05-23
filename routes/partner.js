const express = require("express");
const Partner = require("../models/Partner");
const {
    verifyToken,
    verifyTokenAndAdmin,
    verifyTokenAndAuthorization,
  } = require("../middleware/verifyToken");

const router = express.Router();

// Create partner
router.post("/", async (req, res) => {
    const partner = new Partner(req.body);
    try {
      const savedPartner = await partner.save();
      res.status(201).json(savedPartner);
    } catch (error) {
      res.status(400).json({ 
        message: "Failed to create partner" 
      });
    }
   });

// Update investor by ID
router.put("/:id", verifyTokenAndAuthorization, async (req, res) => {
 try {
   const updatedPartner = await Partner.findByIdAndUpdate(
     req.params.id,
     req.body,
     { new: true }
   );
   if (!updatedPartner) {
     return res.status(404).json({ 
       message: "Partner not found"
     });
   }
   res.status(200).json(updatedPartner);
 } catch (error) {
   res.status(400).json({ 
     message: "Failed to update partner"
   });
 }
});


// Delete investor by ID
router.delete("/:id", verifyTokenAndAuthorization, async (req, res) => {
 try {
   const deletedPartner = await Investor.findByIdAndDelete(req.params.id);
   if (!deletedPartner) {
     return res.status(404).json({ 
       message: "Partner not found"
     });
   }
   res.status(200).json({ 
     message: "Partner deleted successfully"
   });
 } catch (error) {
   res.status(500).json({ 
     message: "Failed to delete partner"
   });
 }
});


// Get single investor by ID
router.get("/:id",  async (req, res) => {
    try {
      const partner = await Partner.findById(req.params.id);
      if (!partner) {
        return res.status(404).json({ 
          message: "Partner not found"
        });
      }
      res.status(200).json(partner);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch partner"
      });
    }
   });


// Get all investors from database
router.get("/", async(req, res) => {
    const query = req.query.new;
 try {
    const partners = query?
    await Partner.find().sort({_id: -1 }).limit(5)
    : await Partner.find();

    res.status(200).json(partners);
 } catch (error) {
    res.status(500).json(error);
 }
});


module.exports = router;