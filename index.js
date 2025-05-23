const express = require("express");
const cors = require("cors");
const app = express();
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { clerkMiddleware } = require("@clerk/express");

dotenv.config();

// use the exported router
const userRoute = require("./routes/user");
const authRoute = require("./routes/auth");
const setupRoute = require("./routes/setup");
const itemRoute = require("./routes/item");
// const paystackRoute = require("./routes/paystack");
const orderRoute = require("./routes/order");
const investorRoute = require("./routes/investor");
const partnerRoute = require("./routes/partner");
const recommendationRoute = require("./routes/recommendationSystem");

// connect our code to the database (MongoDB)
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("DB Connection Established"))
  .catch((err) => console.log(err));

app.use(cors());
//Use the route
app.use(express.json());
app.use(clerkMiddleware());

app.use("/api/users", userRoute);
app.use("/api/auth", authRoute);
// app.use("/api/checkout", paystackRoute);
app.use("/api/setup", setupRoute);
app.use("/api/item", itemRoute);
app.use("/api/order", orderRoute);
app.use("/api/investor", investorRoute);
app.use("/api/partner", partnerRoute);
app.use("/api/recommendations", recommendationRoute);

const PORT = process.env.PORT || 3001;

// to listen to the application
app.listen(PORT, () => {
  console.log(`Backend services is running at http://localhost:${PORT}`);
});
