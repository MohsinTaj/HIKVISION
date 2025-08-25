// sql + custom model
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const request = require('request');

const app = express();
app.use(cors());
app.use(express.json());

// Camera credentials
const CAMERA_IP = process.env.CAMERA_IP || "192.168.137.167";
const CAMERA_USER = process.env.CAMERA_USER || "admin";
const CAMERA_PASS = process.env.CAMERA_PASS || "Mohsinmusab321@";

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


// ==================== camera sample route to get snapshot ====================
app.get('/snapshot', (req, res) => {
  const snapshotUrl = `http://${CAMERA_IP}/ISAPI/Streaming/channels/101/picture`;

  request
    .get(snapshotUrl)
    .auth(CAMERA_USER, CAMERA_PASS, false)
    .on('response', function (response) {
      // Set headers when response starts
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'image/jpeg');
    })
    .on('error', () => res.sendStatus(500))
    .pipe(res);
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
  const { name, institute, role, designation } = req.body;
  const files = req.files;

  if (!name || !files || files.length === 0) {
    return res.status(400).json({ success: false, message: "Name and images are required" });
  }

  const fileNames = files.map(file => file.filename).join(",");

  let sql, values;

  if (institute === "school") {
    if (!role) {
      return res.status(400).json({ success: false, message: "Role is required for school" });
    }
    sql = "INSERT INTO people (name, institute, role, images) VALUES (?, ?, ?, ?)";
    values = [name, "school", role, fileNames];
  } else if (institute === "corporate") {
    if (!designation) {
      return res.status(400).json({ success: false, message: "Designation is required for corporate" });
    }
    sql = "INSERT INTO people (name, institute, designation, images) VALUES (?, ?, ?, ?)";
    values = [name, "corporate", designation, fileNames];
  } else {
    return res.status(400).json({ success: false, message: "Invalid institute type" });
  }

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("DB Insert Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: "Person added successfully", id: result.insertId });
  });
});


app.get("/list-persons", (req, res) => {
  const { mode } = req.query;  // "school" or "corporate"
  const sql = "SELECT * FROM people WHERE institute = ?";
  db.query(sql, [mode], (err, results) => {
    if (err) return res.status(500).json({ message: "DB Error" });
    res.json({ persons: results });
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
