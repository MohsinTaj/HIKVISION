const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const request = require('request');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
app.use(cors());

// PostgreSQL configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_xM01OzXSnBeb@ep-billowing-star-a2ozmeal-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// Camera credentials
const CAMERA_IP = process.env.CAMERA_IP || "192.168.137.122";
const CAMERA_USER = process.env.CAMERA_USER || "admin";
const CAMERA_PASS = process.env.CAMERA_PASS || "Mohsinmusab321@";

// Format duration helper
function formatDuration(seconds) {
  if (seconds == null) return 'N/A';
  const totalSeconds = parseFloat(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

// Route: Get attendance data
app.get('/api/attendance', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT 
        face_id, 
        status, 
        timestamp, 
        EXTRACT(EPOCH FROM duration) AS duration_seconds
      FROM attendance 
      ORDER BY timestamp DESC
    `);

    const formattedData = result.rows.map(record => ({
      face_id: record.face_id,
      status: record.status,
      time: new Date(record.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      date: new Date(record.timestamp).toISOString().split('T')[0],
      duration: formatDuration(record.duration_seconds)
    }));

    client.release();
    res.json({ success: true, data: formattedData, count: formattedData.length });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ success: false, error: 'Server error while fetching attendance data' });
  }
});

// Route: Proxy snapshot from camera
app.get('/snapshot', (req, res) => {
  const snapshotUrl = `http://${CAMERA_IP}/ISAPI/Streaming/channels/101/picture`;

  request
    .get(snapshotUrl)
    .auth(CAMERA_USER, CAMERA_PASS, false)
    .on('error', () => res.sendStatus(500))
    .pipe(res);
});

// Periodically send snapshot to Flask every 10 seconds
const sendSnapshotToFlask = async () => {
  const snapshotUrl = `http://${CAMERA_IP}/ISAPI/Streaming/channels/101/picture`;

  try {
    const snapshotResponse = await axios.get(snapshotUrl, {
      auth: {
        username: CAMERA_USER,
        password: CAMERA_PASS,
      },
      responseType: 'arraybuffer',
    });

    const form = new FormData();
    form.append('image', snapshotResponse.data, {
      filename: 'snapshot.jpg',
      contentType: 'image/jpeg',
    });
    console.log("to see: ",form);
    const flaskResponse = await axios.post('http://127.0.0.1:8080/upload', form, {
      headers: form.getHeaders(),
    });

    console.log(`🟢 Uploaded to Flask: ${flaskResponse.data}`);
  } catch (error) {
    console.error('🔴 Error sending snapshot:', error.message);
  }
};

// Run snapshot upload every 10 seconds
setInterval(sendSnapshotToFlask, 10000);

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
