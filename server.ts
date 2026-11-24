import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  calculateDonorEligibility,
  DonorGender,
  getTodayIST,
} from './src/utils/eligibility.ts';

dotenv.config();

type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
type UrgencyLevel = 'Emergency' | 'Within 24 hrs' | 'Within 3 days';
type RequestStatus = 'active' | 'fulfilled';
type NgoStatus = 'pending' | 'approved' | 'rejected';
type OrganizationType = 'NGO' | 'Blood Bank';

interface BloodRequestRecord {
  id: string;
  patientName: string;
  requesterName: string;
  phone: string;
  bloodGroup: BloodGroup;
  units: number;
  urgency: UrgencyLevel;
  hospitalName: string;
  state: string;
  district: string;
  area: string;
  pinCode: string;
  notes?: string;
  status: RequestStatus;
  prescriptionFileName: string;
  prescriptionMimeType: string;
  prescriptionUrl: string;
  createdAt: string;
  fulfilledAt?: string;
}

interface DonorRecord {
  id: string;
  fullName: string;
  gender: DonorGender;
  bloodGroup: BloodGroup;
  phoneNumber: string;
  altPhone?: string;
  state: string;
  district: string;
  area: string;
  pinCode: string;
  lastDonationDate?: string;
  neverDonated: boolean;
  nextEligibleDate: string | null;
  isEligible: boolean;
  available: boolean;
  consentGiven: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NgoRecord {
  id: string;
  type: OrganizationType;
  ngoName: string;
  registrationNumber: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  district: string;
  area: string;
  pinCode: string;
  services: string[];
  certificateFileName?: string;
  certificateUrl?: string;
  status: NgoStatus;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseStore {
  donors: DonorRecord[];
  ngos: NgoRecord[];
  requests: BloodRequestRecord[];
}

interface AdminCredentialFile {
  salt: string;
  hash: string;
  claimedAt: string;
}

const VALID_BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_URGENCY: UrgencyLevel[] = ['Emergency', 'Within 24 hrs', 'Within 3 days'];
const VALID_GENDERS: DonorGender[] = ['Male', 'Female'];
const VALID_ORG_TYPES: OrganizationType[] = ['NGO', 'Blood Bank'];

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const PRESCRIPTIONS_DIR = path.resolve(UPLOADS_DIR, 'prescriptions');
const CERTIFICATES_DIR = path.resolve(UPLOADS_DIR, 'certificates');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');
const ADMIN_CRED_PATH = path.resolve(DATA_DIR, 'admin-cred.json');

fs.mkdirSync(PRESCRIPTIONS_DIR, { recursive: true });
fs.mkdirSync(CERTIFICATES_DIR, { recursive: true });

// Ephemeral session secret fallback in memory if SESSION_SECRET is unset
const SESSION_SECRET = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

function normalizeNgoRecord(ngo: NgoRecord): NgoRecord {
  return {
    ...ngo,
    type: ngo.type === 'Blood Bank' ? 'Blood Bank' : 'NGO',
  };
}

function readStore(): DatabaseStore {
  if (!fs.existsSync(STORE_PATH)) {
    const initial: DatabaseStore = { donors: [], ngos: [], requests: [] };
    writeStore(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseStore>;
    return {
      donors: Array.isArray(parsed.donors) ? parsed.donors : [],
      ngos: Array.isArray(parsed.ngos) ? parsed.ngos.map(normalizeNgoRecord) : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
    };
  } catch {
    return { donors: [], ngos: [], requests: [] };
  }
}

function writeStore(store: DatabaseStore): void {
  const tmpPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function readAdminCred(): AdminCredentialFile | null {
  if (!fs.existsSync(ADMIN_CRED_PATH)) return null;
  try {
    const raw = fs.readFileSync(ADMIN_CRED_PATH, 'utf8');
    const parsed = JSON.parse(raw) as AdminCredentialFile;
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeAdminCred(cred: AdminCredentialFile): void {
  const tmpPath = `${ADMIN_CRED_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(cred, null, 2), 'utf8');
  fs.renameSync(tmpPath, ADMIN_CRED_PATH);
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyScryptPassword(password: string, salt: string, expectedHashHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function safeCompareStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

interface TokenPayload {
  role: 'admin' | 'donor' | 'request_access';
  sub: string;
  district?: string;
  requestId?: string;
  exp: number;
}

function signToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds: number): string {
  const full: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function extractBearer(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

// Sliding-window in-memory rate limiter
const rateBuckets = new Map<string, number[]>();

function createRateLimiter(bucketPrefix: string, maxHits: number, windowMs: number, messageEn: string, messageBn: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown').trim();
    const key = `${bucketPrefix}:${ip}`;
    const now = Date.now();
    const timestamps = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (timestamps.length >= maxHits) {
      res.status(429).json({
        error: `${messageEn} (${messageBn})`,
      });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

// Built-in signed captcha challenges (fallback when RECAPTCHA_SECRET_KEY is not configured)
const usedCaptchaIds = new Set<string>();

function createSignedCaptcha() {
  const a = crypto.randomInt(2, 15);
  const b = crypto.randomInt(1, 12);
  const id = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = Buffer.from(JSON.stringify({ id, ans: String(a + b), exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return {
    mode: process.env.RECAPTCHA_SECRET_KEY ? 'recaptcha' : 'challenge',
    question: `What is ${a} + ${b}?`,
    token: `${payload}.${sig}`,
  };
}

async function verifyCaptchaSubmission(captchaToken: string, captchaAnswer: string, remoteIp: string): Promise<boolean> {
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (recaptchaSecret) {
    if (!captchaToken) return false;
    try {
      const params = new URLSearchParams({
        secret: recaptchaSecret,
        response: captchaToken,
        remoteip: remoteIp,
      });
      const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = (await resp.json()) as { success?: boolean };
      return Boolean(data.success);
    } catch {
      return false;
    }
  }

  // Built-in signed challenge verification
  if (!captchaToken || !captchaAnswer) return false;
  const parts = captchaToken.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!safeCompareStrings(sig, expectedSig)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      id: string;
      ans: string;
      exp: number;
    };
    if (decoded.exp < Math.floor(Date.now() / 1000)) return false;
    if (usedCaptchaIds.has(decoded.id)) return false;
    if (decoded.ans !== captchaAnswer.trim()) return false;
    usedCaptchaIds.add(decoded.id);
    if (usedCaptchaIds.size > 5000) usedCaptchaIds.clear();
    return true;
  } catch {
    return false;
  }
}

// Magic byte detection for secure file uploads
function detectSafeFileExtension(buffer: Buffer, declaredMime: string): { ext: string; mime: string } | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-' && declaredMime === 'application/pdf') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function sanitizeText(val: unknown, maxLen = 200): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function normalizePhone(val: unknown): string {
  if (typeof val !== 'string') return '';
  const digits = val.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

// OTP store in memory (phone -> { hash, exp, donorId })
const otpStore = new Map<string, { hash: string; exp: number; donorId: string }>();

function syncDonorEligibilityRecord(donor: DonorRecord, todayStr: string): DonorRecord {
  const gender: DonorGender = donor.gender === 'Female' ? 'Female' : 'Male';
  const neverDonated = Boolean(donor.neverDonated || !donor.lastDonationDate);
  const elig = calculateDonorEligibility(gender, donor.lastDonationDate, neverDonated, todayStr);
  const phoneNumber = donor.phoneNumber || '';

  return {
    ...donor,
    phoneNumber,
    gender,
    neverDonated,
    nextEligibleDate: elig.nextEligibleDate,
    isEligible: elig.isEligible,
    available: elig.isEligible,
  };
}

function runDailyEligibilitySweep(): void {
  const store = readStore();
  const todayStr = getTodayIST();
  let changed = false;

  const updatedDonors = store.donors.map((donor) => {
    const synced = syncDonorEligibilityRecord(donor, todayStr);
    if (
      synced.isEligible !== donor.isEligible ||
      synced.nextEligibleDate !== donor.nextEligibleDate ||
      synced.available !== donor.available ||
      synced.phoneNumber !== donor.phoneNumber
    ) {
      changed = true;
    }
    return synced;
  });

  if (changed) {
    store.donors = updatedDonors;
    writeStore(store);
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  const requestLimiter = createRateLimiter(
    'blood_request',
    5,
    15 * 60 * 1000,
    'Too many blood requests submitted from your device. Please wait 15 minutes.',
    'আপনার ডিভাইস থেকে অনেকগুলো রক্তের অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে ১৫ মিনিট অপেক্ষা করুন।'
  );

  const authLimiter = createRateLimiter(
    'auth_attempt',
    10,
    15 * 60 * 1000,
    'Too many attempts. Please wait a few minutes.',
    'অনেকবার চেষ্টা করা হয়েছে। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন।'
  );

  // 1. Live Public Stats
  app.get('/api/stats', (_req, res) => {
    const store = readStore();
    res.json({
      totalDonors: store.donors.length,
      totalNgos: store.ngos.filter((n) => n.status === 'approved').length,
      totalFulfilled: store.requests.filter((r) => r.status === 'fulfilled').length,
      activeRequests: store.requests.filter((r) => r.status === 'active').length,
    });
  });

  // 2. Captcha Challenge
  app.get('/api/captcha', (_req, res) => {
    res.json(createSignedCaptcha());
  });

  // 3. Public Search (District-wide eligible donors & approved NGOs/Blood Banks; area/bloodGroup sort only; NO phone numbers)
  app.get('/api/search', (req, res) => {
    const rawDistrict = sanitizeText(req.query.district, 100);
    const district = rawDistrict.toLowerCase();
    const areaQuery = sanitizeText(req.query.area, 100);
    const bloodGroup = sanitizeText(req.query.bloodGroup, 10).toUpperCase();
    const gender = sanitizeText(req.query.gender, 20);

    if (!district) {
      res.status(400).json({
        error: 'Please select a district to search. (অনুসন্ধানের জন্য অনুগ্রহ করে একটি জেলা নির্বাচন করুন।)',
      });
      return;
    }

    const store = readStore();
    const todayStr = getTodayIST();
    const donors = store.donors
      .map((d) => syncDonorEligibilityRecord(d, todayStr))
      .filter((d) => {
        if (!d.isEligible) return false;
        if (d.district.toLowerCase() !== district) return false;
        if (gender && d.gender !== gender) return false;
        return true;
      })
      .map((d) => {
        const isSameArea = matchesAreaOrPin(d.area, d.pinCode, areaQuery);
        const isExactBloodMatch = Boolean(bloodGroup && d.bloodGroup.toUpperCase() === bloodGroup);
        const rank = (isSameArea && isExactBloodMatch ? 3 : isExactBloodMatch ? 2 : isSameArea ? 1 : 0);
        return {
          rank,
          summary: {
            id: d.id,
            fullName: d.fullName,
            gender: d.gender,
            bloodGroup: d.bloodGroup,
            state: d.state,
            district: d.district,
            area: d.area,
            pinCode: d.pinCode,
            lastDonationDate: d.lastDonationDate,
            neverDonated: d.neverDonated,
            nextEligibleDate: d.nextEligibleDate,
            isEligible: d.isEligible,
            available: d.isEligible,
            isSameArea,
            isExactBloodMatch,
          },
        };
      })
      .sort((a, b) => b.rank - a.rank)
      .map((item) => item.summary);

    // Return ALL approved Blood Banks & NGOs in the selected district (sorted with same area/PIN first), NO phone/email
    const organizations = store.ngos
      .filter((n) => n.status === 'approved' && n.district.toLowerCase() === district)
      .map((n) => {
        const isSameArea = matchesAreaOrPin(n.area, n.pinCode, areaQuery);
        return {
          isSameArea,
          summary: {
            id: n.id,
            type: n.type,
            ngoName: n.ngoName,
            registrationNumber: n.registrationNumber,
            contactPerson: n.contactPerson,
            address: n.address,
            state: n.state,
            district: n.district,
            area: n.area,
            pinCode: n.pinCode,
            services: n.services,
            status: n.status,
            isSameArea,
          },
        };
      })
      .sort((a, b) => Number(b.isSameArea) - Number(a.isSameArea))
      .map((item) => item.summary);

    res.json({ district: rawDistrict, donors, organizations });
  });

  // 4. Submit Blood Request + Upload Prescription
  app.post('/api/requests', requestLimiter, upload.single('prescription'), async (req, res) => {
    try {
      const captchaToken = sanitizeText(req.body.captchaToken, 1000);
      const captchaAnswer = sanitizeText(req.body.captchaAnswer, 32);
      const clientIp = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim();

      const captchaOk = await verifyCaptchaSubmission(captchaToken, captchaAnswer, clientIp);
      if (!captchaOk) {
        res.status(400).json({
          error: 'Human verification failed. Please complete the captcha correctly. (মানব যাচাইকরণ ব্যর্থ হয়েছে। অনুগ্রহ করে ক্যাপচা সঠিকভাবে পূরণ করুন।)',
        });
        return;
      }

      const patientName = sanitizeText(req.body.patientName, 100);
      const requesterName = sanitizeText(req.body.requesterName, 100);
      const phone = normalizePhone(req.body.phone);
      const bloodGroup = sanitizeText(req.body.bloodGroup, 10) as BloodGroup;
      const units = Number(req.body.units);
      const urgency = sanitizeText(req.body.urgency, 40) as UrgencyLevel;
      const hospitalName = sanitizeText(req.body.hospitalName, 150);
      const state = sanitizeText(req.body.state || 'West Bengal', 80);
      const district = sanitizeText(req.body.district, 100);
      const area = sanitizeText(req.body.area, 120);
      const pinCode = sanitizeText(req.body.pinCode, 10);
      const notes = sanitizeText(req.body.notes, 500);

      if (!patientName || !requesterName || !hospitalName || !district || !area) {
        res.status(400).json({
          error: 'Please fill in all required fields. (অনুগ্রহ করে সমস্ত আবশ্যক ঘর পূরণ করুন।)',
        });
        return;
      }
      if (!isValidIndianPhone(phone)) {
        res.status(400).json({
          error: 'Invalid 10-digit Indian phone number. (সঠিক ১০ সংখ্যার ভারতীয় মোবাইল নম্বর দিন।)',
        });
        return;
      }
      if (!VALID_BLOOD_GROUPS.includes(bloodGroup)) {
        res.status(400).json({
          error: 'Invalid blood group selected. (সঠিক রক্তের গ্রুপ নির্বাচন করুন।)',
        });
        return;
      }
      if (!Number.isInteger(units) || units < 1 || units > 20) {
        res.status(400).json({
          error: 'Units required must be between 1 and 20. (প্রয়োজনীয় ইউনিট ১ থেকে ২০-এর মধ্যে হতে হবে।)',
        });
        return;
      }
      if (!VALID_URGENCY.includes(urgency)) {
        res.status(400).json({
          error: 'Invalid urgency level. (সঠিক জরুরি অবস্থা নির্বাচন করুন।)',
        });
        return;
      }
      if (!isValidPin(pinCode)) {
        res.status(400).json({
          error: 'Invalid 6-digit PIN code. (৬ সংখ্যার সঠিক পিন কোড দিন।)',
        });
        return;
      }
      if (!req.file || !req.file.buffer) {
        res.status(400).json({
          error: "Doctor's prescription file is required. (ডাক্তারের প্রেসক্রিপশন আপলোড করা আবশ্যক।)",
        });
        return;
      }

      const detected = detectSafeFileExtension(req.file.buffer, req.file.mimetype);
      if (!detected) {
        res.status(400).json({
          error: 'Prescription must be a valid JPG, PNG, WebP image or PDF (max 5MB). (প্রেসক্রিপশন অবশ্যই সঠিক JPG, PNG, WebP ছবি বা PDF হতে হবে।)',
        });
        return;
      }

      const requestId = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const safeFilename = `${requestId}_${crypto.randomUUID().slice(0, 8)}.${detected.ext}`;
      const destPath = path.resolve(PRESCRIPTIONS_DIR, safeFilename);
      if (!destPath.startsWith(PRESCRIPTIONS_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid file path.' });
        return;
      }
      fs.writeFileSync(destPath, req.file.buffer);

      const newRequest: BloodRequestRecord = {
        id: requestId,
        patientName,
        requesterName,
        phone,
        bloodGroup,
        units,
        urgency,
        hospitalName,
        state,
        district,
        area,
        pinCode,
        notes: notes || undefined,
        status: 'active',
        prescriptionFileName: safeFilename,
        prescriptionMimeType: detected.mime,
        prescriptionUrl: `/api/files/prescriptions/${safeFilename}`,
        createdAt: new Date().toISOString(),
      };

      const store = readStore();
      store.requests.unshift(newRequest);
      writeStore(store);

      const requestAccessToken = signToken(
        { role: 'request_access', sub: requestId, requestId, district },
        24 * 3600
      );

      res.status(201).json({
        request: newRequest,
        requestAccessToken,
      });
    } catch (err) {
      console.error('Error submitting blood request:', err);
      res.status(500).json({ error: 'Unable to submit blood request right now.' });
    }
  });

  // 4B. getDistrictContacts equivalent: returns matching eligible donors, blood banks, and NGOs with phone numbers
  app.get('/api/requests/:requestId/contacts', (req, res) => {
    const requestId = sanitizeText(req.params.requestId, 64);
    const bearer = extractBearer(req);
    const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
    const decoded = verifyToken(bearer || queryToken || '');

    if (!decoded || decoded.role !== 'request_access' || decoded.requestId !== requestId) {
      res.status(403).json({ error: 'Valid blood request session is required to view contact numbers.' });
      return;
    }

    const store = readStore();
    const requestRecord = store.requests.find((r) => r.id === requestId);
    if (!requestRecord) {
      res.status(404).json({ error: 'Blood request not found.' });
      return;
    }

    // Verify request was recently created (within 24 hours)
    const ageMs = Date.now() - new Date(requestRecord.createdAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      res.status(403).json({ error: 'Contact lookup window for this request has expired. Please submit a new request.' });
      return;
    }

    const todayStr = getTodayIST();
    const districtLower = requestRecord.district.toLowerCase();

    const donors = store.donors
      .map((d) => syncDonorEligibilityRecord(d, todayStr))
      .filter((d) => d.isEligible && d.district.toLowerCase() === districtLower)
      .map((d) => {
        const isSameArea = matchesAreaOrPin(d.area, d.pinCode, requestRecord.area, requestRecord.pinCode);
        const isExactBloodMatch = d.bloodGroup === requestRecord.bloodGroup;
        const rank = isSameArea && isExactBloodMatch ? 3 : isExactBloodMatch ? 2 : isSameArea ? 1 : 0;
        return {
          rank,
          record: {
            id: d.id,
            fullName: d.fullName,
            gender: d.gender,
            bloodGroup: d.bloodGroup,
            state: d.state,
            district: d.district,
            area: d.area,
            pinCode: d.pinCode,
            lastDonationDate: d.lastDonationDate,
            neverDonated: d.neverDonated,
            nextEligibleDate: d.nextEligibleDate,
            isEligible: d.isEligible,
            available: d.isEligible,
            phoneNumber: d.phoneNumber,
            altPhone: d.altPhone,
            isExactBloodMatch,
            isSameArea,
          },
        };
      })
      .sort((a, b) => b.rank - a.rank)
      .map((item) => item.record);

    const approvedInDistrict = store.ngos
      .filter((n) => n.status === 'approved' && n.district.toLowerCase() === districtLower)
      .map((n) => ({
        ...n,
        isSameArea: matchesAreaOrPin(n.area, n.pinCode, requestRecord.area, requestRecord.pinCode),
      }))
      .sort((a, b) => Number(Boolean(b.isSameArea)) - Number(Boolean(a.isSameArea)));

    const bloodBanks = approvedInDistrict.filter((n) => n.type === 'Blood Bank');
    const ngos = approvedInDistrict.filter((n) => n.type !== 'Blood Bank');

    res.json({
      request: {
        id: requestRecord.id,
        patientName: requestRecord.patientName,
        bloodGroup: requestRecord.bloodGroup,
        units: requestRecord.units,
        urgency: requestRecord.urgency,
        hospitalName: requestRecord.hospitalName,
        district: requestRecord.district,
        area: requestRecord.area,
        pinCode: requestRecord.pinCode,
        createdAt: requestRecord.createdAt,
      },
      donors,
      bloodBanks,
      ngos,
    });
  });

  // 5. Donor Registration
  app.post('/api/donors', (req, res) => {
    const fullName = sanitizeText(req.body.fullName, 100);
    const gender = sanitizeText(req.body.gender, 20) as DonorGender;
    const bloodGroup = sanitizeText(req.body.bloodGroup, 10) as BloodGroup;
    const phoneNumber = normalizePhone(req.body.phoneNumber);
    const altPhone = normalizePhone(req.body.altPhone);
    const state = sanitizeText(req.body.state || 'West Bengal', 80);
    const district = sanitizeText(req.body.district, 100);
    const area = sanitizeText(req.body.area, 120);
    const pinCode = sanitizeText(req.body.pinCode, 10);
    const neverDonated = req.body.neverDonated === true;
    const lastDonationDate = neverDonated ? '' : sanitizeText(req.body.lastDonationDate, 20);
    const consentGiven = req.body.consentGiven === true;

    if (!fullName || !district || !area) {
      res.status(400).json({ error: 'Please fill in all required donor fields. (সমস্ত আবশ্যক তথ্য দিন।)' });
      return;
    }
    if (!VALID_GENDERS.includes(gender)) {
      res.status(400).json({ error: 'Please select gender (Male or Female). (অনুগ্রহ করে লিঙ্গ নির্বাচন করুন।)' });
      return;
    }
    if (!VALID_BLOOD_GROUPS.includes(bloodGroup)) {
      res.status(400).json({ error: 'Invalid blood group. (সঠিক রক্তের গ্রুপ দিন।)' });
      return;
    }
    if (!isValidIndianPhone(phoneNumber)) {
      res.status(400).json({ error: 'Invalid 10-digit Phone Number. (সঠিক ১০ সংখ্যার ফোন নম্বর দিন।)' });
      return;
    }
    if (altPhone && !isValidIndianPhone(altPhone)) {
      res.status(400).json({ error: 'Invalid 10-digit alternative phone number. (বিকল্প নম্বরটি সঠিক ১০ সংখ্যার হতে হবে।)' });
      return;
    }
    if (!isValidPin(pinCode)) {
      res.status(400).json({ error: 'Invalid 6-digit PIN code. (৬ সংখ্যার সঠিক পিন কোড দিন।)' });
      return;
    }

    const todayStr = getTodayIST();
    if (!neverDonated) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDonationDate)) {
        res.status(400).json({
          error: 'Last donation date is mandatory unless you have never donated before. (শেষ রক্তদানের তারিখ আবশ্যক অথবা প্রথমবার হলে চেকবক্সে টিক দিন।)',
        });
        return;
      }
      if (lastDonationDate > todayStr) {
        res.status(400).json({
          error: 'Last donation date cannot be in the future. (শেষ রক্তদানের তারিখ ভবিষ্যতের হতে পারবে না।)',
        });
        return;
      }
    }

    if (!consentGiven) {
      res.status(400).json({
        error: 'Consent is required to register as a blood donor. (রক্তদাতা হিসেবে নিবন্ধনের জন্য সম্মতি প্রয়োজন।)',
      });
      return;
    }

    const store = readStore();
    const duplicate = store.donors.find((d) => d.phoneNumber === phoneNumber);
    if (duplicate) {
      res.status(409).json({
        error: 'A donor with this Phone Number is already registered. Please log in with OTP to update details. (এই ফোন নম্বর দিয়ে ইতিমধ্যেই নিবন্ধন করা আছে। আপডেট করতে OTP দিয়ে লগইন করুন।)',
      });
      return;
    }

    const elig = calculateDonorEligibility(gender, lastDonationDate || undefined, neverDonated, todayStr);
    const now = new Date().toISOString();
    const donor: DonorRecord = {
      id: `dnr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      fullName,
      gender,
      bloodGroup,
      phoneNumber,
      altPhone: altPhone || undefined,
      state,
      district,
      area,
      pinCode,
      lastDonationDate: neverDonated ? undefined : lastDonationDate,
      neverDonated,
      nextEligibleDate: elig.nextEligibleDate,
      isEligible: elig.isEligible,
      available: elig.isEligible,
      consentGiven: true,
      createdAt: now,
      updatedAt: now,
    };

    store.donors.unshift(donor);
    writeStore(store);

    const token = signToken({ role: 'donor', sub: donor.id, district: donor.district }, 24 * 3600);
    res.status(201).json({ donor, token });
  });

  // 6. Donor Phone OTP Login
  app.post('/api/donors/otp/request', authLimiter, (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!isValidIndianPhone(phone)) {
      res.status(400).json({ error: 'Enter a valid 10-digit Phone Number. (সঠিক ১০ সংখ্যার নম্বর দিন।)' });
      return;
    }
    const store = readStore();
    const donor = store.donors.find((d) => d.phoneNumber === phone);
    if (!donor) {
      res.status(404).json({
        error: 'No donor found with this mobile number. Please register first. (এই নম্বরে কোনো রক্তদাতা পাওয়া যায়নি। অনুগ্রহ করে প্রথমে নিবন্ধন করুন।)',
      });
      return;
    }
    const otp = String(crypto.randomInt(100000, 999999));
    const otpHash = crypto.createHmac('sha256', SESSION_SECRET).update(`${phone}:${otp}`).digest('hex');
    otpStore.set(phone, { hash: otpHash, exp: Date.now() + 5 * 60 * 1000, donorId: donor.id });

    const smsConfigured = Boolean(process.env.SMS_API_KEY?.trim());
    res.json({
      ok: true,
      message: smsConfigured
        ? 'OTP sent to your registered mobile number.'
        : 'Verification OTP generated for preview testing.',
      ...(smsConfigured ? {} : { demoOtp: otp }),
    });
  });

  app.post('/api/donors/otp/verify', authLimiter, (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const otp = sanitizeText(req.body.otp, 10);
    const entry = otpStore.get(phone);
    if (!entry || entry.exp < Date.now()) {
      res.status(400).json({ error: 'OTP expired or invalid. Please request a new OTP. (OTP মেয়াদোত্তীর্ণ বা ভুল হয়েছে।)' });
      return;
    }
    const candidateHash = crypto.createHmac('sha256', SESSION_SECRET).update(`${phone}:${otp}`).digest('hex');
    if (!safeCompareStrings(candidateHash, entry.hash)) {
      res.status(401).json({ error: 'Incorrect OTP entered. (ভুল OTP দিয়েছেন।)' });
      return;
    }
    otpStore.delete(phone);
    const store = readStore();
    const rawDonor = store.donors.find((d) => d.id === entry.donorId);
    if (!rawDonor) {
      res.status(404).json({ error: 'Donor account not found.' });
      return;
    }
    const donor = syncDonorEligibilityRecord(rawDonor, getTodayIST());
    const token = signToken({ role: 'donor', sub: donor.id, district: donor.district }, 24 * 3600);
    res.json({ donor, token });
  });

  app.patch('/api/donors/me', (req, res) => {
    const token = extractBearer(req);
    const decoded = token ? verifyToken(token) : null;
    if (!decoded || decoded.role !== 'donor') {
      res.status(401).json({ error: 'Please log in with OTP first.' });
      return;
    }
    const store = readStore();
    const idx = store.donors.findIndex((d) => d.id === decoded.sub);
    if (idx === -1) {
      res.status(404).json({ error: 'Donor record not found.' });
      return;
    }
    const current = syncDonorEligibilityRecord(store.donors[idx], getTodayIST());
    const nextFullName = req.body.fullName !== undefined ? sanitizeText(req.body.fullName, 100) : current.fullName;
    const nextGender = req.body.gender !== undefined ? (sanitizeText(req.body.gender, 20) as DonorGender) : current.gender || 'Male';
    const nextBloodGroup = req.body.bloodGroup !== undefined ? (sanitizeText(req.body.bloodGroup, 10) as BloodGroup) : current.bloodGroup;
    const nextDistrict = req.body.district !== undefined ? sanitizeText(req.body.district, 100) : current.district;
    const nextState = req.body.state !== undefined ? sanitizeText(req.body.state, 80) : current.state;
    const nextArea = req.body.area !== undefined ? sanitizeText(req.body.area, 120) : current.area;
    const nextPin = req.body.pinCode !== undefined ? sanitizeText(req.body.pinCode, 10) : current.pinCode;
    const nextAlt = req.body.altPhone !== undefined ? normalizePhone(req.body.altPhone) : current.altPhone;

    const nextNeverDonated =
      req.body.neverDonated !== undefined ? Boolean(req.body.neverDonated) : Boolean(current.neverDonated);
    const nextLastDonation = nextNeverDonated
      ? undefined
      : req.body.lastDonationDate !== undefined
      ? sanitizeText(req.body.lastDonationDate, 20)
      : current.lastDonationDate;

    if (!nextFullName || !nextDistrict || !nextArea || !VALID_GENDERS.includes(nextGender) || !VALID_BLOOD_GROUPS.includes(nextBloodGroup) || !isValidPin(nextPin)) {
      res.status(400).json({ error: 'Invalid donor details provided.' });
      return;
    }
    if (nextAlt && !isValidIndianPhone(nextAlt)) {
      res.status(400).json({ error: 'Invalid alternative phone number.' });
      return;
    }

    const todayStr = getTodayIST();
    if (!nextNeverDonated) {
      if (!nextLastDonation || !/^\d{4}-\d{2}-\d{2}$/.test(nextLastDonation)) {
        res.status(400).json({ error: 'Last donation date is required unless "never donated" is selected.' });
        return;
      }
      if (nextLastDonation > todayStr) {
        res.status(400).json({ error: 'Last donation date cannot be in the future.' });
        return;
      }
    }

    const elig = calculateDonorEligibility(nextGender, nextLastDonation, nextNeverDonated, todayStr);

    const updated: DonorRecord = {
      ...current,
      fullName: nextFullName,
      gender: nextGender,
      bloodGroup: nextBloodGroup,
      state: nextState,
      district: nextDistrict,
      area: nextArea,
      pinCode: nextPin,
      altPhone: nextAlt || undefined,
      lastDonationDate: nextLastDonation,
      neverDonated: nextNeverDonated,
      nextEligibleDate: elig.nextEligibleDate,
      isEligible: elig.isEligible,
      available: elig.isEligible,
      updatedAt: new Date().toISOString(),
    };
    store.donors[idx] = updated;
    writeStore(store);
    res.json({ donor: updated });
  });

  // Active requests in donor's district (no prescription URL exposed to donors)
  app.get('/api/donors/me/requests', (req, res) => {
    const token = extractBearer(req);
    const decoded = token ? verifyToken(token) : null;
    if (!decoded || decoded.role !== 'donor') {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    const store = readStore();
    const donor = store.donors.find((d) => d.id === decoded.sub);
    if (!donor) {
      res.status(404).json({ error: 'Donor not found.' });
      return;
    }
    const requests = store.requests
      .filter((r) => r.status === 'active' && r.district.toLowerCase() === donor.district.toLowerCase())
      .map((r) => ({
        id: r.id,
        patientName: r.patientName,
        requesterName: r.requesterName,
        phone: r.phone,
        bloodGroup: r.bloodGroup,
        units: r.units,
        urgency: r.urgency,
        hospitalName: r.hospitalName,
        state: r.state,
        district: r.district,
        area: r.area,
        pinCode: r.pinCode,
        status: r.status,
        createdAt: r.createdAt,
      }));
    res.json({ requests });
  });

  // 7. NGO / Blood Bank Registration
  app.post('/api/ngos', upload.single('certificate'), (req, res) => {
    const orgTypeRaw = sanitizeText(req.body.type || 'NGO', 30);
    const type: OrganizationType = VALID_ORG_TYPES.includes(orgTypeRaw as OrganizationType)
      ? (orgTypeRaw as OrganizationType)
      : 'NGO';
    const ngoName = sanitizeText(req.body.ngoName, 140);
    const registrationNumber = sanitizeText(req.body.registrationNumber, 80);
    const contactPerson = sanitizeText(req.body.contactPerson, 100);
    const phone = normalizePhone(req.body.phone);
    const email = sanitizeText(req.body.email, 120);
    const address = sanitizeText(req.body.address, 240);
    const state = sanitizeText(req.body.state || 'West Bengal', 80);
    const district = sanitizeText(req.body.district, 100);
    const area = sanitizeText(req.body.area, 120);
    const pinCode = sanitizeText(req.body.pinCode, 10);

    let services: string[] = [];
    if (typeof req.body.services === 'string') {
      try {
        const parsed = JSON.parse(req.body.services);
        if (Array.isArray(parsed)) {
          services = parsed.map((s) => sanitizeText(s, 60)).filter(Boolean).slice(0, 10);
        }
      } catch {
        services = req.body.services
          .split(',')
          .map((s: string) => sanitizeText(s, 60))
          .filter(Boolean)
          .slice(0, 10);
      }
    }

    if (!ngoName || !registrationNumber || !contactPerson || !address || !district || !area || services.length === 0) {
      res.status(400).json({ error: 'Please complete all required organization details and select at least one service. (সমস্ত আবশ্যক তথ্য এবং অন্তত একটি পরিষেবা নির্বাচন করুন।)' });
      return;
    }
    if (!isValidIndianPhone(phone)) {
      res.status(400).json({ error: 'Invalid 10-digit Indian phone number. (সঠিক ১০ সংখ্যার ফোন নম্বর দিন।)' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email address. (সঠিক ইমেইল ঠিকানা দিন।)' });
      return;
    }
    if (!isValidPin(pinCode)) {
      res.status(400).json({ error: 'Invalid 6-digit PIN code. (৬ সংখ্যার সঠিক পিন কোড দিন।)' });
      return;
    }

    let certFileName: string | undefined;
    if (req.file && req.file.buffer) {
      const detected = detectSafeFileExtension(req.file.buffer, req.file.mimetype);
      if (!detected) {
        res.status(400).json({ error: 'Certificate must be a valid JPG, PNG, WebP image or PDF (max 5MB).' });
        return;
      }
      certFileName = `ngo_${crypto.randomUUID().slice(0, 12)}.${detected.ext}`;
      const destPath = path.resolve(CERTIFICATES_DIR, certFileName);
      if (!destPath.startsWith(CERTIFICATES_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid file path.' });
        return;
      }
      fs.writeFileSync(destPath, req.file.buffer);
    }

    const now = new Date().toISOString();
    const ngo: NgoRecord = {
      id: `ngo_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      type,
      ngoName,
      registrationNumber,
      contactPerson,
      phone,
      email,
      address,
      state,
      district,
      area,
      pinCode,
      services,
      certificateFileName: certFileName,
      certificateUrl: certFileName ? `/api/files/certificates/${certFileName}` : undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const store = readStore();
    store.ngos.unshift(ngo);
    writeStore(store);

    res.status(201).json({
      ngo,
      message: `${type} registered successfully and queued for admin verification.`,
    });
  });

  // 8. Protected File Serving (Prescriptions restricted STRICTLY to Admin via signed token)
  app.get('/api/files/prescriptions/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp|pdf)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }

    const bearer = extractBearer(req);
    const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
    const decoded = verifyToken(bearer || queryToken || '');
    if (!decoded || decoded.role !== 'admin') {
      res.status(403).json({ error: 'Prescriptions are viewable only by administrators.' });
      return;
    }

    const store = readStore();
    const linkedRequest = store.requests.find((r) => r.prescriptionFileName === filename);
    if (!linkedRequest) {
      res.status(404).json({ error: 'Prescription not found.' });
      return;
    }

    const resolved = path.resolve(PRESCRIPTIONS_DIR, filename);
    if (!resolved.startsWith(PRESCRIPTIONS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.setHeader('Content-Type', linkedRequest.prescriptionMimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(resolved);
  });

  app.get('/api/files/certificates/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp|pdf)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }
    const store = readStore();
    const ngo = store.ngos.find((n) => n.certificateFileName === filename);
    if (!ngo) {
      res.status(404).json({ error: 'Certificate not found.' });
      return;
    }
    const bearer = extractBearer(req);
    const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
    const decoded = verifyToken(bearer || queryToken || '');
    if (ngo.status !== 'approved' && decoded?.role !== 'admin') {
      res.status(403).json({ error: 'Certificate is only visible to admins until approved.' });
      return;
    }
    const resolved = path.resolve(CERTIFICATES_DIR, filename);
    if (!resolved.startsWith(CERTIFICATES_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.sendFile(resolved);
  });

  // 9. Admin Auth & Management
  app.get('/api/admin/status', (_req, res) => {
    const envPass = process.env.ADMIN_PASSWORD?.trim();
    const claimed = Boolean(readAdminCred());
    res.json({
      configuredViaEnv: Boolean(envPass),
      claimed: Boolean(envPass) || claimed,
    });
  });

  app.post('/api/admin/claim', authLimiter, (req, res) => {
    const envPass = process.env.ADMIN_PASSWORD?.trim();
    if (envPass) {
      res.status(403).json({ error: 'Admin password is already configured via environment secrets.' });
      return;
    }
    if (readAdminCred()) {
      res.status(409).json({ error: 'Admin access has already been claimed. Please sign in.' });
      return;
    }
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < 8) {
      res.status(400).json({ error: 'Admin password must be at least 8 characters long.' });
      return;
    }
    const { salt, hash } = hashPassword(password);
    writeAdminCred({ salt, hash, claimedAt: new Date().toISOString() });
    const token = signToken({ role: 'admin', sub: 'admin' }, 12 * 3600);
    res.status(201).json({ token });
  });

  app.post('/api/admin/login', authLimiter, (req, res) => {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }
    const envPass = process.env.ADMIN_PASSWORD?.trim();
    if (envPass) {
      if (!safeCompareStrings(password, envPass)) {
        res.status(401).json({ error: 'Incorrect admin password.' });
        return;
      }
      const token = signToken({ role: 'admin', sub: 'admin' }, 12 * 3600);
      res.json({ token });
      return;
    }

    const cred = readAdminCred();
    if (!cred) {
      res.status(400).json({ error: 'Admin password has not been set up yet.' });
      return;
    }
    if (!verifyScryptPassword(password, cred.salt, cred.hash)) {
      res.status(401).json({ error: 'Incorrect admin password.' });
      return;
    }
    const token = signToken({ role: 'admin', sub: 'admin' }, 12 * 3600);
    res.json({ token });
  });

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = extractBearer(req);
    const decoded = token ? verifyToken(token) : null;
    if (!decoded || decoded.role !== 'admin') {
      res.status(401).json({ error: 'Admin authentication required.' });
      return;
    }
    next();
  }

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const store = readStore();
    const todayStr = getTodayIST();
    res.json({
      ...store,
      donors: store.donors.map((d) => syncDonorEligibilityRecord(d, todayStr)),
    });
  });

  app.patch('/api/admin/ngos/:id', requireAdmin, (req, res) => {
    const status = req.body.status;
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'Status must be approved or rejected.' });
      return;
    }
    const store = readStore();
    const idx = store.ngos.findIndex((n) => n.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    store.ngos[idx] = {
      ...store.ngos[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
    res.json({ ngo: store.ngos[idx] });
  });

  app.patch('/api/admin/requests/:id/fulfill', requireAdmin, (req, res) => {
    const store = readStore();
    const idx = store.requests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    store.requests[idx] = {
      ...store.requests[idx],
      status: 'fulfilled',
      fulfilledAt: new Date().toISOString(),
    };
    writeStore(store);
    res.json({ request: store.requests[idx] });
  });

  app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
    const store = readStore();
    const target = store.requests.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    store.requests = store.requests.filter((r) => r.id !== req.params.id);
    writeStore(store);
    if (target.prescriptionFileName) {
      const p = path.resolve(PRESCRIPTIONS_DIR, target.prescriptionFileName);
      if (p.startsWith(PRESCRIPTIONS_DIR + path.sep) && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    res.json({ ok: true });
  });

  app.delete('/api/admin/donors/:id', requireAdmin, (req, res) => {
    const store = readStore();
    const before = store.donors.length;
    store.donors = store.donors.filter((d) => d.id !== req.params.id);
    if (store.donors.length === before) {
      res.status(404).json({ error: 'Donor not found.' });
      return;
    }
    writeStore(store);
    res.json({ ok: true });
  });

  app.delete('/api/admin/ngos/:id', requireAdmin, (req, res) => {
    const store = readStore();
    const target = store.ngos.find((n) => n.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }
    store.ngos = store.ngos.filter((n) => n.id !== req.params.id);
    writeStore(store);
    if (target.certificateFileName) {
      const p = path.resolve(CERTIFICATES_DIR, target.certificateFileName);
      if (p.startsWith(CERTIFICATES_DIR + path.sep) && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    res.json({ ok: true });
  });

  // Run daily donor eligibility sweep on boot and every 24 hours
  runDailyEligibilitySweep();
  setInterval(runDailyEligibilitySweep, 24 * 60 * 60 * 1000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RaktoSeva server listening on port ${PORT}`);
  });
}

startServer();
