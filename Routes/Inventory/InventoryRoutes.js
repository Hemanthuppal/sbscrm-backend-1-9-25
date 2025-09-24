const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require('./../../Config/db');

// ================= Multer Storage =================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/products";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ================== Routes ==================

// 📌 Get Main Categories
router.get("/main", async (req, res) => {
  try {
    const [results] = await db.query("SELECT * FROM main_category");
    res.json(results);
  } catch (err) {
    console.error("Error fetching main categories:", err.message);
    res.status(500).json({ error: "Failed to fetch main categories" });
  }
});

// 📌 Get Sub Categories by Main Category ID
router.get("/sub-categories-main/:mainCategoryId", async (req, res) => {
  const mainCategoryId = req.params.mainCategoryId;
  try {
    const [results] = await db.query(
      "SELECT * FROM sub_category WHERE maincategory_id = ?",
      [mainCategoryId]
    );
    res.json(results);
  } catch (err) {
    console.error("Error fetching subcategories:", err.message);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

// 📌 Get Products by Subcategory ID
router.get("/products-main/:subCategoryId", async (req, res) => {
  const subCategoryId = req.params.subCategoryId;
  try {
    const [results] = await db.query(
      "SELECT * FROM product_name WHERE subcategory_id = ?",
      [subCategoryId]
    );
    res.json(results);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// 📌 Add Main Category
router.post("/main-categories-main", async (req, res) => {
  const { maincategory_name } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO main_category (maincategory_name) VALUES (?)",
      [maincategory_name]
    );
    res.status(201).json({
      message: "Main Category added successfully",
      maincategory_id: result.insertId,
    });
  } catch (err) {
    console.error("Error adding main category:", err.message);
    res.status(500).json({ error: "Failed to add main category" });
  }
});

// 📌 Add Sub Category
router.post("/sub-categories-main", async (req, res) => {
  const { subcategory_name, maincategory_id } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO sub_category (subcategory_name, maincategory_id) VALUES (?, ?)",
      [subcategory_name, maincategory_id]
    );
    res.status(201).json({
      message: "Sub Category added successfully",
      subcategory_id: result.insertId,
    });
  } catch (err) {
    console.error("Error adding subcategory:", err.message);
    res.status(500).json({ error: "Failed to add subcategory" });
  }
});

// 📌 Add Product Name
router.post("/product-name-main", async (req, res) => {
  const { product_name, subcategory_id } = req.body;
  if (!product_name || !subcategory_id) {
    return res
      .status(400)
      .json({ error: "Product name and subcategory ID are required" });
  }

  try {
    const [subCategoryResult] = await db.query(
      "SELECT * FROM sub_category WHERE subcategory_id = ?",
      [subcategory_id]
    );
    if (subCategoryResult.length === 0) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    const [result] = await db.query(
      "INSERT INTO product_name (product_name, subcategory_id) VALUES (?, ?)",
      [product_name, subcategory_id]
    );

    res.status(201).json({
      message: "Product name added successfully",
      product_id: result.insertId,
    });
  } catch (err) {
    console.error("Error adding product name:", err.message);
    res.status(500).json({ error: "Failed to add product name" });
  }
});

// 📌 Add Product with files
router.post("/products-main", upload.any(), async (req, res) => {
  try {
    const productCount =
      Object.keys(req.body)
        .filter((key) => key.startsWith("product_"))
        .map((key) => parseInt(key.split("_")[1]))
        .reduce((max, idx) => Math.max(max, idx), -1) + 1;

    const products = [];

    for (let i = 0; i < productCount; i++) {
      const product = {
        main_category: req.body[`product_${i}_main_category`],
        sub_category: req.body[`product_${i}_sub_category`],
        selected_product: req.body[`product_${i}_selected_product`],
        size: req.body[`product_${i}_size`],
        listprice: req.body[`product_${i}_listprice`],
        moq: req.body[`product_${i}_moq`],
        hsncode: req.body[`product_${i}_hsncode`],
        Quantity: req.body[`product_${i}_Quantity`],
        gstrate: req.body[`product_${i}_gstrate`],
        batch: req.body[`product_${i}_batch`],
        productImage: null,
        techSpecs: null,
      };

      if (req.files && req.files.length > 0) {
        const productImageFile = req.files.find(
          (f) => f.fieldname === `product_${i}_productImage`
        );
        const techSpecsFile = req.files.find(
          (f) => f.fieldname === `product_${i}_techSpecs`
        );

        if (productImageFile) product.productImage = productImageFile.filename;
        if (techSpecsFile) product.techSpecs = techSpecsFile.filename;
      }

      products.push(product);
    }

    if (products.length === 0) {
      return res.status(400).json({ error: "No products provided" });
    }

    for (const product of products) {
      const {
        main_category,
        sub_category,
        selected_product,
        size,
        hsncode,
        gstrate,
        listprice,
        moq,
        batch,
        Quantity,
        productImage,
        techSpecs,
      } = product;

      if (
        !selected_product ||
        !main_category ||
        !sub_category ||
        !size ||
        !hsncode ||
        !listprice ||
        !moq ||
        !batch
      ) {
        return res
          .status(400)
          .json({ error: "All required fields must be filled" });
      }

      const [productResult] = await db.query(
        "SELECT * FROM product_name WHERE product_id = ?",
        [selected_product]
      );
      if (productResult.length === 0) {
        return res.status(404).json({ error: "Product not found" });
      }

      await db.query(
        `
        INSERT INTO product_details 
        (maincategory_id, subcategory_id, product_id, size, hsncode, gstrate, listprice, moq, batch, Quantity, product_image, tech_specs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          main_category,
          sub_category,
          selected_product,
          size,
          hsncode,
          gstrate,
          listprice,
          moq,
          batch,
          Quantity,
          productImage,
          techSpecs,
        ]
      );
    }

    res.status(201).json({ message: "Products added successfully" });
  } catch (err) {
    console.error("Error adding products:", err.message);
    res.status(500).json({ error: "Failed to add products" });
  }
});

module.exports = router;
