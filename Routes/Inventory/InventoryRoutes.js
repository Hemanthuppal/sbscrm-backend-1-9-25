const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require('./../../Config/db');
require('dotenv').config();

const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const fetch = require("node-fetch");
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



async function extractTextFromFile(filePath, mimeType) {
  if (mimeType.includes("pdf")) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (mimeType.includes("word") || mimeType.includes("docx")) {
    const data = await mammoth.extractRawText({ path: filePath });
    return data.value;
  } else if (mimeType.includes("image") || mimeType.includes("jpg") || mimeType.includes("png")) {
    const { data: { text } } = await Tesseract.recognize(filePath, "eng");
    return text;
  } else {
    return fs.readFileSync(filePath, "utf8"); // fallback for txt
  }
}

// Send raw text to OpenRouter for structured JSON
// async function parseSpecsWithAI(rawText) {
//   try {
//     const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
//       method: "POST",
//       headers: {
//         "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify({
//         model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
//         messages: [
//           {
//             role: "system",
//             content: `
// You are an AI that extracts product technical specifications from messy raw text.
// Rules:
// - Always output ONLY valid flat JSON (no markdown, no text before/after JSON).
// - Use clear and human-friendly labels (e.g., "Product", "Handle", "Grip", "Applications 1").
// - Do not nest objects or arrays. Flatten everything into { "Label": "Value" } pairs.
// - If multiple items belong to the same category, suffix with a number (e.g., "Application 1", "Application 2").
// - Ensure the JSON is clean, structured, and machine-readable.`
//           },
//           {
//             role: "user",
//             content: `Convert the following raw product description into structured flat JSON with label:value pairs:\n\n${rawText}`
//           }
//         ],
//         temperature: 0.1
//       })
//     });

//     const data = await response.json();
//     let structured = data.choices[0].message.content.trim();

//     // Ensure valid JSON
//     if (!structured.startsWith("{")) {
//       structured = structured.substring(structured.indexOf("{"));
//     }
//     return JSON.parse(structured);
//   } catch (err) {
//     console.error("AI parsing failed:", err.message);
//     return { raw_text: rawText }; // fallback
//   }
// }
async function parseSpecsWithAI(rawText) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
           content: `
You are an AI that extracts product technical specifications from messy raw text.

⚠️ IMPORTANT RULES:
- Output ONLY valid flat JSON. Do not include markdown, explanations, or extra text.
- Use { "Label": "Value" } format only.
- Use clear and human-friendly labels (e.g., "Product", "Handle", "Grip", "Applications").
- Do NOT nest objects or arrays.
- If multiple values belong to the same category (e.g., Applications, Utilities), combine them into a single comma-separated string instead of numbering them.
- Ensure the JSON is syntactically valid and machine-readable.
`  },
          {
            role: "user",
            content: `Convert the following raw product description into structured flat JSON with label:value pairs:\n\n${rawText}`
          }
        ],
        temperature: 0.1
      })
    });

    const data = await response.json();
    let structured = data.choices[0].message.content.trim();

    // Ensure valid JSON
    if (!structured.startsWith("{")) {
      structured = structured.substring(structured.indexOf("{"));
    }
    return JSON.parse(structured);
  } catch (err) {
    console.error("AI parsing failed:", err.message);
    return { raw_text: rawText }; // fallback
  }
}



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
        description: req.body[`product_${i}_description`],
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
        description,
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
        (maincategory_id, subcategory_id, product_id, size, hsncode, gstrate, description, listprice, moq, batch, Quantity, product_image, tech_specs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          main_category,
          sub_category,
          selected_product,
          size,
          hsncode,
          gstrate,
          description,
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



// 📌 Add Product with files
// router.post("/products-main", upload.any(), async (req, res) => {
//   try {
//     const productCount =
//       Object.keys(req.body)
//         .filter((key) => key.startsWith("product_"))
//         .map((key) => parseInt(key.split("_")[1]))
//         .reduce((max, idx) => Math.max(max, idx), -1) + 1;

//     const products = [];

//     // Build product objects
//     for (let i = 0; i < productCount; i++) {
//       const product = {
//         main_category: req.body[`product_${i}_main_category`],
//         sub_category: req.body[`product_${i}_sub_category`],
//         selected_product: req.body[`product_${i}_selected_product`],
//         size: req.body[`product_${i}_size`],
//         listprice: req.body[`product_${i}_listprice`],
//         moq: req.body[`product_${i}_moq`],
//         hsncode: req.body[`product_${i}_hsncode`],
//         Quantity: req.body[`product_${i}_Quantity`],
//         gstrate: req.body[`product_${i}_gstrate`],
//         description: req.body[`product_${i}_description`],
//         batch: req.body[`product_${i}_batch`],
//         productImage: null,
//         techSpecs: null,
//         techSpecsFileMeta: null
//       };

//       if (req.files && req.files.length > 0) {
//         const productImageFile = req.files.find(
//           (f) => f.fieldname === `product_${i}_productImage`
//         );
//         const techSpecsFile = req.files.find(
//           (f) => f.fieldname === `product_${i}_techSpecs`
//         );

//         if (productImageFile) product.productImage = productImageFile.filename;
//         if (techSpecsFile) {
//           product.techSpecs = techSpecsFile.filename;
//           product.techSpecsFileMeta = techSpecsFile; // keep metadata
//         }
//       }

//       products.push(product);
//     }

//     if (products.length === 0) {
//       return res.status(400).json({ error: "No products provided" });
//     }

//     // Insert into DB
//     for (const product of products) {
//       const {
//         main_category,
//         sub_category,
//         selected_product,
//         size,
//         hsncode,
//         gstrate,
//         description,
//         listprice,
//         moq,
//         batch,
//         Quantity,
//         productImage,
//         techSpecs,
//         techSpecsFileMeta
//       } = product;

//       if (
//         !selected_product ||
//         !main_category ||
//         !sub_category ||
//         !size ||
//         !hsncode ||
//         !listprice ||
//         !moq ||
//         !batch
//       ) {
//         return res.status(400).json({ error: "All required fields must be filled" });
//       }

//       const [productResult] = await db.query(
//         "SELECT * FROM product_name WHERE product_id = ?",
//         [selected_product]
//       );
//       if (productResult.length === 0) {
//         return res.status(404).json({ error: "Product not found" });
//       }

//       // Insert into product_details
//       const [insertResult] = await db.query(
//         `
//         INSERT INTO product_details 
//         (maincategory_id, subcategory_id, product_id, size, hsncode, gstrate, description, listprice, moq, batch, Quantity, product_image, tech_specs)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `,
//         [
//           main_category,
//           sub_category,
//           selected_product,
//           size,
//           hsncode,
//           gstrate,
//           description,
//           listprice,
//           moq,
//           batch,
//           Quantity,
//           productImage,
//           techSpecs,
//         ]
//       );

//       const productDetailId = insertResult.insertId;

//       // If techSpecs file exists → extract & store structured JSON
//       if (techSpecsFileMeta) {
//         const filePath = path.join("uploads/products", techSpecsFileMeta.filename);
//         const rawText = await extractTextFromFile(filePath, techSpecsFileMeta.mimetype);
//         const structuredJson = await parseSpecsWithAI(rawText);

//         await db.query(
//           "INSERT INTO product_specifications (product_detail_id, specification) VALUES (?, ?)",
//           [productDetailId, JSON.stringify(structuredJson)]
//         );
//       }
//     }

//     res.status(201).json({ message: "Products added successfully" });
//   } catch (err) {
//     console.error("Error adding products:", err.message);
//     res.status(500).json({ error: "Failed to add products" });
//   }
// });



// Get single product by ID
router.get("/product/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query(
      "SELECT * FROM product_details WHERE detail_id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching product:", err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});



// UPDATE product
router.put("/product/:id", upload.any(), async (req, res) => {
  const id = req.params.id;

  try {
    // Fetch existing product
    const [existingRows] = await db.query(
      "SELECT * FROM product_details WHERE detail_id = ?",
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existing = existingRows[0];

    const {
      detail_id,
      maincategory_id,
      subcategory_id,
          product_id,
      batch,
      description,
      size,
      hsncode,
      gstrate,
      listprice,
      moq,
      Quantity,
      existing_product_image,
      existing_tech_specs
    } = req.body;

    // --- Handle uploaded files ---
    let productImageFilename = existing.product_image; // default to current DB value
    let techSpecsFilename = existing.tech_specs;       // default to current DB value

    if (req.files && req.files.length > 0) {
      const productImageFile = req.files.find(f => f.fieldname === "product_image");
      const techSpecsFile = req.files.find(f => f.fieldname === "tech_specs");

      if (productImageFile) {
        // Remove old file if exists
        if (existing.product_image) {
          const oldPath = path.join(__dirname, '../../Uploads/products', existing.product_image);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        productImageFilename = productImageFile.filename;
      } else if (existing_product_image) {
        // User did not upload a new file, keep old
        productImageFilename = existing_product_image;
      }

      if (techSpecsFile) {
        if (existing.tech_specs) {
          const oldPath = path.join(__dirname, '../../Uploads/products', existing.tech_specs);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        techSpecsFilename = techSpecsFile.filename;
      } else if (existing_tech_specs) {
        techSpecsFilename = existing_tech_specs;
      }
    }

    // --- UPDATE query ---
    await db.query(
      `UPDATE product_details SET
      detail_id = ?,
        maincategory_id = ?,
        subcategory_id = ?,
 product_id = ?,
        batch = ?,
       
        description = ?,
        size = ?,
        hsncode = ?,
        gstrate = ?,
        listprice = ?,
        moq = ?,
        Quantity = ?,
        product_image = ?,
        tech_specs = ?
      WHERE detail_id= ?`,
      [
        detail_id,
        maincategory_id,
        subcategory_id,
        product_id,
        batch,
        description,
        size,
        hsncode,
        gstrate,
        listprice,
        moq,
        Quantity,
        productImageFilename,
        techSpecsFilename,
        id
      ]
    );

    res.json({
      message: "Product updated successfully",
      product_image: productImageFilename,
      tech_specs: techSpecsFilename
    });

  } catch (err) {
    console.error("Error updating product:", err.message);
    res.status(500).json({ error: `Failed to update product: ${err.message}` });
  }
});



// DELETE product
router.delete("/product/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const [existingRows] = await db.query(
      "SELECT * FROM product_details WHERE detail_id = ?",
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    const existing = existingRows[0];

    await db.query("DELETE FROM product_details WHERE detail_id = ?", [id]);

    if (existing.product_image) {
      const filePath = path.join("Uploads/products", existing.product_image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    if (existing.tech_specs) {
      const filePath = path.join("Uploads/products", existing.tech_specs);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err.message);
    res.status(500).json({ error: `Failed to delete product: ${err.message}` });
  }
});

module.exports = router;
