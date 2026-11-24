# RaktoSeva — Blood Donation Connector Platform

**RaktoSeva** is a mobile-first, responsive blood donation connector platform built for India (with full coverage of all 23 West Bengal districts and extended major Indian states). It connects patients and families urgently needing blood with eligible local donors, approved Blood Banks, and approved NGOs.

> **Disclaimer:** RaktoSeva only connects people. We do not sell blood. Please verify the patient's details before donating.

---

## Project Structure

```
├── server.ts                         # Express backend (API routes, rate limiting, eligibility checks, file vault)
├── firestore.rules                   # Hardened Firestore Security Rules (private phone isolation)
├── firestore.indexes.json            # Composite Firestore indexes for district/eligibility/organization queries
├── storage.rules                     # Firebase Storage Rules (admin-only prescription & certificate access)
├── firebase/
│   ├── firebaseConfig.example.ts     # Firebase Modular SDK client config template
│   └── functions/index.ts            # Cloud Functions: getDistrictContacts, getAdminPrescriptionSignedUrl, dailyDonorEligibilityCheck
├── src/
│   ├── App.tsx                       # App shell, navigation (3-zone top bar + mobile bottom nav), toast system
│   ├── data/locations.ts             # West Bengal districts, extended states, blood groups, NGO services
│   ├── types/raktoseva.ts            # TypeScript entity & API contracts
│   ├── utils/eligibility.ts          # 90-day Male / 120-day Female cooldown calculation
│   ├── utils/validation.ts           # Bilingual (English + Bengali) form & file validators
│   └── components/
│       ├── HomePage.tsx              # Hero, live counters, 3-step guide, privacy section, footer
│       ├── BloodRequestFlow.tsx      # Blood request form + captcha + 3-section district contacts results page
│       ├── DonorPortal.tsx           # Donor registration + Phone OTP login + eligibility & profile editor
│       ├── NgoRegistration.tsx       # NGO & Blood Bank registration with Type selector & optional certificate upload
│       ├── SearchPage.tsx            # Public directory (phone numbers hidden until a blood request is submitted)
│       └── AdminPanel.tsx            # Password-protected moderation dashboard with admin-only prescription access
```

---

## 1. Environment Variables Setup

Copy `.env.example` to `.env` (or configure secrets in your hosting environment):

- `ADMIN_PASSWORD`: Strong passcode for the Admin Panel (if left blank, the Admin page shows a one-time Setup form to claim an admin password hashed with `scrypt`)
- `RECAPTCHA_SECRET_KEY` & `VITE_RECAPTCHA_SITE_KEY`: Optional Google reCAPTCHA keys (when unset, RaktoSeva uses its built-in server-signed verification challenge)
- `SESSION_SECRET`: Signing key for server session and request contact tokens

---

## 2. Privacy & Access Architecture

- **Phone Number Isolation**: Public directory endpoints and Firestore public collections (`donors_public`, `organizations_public`) strip all phone numbers. On the public Search page, users see `"Submit a blood request to view contact numbers."`
- **District Contact Lookup (`getDistrictContacts`)**: Immediately after a blood request is created, the results page fetches eligible donors, approved Blood Banks, and approved NGOs in that district with `Call` (`tel:`) and `Copy number` actions.
- **Donation Eligibility Rule**: Male donors become eligible 90 days after their last donation; Female donors become eligible 120 days after their last donation (or immediately if *"I have never donated blood before"* is checked).
- **Admin-Only Prescriptions**: Uploaded doctor prescriptions are accessible strictly to administrators via short-lived signed URLs/tokens and are never exposed to donors or requesters.

---

## 3. Firebase Deployment Guide

1. **Create a Firebase Project** in the [Firebase Console](https://console.firebase.google.com).
2. **Enable Authentication**: Go to *Authentication > Sign-in method* and enable **Phone** authentication.
3. **Create Firestore Database & Storage Bucket**, then deploy indexes, security rules, Cloud Functions, and Hosting:
   ```bash
   firebase deploy --only firestore:indexes
   firebase deploy --only functions,firestore:rules,hosting
   firebase deploy --only storage
   ```

---

## 4. Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
