const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',       // your MariaDB username
  password: '',       // your MariaDB password
  database: 'spinx',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise(); // enables async/await queries
