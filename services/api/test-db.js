const { Pool } = require('pg');
require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()')
  .then(res => { console.log('Connected!', res.rows); pool.end(); })
  .catch(err => { console.error('Error:', err.message); pool.end(); });
