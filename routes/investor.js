const express = require("express");
const Investor = require("../models/Investor");
const {
    verifyToken,
    verifyTokenAndAdmin,
    verifyTokenAndAuthorization,
  } = require("../middleware/verifyToken");

const router = express.Router();

// Create investor
router.post("/", async (req, res) => {
    const investor = new Investor(req.body);
    try {
      const savedInvestor = await investor.save();
      res.status(201).json(savedInvestor);

      const accessToken = jwt.sign(
            { id: user._id, isAdmin: user.isAdmin },
            process.env.JWT_SEC,
            { expiresIn: "15m" }
          );
    } catch (error) {
      res.status(400).json({ 
        message: "Failed to create investor" 
      });
    }
   });

// Update investor by ID
router.put("/:id", verifyTokenAndAuthorization, async (req, res) => {
 try {
   const updatedInvestor = await Investor.findByIdAndUpdate(
     req.params.id,
     req.body,
     { new: true }
   );
   if (!updatedInvestor) {
     return res.status(404).json({ 
       message: "Investor not found"
     });
   }
   res.status(200).json(updatedInvestor);
 } catch (error) {
   res.status(400).json({ 
     message: "Failed to update investor"
   });
 }
});

// Delete investor by ID
router.delete("/:id", verifyTokenAndAuthorization, async (req, res) => {
 try {
   const deletedInvestor = await Investor.findByIdAndDelete(req.params.id);
   if (!deletedInvestor) {
     return res.status(404).json({ 
       message: "Investor not found"
     });
   }
   res.status(200).json({ 
     message: "Investor deleted successfully"
   });
 } catch (error) {
   res.status(500).json({ 
     message: "Failed to delete investor"
   });
 }
});


// Get single investor by ID
router.get("/:id",  async (req, res) => {
    try {
      const investor = await Investor.findById(req.params.id);
      if (!investor) {
        return res.status(404).json({ 
          message: "Investor not found"
        });
      }
      res.status(200).json(investor);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to fetch investor"
      });
    }
   });

// Get all investors from database
router.get("/",  async(req, res) => {
    const query = req.query.new;
 try {
    const investors = query?
    await Investor.find().sort({_id: -1 }).limit(5)
    : await Investor.find();

    res.status(200).json(investors);
 } catch (error) {
    res.status(500).json(error);
 }
});

module.exports = router;