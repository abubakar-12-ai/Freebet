const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const SECRET = "supersecretkey"; // In production, store this in an environment variable.

// In-memory “database” for demonstration. (Replace with MongoDB or another DB later.)
const users = [
  // Pre-seed an admin account:
  {
    email: "admin@freebet.ng",
    phone: "0000",
    password: "admin123",
    wallet: 0,
    blocked: false,
    isAdmin: true,
  },
];

// Helper: generate JWT
function generateToken(user) {
  return jwt.sign(
    { email: user.email, isAdmin: user.isAdmin || false },
    SECRET,
    { expiresIn: "12h" }
  );
}

// Middleware: authenticate normal users
function authUser(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.isAdmin) {
      // Admin tokens are not valid for user-only endpoints
      return res.status(403).json({ error: "Forbidden" });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Middleware: authenticate admins
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: "Forbidden" });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/** ROUTES **/

// 1) SIGNUP
// POST /api/signup
// Body: { email, phone, password }
app.post("/api/signup", (req, res) => {
  const { email, phone, password } = req.body;
  if (!email || !phone || !password)
    return res.status(400).json({ error: "All fields are required" });

  if (users.find((u) => u.email === email))
    return res.status(400).json({ error: "Email already registered" });

  users.push({ email, phone, password, wallet: 0, blocked: false, isAdmin: false });
  return res.json({ message: "Signup successful. You can now log in." });
});

// 2) LOGIN (for both users and admin)
// POST /api/login
// Body: { email, password }
// Response: { token, email, wallet?, isAdmin }
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.blocked) return res.status(403).json({ error: "Account blocked" });

  const token = generateToken(user);
  return res.json({
    token,
    email: user.email,
    wallet: user.wallet,
    isAdmin: user.isAdmin,
  });
});

// 3) GET CURRENT USER DATA
// GET /api/user
// Headers: Authorization: Bearer <token>
app.get("/api/user", authUser, (req, res) => {
  const user = users.find((u) => u.email === req.user.email);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ email: user.email, phone: user.phone, wallet: user.wallet });
});

// 4) DEPOSIT
// POST /api/deposit
// Headers: Authorization: Bearer <token>
// Body: { amount }
// Response: { wallet, message }
app.post("/api/deposit", authUser, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 5100)
    return res.status(400).json({ error: "Minimum deposit is ₦5,100" });

  const user = users.find((u) => u.email === req.user.email);
  user.wallet += amount;
  return res.json({ wallet: user.wallet, message: "Deposit successful" });
});

// 5) PLAY GAME
// POST /api/play
// Headers: Authorization: Bearer <token>
// Body: { }
// - Deduct ₦500 each play.
// - First bet = guaranteed win. Thereafter 30% chance.
// Response: { wallet, win, amountWon }
app.post("/api/play", authUser, (req, res) => {
  const user = users.find((u) => u.email === req.user.email);
  if (user.wallet < 500) return res.status(400).json({ error: "Insufficient funds" });

  user.wallet -= 500;
  if (user.firstBet === undefined) user.firstBet = true;

  let win = false;
  let amountWon = 0;

  if (user.firstBet) {
    win = true;
    amountWon = Math.floor(Math.random() * 100000 + 50000);
    user.firstBet = false;
  } else {
    if (Math.random() < 0.3) {
      win = true;
      amountWon = Math.floor(Math.random() * 100000 + 50000);
    }
  }

  user.wallet += amountWon;
  return res.json({ wallet: user.wallet, win, amountWon });
});

// 6) ADMIN: LIST USERS
// GET /api/admin/users
// Headers: Authorization: Bearer <token>
app.get("/api/admin/users", authAdmin, (req, res) => {
  const userList = users.map((u) => ({
    email: u.email,
    phone: u.phone,
    wallet: u.wallet,
    blocked: u.blocked,
  }));
  return res.json(userList);
});

// 7) ADMIN: BLOCK A USER
// POST /api/admin/block
// Headers: Authorization: Bearer <token>
// Body: { email }
app.post("/api/admin/block", authAdmin, (req, res) => {
  const { email } = req.body;
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.blocked = true;
  return res.json({ message: `User ${email} has been blocked` });
});

// 8) ADMIN: UNBLOCK A USER
// POST /api/admin/unblock
// Headers: Authorization: Bearer <token>
// Body: { email }
app.post("/api/admin/unblock", authAdmin, (req, res) => {
  const { email } = req.body;
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.blocked = false;
  return res.json({ message: `User ${email} has been unblocked` });
});

// 9) SERVE FRONTEND PAGES
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
