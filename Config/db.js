const mysql = require('mysql2');

// Create a pool instead of single connection
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Replace with your DB password
  database: 'sbs_crm',
  waitForConnections: true,
  connectionLimit: 10,  // Number of connections in pool
  queueLimit: 0         // Unlimited queueing
});


const db = pool.promise();

// Test connection
db.getConnection()
  .then((connection) => {
    console.log('Connected to MySQL database');
    connection.release(); // Always release connection back to pool
  })
  .catch((err) => {
    console.error('Database connection error: ', err.message);
  });

module.exports = db;
