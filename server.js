// server.js
require("dotenv").config();
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const bodyParser = require("body-parser");
const path = require("path");

const connectMongo = require("./config/mongo");
const Product = require("./models/product");
const Customer = require("./models/customer");
const Order = require("./models/order");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

// Health-check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Connect to Mongo and start server
(async () => {
  try {
    await connectMongo();

    // If no products exist, seed sample products (similar to previous DB initializer)
    const count = await Product.countDocuments();
    if (count === 0) {
      console.log("Seeding sample products...");
      await Product.create([
        {
          name: "Buckets",
          price: 29.99,
          description: "Amazon S3 Buckets for scalable storage",
          stock: 50
        },
        {
          name: "Load Balancers",
          price: 34.99,
          description: "Customizable load balancers for your applications",
          stock: 30
        },
        {
          name: "Microsoft Azure",
          price: 24.99,
          description: "Cloud computing services for building, testing, and deploying applications",
          stock: 25
        }
      ]);
      console.log("Sample products created.");
    }

    app.listen(PORT, () => {
      console.log(`Flash Tans server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();

/* -----------------
   Routes (rendering + API)
   ----------------- */

// Home page - render products
app.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean().exec();
    res.render("index", { products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).render("error", { message: "Failed to load products" });
  }
});

// Admin page - show products and orders
app.get("/admin", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean().exec();
    const orders = await Order.find().sort({ createdAt: -1 }).lean().exec();
    res.render("admin", { products, orders });
  } catch (error) {
    console.error("Error loading admin data:", error);
    res.status(500).render("error", { message: "Failed to load admin data" });
  }
});

app.get("/cart", (req, res) => {
  res.render("cart");
});

/* -----------------
   API: Products
   ----------------- */

// GET /api/products
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean().exec();
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// POST /api/products
app.post("/api/products", async (req, res) => {
  try {
    const { name, price, description, stock } = req.body;
    if (!name || price === undefined || description === undefined || stock === undefined) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const created = await Product.create({
      name,
      price: parseFloat(price),
      description,
      stock: parseInt(stock, 10)
    });
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// DELETE /api/products/:id
app.delete("/api/products/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await Product.findByIdAndDelete(id).exec();
    if (!result) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

/* -----------------
   API: Orders
   ----------------- */

// POST /api/orders
app.post("/api/orders", async (req, res) => {
  try {
    const { items, customerInfo } = req.body;

    if (!items || !items.length || !customerInfo) {
      return res.status(400).json({ error: "Items and customer info are required" });
    }

    // Verify products and calculate total
    let total = 0;
    const orderItems = [];

    // We will load product docs to verify stock
    for (const item of items) {
      const product = await Product.findById(item.productId).exec();
      if (!product) {
        return res.status(404).json({ error: `Product ${item.productId} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }
      const itemTotal = product.price * item.quantity;
      total += itemTotal;

      orderItems.push({
        productId: product._id.toString(),
        productName: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: itemTotal
      });
    }

    // Create customer record
    const customer = await Customer.create({
      name: customerInfo.name,
      email: customerInfo.email,
      address: customerInfo.address
    });

    // Create order
    const newOrder = await Order.create({
      customerId: customer._id.toString(),
      customerName: customer.name,
      customerEmail: customer.email,
      total,
      items: orderItems
    });

    // Update product stock in parallel
    const updates = orderItems.map(it =>
      Product.findByIdAndUpdate(it.productId, { $inc: { stock: -it.quantity } }).exec()
    );
    await Promise.all(updates);

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// GET /api/orders
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean().exec();
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* -----------------
   Error handlers
   ----------------- */

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error", { message: "Something went wrong!" });
});

app.use((req, res) => {
  res.status(404).render("error", { message: "Page not found" });
});
