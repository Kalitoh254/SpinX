// server.js — SpinX backend (Express + MariaDB + Transactions + Forgot Password)
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise");
const bcrypt = require('bcryptjs');
const crypto = require("crypto"); // for forgot password token

const app = express();
const PORT = 3000;

// === Middleware ===
app.use(cors());
app.use(bodyParser.json());

// === Database Setup ===
const pool = mysql.createPool({
  host: "localhost",      
  user: "root",           
  password: "546042",     
  database: "spinx",      
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// === Routes ===

// Root
app.get("/", (req, res) => {
  res.send("SpinX Backend Running");
});

// === Authentication ===

// Register
app.post("/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password || !email)
      return res.status(400).json({ success: false, message: "All fields required" });

    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existing.length > 0)
      return res.status(400).json({ success: false, message: "Username or email already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, email, password, balance) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, 0.0]
    );

    res.json({
      success: true,
      user: { id: result.insertId, username, email, balance: 0.0 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "Username and password required" });

    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0)
      return res.status(400).json({ success: false, message: "User not found" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: "Wrong password" });

    res.json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email, balance: user.balance },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// Forgot password - generate token
app.post("/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) return res.status(400).json({ success: false, message: "Email not found" });

    const token = crypto.randomBytes(20).toString("hex");
    const expires = new Date(Date.now() + 3600000); // 1 hour expiration

    await pool.query(
      "UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?",
      [token, expires, email]
    );

    // TODO: Send token via email (use nodemailer or any mail service)
    console.log(`Password reset token for ${email}: ${token}`);

    res.json({ success: true, message: "Reset token generated. Check server log for demo purposes." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Forgot password failed" });
  }
});

// Reset password using token
app.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ success: false, message: "Token and new password required" });

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()",
      [token]
    );
    if (rows.length === 0) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?",
      [hashedPassword, rows[0].id]
    );

    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Reset password failed" });
  }
});

// === Wallet & Transactions ===

// Deposit / Withdraw
app.post("/api/transaction", async (req, res) => {
  try {
    const { username, type, amount } = req.body;
    if (!username || !type || !amount)
      return res.status(400).json({ success: false, message: "All fields required" });

    const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (users.length === 0) return res.status(400).json({ success: false, message: "User not found" });

    const user = users[0];
    let newBalance = parseFloat(user.balance);

    if (type === "deposit") {
      newBalance += parseFloat(amount);
    } else if (type === "withdraw") {
      if (parseFloat(amount) > newBalance)
        return res.status(400).json({ success: false, message: "Insufficient balance" });
      newBalance -= parseFloat(amount);
    } else {
      return res.status(400).json({ success: false, message: "Invalid transaction type" });
    }

    await pool.query("UPDATE users SET balance = ? WHERE username = ?", [newBalance, username]);
    await pool.query(
      "INSERT INTO transactions (username, type, amount, timestamp) VALUES (?, ?, ?, NOW())",
      [username, type, amount]
    );

    res.json({ success: true, balance: newBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Transaction failed" });
  }
});

// Transaction history
app.get("/api/transactions/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const [records] = await pool.query(
      "SELECT id, type, amount, timestamp FROM transactions WHERE username = ? ORDER BY timestamp DESC",
      [username]
    );
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Fetch transactions failed" });
  }
});

// Fetch user info
app.get("/api/users/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const [rows] = await pool.query(
      "SELECT id, username, email, balance FROM users WHERE username = ?",
      [username]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Fetch user failed" });
  }
});

// === Start server ===
app.listen(PORT, () => {
  console.log(`🚀 SpinX backend running at http://localhost:${PORT}`);
});