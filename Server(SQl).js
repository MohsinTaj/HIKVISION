// sql + custom model
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "your_db_name",
});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection error:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL");
});

// ==================== REGISTER API ====================
app.post("/register", (req, res) => {
  const { name, password, institute } = req.body;

  if (!name || !password || !institute) {
    return res.status(400).json({ success: false, message: "Name, password, and institute are required" });
  }

  // Check if user exists
  db.query("SELECT id FROM users WHERE name = ?", [name], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });

    if (results.length > 0) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert user
    db.query(
      "INSERT INTO users (name, password, institute) VALUES (?, ?, ?)",
      [name, hashedPassword, institute],
      (err) => {
        if (err) return res.status(500).json({ success: false, message: "Error creating user" });
        res.json({ success: true, message: "User registered successfully" });
      }
    );
  });
});

// ==================== LOGIN API ====================
app.post("/login", (req, res) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({ success: false, message: "Name and password are required" });
  }

  db.query("SELECT * FROM users WHERE name = ?", [name], (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid name or password" });
    }

    const user = results[0];

    // Compare bcrypt password
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid name or password" });
    }

    res.json({
      success: true,
      message: "Login successful",
      name: user.name,
      institute: user.institute, // return institute
    });
  });
});


// ==================== add-person API ====================
// ✅ Create uploads folder if not exists
const uploadFolder = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder);
}

// ✅ Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// ✅ Add Person API
app.post("/add-person", upload.array("images", 10), (req, res) => {
  const { name, institute } = req.body;
  const files = req.files;

  if (!name || !files || files.length === 0) {
    return res.status(400).json({ success: false, message: "Name and images are required" });
  }

  const fileNames = files.map(file => file.filename).join(",");

  const sql = "INSERT INTO people (name, institute, images) VALUES (?, ?, ?)";
  db.query(sql, [name, institute || "school", fileNames], (err, result) => {
    if (err) {
      console.error("DB Insert Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: "Person added successfully", id: result.insertId });
  });
});

app.get("/list-persons", (req, res) => {
  const sql = "SELECT id, name, institute, images FROM people";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("DB Fetch Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    // Convert images string back to array
    const persons = results.map(p => ({
      id: p.id,
      name: p.name,
      institute: p.institute,
      images: p.images ? p.images.split(",") : []
    }));

    res.json({ success: true, persons });
  });
});

app.delete("/delete-person/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM people WHERE name = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("DB Delete Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Person not found" });
    }

    res.json({ success: true, message: "Person deleted successfully" });
  });
});



// ✅ Serve uploaded images
app.use("/uploads", express.static(uploadFolder));

// ==================== SERVER START ====================
app.listen(8080, () => console.log("Server running on http://localhost:8080"));
