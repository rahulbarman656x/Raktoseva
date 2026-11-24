export interface BilingualError {
  en: string;
  bn: string;
}

export function formatBilingualError(err?: BilingualError): string {
  if (!err) return '';
  return `${err.en} (${err.bn})`;
}

export function isValidIndianPhone(value: string): boolean {
  const cleaned = value.trim().replace(/[\s-]/g, '');
  return /^[6-9]\d{9}$/.test(cleaned);
}

export function isValidPinCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeIndianPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function validateRequiredText(value: string, labelEn: string, labelBn: string, minLen = 2): BilingualError | null {
  if (!value || value.trim().length < minLen) {
    return {
      en: `Please enter a valid ${labelEn}.`,
      bn: `অনুগ্রহ করে সঠিক ${labelBn} লিখুন।`,
    };
  }
  return null;
}

export function validatePhoneField(value: string, required = true): BilingualError | null {
  const normalized = normalizeIndianPhone(value);
  if (!normalized && !required) return null;
  if (!isValidIndianPhone(normalized)) {
    return {
      en: 'Enter a valid 10-digit Indian mobile number starting with 6–9.',
      bn: '৬–৯ দিয়ে শুরু হওয়া ১০ সংখ্যার সঠিক ভারতীয় মোবাইল নম্বর লিখুন।',
    };
  }
  return null;
}

export function validatePinField(value: string): BilingualError | null {
  if (!isValidPinCode(value)) {
    return {
      en: 'Enter a valid 6-digit PIN code.',
      bn: '৬ সংখ্যার সঠিক পিন কোড লিখুন।',
    };
  }
  return null;
}

export function validatePrescriptionFile(file: File | null): BilingualError | null {
  if (!file) {
    return {
      en: "Doctor's prescription (image or PDF) is required.",
      bn: 'ডাক্তারের প্রেসক্রিপশন (ছবি বা PDF) আপলোড করা আবশ্যক।',
    };
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return {
      en: 'Only JPG, PNG, WebP images or PDF files are allowed.',
      bn: 'শুধুমাত্র JPG, PNG, WebP ছবি বা PDF ফাইল অনুমোদিত।',
    };
  }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      en: 'File size must not exceed 5 MB.',
      bn: 'ফাইলের আকার ৫ MB-এর বেশি হতে পারবে না।',
    };
  }
  return null;
}

export function validateOptionalCertificateFile(file: File | null): BilingualError | null {
  if (!file) return null;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return {
      en: 'Only JPG, PNG, WebP images or PDF files are allowed.',
      bn: 'শুধুমাত্র JPG, PNG, WebP ছবি বা PDF ফাইল অনুমোদিত।',
    };
  }
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      en: 'Certificate size must not exceed 5 MB.',
      bn: 'সার্টিফিকেটের আকার ৫ MB-এর বেশি হতে পারবে না।',
    };
  }
  return null;
}

export function validateLastDonationDate(
  dateStr: string,
  neverDonated: boolean,
  todayStr: string
): BilingualError | null {
  if (neverDonated) return null;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      en: 'Please select your last donation date or tick "I have never donated blood before".',
      bn: 'অনুগ্রহ করে শেষ রক্তদানের তারিখ নির্বাচন করুন অথবা "আমি আগে কখনো রক্ত দিইনি" টিক দিন।',
    };
  }
  if (dateStr > todayStr) {
    return {
      en: 'Last donation date cannot be in the future.',
      bn: 'শেষ রক্তদানের তারিখ ভবিষ্যতের হতে পারবে না।',
    };
  }
  return null;
}
