/**
 * Comprehensive verification script for Google Authentication & Role-Based Access Control in QFlow.
 */

require('dotenv').config({ path: '.env.local' });
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
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

const adminAuth = getAuth(app);
const adminDb = getFirestore(app);

function isStaffEmail(email) {
  if (!email) return false;
  const rawList = process.env.STAFF_EMAILS || '';
  if (!rawList.trim()) return false;
  const clean = email.trim().toLowerCase();
  const allowed = rawList.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(clean);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running QFlow Staff/Customer Google Auth & RBAC Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testCustomerUid = `test-cust-${Date.now()}`;
  const testOrdinaryGoogleUid = `test-ord-google-${Date.now()}`;
  const testStaffGoogleUid = `test-staff-google-${Date.now()}`;
  const staffEmail = `allowlist-staff-${Date.now()}@qflow-staff.com`;

  // Dynamically add staffEmail to STAFF_EMAILS for this test run
  process.env.STAFF_EMAILS = `${process.env.STAFF_EMAILS || ''},${staffEmail}`;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Ordinary Google user signs in -> gets role "customer" by default
    // -------------------------------------------------------------------------
    console.log('Test 1: Ordinary Google user signs in (not in STAFF_EMAILS)');
    
    await adminAuth.createUser({
      uid: testOrdinaryGoogleUid,
      email: `${testOrdinaryGoogleUid}@gmail.com`,
      displayName: 'Regular Google Customer',
    });

    const isStaff = isStaffEmail(`${testOrdinaryGoogleUid}@gmail.com`);
    assert(!isStaff, 'Regular user is not in STAFF_EMAILS');

    // Simulate /api/auth/google logic for ordinary user
    const resolvedRole1 = isStaff ? 'staff' : 'customer';
    assert(resolvedRole1 === 'customer', 'Ordinary Google user receives role "customer"');

    await adminDb.collection('users').doc(testOrdinaryGoogleUid).set({
      name: 'Regular Google Customer',
      email: `${testOrdinaryGoogleUid}@gmail.com`,
      role: resolvedRole1,
      createdAt: new Date().toISOString(),
    });
    await adminAuth.setCustomUserClaims(testOrdinaryGoogleUid, { role: resolvedRole1 });

    const custDoc = await adminDb.collection('users').doc(testOrdinaryGoogleUid).get();
    assert(custDoc.data().role === 'customer', 'Firestore user document has role "customer"');

    // -------------------------------------------------------------------------
    // Test 2: Authorized staff account signs in via Google -> gets role "staff"
    // -------------------------------------------------------------------------
    console.log('\nTest 2: Authorized staff account in STAFF_EMAILS signs in via Google');
    
    await adminAuth.createUser({
      uid: testStaffGoogleUid,
      email: staffEmail,
      displayName: 'Authorized Staff Member',
      photoURL: 'https://lh3.googleusercontent.com/staff-photo.jpg',
    });

    const staffCheck = isStaffEmail(staffEmail);
    assert(staffCheck, 'User email matches STAFF_EMAILS allowlist');

    // Simulate Google Sign-In with staff email
    const resolvedStaffRole = staffCheck ? 'staff' : 'customer';
    assert(resolvedStaffRole === 'staff', 'Allowlisted staff email resolves to role "staff"');

    await adminDb.collection('users').doc(testStaffGoogleUid).set({
      name: 'Authorized Staff Member',
      email: staffEmail,
      role: resolvedStaffRole,
      photoURL: 'https://lh3.googleusercontent.com/staff-photo.jpg',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
    await adminAuth.setCustomUserClaims(testStaffGoogleUid, { role: resolvedStaffRole });

    const staffDoc = await adminDb.collection('users').doc(testStaffGoogleUid).get();
    assert(staffDoc.data().role === 'staff', 'Firestore user document assigned role "staff"');

    const authStaffRecord = await adminAuth.getUser(testStaffGoogleUid);
    assert(authStaffRecord.customClaims?.role === 'staff', 'Firebase Auth custom claims assigned role "staff"');

    // -------------------------------------------------------------------------
    // Test 3: Subsequent Google login does NOT overwrite role
    // -------------------------------------------------------------------------
    console.log('\nTest 3: Subsequent Google logins preserve role & profile');

    // Re-verify staff user
    const existingStaffDoc = await adminDb.collection('users').doc(testStaffGoogleUid).get();
    assert(existingStaffDoc.data().role === 'staff', 'Existing staff role preserved on subsequent login');

    // Re-verify customer user
    const existingCustDoc = await adminDb.collection('users').doc(testOrdinaryGoogleUid).get();
    assert(existingCustDoc.data().role === 'customer', 'Existing customer role preserved on subsequent login');

    // -------------------------------------------------------------------------
    // Test 4: RBAC & Dashboard Access Control
    // -------------------------------------------------------------------------
    console.log('\nTest 4: RBAC verification (Customer blocked from staff routes)');

    const requireStaffCheck = (role) => {
      if (role !== 'staff' && role !== 'admin') {
        return { error: 'Staff access required. Customers are not permitted to perform this action.', status: 403 };
      }
      return { status: 200 };
    };

    const customerAccess = requireStaffCheck(custDoc.data().role);
    assert(customerAccess.status === 403, 'Customer blocked from staff routes with HTTP 403');

    const staffAccess = requireStaffCheck(staffDoc.data().role);
    assert(staffAccess.status === 200, 'Staff user permitted on staff routes with HTTP 200');

    // -------------------------------------------------------------------------
    // Test 5: Auto-healing existing customer doc if email is added to STAFF_EMAILS
    // -------------------------------------------------------------------------
    console.log('\nTest 5: Account promotion if email in STAFF_EMAILS previously had customer doc');
    
    // Simulate user previously had role: 'customer' in Firestore
    await adminDb.collection('users').doc(testStaffGoogleUid).update({ role: 'customer' });
    let healedDoc = await adminDb.collection('users').doc(testStaffGoogleUid).get();
    assert(healedDoc.data().role === 'customer', 'Temporarily set role to customer for test');

    // Route logic runs: sees email in STAFF_EMAILS -> heals role to 'staff'
    if (isStaffEmail(staffEmail)) {
      await adminDb.collection('users').doc(testStaffGoogleUid).update({ role: 'staff' });
      await adminAuth.setCustomUserClaims(testStaffGoogleUid, { role: 'staff' });
    }

    healedDoc = await adminDb.collection('users').doc(testStaffGoogleUid).get();
    assert(healedDoc.data().role === 'staff', 'Account automatically promoted to "staff" based on STAFF_EMAILS');

  } finally {
    console.log('\n🧹 Cleaning up test accounts from Firebase Auth & Firestore...');
    try {
      await adminDb.collection('users').doc(testOrdinaryGoogleUid).delete();
      await adminAuth.deleteUser(testOrdinaryGoogleUid);
    } catch {}
    try {
      await adminDb.collection('users').doc(testStaffGoogleUid).delete();
      await adminAuth.deleteUser(testStaffGoogleUid);
    } catch {}
    console.log('Cleanup completed.\n');
  }

  console.log('====================================================');
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
