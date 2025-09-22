require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

// Create the MySQL connection pool
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'sbs_crm_new'
});

// Get Main Categories
app.get('/api/main-categories', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM main_category');
    res.json(results);
  } catch (err) {
    console.error('Error fetching main categories:', err.message);
    res.status(500).json({ error: 'Failed to fetch main categories', details: err.message });
  }
});

// Get Sub Categories by Main Category ID
app.get('/api/sub-categories/:mainCategoryId', async (req, res) => {
  const mainCategoryId = req.params.mainCategoryId;
  try {
    const [results] = await db.query('SELECT * FROM sub_category WHERE maincategory_id = ?', [mainCategoryId]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching subcategories:', err.message);
    res.status(500).json({ error: 'Failed to fetch subcategories', details: err.message });
  }
});

// Get Products by Subcategory ID
app.get('/api/products/:subCategoryId', async (req, res) => {
  const subCategoryId = req.params.subCategoryId;
  try {
    const [results] = await db.query('SELECT * FROM product_name WHERE subcategory_id = ?', [subCategoryId]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ error: 'Failed to fetch products', details: err.message });
  }
});

// POST Main Category
app.post('/api/main-categories', async (req, res) => {
  const { maincategory_name } = req.body;
  try {
    const [result] = await db.query('INSERT INTO main_category (maincategory_name) VALUES (?)', [maincategory_name]);
    res.status(201).json({ message: 'Main Category added successfully', maincategory_id: result.insertId });
  } catch (err) {
    console.error('Error adding main category:', err.message);
    res.status(500).json({ error: 'Failed to add main category', details: err.message });
  }
});
// POST Product Name
app.post('/api/product-name', async (req, res) => {
  const { product_name, subcategory_id } = req.body;

  // Validate input
  if (!product_name || !subcategory_id) {
    return res.status(400).json({ error: 'Product name and subcategory ID are required' });
  }

  try {
    // Check if the subcategory exists
    const [subCategoryResult] = await db.query('SELECT * FROM sub_category WHERE subcategory_id = ?', [subcategory_id]);
    if (subCategoryResult.length === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    // Insert the new product name
    const [result] = await db.query(
      'INSERT INTO product_name (product_name, subcategory_id) VALUES (?, ?)',
      [product_name, subcategory_id]
    );

    res.status(201).json({
      message: 'Product name added successfully',
      product_id: result.insertId,
      product_name,
      subcategory_id
    });
  } catch (err) {
    console.error('Error adding product name:', err.message);
    res.status(500).json({ error: 'Failed to add product name', details: err.message });
  }
});

// POST Sub Category
app.post('/api/sub-categories', async (req, res) => {
  const { subcategory_name, maincategory_id } = req.body;
  try {
    const [result] = await db.query('INSERT INTO sub_category (subcategory_name, maincategory_id) VALUES (?, ?)', [subcategory_name, maincategory_id]);
    res.status(201).json({ message: 'Sub Category added successfully', subcategory_id: result.insertId });
  } catch (err) {
    console.error('Error adding subcategory:', err.message);
    res.status(500).json({ error: 'Failed to add subcategory', details: err.message });
  }
});

// POST Product
// POST Product
// app.post('/api/products', async (req, res) => {
//   const { product_id, maincategory_id, subcategory_id, size, hsncode, listprice, moq, batch } = req.body;
//   console.log('Received product data:', req.body);

//   // Validate required fields
//   if (!product_id || !maincategory_id || !subcategory_id || !size || !hsncode || !listprice || !moq || !batch) {
//     return res.status(400).json({ error: 'All fields are required' });
//   }

//   try {
//     // Verify product exists
//     const [productResult] = await db.query('SELECT * FROM product_name WHERE product_id = ?', [product_id]);
//     if (productResult.length === 0) {
//       return res.status(404).json({ error: 'Product not found' });
//     }

//     // Verify subcategory exists
//     const [subCategoryResult] = await db.query('SELECT * FROM sub_category WHERE subcategory_id = ?', [subcategory_id]);
//     if (subCategoryResult.length === 0) {
//       return res.status(404).json({ error: 'Subcategory not found' });
//     }

//     // Verify maincategory exists
//     const [mainCategoryResult] = await db.query('SELECT * FROM main_category WHERE maincategory_id = ?', [maincategory_id]);
//     if (mainCategoryResult.length === 0) {
//       return res.status(404).json({ error: 'Main category not found' });
//     }

//     // Insert product details
//     const [insertResult] = await db.query(`
//       INSERT INTO product_details (maincategory_id, subcategory_id, product_id, size, hsncode, gstrate, listprice, moq, batch)
//       VALUES (?, ?, ?, ?, ?, 18.00, ?, ?, ?)
//     `, [maincategory_id, subcategory_id, product_id, size, hsncode, listprice, moq, batch]);

//     res.status(201).json({ message: 'Product details added successfully', detail_id: insertResult.insertId });
//   } catch (err) {
//     console.error('Error adding product:', err.message);
//     res.status(500).json({ error: 'Failed to add product', details: err.message });
//   }
// });

app.post('/api/products', async (req, res) => {
  const productDetailsArray = req.body;
  console.log('Received product data array:', productDetailsArray);

  // Validate if productDetailsArray is an array
  if (!Array.isArray(productDetailsArray) || productDetailsArray.length === 0) {
    return res.status(400).json({ error: 'No products provided' });
  }

  try {
    for (const productDetails of productDetailsArray) {
      const {
        main_category, sub_category, selected_product, size, hsncode, gstrate, listprice, moq, batch, Quantity,
        Model_No, Pit_No, Pit_Size, Rated_capacity, Length, Width, Structure,
        Conveyor_Made_of, Type, Speed, Gear_Motor, VFD, Electric_Panel,
        Safety_Sensors, Human_Sensor, Buzzer, Operation, Emergency, Wiring,
        Over_Load_Protection, Panel, Bearings
      } = productDetails;

      // ✅ Required field validation (core fields only)
      if (!selected_product || !main_category || !sub_category || !size || !hsncode || !listprice || !moq || !batch) {
        return res.status(400).json({ error: 'All mandatory fields are required for each product' });
      }

      // ✅ Check if product exists
      const [productResult] = await db.query(
        'SELECT * FROM product_name WHERE product_id = ?',
        [selected_product]
      );
      if (productResult.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // ✅ Insert into product_details with all new columns
      await db.query(
        `
        INSERT INTO product_details (
          maincategory_id, subcategory_id, product_id, size, hsncode, gstrate, listprice, moq, batch, Quantity,
          Model_No, Pit_No, Pit_Size, Rated_capacity, Length, Width, Structure,
          Conveyor_Made_of, Type, Speed, Gear_Motor, VFD, Electric_Panel,
          Safety_Sensors, Human_Sensor, Buzzer, Operation, Emergency, Wiring,
          Over_Load_Protection, Panel, Bearings
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,
                ?,?,?,?,?,?,?,?,
                ?,?,?,?,?,?,?,?,
                ?,?,?,?,?,?)
        `,
        [
          main_category, sub_category, selected_product, size, hsncode, gstrate, listprice, moq, batch, Quantity,
          Model_No, Pit_No, Pit_Size, Rated_capacity, Length, Width, Structure,
          Conveyor_Made_of, Type, Speed, Gear_Motor, VFD, Electric_Panel,
          Safety_Sensors, Human_Sensor, Buzzer, Operation, Emergency, Wiring,
          Over_Load_Protection, Panel, Bearings
        ]
      );
    }

    res.status(201).json({ message: 'Products added successfully' });
  } catch (err) {
    console.error('Error adding products:', err.message);
    res.status(500).json({ error: 'Failed to add products', details: err.message });
  }
});

app.post("/api/specifications", (req, res) => {
  const data = req.body; // frontend sends JSON with fields
  const sql = "INSERT INTO specifications SET ?";
  db.query(sql, data, (err, result) => {
    if (err) return res.status(500).send(err);
    res.send({ id: result.insertId, ...data });
  });
});


app.get('/api/batches/:productName', async (req, res) => {
  const productName = req.params.productName;
  try {
    const [results] = await db.query('SELECT * FROM product_details WHERE product_id = ?', [productName]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ error: 'Failed to fetch products', details: err.message });
  }
});


// Start the server
const PORT =  4000;
app.listen(PORT, () => {
  console.log(`API running on :${PORT}`);
});
