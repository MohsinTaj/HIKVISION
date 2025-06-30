// server.js
const express = require("express");
const request = require("request");
const cors = require("cors");
const app = express();

app.use(cors());

app.get("/snapshot", (req, res) => {
  const snapshotUrl = "http://192.168.137.65/ISAPI/Streaming/channels/101/picture";
  request
    .get(snapshotUrl)
    .auth("admin", "Mohsinmusab321@", false) // BASIC auth
    .on("error", () => res.sendStatus(500))
    .pipe(res);
});

app.listen(5000, () => {
  console.log("Proxy server running at http://localhost:5000");
});
