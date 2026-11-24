/**
 * Firebase Cloud Functions Reference for RaktoSeva
 *
 * 1. getDistrictContacts:
 *    HTTPS Callable function that validates a recently created blood request (within 24 hours),
 *    then fetches eligible donors (isEligible == true), approved Blood Banks, and approved NGOs
 *    in the same district together with their protected phone numbers from donors_private and
 *    organizations_private.
 *
 * 2. getAdminPrescriptionSignedUrl:
 *    Admin-only HTTPS Callable function returning a short-lived Storage signed URL for a
 *    request's prescription file (never shared with donors or requesters).
 *
 * 3. dailyDonorEligibilityCheck:
 *    Runs daily at 08:00 IST to re-evaluate every donor's nextEligibleDate and update isEligible.
 *
 * Deploy with:
 *   firebase deploy --only functions,firestore:rules,hosting
 */

/*
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

const REQUEST_ACCESS_WINDOW_MS = 24 * 60 * 60 * 1000;

function getTodayIST(): string {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function normalizeLocationToken(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesAreaOrPin(
  recordArea: string,
  recordPin: string,
  queryAreaOrPin: string,
  queryPin?: string
): boolean {
  const q = normalizeLocationToken(queryAreaOrPin);
  const qDigits = q.replace(/\D/g, '');
  const rArea = normalizeLocationToken(recordArea);
  const rPin = normalizeLocationToken(recordPin);

  if (queryPin && rPin && rPin === normalizeLocationToken(queryPin)) {
    return true;
  }
  if (!q) return false;
  if (qDigits.length === 6 && rPin === qDigits) {
    return true;
  }
  if (q.length >= 2 && rArea) {
    if (rArea.includes(q) || q.includes(rArea)) {
      return true;
    }
  }
  return false;
}

export const getDistrictContacts = onCall(async (request) => {
  const requestId = String(request.data?.requestId || '').trim();
  if (!requestId) {
    throw new HttpsError('invalid-argument', 'requestId is required.');
  }

  const reqSnap = await db.collection('requests').doc(requestId).get();
  if (!reqSnap.exists) {
    throw new HttpsError('not-found', 'Blood request not found.');
  }

  const reqData = reqSnap.data()!;
  const createdAtMs = reqData.createdAt?.toMillis ? reqData.createdAt.toMillis() : 0;
  if (!createdAtMs || Date.now() - createdAtMs > REQUEST_ACCESS_WINDOW_MS) {
    throw new HttpsError('permission-denied', 'Contact access for this request has expired.');
  }

  const district = String(reqData.district || '');
  const requestedGroup = String(reqData.bloodGroup || '');
  const reqArea = String(reqData.area || '');
  const reqPin = String(reqData.pinCode || '');

  // Query ALL eligible donors in the same district from donors_private (never filter by area/PIN)
  const donorsSnap = await db
    .collection('donors_private')
    .where('district', '==', district)
    .where('isEligible', '==', true)
    .get();

  const donors = donorsSnap.docs
    .map((doc) => {
      const d = doc.data();
      const isSameArea = matchesAreaOrPin(String(d.area || ''), String(d.pinCode || ''), reqArea, reqPin);
      const isExactBloodMatch = d.bloodGroup === requestedGroup;
      const rank = isSameArea && isExactBloodMatch ? 3 : isExactBloodMatch ? 2 : isSameArea ? 1 : 0;
      return {
        rank,
        record: {
          id: doc.id,
          fullName: d.fullName,
          gender: d.gender,
          bloodGroup: d.bloodGroup,
          district: d.district,
          area: d.area,
          pinCode: d.pinCode,
          lastDonationDate: d.lastDonationDate || null,
          neverDonated: Boolean(d.neverDonated),
          nextEligibleDate: d.nextEligibleDate || null,
          isEligible: Boolean(d.isEligible),
          phoneNumber: d.phoneNumber,
          altPhone: d.altPhone || null,
          isExactBloodMatch,
          isSameArea,
        },
      };
    })
    .sort((a, b) => b.rank - a.rank)
    .map((item) => item.record);

  // Query ALL approved organizations (Blood Banks + NGOs) in the same district
  const orgsSnap = await db
    .collection('organizations_private')
    .where('district', '==', district)
    .where('status', '==', 'approved')
    .get();

  const bloodBanks: any[] = [];
  const ngos: any[] = [];

  for (const doc of orgsSnap.docs) {
    const o = doc.data();
    const orgType = o.type === 'Blood Bank' ? 'Blood Bank' : 'NGO';
    const isSameArea = matchesAreaOrPin(String(o.area || ''), String(o.pinCode || ''), reqArea, reqPin);
    const item = {
      id: doc.id,
      type: orgType,
      ngoName: o.ngoName,
      registrationNumber: o.registrationNumber,
      contactPerson: o.contactPerson,
      phone: o.phone,
      address: o.address,
      district: o.district,
      area: o.area,
      pinCode: o.pinCode,
      services: o.services || [],
      isSameArea,
    };
    if (orgType === 'Blood Bank') {
      bloodBanks.push(item);
    } else {
      ngos.push(item);
    }
  }

  bloodBanks.sort((a, b) => Number(b.isSameArea) - Number(a.isSameArea));
  ngos.sort((a, b) => Number(b.isSameArea) - Number(a.isSameArea));

  return {
    request: {
      id: reqSnap.id,
      patientName: reqData.patientName,
      bloodGroup: reqData.bloodGroup,
      units: reqData.units,
      urgency: reqData.urgency,
      hospitalName: reqData.hospitalName,
      district: reqData.district,
      area: reqData.area,
      pinCode: reqData.pinCode,
    },
    donors,
    bloodBanks,
    ngos,
  };
});

export const getAdminPrescriptionSignedUrl = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }

  const requestId = String(request.data?.requestId || '').trim();
  const reqSnap = await db.collection('requests').doc(requestId).get();
  if (!reqSnap.exists) {
    throw new HttpsError('not-found', 'Blood request not found.');
  }

  const prescriptionPath = String(reqSnap.data()?.prescriptionPath || '');
  if (!prescriptionPath) {
    throw new HttpsError('not-found', 'Prescription file not found.');
  }

  const [signedUrl] = await storage
    .bucket()
    .file(prescriptionPath)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });

  return { signedUrl };
});

export const dailyDonorEligibilityCheck = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const todayStr = getTodayIST();

    const ineligibleSnap = await db
      .collection('donors_private')
      .where('isEligible', '==', false)
      .get();

    const batch = db.batch();

    for (const docSnap of ineligibleSnap.docs) {
      const donor = docSnap.data();
      const nextDate = donor.nextEligibleDate;
      if (donor.neverDonated || (nextDate && todayStr >= nextDate)) {
        batch.update(docSnap.ref, {
          isEligible: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const publicRef = db.collection('donors_public').doc(docSnap.id);
        batch.update(publicRef, {
          isEligible: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
  }
);
*/

export {};
