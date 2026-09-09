const cors = require("cors");
const express = require("express");
const errorMiddleware = require("./middleware/errorMiddleware");
const catalogRoutes = require("./routes/catalogRoutes");
const collectionRoutes = require(
  "./routes/collectionRoutes"
);


const path = require("path");

const app = express();

// ================================
// CORS
// ================================

app.use(
  cors({
    origin:[
  "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/*
====================================================
FASTRR WEBHOOK RAW BODY
====================================================

IMPORTANT:
FASTRR webhook ka HMAC verify karne ke liye
original/raw request body chahiye.

Isliye ye route express.json() se PEHLE hona chahiye.
*/

app.use(
  "/api/payment/fastrr/webhook",
  express.raw({
    type: "application/json",
  })
);


// ====================================================
// GLOBAL JSON MIDDLEWARE
// ====================================================

app.use(express.json());


// ====================================================
// UPLOADED FILES
// ====================================================

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
  )
);


// ====================================================
// REELS ROUTES
// ====================================================

app.use(
  "/api/reels",
  require("./routes/reelRoutes")
);


// ====================================================
// TEST ROUTE
// ====================================================

app.get("/", (req, res) => {
  res.send(
    "We Make Sweets Backend is running!"
  );
});


// ====================================================
// AUTH ROUTES
// ====================================================

app.use(
  "/api/auth",
  require("./routes/authRoutes")
);


// ====================================================
// PRODUCT ROUTES
// ====================================================

app.use(
  "/api/products",
  require("./routes/productRoutes")
);

// ====================================================
// COLLECTION ROUTES
// ==================================================== 
app.use(
  "/api/collections",
  collectionRoutes
);

//====================================================
// CATALOG ROUTES
//====================================================  
app.use(
  "/api/catalog",
  catalogRoutes
);


// ====================================================
// CART ROUTES
// ====================================================

app.use(
  "/api/cart",
  require("./routes/cartRoutes")
);


// ====================================================
// WISHLIST ROUTES
// ====================================================

app.use(
  "/api/wishlist",
  require("./routes/wishlistRoutes")
);


// ====================================================
// ORDER ROUTES
// ====================================================

app.use(
  "/api/orders",
  require("./routes/orderRoutes")
);


// ====================================================
// PAYMENT ROUTES
// ====================================================

app.use(
  "/api/payment",
  require("./routes/paymentRoutes")
);


// ====================================================
// SHIPROCKET ROUTES
// ====================================================

app.use(
  "/api/shiprocket",
  require("./routes/shiprocketRoutes")
);


// ====================================================
// REVIEW ROUTES
// ====================================================

app.use(
  "/api/reviews",
  require("./routes/reviewRoutes")
);


// ====================================================
// HERO BANNER ROUTES
// ====================================================

app.use(
  "/api/hero-banner",
  require("./routes/heroBannerRoutes")
);


// ====================================================
// USER ROUTES
// ====================================================

app.use(
  "/api/users",
  require("./routes/userRoutes")
);


// ====================================================
// ADMIN ROUTES
// ====================================================

app.use(
  "/api/admin",
  require("./routes/adminRoutes")
);


// ====================================================
// ERROR MIDDLEWARE
// ====================================================

app.use(errorMiddleware);


// ====================================================
// EXPORT APP
// ====================================================

module.exports = app;