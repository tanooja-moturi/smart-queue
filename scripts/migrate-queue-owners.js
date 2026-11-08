/**
 * Safe Migration Script: Ensure all existing queues have an 'ownerId' field
 * matching their legacy 'userId' creator ID.
 *
 * Rules:
 * - If queue has 'userId' and no 'ownerId', sets ownerId = userId.
 * - Does NOT overwrite existing ownerId.
 * - Does NOT assign unowned queues to arbitrary users.
 * - Preserves all queue data, entries, IDs, and tokens.
 */

require('dotenv').config({ path: '.env.local' });
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'qflow-645af';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let app;
if (getApps().length === 0) {
  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
} else {
  app = getApps()[0];
}

const db = getFirestore(app);

async function migrateQueueOwners() {
  console.log('🔄 Starting Queue Ownership Migration...');
  const queuesSnapshot = await db.collection('queues').get();

  let updated = 0;
  let alreadyValid = 0;
  let unassigned = 0;

  for (const doc of queuesSnapshot.docs) {
    const data = doc.data();
    const queueId = doc.id;

    if (data.ownerId) {
      alreadyValid++;
      console.log(`  Queue [${queueId}] (${data.queueName}): already has ownerId = ${data.ownerId}`);
      continue;
    }

    if (data.userId) {
      await doc.ref.update({
        ownerId: data.userId,
        updatedAt: new Date().toISOString(),
      });
      updated++;
      console.log(`  Queue [${queueId}] (${data.queueName}): migrated ownerId = ${data.userId}`);
    } else {
      unassigned++;
      console.warn(`  Queue [${queueId}] (${data.queueName}): has neither ownerId nor userId. Kept unassigned.`);
    }
  }

  console.log('\n=============================================');
  console.log(`Migration Summary:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Already had ownerId: ${alreadyValid}`);
  console.log(`  Unassigned legacy queues: ${unassigned}`);
  console.log(`  Total: ${queuesSnapshot.size}`);
  console.log('=============================================\n');
}

migrateQueueOwners()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

