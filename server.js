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
const CAMERA_IP = process.env.CAMERA_IP || "192.168.137.177";
const CAMERA_USER = process.env.CAMERA_USER || "admin";
const CAMERA_PASS = process.env.CAMERA_PASS || "Mohsinmusab321@";
function formatTimeRange(start, end) {
  if (!start || !end) return 'N/A';
  return `${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDuration(seconds) {
  if (seconds == null) return 'N/A';
  const totalSeconds = parseFloat(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

// Route: Proxy snapshot from camera
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Attendance API' });
});


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


app.get('/api/attendance/summary', async (req, res) => {
  try {
    const client = await pool.connect();

    const result = await client.query(`
      SELECT 
        face_id, 
        status, 
        timestamp
      FROM attendance
      ORDER BY face_id, timestamp
    `);

    const rows = result.rows;
    const summaries = {};

    for (const row of rows) {
      const date = new Date(row.timestamp).toISOString().split('T')[0];
      const faceId = row.face_id;
      const status = row.status;
      const time = new Date(row.timestamp);

      if (!summaries[faceId]) summaries[faceId] = {};
      if (!summaries[faceId][date]) {
        summaries[faceId][date] = {
          present: [],
          sitting: [],
          left: [],
          total_sitting_seconds: 0,
        };
      }

      const daySummary = summaries[faceId][date];

      if (status === 'present') daySummary.present.push(time);
      if (status === 'sitting') daySummary.sitting.push(time);
      if (status === 'left') daySummary.left.push(time);
    }

    const summaryOutput = [];

    for (const faceId in summaries) {
      for (const date in summaries[faceId]) {
        const summary = summaries[faceId][date];

        const sittingTimes = summary.sitting.sort((a, b) => a - b);

        // 🛠️ Use total time from first to last sitting timestamp
        if (sittingTimes.length >= 2) {
          const sittingStart = sittingTimes[0];
          const sittingEnd = sittingTimes[sittingTimes.length - 1];
          summary.total_sitting_seconds = (sittingEnd - sittingStart) / 1000;
        } else {
          summary.total_sitting_seconds = 0;
        }

        const formatRange = times =>
          times.length
            ? formatTimeRange(times[0], times[times.length - 1])
            : 'N/A';

        summaryOutput.push({
          face_id: faceId,
          date,
          present_range: formatRange(summary.present),
          sitting_range: formatRange(summary.sitting),
          left_range: formatRange(summary.left),
          total_sitting: formatDuration(summary.total_sitting_seconds),
        });
      }
    }

    client.release();
    res.json({ success: true, summary: summaryOutput });

  } catch (err) {
    console.error('❌ Error summarizing attendance:', err);
    res.status(500).json({ success: false, error: 'Server error while summarizing attendance data' });
  }
});


app.get('/api/attendance/persons', async (req, res) => {
  const { face_id } = req.query; // Get the face_id from query params

  try {
    const client = await pool.connect();
    
    let query = `
      SELECT 
        face_id, 
        status, 
        timestamp, 
        EXTRACT(EPOCH FROM duration) AS duration_seconds
      FROM attendance
    `;

    const values = [];

    if (face_id) {
      query += ` WHERE face_id = $1`;
      values.push(face_id);
    }

    query += ` ORDER BY timestamp DESC`;

    const result = await client.query(query, values);

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


// camera sample route to get snapshot
app.get('/snapshot', (req, res) => {
  const snapshotUrl = `http://${CAMERA_IP}/ISAPI/Streaming/channels/101/picture`;

  request
    .get(snapshotUrl)
    .auth(CAMERA_USER, CAMERA_PASS, false)
    .on('response', function (response) {
      // Set headers when response starts
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'image/jpeg');
    })
    .on('error', () => res.sendStatus(500))
    .pipe(res);
});


const sendSnapshotToFlask = async () => {
  const awsurl = `http://127.0.0.1:8080/upload`;

  try {
    const response = await axios.post(awsurl);  // No body, just an empty POST
    console.log('✅ Flask response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('🔴 Error sending snapshot:', error.response.status);
      console.error('🔴 Response body:', error.response.data.toString());
    } else {
      console.error('🔴 Request failed:', error.message);
    }
  }
};

// Run snapshot upload every 10 seconds
setInterval(sendSnapshotToFlask, 10000);

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
