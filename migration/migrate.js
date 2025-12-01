/***********************************************
 * SQL → MongoDB Migration Script
 * FlashTans E-Commerce Migration (Phase 3.3)
 ***********************************************/

require("dotenv").config();
const mysql = require("mysql2/promise");
const connectMongo = require("../config/mongo");

const Product = require("../models/product");
const Customer = require("../models/customer");
const Order = require("../models/order");

/*
 * NOTE:
 * You must have BOTH MySQL and MongoDB running.
 * This script reads SQL tables:
 *    products, customers, orders, order_items
 * and transforms them into MongoDB collections:
 *    products, customers, orders
 *
 * Run it with:
 *    node migration/migrate.js
 */

async function migrate() {
  console.log("🚀 Starting SQL → MongoDB migration...");

  // -----------------------------------------------
  //   1. CONNECT TO MYSQL
  // -----------------------------------------------
  const mysqlConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "admin123",
    database: process.env.MYSQL_DATABASE || "flash_tans_db",
    port: process.env.MYSQL_PORT || 3306
  });

  console.log("🟢 Connected to MySQL");

  // -----------------------------------------------
  //   2. CONNECT TO MONGODB
  // -----------------------------------------------
  await connectMongo();
  console.log("🟢 Connected to MongoDB\n");

  // -----------------------------------------------
  //   3. MIGRATE PRODUCTS
  // -----------------------------------------------
  console.log("📦 Migrating products...");

  const [productRows] = await mysqlConnection.execute(`
    SELECT id, name, price, description, stock, image
    FROM products
  `);

  await Product.deleteMany({}); // clean slate
  for (const p of productRows) {
    await Product.create({
      name: p.name,
      price: Number(p.price),
      description: p.description,
      stock: p.stock,
      image: p.image || "/images/placeholder.jpg"
    });
  }

  console.log(`   ✔ Migrated ${productRows.length} products`);

  // -----------------------------------------------
  //   4. MIGRATE CUSTOMERS
  // -----------------------------------------------
  console.log("👤 Migrating customers...");

  const [customerRows] = await mysqlConnection.execute(`
    SELECT id, name, email, address 
    FROM customers
  `);

  await Customer.deleteMany({});
  const customerIdMap = {}; // maps SQL id → Mongo id

  for (const c of customerRows) {
    const mongoCust = await Customer.create({
      name: c.name,
      email: c.email,
      address: c.address
    });

    customerIdMap[c.id] = mongoCust._id.toString();
  }

  console.log(`   ✔ Migrated ${customerRows.length} customers`);

  // -----------------------------------------------
  //   5. MIGRATE ORDERS + ORDER ITEMS
  // -----------------------------------------------
  console.log("🧾 Migrating orders...");

  const [orderRows] = await mysqlConnection.execute(`
    SELECT id, customer_id, total, status, created_at
    FROM orders
  `);

  // Load order_items
  const [itemRows] = await mysqlConnection.execute(`
    SELECT order_id, product_id, product_name, price, quantity, subtotal
    FROM order_items
  `);

  await Order.deleteMany({});

  for (const oldOrder of orderRows) {
    const sqlOrderId = oldOrder.id;

    // Filter items belonging to this order
    const itemsForOrder = itemRows
      .filter((it) => it.order_id === sqlOrderId)
      .map((it) => ({
        productId: it.product_id,
        productName: it.product_name,
        price: Number(it.price),
        quantity: it.quantity,
        subtotal: Number(it.subtotal)
      }));

    // Resolve linked customer
    const mongoCustomerId = customerIdMap[oldOrder.customer_id] || null;

    // Insert order into MongoDB
    await Order.create({
      customerId: mongoCustomerId,
      customerName: customerRows.find((c) => c.id === oldOrder.customer_id)?.name || "Unknown",
      customerEmail: customerRows.find((c) => c.id === oldOrder.customer_id)?.email || "Unknown",
      total: Number(oldOrder.total),
      status: oldOrder.status || "pending",
      items: itemsForOrder,
      createdAt: oldOrder.created_at
    });
  }

  console.log(`   ✔ Migrated ${orderRows.length} orders`);

  // -----------------------------------------------
  //   6. FINISH
  // -----------------------------------------------
  console.log("\n🎉 Migration completed successfully!");
  console.log("   SQL → MongoDB data transfer finished.\n");

  process.exit(0);
}

// Run migration
migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
