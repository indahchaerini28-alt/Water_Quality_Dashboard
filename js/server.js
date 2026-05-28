const { WebSocketServer } = require('ws');
const http = require('http');
const admin = require('firebase-admin');

/* ================= FIREBASE ================= */

const serviceAccount =
require('./serviceAccountKey.json');

admin.initializeApp({

  credential:
  admin.credential.cert(serviceAccount),

  databaseURL:
  "https://water-quality-dashboard-b6ac0-default-rtdb.asia-southeast1.firebasedatabase.app"

});

const db = admin.database();

/* ================= HTTP SERVER ================= */

const server = http.createServer((req, res) => {

  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });

  res.end('WebSocket Server Running');

});

/* ================= WEBSOCKET SERVER ================= */

const wss = new WebSocketServer({

  server

});

/* ================= CONNECTION ================= */

wss.on('connection', (ws, req) => {

  console.log(
    'CLIENT CONNECTED:',
    req.socket.remoteAddress
  );

  /* ================= RECEIVE DATA ================= */

  ws.on('message', async(message) => {

    try {

      /* ================= PARSE JSON ================= */

      const data =
      JSON.parse(message.toString());

      console.log(
        'DATA RECEIVED:',
        data
      );

      /* ================= IGNORE REGISTER ================= */

      if (data.action === "register") {

        console.log("ESP32 REGISTERED");
        return;
      }

      /* ================= SAVE FIREBASE ================= */

      await db.ref("history").push({

        timestamp:
        data.timestamp ||

        new Date()
        .toLocaleString(),

        ph:
        data.ph || 0,

        turbidity:
        data.turbidity || 0,

        salinity:
        data.salinity || 0,

        status:
        data.status || "-",

        ph_category:
        data.ph_category || "-",

        turbidity_category:
        data.turbidity_category || "-",

        salinity_category:
        data.salinity_category || "-",

        server_time:
        Date.now()

      });

      /* ================= BROADCAST ================= */

      wss.clients.forEach((client) => {

        if (
          client.readyState === 1
        ) {

          client.send(
            JSON.stringify({

              ...data

            })
          );
        }

      });

    }

    catch(err){

      console.log(
        'ERROR:',
        err.message
      );
    }

  });

  /* ================= CLOSE ================= */

  ws.on('close', () => {

    console.log(
      'CLIENT DISCONNECTED'
    );

  });

});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {

  console.log('================================');

  console.log(`SERVER RUNNING ON PORT ${PORT}`);

  console.log('================================');

});
