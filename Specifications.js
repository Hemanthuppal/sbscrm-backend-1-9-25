const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Set your MySQL password if any
    database: 'sbs_crm_specs'
});

db.connect(err => {
    if (err) throw err;
    console.log('MySQL Connected');
});

// Existing endpoints for categories, subcategories, products unchanged...
app.get('/categories', (req, res) => {
    db.query('SELECT * FROM categories', (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

app.get('/subcategories/:categoryId', (req, res) => {
    const categoryId = req.params.categoryId;
    db.query('SELECT * FROM subcategories WHERE category_id = ?', [categoryId], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

app.get('/products/:subcategoryId', (req, res) => {
    const subcategoryId = req.params.subcategoryId;
    db.query('SELECT * FROM products WHERE subcategory_id = ?', [subcategoryId], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// Existing: GET /category-specs/:categoryId
app.get('/category-specs/:categoryId', (req, res) => {
    const categoryId = req.params.categoryId;
    db.query('SELECT * FROM category_specifications WHERE category_id = ?', [categoryId], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// Existing: POST /category-specs
app.post('/category-specs', (req, res) => {
    const { category_id, name } = req.body;
    if (!category_id || !name) return res.status(400).json({ error: 'Missing fields' });
    db.query('INSERT INTO category_specifications (name, category_id) VALUES (?, ?)', [name, category_id], (err, results) => {
        if (err) throw err;
        res.json({ id: results.insertId });
    });
});

// NEW: GET /subcategory-specs/:subcategoryId - Get subcategory-level specs
app.get('/subcategory-specs/:subcategoryId', (req, res) => {
    const subcategoryId = req.params.subcategoryId;
    db.query('SELECT * FROM subcategory_specifications WHERE subcategory_id = ?', [subcategoryId], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// NEW: POST /subcategory-specs - Add new subcategory specification
app.post('/subcategory-specs', (req, res) => {
    const { subcategory_id, name } = req.body;
    if (!subcategory_id || !name) return res.status(400).json({ error: 'Missing fields' });
    db.query('INSERT INTO subcategory_specifications (name, subcategory_id) VALUES (?, ?)', [name, subcategory_id], (err, results) => {
        if (err) throw err;
        res.json({ id: results.insertId });
    });
});

// UPDATED: GET /specs/:productId - Now combines category + subcategory + product specs
app.get('/specs/:productId', (req, res) => {
    const productId = req.params.productId;
    
    // Use UNION to combine all levels with type
    db.query(`
        SELECT cs.*, 'category' as type, cs.id as spec_id 
        FROM category_specifications cs
        JOIN subcategories sc ON cs.category_id = sc.category_id
        JOIN products p ON sc.id = p.subcategory_id
        WHERE p.id = ?
        UNION ALL
        SELECT ss.*, 'subcategory' as type, ss.id as spec_id 
        FROM subcategory_specifications ss
        JOIN products p ON ss.subcategory_id = p.subcategory_id
        WHERE p.id = ?
        UNION ALL
        SELECT s.*, 'product' as type, s.id as spec_id
        FROM specifications s
        WHERE s.product_id = ?
    `, [productId, productId, productId], (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// Existing POST /specs (product-level)
app.post('/specs', (req, res) => {
    const { product_id, name } = req.body;
    if (!product_id || !name) return res.status(400).json({ error: 'Missing fields' });
    db.query('INSERT INTO specifications (name, product_id) VALUES (?, ?)', [name, product_id], (err, results) => {
        if (err) throw err;
        res.json({ id: results.insertId });
    });
});

// Existing POST /selections and GET /selections/:productId unchanged...
app.post('/selections', (req, res) => {
    const { product_id, specs_json } = req.body;
    if (!product_id || !specs_json) return res.status(400).json({ error: 'Missing fields' });
    db.query('INSERT INTO selections (product_id, specs_json) VALUES (?, ?)', [product_id, JSON.stringify(specs_json)], (err, results) => {
        if (err) throw err;
        res.json({ id: results.insertId });
    });
});

app.get('/selections/:productId', (req, res) => {
    const productId = req.params.productId;
    db.query('SELECT * FROM selections WHERE product_id = ?', [productId], (err, results) => {
        if (err) throw err;
        res.json(results.map(r => ({ ...r, specs_json: JSON.parse(r.specs_json) })));
    });
});

app.listen(5000, () => {
    console.log('Server running on port 5000');
});