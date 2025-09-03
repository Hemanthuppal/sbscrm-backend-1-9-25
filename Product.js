const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// -------------------- DATABASE CONFIG --------------------
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sbs_crm_new',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

app.post('/api/main-categories', async (req, res) => {
    const { maincategory_name } = req.body;

    if (!maincategory_name) {
        return res.status(400).json({ error: 'maincategory_name is required' });
    }

    try {
        // Check if main category already exists
        const [existing] = await pool.query(
            'SELECT maincategory_id FROM main_category WHERE maincategory_name = ?',
            [maincategory_name]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Main category already exists' });
        }

        // Insert main category
        const [result] = await pool.query(
            'INSERT INTO main_category (maincategory_name) VALUES (?)',
            [maincategory_name]
        );

        res.json({ message: 'Main category added', maincategory_id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error adding main category' });
    }
});

// -------------------- POST SUBCATEGORY --------------------
app.post('/api/sub-categories', async (req, res) => {
    const { subcategory_name, maincategory_id } = req.body;

    if (!subcategory_name || !maincategory_id) {
        return res.status(400).json({ error: 'subcategory_name and maincategory_id are required' });
    }

    try {
        // Check if subcategory already exists under the main category
        const [existing] = await pool.query(
            'SELECT subcategory_id FROM sub_category WHERE subcategory_name = ? AND maincategory_id = ?',
            [subcategory_name, maincategory_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Subcategory already exists under this main category' });
        }

        // Insert subcategory
        const [result] = await pool.query(
            'INSERT INTO sub_category (subcategory_name, maincategory_id) VALUES (?, ?)',
            [subcategory_name, maincategory_id]
        );

        res.json({ message: 'Subcategory added', subcategory_id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error adding subcategory' });
    }
});

// -------------------- POST /api/products --------------------
app.post('/api/products', async (req, res) => {
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

    // Validate required fields
    if (!maincategory_id || !subcategory_id || !product_name || !listprice || !moq) {
        return res.status(400).json({
            error: 'maincategory_id, subcategory_id, product_name, listprice, and moq are required'
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check if product already exists in the subcategory
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

        // Check for NULL batch duplicates
        if (batch === null) {
            const [existingNullBatch] = await connection.query(
                'SELECT detail_id FROM product_details WHERE product_id = ? AND batch IS NULL',
                [product_id]
            );
            if (existingNullBatch.length > 0) {
                throw new Error('A record with NULL batch already exists for this product');
            }
        }

        // Insert product details
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


// -------------------- POST PRODUCT DETAILS --------------------
app.post('/api/product-details', async (req, res) => {
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
        return res.status(400).json({ error: 'Missing required fields' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check if product_name exists
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

        // Prevent duplicate NULL batch
        if (batch === null) {
            const [existingNullBatch] = await connection.query(
                'SELECT detail_id FROM product_details WHERE product_id = ? AND batch IS NULL',
                [product_id]
            );
            if (existingNullBatch.length > 0) {
                throw new Error('A record with NULL batch already exists for this product');
            }
        }

        // Insert product details
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

// -------------------- GET MAIN CATEGORIES --------------------
app.get('/api/main-categories', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM main_category');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching main categories' });
    }
});

// -------------------- GET SUBCATEGORIES BY MAIN CATEGORY --------------------
app.get('/api/sub-categories', async (req, res) => {
    const { maincategory_id } = req.query;

    if (!maincategory_id) {
        return res.status(400).json({ error: 'maincategory_id is required' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM sub_category WHERE maincategory_id = ?',
            [maincategory_id]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching subcategories' });
    }
});

// -------------------- GET SIZES (OPTIONAL) --------------------
app.get('/api/sizes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sizes'); // Assuming you have a sizes table
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching sizes' });
    }
});

// -------------------- GET PRODUCTS LIST --------------------
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query(`
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

// -------------------- INSERT PRODUCT DETAILS --------------------
app.post('/api/product-details', async (req, res) => {
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
            throw new Error('Missing required fields: maincategory_id, subcategory_id, product_name, listprice, moq');
        }

        connection = await pool.getConnection();
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

// -------------------- SERVER START --------------------
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
