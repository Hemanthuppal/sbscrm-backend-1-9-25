const mysql = require('mysql2');


const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', 
  database: 'sbs_crm_new',
  waitForConnections: true,
  connectionLimit: 10,  
  queueLimit: 0,   
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
