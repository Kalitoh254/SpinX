// backend/test-db.js
const mysql = require('mysql2/promise');

// create pool / connection
const pool = mysql.createPool({
  host: 'localhost',       // or your DB host
  user: 'your_db_user',
  password: 'your_db_pass',
  database: 'spinxdemo',   // your DB name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result'); // no callback here
    console.log('DB works:', rows);
    process.exit(0);
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
}

testConnection();
