const { Pool } = require('pg');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function seed() {
  try {
    const instructorRes = await pool.query(
      `INSERT INTO users (id, email, name, role, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [crypto.randomUUID(), 'instructor@example.com', 'Demo Instructor', 'instructor']
    );
    const instructorId = instructorRes.rows[0].id;

    const sessionId = crypto.randomUUID();
    // the invite_token column just expects some string, we can use a random one
    const inviteTokenColumn = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, title, description, instructor_id, status, scheduled_at, max_attendees, invite_token, livekit_room_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, NOW(), NOW())`,
      [
        sessionId,
        'Introduction to Webinar Platform',
        'Learn how to use this platform',
        instructorId,
        'scheduled',
        100,
        inviteTokenColumn,
        'room_' + sessionId.substring(0, 8)
      ]
    );

    const payload = {
      sessionId,
      type: 'invite',
      createdAt: Date.now(),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    
    console.log('Seeded successfully!');
    console.log('Session ID:', sessionId);
    console.log('Invite URL: http://localhost:5173/join/' + token);
    
    // Also, just to make sure the session is LIVE so we can join it, we can set it to live
    await pool.query(`UPDATE sessions SET status = 'live' WHERE id = $1`, [sessionId]);
    console.log('Session status updated to LIVE.');
  } catch (err) {
    console.error('Error seeding:', err.message);
  } finally {
    pool.end();
  }
}
seed();
