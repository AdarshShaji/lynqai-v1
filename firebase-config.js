const admin = require('firebase-admin');
// Update the path to your service account key file
const serviceAccount = require('./lexileap-4b31e-firebase-adminsdk-v42zs-3a0130b7b7.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.appspot.com`
});

const firestore = admin.firestore();
const auth = admin.auth();
const storage = admin.storage().bucket();

module.exports = { firestore, auth, storage };