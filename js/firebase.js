const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://water-quality-dashboard-b6ac0-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

module.exports = db;