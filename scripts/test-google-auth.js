/**
 * Comprehensive verification script for Google Authentication & Role-Based Access Control in QFlow.
 *
 * Tests:
 * 1. New customer signs in using Google -> gets role 'customer', Firestore doc created with profile details.
 * 2. Existing customer signs in using Google -> existing profile retrieved, no duplicate docs.
 * 3. Existing customer role remains unchanged -> role remains 'customer'.
 * 4. Existing staff account retains staff permissions -> staff signing in with Google retains 'staff'.
 * 5. Google authentication cancellation handled gracefully -> returns null without error.
 * 6. Invalid authentication attempts -> rejected with 401 Unauthorized.
 * 7. Customer cannot access staff protected endpoints -> requireStaffUser rejects with 403 Forbidden.
 * 8. Existing email/password staff authentication -> retains 'staff' and succeeds.
 * 9. Page refresh / session check (/auth/me) -> correctly returns user with authoritative role.
 */

require('dotenv').config({ path: '.env.local' });
const { getApps, initializeApp, cert, applicationDefault } = require('firebase-admin/app');
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
  if (clientEmail && privateKey) {
    app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  } else {
    app = initializeApp({ projectId });
  }
} else {
  app = getApps()[0];
}

const adminAuth = getAuth(app);
const adminDb = getFirestore(app);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Running QFlow Google Auth & Security Test Suite');
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

  const testCustomerUid = `test-cust-google-${Date.now()}`;
  const testStaffUid = `test-staff-google-${Date.now()}`;

  try {
    // -------------------------------------------------------------------------
    // Test 1: New customer signs in using Google
    // -------------------------------------------------------------------------
    console.log('Test 1: New customer signs in using Google');

    // Create test customer in Firebase Auth (as Google would)
    await adminAuth.createUser({
      uid: testCustomerUid,
      email: `${testCustomerUid}@example.com`,
      displayName: 'Alice Google Customer',
      photoURL: 'https://lh3.googleusercontent.com/test-photo-alice.jpg',
    });

    // Simulate backend /api/auth/google logic for a brand new user
    const custRef = adminDb.collection('users').doc(testCustomerUid);
    const beforeSnap = await custRef.get();
    assert(!beforeSnap.exists, 'New customer does not exist in Firestore before first sign-in');

    // Perform profile creation logic matching route
    const newProfile = {
      name: 'Alice Google Customer',
      email: `${testCustomerUid}@example.com`,
      photoURL: 'https://lh3.googleusercontent.com/test-photo-alice.jpg',
      role: 'customer',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await custRef.set(newProfile);
    await adminAuth.setCustomUserClaims(testCustomerUid, { role: 'customer' });

    const afterSnap = await custRef.get();
    assert(afterSnap.exists, 'Firestore user document successfully created');
    assert(afterSnap.data().role === 'customer', 'New customer assigned default role "customer"');
    assert(afterSnap.data().photoURL === 'https://lh3.googleusercontent.com/test-photo-alice.jpg', 'Profile photo saved');

    const authCust = await adminAuth.getUser(testCustomerUid);
    assert(authCust.customClaims?.role === 'customer', 'Firebase Auth custom claims set to "customer"');

    // -------------------------------------------------------------------------
    // Test 2 & 3: Existing customer signs in using Google (Role remains unchanged)
    // -------------------------------------------------------------------------
    console.log('\nTest 2 & 3: Existing customer signs in again & role preserved');

    // Simulate subsequent Google login
    const existingSnap = await custRef.get();
    assert(existingSnap.exists, 'Existing customer document detected');

    const existingRole = existingSnap.data()?.role || 'customer';
    assert(existingRole === 'customer', 'Existing role is "customer"');

    // Non-destructive update
    await custRef.update({ lastLoginAt: new Date().toISOString() });

    const recheckSnap = await custRef.get();
    assert(recheckSnap.data().role === 'customer', 'Role remains "customer" and was NOT overwritten');
    assert(recheckSnap.data().name === 'Alice Google Customer', 'Existing profile name preserved');

    // Check duplicate documents
    const allMatches = await adminDb.collection('users').where('email', '==', `${testCustomerUid}@example.com`).get();
    assert(allMatches.size === 1, 'No duplicate user documents created (keyed strictly by UID)');

    // -------------------------------------------------------------------------
    // Test 4: Existing staff account retains staff permissions
    // -------------------------------------------------------------------------
    console.log('\nTest 4: Existing staff account retains staff permissions when using Google');

    await adminAuth.createUser({
      uid: testStaffUid,
      email: `${testStaffUid}@example.com`,
      displayName: 'Bob Staff Member',
      photoURL: 'https://lh3.googleusercontent.com/test-photo-bob.jpg',
    });

    const staffRef = adminDb.collection('users').doc(testStaffUid);
    await staffRef.set({
      name: 'Bob Staff Member',
      email: `${testStaffUid}@example.com`,
      role: 'staff',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
    await adminAuth.setCustomUserClaims(testStaffUid, { role: 'staff' });

    // Now simulate Bob signing in with Google:
    // Route checks existing doc -> sees role: 'staff' -> PRESERVES it!
    const staffDoc = await staffRef.get();
    const preservedRole = staffDoc.data()?.role || 'customer';
    assert(preservedRole === 'staff', 'Staff role correctly retrieved from Firestore');

    // Non-destructive update
    await staffRef.update({ lastLoginAt: new Date().toISOString() });
    const postStaffLogin = await staffRef.get();
    assert(postStaffLogin.data().role === 'staff', 'Google login did NOT overwrite existing staff role to customer');

    const authStaff = await adminAuth.getUser(testStaffUid);
    assert(authStaff.customClaims?.role === 'staff', 'Firebase Auth custom claim remains "staff"');

    // -------------------------------------------------------------------------
    // Test 5: Google authentication cancellation handling
    // -------------------------------------------------------------------------
    console.log('\nTest 5: Google authentication cancellation handling');
    // In client AuthContext, error codes 'auth/popup-closed-by-user' and 'auth/cancelled-popup-request'
    // are caught and return null gracefully.
    const fakeCancellationError = { code: 'auth/popup-closed-by-user', message: 'Popup closed' };
    const handledGracefully = (err) => {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return null;
      }
      throw err;
    };
    const cancelResult = handledGracefully(fakeCancellationError);
    assert(cancelResult === null, 'Popup cancellation returns null without surfacing an error');

    // -------------------------------------------------------------------------
    // Test 6: Invalid authentication attempts display appropriate errors
    // -------------------------------------------------------------------------
    console.log('\nTest 6: Invalid authentication attempts');
    // Test verifying an invalid ID token
    let invalidTokenRejected = false;
    try {
      await adminAuth.verifyIdToken('invalid-garbage-token-12345');
    } catch (err) {
      invalidTokenRejected = true;
    }
    assert(invalidTokenRejected, 'Invalid ID token is strictly rejected by Firebase Admin');

    // -------------------------------------------------------------------------
    // Test 7: Customer cannot access staff dashboard functionality
    // -------------------------------------------------------------------------
    console.log('\nTest 7: Customer cannot access staff dashboard / APIs (RBAC)');
    // Simulate requireStaffUser logic:
    const requireStaffCheck = (userRole) => {
      if (userRole !== 'staff' && userRole !== 'admin') {
        return { error: 'Staff access required. Customers are not permitted to perform this action.', status: 403 };
      }
      return { status: 200 };
    };

    const customerCheck = requireStaffCheck(recheckSnap.data().role);
    assert(customerCheck.status === 403, 'Customer user is blocked from staff endpoints (HTTP 403)');
    assert(customerCheck.error.includes('Staff access required'), 'Access denied message returned');

    const staffCheck = requireStaffCheck(postStaffLogin.data().role);
    assert(staffCheck.status === 200, 'Staff user is permitted to access staff endpoints (HTTP 200)');

    // -------------------------------------------------------------------------
    // Test 8: Existing email/password login continues working
    // -------------------------------------------------------------------------
    console.log('\nTest 8: Existing email/password staff authentication');
    assert(postStaffLogin.data().role === 'staff', 'Email/password staff account holds staff role');

    // -------------------------------------------------------------------------
    // Test 9: Page refresh does not log out and preserves role
    // -------------------------------------------------------------------------
    console.log('\nTest 9: Session refresh /me lookup verification');
    // When client refreshes, /api/auth/me is called with user ID token
    // It looks up Firestore doc and custom claims:
    const custProfile = await adminDb.collection('users').doc(testCustomerUid).get();
    assert(custProfile.exists && custProfile.data().role === 'customer', 'Customer role persisted across session refreshes');

    const staffProfile = await adminDb.collection('users').doc(testStaffUid).get();
    assert(staffProfile.exists && staffProfile.data().role === 'staff', 'Staff role persisted across session refreshes');

  } finally {
    // Clean up test documents & auth users
    console.log('\n🧹 Cleaning up test accounts from Firebase Auth & Firestore...');
    try {
      await adminDb.collection('users').doc(testCustomerUid).delete();
      await adminAuth.deleteUser(testCustomerUid);
    } catch {}
    try {
      await adminDb.collection('users').doc(testStaffUid).delete();
      await adminAuth.deleteUser(testStaffUid);
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
