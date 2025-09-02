const express = require("express");
const router = express.Router();
const db = require("../../Config/db");
const multer = require("multer");
const path = require("path");

// Multer storage configuration for image uploads
const storage = multer.diskStorage({
  destination: "./Uploads/",
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Get employee details by ID
router.get("/employee/:id", async (req, res) => {
  const employeeId = req.params.id;
  const query = "SELECT * FROM employees WHERE id = ?";

  try {
    const [results] = await db.query(query, [employeeId]);

    if (results.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(results[0]);
  } catch (err) {
    console.error("Error fetching employee:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update employee details including image
router.put("/employee/update/:id", upload.single("image"), async (req, res) => {
  const employeeId = req.params.id;
  console.log("Received Body:", req.body);
  const { name, email, mobile, dob, qualification, address } = req.body;
  const image = req.file ? `/Uploads/${req.file.filename}` : null;
  console.log("Received File:", req.file);

  let query = "UPDATE employees SET name = ?, email = ?, mobile = ?, dob = ?, qualification = ?, address = ?";
  let values = [name, email, mobile, dob, qualification, address];

  if (image) {
    query += ", image = ?";
    values.push(image);
  }

  query += " WHERE id = ?";
  values.push(employeeId);

  try {
    await db.query(query, values);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Error updating employee:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update employee details and handle role changes
router.put("/updateemployee/:id", async (req, res) => {
  const employeeId = req.params.id;
  console.log("Received Body:", req.body);
  const { name, email, mobile, password, role, managerId, assign_manager } = req.body;

  const query = `
    UPDATE employees 
    SET name = ?, email = ?, mobile = ?, password = ?, role = ?, managerId = ?, assign_manager = ? 
    WHERE id = ?`;
  const values = [name, email, mobile, password, role, managerId, assign_manager, employeeId];

  try {
    await db.query(query, values);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Error updating employee:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


module.exports = router;