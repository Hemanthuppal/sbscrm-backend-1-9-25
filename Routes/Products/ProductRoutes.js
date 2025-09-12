const express = require('express');
const router = express.Router();
const db = require('./../../Config/db'); // shared db connection

// -------------------- ADD MAIN CATEGORY --------------------
router.post('/main-categories', async (req, res) => {
  const { maincategory_name } = req.body;

  if (!maincategory_name) {
    return res.status(400).json({ error: 'maincategory_name is required' });
  }

  try {
    const [existing] = await db.query(
      'SELECT maincategory_id FROM main_category WHERE maincategory_name = ?',
      [maincategory_name]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Main category already exists' });
    }

    const [result] = await db.query(
      'INSERT INTO main_category (maincategory_name) VALUES (?)',
      [maincategory_name]
    );

    res.json({ message: 'Main category added', maincategory_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error adding main category' });
  }
});

// -------------------- ADD SUBCATEGORY --------------------
router.post('/sub-categories', async (req, res) => {
  const { subcategory_name, maincategory_id } = req.body;

  if (!subcategory_name || !maincategory_id) {
    return res.status(400).json({ error: 'subcategory_name and maincategory_id are required' });
  }

  try {
    const [existing] = await db.query(
      'SELECT subcategory_id FROM sub_category WHERE subcategory_name = ? AND maincategory_id = ?',
      [subcategory_name, maincategory_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Subcategory already exists under this main category' });
    }

    const [result] = await db.query(
      'INSERT INTO sub_category (subcategory_name, maincategory_id) VALUES (?, ?)',
      [subcategory_name, maincategory_id]
    );

    res.json({ message: 'Subcategory added', subcategory_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error adding subcategory' });
  }
});

// -------------------- ADD PRODUCT --------------------
router.post('/products', async (req, res) => {
  const {
    maincategory_id,
    subcategory_id,
    product_name,
    batch = null,
    description = '',
    size = '',
    hsncode = '',
    gstrate = 0,
    listprice,
    moq
  } = req.body;

  if (!maincategory_id || !subcategory_id || !product_name || !listprice || !moq) {
    return res.status(400).json({
      error: 'maincategory_id, subcategory_id, product_name, listprice, and moq are required'
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existingProducts] = await connection.query(
      'SELECT product_id FROM product_name WHERE product_name = ? AND subcategory_id = ?',
      [product_name, subcategory_id]
    );

    let product_id;
    if (existingProducts.length === 0) {
      const [productResult] = await connection.query(
        'INSERT INTO product_name (product_name, subcategory_id) VALUES (?, ?)',
        [product_name, subcategory_id]
      );
      product_id = productResult.insertId;
    } else {
      product_id = existingProducts[0].product_id;
    }

    if (batch === null) {
      const [existingNullBatch] = await connection.query(
        'SELECT detail_id FROM product_details WHERE product_id = ? AND batch IS NULL',
        [product_id]
      );
      if (existingNullBatch.length > 0) {
        throw new Error('A record with NULL batch already exists for this product');
      }
    }

    await connection.query(
      `INSERT INTO product_details (
        maincategory_id, subcategory_id, product_id, batch, description, size, 
        hsncode, gstrate, listprice, moq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        maincategory_id,
        subcategory_id,
        product_id,
        batch,
        description,
        size,
        hsncode,
        gstrate,
        listprice,
        moq
      ]
    );

    await connection.commit();
    res.json({ message: 'Product added successfully', product_id });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(400).json({ error: err.message || 'Error adding product' });
  } finally {
    if (connection) connection.release();
  }
});

// -------------------- GET MAIN CATEGORIES --------------------
router.get('/main-categories', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM main_category');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching main categories' });
  }
});

// -------------------- GET SUBCATEGORIES BY MAIN --------------------
router.get('/sub-categories', async (req, res) => {
  const { maincategory_id } = req.query;

  if (!maincategory_id) {
    return res.status(400).json({ error: 'maincategory_id is required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM sub_category WHERE maincategory_id = ?',
      [maincategory_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching subcategories' });
  }
});

// -------------------- GET PRODUCTS --------------------
router.get('/products', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT pd.detail_id, pd.batch, pd.description, pd.size, pd.hsncode, pd.gstrate, pd.listprice, pd.moq,
             mn.product_name, sc.subcategory_name, mc.maincategory_name
      FROM product_details pd
      JOIN product_name mn ON pd.product_id = mn.product_id
      JOIN sub_category sc ON pd.subcategory_id = sc.subcategory_id
      JOIN main_category mc ON pd.maincategory_id = mc.maincategory_id
      ORDER BY pd.detail_id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching products' });
  }
});

// -------------------- GET SIZES --------------------
router.get('/sizes', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM sizes'); // Assuming you have a sizes table
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching sizes' });
  }
});

// -------------------- INSERT PRODUCT DETAILS --------------------
router.post('/product-details', async (req, res) => {
  const {
    maincategory_id,
    subcategory_id,
    product_name,
    batch = null,
    description = '',
    size = '',
    hsncode = '',
    gstrate = 0,
    listprice,
    moq
  } = req.body;

  let connection;

  try {
    // Validate required fields
    if (!maincategory_id || !subcategory_id || !product_name || !listprice || !moq) {
      throw new Error(
        'Missing required fields: maincategory_id, subcategory_id, product_name, listprice, moq'
      );
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // -------------------- CHECK IF PRODUCT EXISTS --------------------
    const [existingProducts] = await connection.query(
      'SELECT product_id FROM product_name WHERE product_name = ? AND subcategory_id = ?',
      [product_name, subcategory_id]
    );

    let product_id;
    if (existingProducts.length === 0) {
      // Insert new product
      const [productResult] = await connection.query(
        'INSERT INTO product_name (product_name, subcategory_id) VALUES (?, ?)',
        [product_name, subcategory_id]
      );
      product_id = productResult.insertId;
    } else {
      product_id = existingProducts[0].product_id;
    }

    // -------------------- PREVENT DUPLICATE NULL BATCH --------------------
    if (batch === null) {
      const [existingNullBatch] = await connection.query(
        'SELECT detail_id FROM product_details WHERE product_id = ? AND batch IS NULL',
        [product_id]
      );

      if (existingNullBatch.length > 0) {
        throw new Error('A record with NULL batch already exists for this product');
      }
    }

    // -------------------- INSERT PRODUCT DETAILS --------------------
    await connection.query(
      `INSERT INTO product_details (
          maincategory_id, subcategory_id, product_id, batch, description, size, 
          hsncode, gstrate, listprice, moq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        maincategory_id,
        subcategory_id,
        product_id,
        batch,
        description,
        size,
        hsncode,
        gstrate,
        listprice,
        moq
      ]
    );

    await connection.commit();
    res.json({ message: 'Product added successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(400).json({ error: err.message || 'Error adding product' });
  } finally {
    if (connection) connection.release();
  }
});
router.get("/all-details", async (req, res) => {
  try {
    const query = `
      SELECT 
          mc.maincategory_id,
          mc.maincategory_name,
          sc.subcategory_id,
          sc.subcategory_name,
          p.product_id,
          p.product_name,
          pd.detail_id,
          pd.batch,
          pd.description,
          pd.size,
          pd.hsncode,
          pd.gstrate,
          pd.listprice,
          pd.moq,
          pd.created_at
      FROM product_details pd
      LEFT JOIN main_category mc ON pd.maincategory_id = mc.maincategory_id
      LEFT JOIN sub_category sc ON pd.subcategory_id = sc.subcategory_id
      LEFT JOIN product_name p ON pd.product_id = p.product_id
      ORDER BY pd.detail_id DESC
    `;

    const [results] = await db.query(query); // ✅ no callback here
    res.json(results);

  } catch (err) {
    console.error("Error executing query:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});




// Get email-products by lead_id
router.get("/email-products/:leadId", async (req, res) => {
  const { leadId } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT * FROM emailproducts WHERE lead_id = ? ORDER BY id DESC",
      [leadId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching email products:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

// Get email-products by lead_id
router.get("/all-email-products/:leadId", async (req, res) => {
  const { leadId } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT * FROM matched_products WHERE lead_id = ? ORDER BY id DESC",
      [leadId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching email products:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});



// Update quantity API
router.post("/update-quantity", async (req, res) => {
  try {
    const { product_id, quantity } = req.body;

    if (!product_id || !quantity) {
      return res.status(400).json({ message: "product_id and quantity are required" });
    }

    // Update the matched_products table
    const query = "UPDATE matched_products SET quantity = ? WHERE id = ?";
    db.query(query, [quantity, product_id], (err, result) => {
      if (err) {
        console.error("Error updating quantity:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({ message: "Quantity updated successfully" });
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});





module.exports = router;
