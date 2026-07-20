const { WebSocketServer } = require('ws');
const http = require('http');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');


// =========================
// FIREBASE
// =========================

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {

  try {

    serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

  } catch (err) {

    console.error(
      "❌ Error parsing FIREBASE_SERVICE_ACCOUNT:",
      err
    );

    process.exit(1);
  }

} else {

  try {

    serviceAccount = require('./serviceAccountKey.json');

  } catch (err) {

    console.warn(
      "⚠️ serviceAccountKey.json tidak ditemukan"
    );
  }
}

const databaseURL =
process.env.FIREBASE_DATABASE_URL ||
'https://water-quality-dashboard-b6ac0-default-rtdb.asia-southeast1.firebasedatabase.app';


if(serviceAccount){

admin.initializeApp({

credential:
admin.credential.cert(serviceAccount),

databaseURL

});

}else{

console.error(
"❌ Firebase gagal"
);

}

const db = admin.database();

// =========================
// HTTP SERVER
// =========================

const server = http.createServer((req,res)=>{

let filePath =
req.url === '/'
? '/index.html'
: req.url;

const baseDir =
path.join(__dirname,'..');

const fullPath =
path.normalize(
path.join(baseDir,filePath)
);

if(
!fullPath.startsWith(baseDir) ||
fullPath.includes('json') ||
fullPath.includes('Dockerfile')
){

res.writeHead(403);
return res.end("403 Forbidden");

}

const ext =
path.extname(fullPath)
.toLowerCase();

const mime = {

'.html':'text/html',
'.js':'text/javascript',
'.css':'text/css',
'.png':'image/png',
'.jpg':'image/jpeg',
'.jpeg':'image/jpeg',
'.svg':'image/svg+xml'

};

if(!mime[ext]){

res.writeHead(403);
return res.end("Forbidden");

}

fs.readFile(fullPath,(err,content)=>{

if(err){

res.writeHead(404);
return res.end("Not Found");

}

res.writeHead(200,{
'Content-Type':mime[ext]
});

res.end(content);

});

});

// =========================
// WEBSOCKET
// =========================

const wss =
new WebSocketServer({
server
});

// =========================
// QOS VARIABLE
// =========================

let packetCount = 0;

let totalBytes = 0;

let startTime = Date.now();

// =========================
// VALIDASI DATA
// =========================

function isValidSensorData(data){

return (

data &&

!isNaN(parseFloat(data.ph)) &&

!isNaN(parseFloat(data.turbidity)) &&

!isNaN(parseFloat(data.tds))

);

}

// =========================
// CONNECTION
// =========================

wss.on('connection',(ws,request)=>{

console.log(
"🔥 CONNECT:",
request.headers['user-agent']
);

ws.isAlive = true;

ws.on('pong',()=>{

ws.isAlive=true;

});

ws.on('message',async(message)=>{

try{

const data =
JSON.parse(
message.toString().trim()
);

// =========================
// DELAY
// ESP32 -> SERVER
// =========================

const serverReceiveTime =
Date.now();

let networkDelay = null;

if(data.timestamp_ms){

networkDelay = serverReceiveTime - data.timestamp_ms;

}

// =========================
// CONTROL
// =========================

if(data.type==="control"){

console.log(
"🎮 CONTROL:",
data.command
);

wss.clients.forEach(client=>{

if(client.readyState===1){

client.send(
JSON.stringify(data)
);

}

});

return;

}

// =========================
// ACK
// =========================

if(data.type==="ack"){

wss.clients.forEach(client=>{

if(client.readyState===1){

client.send(
JSON.stringify(data)
);

}

});

return;

}

if(
data.type==='ping' ||
data.action==='register'
){

return;

}

// =========================
// VALID SENSOR
// =========================


if(!isValidSensorData(data)){

console.log(
"⚠️ Invalid data",
data
);

return;

}

// =========================
// THROUGHPUT
// =========================

packetCount++;

const packetSize =
Buffer.byteLength(
JSON.stringify(data)
);

totalBytes += packetSize;

const duration =
(Date.now()-startTime)
/1000;

const throughput = duration > 0 ?

((totalBytes*8)/duration) /1000 

: 0;

// =========================
// DATE
// =========================

const today =
new Date()
.toISOString()
.split("T")[0];

// =========================
// DATA FIREBASE
// =========================

const sensorData = {

timestamp:
data.timestamp ||
new Date().toISOString(),

timestamp_ms:
data.timestamp_ms,

// QoS
delay_ms:
networkDelay,

throughput_kbps:
throughput,

packet_count:
packetCount,

ph:
parseFloat(data.ph),

turbidity:
parseFloat(data.turbidity),

tds:
parseFloat(data.tds),

status:
data.status || "-",

ph_category:
data.ph_category || "-",

turbidity_category:
data.turbidity_category || "-",

tds_category:
data.tds_category || "-"

};

console.log(
"💾 Saving Firebase..."
);

// =========================
// SAVE
// =========================

const ref =
await db
.ref(`history/${today}`)
.push(sensorData);

// =========================
// SEND DASHBOARD
// =========================
const payload = {

type:"sensor_data",

firebaseKey: ref.key,

dateKey: today,

timestamp: sensorData.timestamp,

ph: sensorData.ph,

turbidity: sensorData.turbidity,

tds: sensorData.tds,

status: sensorData.status,

ph_category: sensorData.ph_category,

turbidity_category: sensorData.turbidity_category,

tds_category: sensorData.tds_category

};

wss.clients.forEach(client=>{

if(client.readyState===1){

client.send(
JSON.stringify(payload)
);

}

});

console.log(
"✅ Sent Dashboard",
"Delay:",
networkDelay,
"ms",
"Throughput:",
throughput.toFixed(2),
"kbps"
);

// ACK

ws.send(
JSON.stringify({

type:"ack",

status:"saved"

})
);

}catch(err){

console.error(
"❌ ERROR:",
err
);

}

});

ws.on('close',()=>{

console.log(
"❌ Client disconnected"
);

});

});

// =========================
// HEARTBEAT
// =========================
setInterval(()=>{
wss.clients.forEach(ws=>{

  if(!ws.isAlive){

console.log(
"⚠️ Dead connection"
);

return ws.terminate();

}

ws.isAlive=false;

ws.ping();

});

},25000);

// =========================
// START SERVER
// =========================
const PORT =
process.env.PORT || 8080;

server.listen(
PORT,
'0.0.0.0',
()=>{

console.log(
`🚀 Server running port ${PORT}`
);

});

// =========================
// CLEAN SHUTDOWN
// =========================
process.on(
'SIGINT',
()=>{

console.log(
"🛑 Shutdown..."
);

wss.clients.forEach(client=>{

if(client.readyState===1){

client.close();

}

});

server.close(
()=>process.exit(0)
);

});
