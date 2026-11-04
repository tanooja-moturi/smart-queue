/**
 * Provision or promote a staff account securely using Firebase Admin SDK.
 *
 * Usage:
 *   1. Promote existing user:
 *      node scripts/set-staff.js user@example.com
 *
 *   2. Create new staff user:
 *      node scripts/set-staff.js newstaff@example.com MySecurePass123 "Staff Member Name"
 */

require('dotenv').config({ path: '.env.local' });
const { getApps, initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] || 'Staff Member';

if (!email) {
  console.log('Usage:');
  console.log('  Promote existing user: node scripts/set-staff.js <email>');
  console.log('  Create new staff user:  node scripts/set-staff.js <email> <password> [name]');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'qflow-645af';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let app;
if (getApps().length === 0) {
  if (clientEmail && privateKey) {
    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    try {
      app = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    } catch {
      app = initializeApp({ projectId });
    }
  }
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const cleanEmail = email.trim().toLowerCase();
  console.log(`Checking user: ${cleanEmail}...`);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(cleanEmail);
    console.log(`Found existing user with UID: ${userRecord.uid}`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      if (!password) {
        console.error(`User ${cleanEmail} was not found in Firebase Auth.`);
        console.error('To create a new user, specify a password: node scripts/set-staff.js <email> <password> [name]');
        process.exit(1);
      }

      console.log(`Creating new user account for ${cleanEmail}...`);
      userRecord = await auth.createUser({
        email: cleanEmail,
        password: password,
        displayName: name,
      });
      console.log(`Created user account with UID: ${userRecord.uid}`);
    } else {
      console.error('Error querying Firebase Auth:', err.message);
      process.exit(1);
    }
  }

  // 1. Set custom claims in Firebase Authentication
  await auth.setCustomUserClaims(userRecord.uid, {
    ...(userRecord.customClaims || {}),
    role: 'staff',
  });

  // 2. Update or set role in Firestore /users/{uid}
  await db.collection('users').doc(userRecord.uid).set(
    {
      name: userRecord.displayName || name,
      email: cleanEmail,
      role: 'staff',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`Success! User ${cleanEmail} (UID: ${userRecord.uid}) is now provisioned with role: "staff" in both Firebase Auth and Firestore.`);
  console.log('You can now log in at /login with this account to access the staff dashboard.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to provision staff account:', err);
  process.exit(1);
});
