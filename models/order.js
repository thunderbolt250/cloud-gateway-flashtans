const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: String,
  productName: String,
  price: Number,
  quantity: Number,
  subtotal: Number
});

const OrderSchema = new mongoose.Schema({
  customerId: String,
  customerName: String,
  customerEmail: String,
  total: Number,
  status: { type: String, default: "pending" },
  items: [OrderItemSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", OrderSchema);
