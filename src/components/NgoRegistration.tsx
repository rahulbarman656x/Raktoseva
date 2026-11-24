import React, { useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import {
  AVAILABLE_STATES,
  INDIAN_STATES_AND_DISTRICTS,
  NGO_SERVICES,
} from '../data/locations';
import { db, firebaseInitError, storage } from '../lib/firebase';
import { OrganizationType } from '../types/raktoseva';
import {
  BilingualError,
  formatBilingualError,
  isValidEmail,
  normalizeIndianPhone,
  validateOptionalCertificateFile,
  validatePhoneField,
  validatePinField,
  validateRequiredText,
} from '../utils/validation';

interface NgoRegistrationProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
  onSuccessComplete?: () => void;
}

function formatFirebaseError(err: unknown): { code: string; message: string } {
  const obj = err as { code?: unknown; message?: unknown };
  const code = typeof obj?.code === 'string' && obj.code ? obj.code : 'unknown-error';
  const message =
    typeof obj?.message === 'string' && obj.message
      ? obj.message
      : err instanceof Error
      ? err.message
      : String(err);
  return { code, message };
}

export const NgoRegistration: React.FC<NgoRegistrationProps> = ({ onToast, onSuccessComplete }) => {
  const [orgType, setOrgType] = useState<OrganizationType>('NGO');
  const [ngoName, setNgoName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('West Bengal');
  const [district, setDistrict] = useState('Kolkata');
  const [area, setArea] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [services, setServices] = useState<string[]>(['Blood Bank']);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, BilingualError>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrg, setSubmittedOrg] = useState<{
    name: string;
    type: OrganizationType;
    certificateWarning?: string;
  } | null>(null);

  const districts = INDIAN_STATES_AND_DISTRICTS[stateName] || [];

  const handleStateChange = (newState: string) => {
    setStateName(newState);
    const list = INDIAN_STATES_AND_DISTRICTS[newState] || [];
    setDistrict(list[0] || '');
  };

  const toggleService = (service: string) => {
    setServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const validate = (): boolean => {
    const next: Record<string, BilingualError> = {};
    const eNgo = validateRequiredText(ngoName, 'Organization Name', 'সংস্থার নাম');
    if (eNgo) next.ngoName = eNgo;

    const eReg = validateRequiredText(registrationNumber, 'Registration Number', 'রেজিস্ট্রেশন নম্বর');
    if (eReg) next.registrationNumber = eReg;

    const eContact = validateRequiredText(contactPerson, 'Contact Person Name', 'যোগাযোগকারীর নাম');
    if (eContact) next.contactPerson = eContact;

    const ePhone = validatePhoneField(phone, true);
    if (ePhone) next.phone = ePhone;

    if (!isValidEmail(email)) {
      next.email = {
        en: 'Enter a valid email address.',
        bn: 'সঠিক ইমেইল ঠিকানা লিখুন।',
      };
    }

    const eAddr = validateRequiredText(address, 'Full Address', 'সম্পূর্ণ ঠিকানা', 5);
    if (eAddr) next.address = eAddr;

    const eArea = validateRequiredText(area, 'Area Name', 'এলাকার নাম');
    if (eArea) next.area = eArea;

    const ePin = validatePinField(pinCode);
    if (ePin) next.pinCode = ePin;

    if (services.length === 0) {
      next.services = {
        en: 'Select at least one service offered.',
        bn: 'অন্তত একটি পরিষেবা নির্বাচন করুন।',
      };
    }

    const eCert = validateOptionalCertificateFile(certificate);
    if (eCert) next.certificate = eCert;

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      onToast('error', 'Please fix the highlighted fields', 'Check bilingual guidance below each input.');
      return;
    }

    setSubmitting(true);
    try {
      if (!db) {
        const initErr = new Error(
          firebaseInitError?.message ||
            'Firestore is not initialized. Configure your VITE_FIREBASE_* environment variables.'
        ) as Error & { code?: string };
        initErr.code = firebaseInitError?.code || 'firebase/not-configured';
        throw initErr;
      }

      const ngoRef = doc(collection(db, 'ngos'));
      let certificatePath: string | undefined;
      let certificateFileName: string | undefined;
      let certificateWarning: string | undefined;

      // Certificate upload is optional: if Storage upload fails, still save the NGO and show a warning
      if (certificate) {
        try {
          if (!storage) {
            const storageMissingErr = new Error(
              'Firebase Storage is not configured (missing VITE_FIREBASE_STORAGE_BUCKET).'
            ) as Error & { code?: string };
            storageMissingErr.code = 'storage/not-configured';
            throw storageMissingErr;
          }
          const sanitizedFileName = certificate.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `certificates/${ngoRef.id}/${Date.now()}_${sanitizedFileName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, certificate, {
            contentType: certificate.type || 'application/octet-stream',
          });
          certificatePath = storagePath;
          certificateFileName = certificate.name;
        } catch (uploadErr: unknown) {
          const formattedUploadErr = formatFirebaseError(uploadErr);
          console.log('NGO certificate upload failed (continuing without file):', formattedUploadErr, uploadErr);
          certificateWarning = `Certificate upload skipped (${formattedUploadErr.code}: ${formattedUploadErr.message})`;
          onToast(
            'info',
            'Certificate upload failed — continuing registration',
            `${formattedUploadErr.code}: ${formattedUploadErr.message}`
          );
        }
      }

      const ngoDocData: Record<string, unknown> = {
        type: orgType,
        ngoName: ngoName.trim(),
        registrationNumber: registrationNumber.trim(),
        contactPerson: contactPerson.trim(),
        phone: normalizeIndianPhone(phone),
        email: email.trim(),
        address: address.trim(),
        state: stateName,
        district,
        area: area.trim(),
        pinCode: pinCode.trim(),
        services,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (certificatePath && certificateFileName) {
        ngoDocData.certificatePath = certificatePath;
        ngoDocData.certificateFileName = certificateFileName;
      }

      await setDoc(ngoRef, ngoDocData);

      setSubmittedOrg({
        name: ngoName.trim(),
        type: orgType,
        certificateWarning,
      });
      onToast(
        'success',
        `${orgType} Application Submitted`,
        certificateWarning
          ? 'Saved as pending (without certificate attachment).'
          : 'Saved to Firestore with pending verification status.'
      );
      onSuccessComplete?.();
    } catch (err: unknown) {
      const { code, message } = formatFirebaseError(err);
      console.log('NGO registration error:', { code, message, error: err });
      onToast('error', `Registration failed (${code})`, message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedOrg) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 pb-24 sm:px-6 md:pb-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-4 font-display text-2xl font-bold text-slate-900">
            Registration Received
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Thank you for registering <span className="font-semibold text-slate-900">{submittedOrg.name}</span> ({submittedOrg.type}). Your organization is currently marked as <span className="font-semibold text-slate-900">pending verification</span> and will appear in district results once approved by an administrator.
          </p>
          {submittedOrg.certificateWarning && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-left text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <span>
                Your {submittedOrg.type} was saved successfully, but the optional certificate could not be uploaded: {submittedOrg.certificateWarning}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setSubmittedOrg(null);
              setOrgType('NGO');
              setNgoName('');
              setRegistrationNumber('');
              setContactPerson('');
              setPhone('');
              setEmail('');
              setAddress('');
              setArea('');
              setPinCode('');
              setCertificate(null);
            }}
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#D32F2F] px-6 text-sm font-semibold text-white hover:bg-[#B71C1C]"
          >
            Register Another Organization
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#D32F2F]">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Register as NGO or Blood Bank
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Partner NGOs and licensed blood banks appear in district listings after administrator verification.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8" noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="block text-sm font-medium text-slate-800">
              Organization Type <span className="text-[#D32F2F]">*</span>
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Organization Type">
              {(['NGO', 'Blood Bank'] as OrganizationType[]).map((typeOption) => {
                const selected = orgType === typeOption;
                return (
                  <button
                    key={typeOption}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setOrgType(typeOption)}
                    className={`flex min-h-[48px] items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors ${
                      selected
                        ? 'border-[#D32F2F] bg-red-50/70 text-[#D32F2F]'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {typeOption}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ngo-name" className="block text-sm font-medium text-slate-800">
              {orgType === 'Blood Bank' ? 'Blood Bank Name' : 'NGO / Organization Name'}{' '}
              <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-name"
              type="text"
              value={ngoName}
              onChange={(e) => setNgoName(e.target.value)}
              placeholder={
                orgType === 'Blood Bank'
                  ? 'e.g. Lions District Blood Bank'
                  : 'e.g. Bengal Voluntary Blood Donors Forum'
              }
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.ngoName && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.ngoName)}</p>}
          </div>

          <div>
            <label htmlFor="ngo-reg" className="block text-sm font-medium text-slate-800">
              Registration / License Number <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-reg"
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="e.g. WB/SOC/2018/04921"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.registrationNumber && (
              <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.registrationNumber)}</p>
            )}
          </div>

          <div>
            <label htmlFor="ngo-contact" className="block text-sm font-medium text-slate-800">
              Contact Person Name <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-contact"
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Coordinator full name"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.contactPerson && (
              <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.contactPerson)}</p>
            )}
          </div>

          <div>
            <label htmlFor="ngo-phone" className="block text-sm font-medium text-slate-800">
              Phone Number <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.phone && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.phone)}</p>}
          </div>

          <div>
            <label htmlFor="ngo-email" className="block text-sm font-medium text-slate-800">
              Official Email <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@organization.org"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.email && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.email)}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ngo-address" className="block text-sm font-medium text-slate-800">
              Office / Center Address <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, landmark"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.address && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.address)}</p>}
          </div>

          <div>
            <label htmlFor="ngo-state" className="block text-sm font-medium text-slate-800">
              State <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="ngo-state"
              value={stateName}
              onChange={(e) => handleStateChange(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              {AVAILABLE_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ngo-district" className="block text-sm font-medium text-slate-800">
              District <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="ngo-district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ngo-area" className="block text-sm font-medium text-slate-800">
              Area Name <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-area"
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. Ballygunge, Siliguri"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.area && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.area)}</p>}
          </div>

          <div>
            <label htmlFor="ngo-pin" className="block text-sm font-medium text-slate-800">
              PIN Code <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="ngo-pin"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder="6-digit PIN"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.pinCode && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.pinCode)}</p>}
          </div>
        </div>

        {/* Services Offered */}
        <div>
          <span className="block text-sm font-medium text-slate-800">
            Services Offered <span className="text-[#D32F2F]">*</span>
          </span>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {NGO_SERVICES.map((srv) => {
              const checked = services.includes(srv);
              return (
                <label
                  key={srv}
                  className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                    checked
                      ? 'border-[#D32F2F] bg-red-50/60 font-medium text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleService(srv)}
                    className="h-4 w-4 accent-[#D32F2F]"
                  />
                  <span>{srv}</span>
                </label>
              );
            })}
          </div>
          {errors.services && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.services)}</p>}
        </div>

        {/* Optional Certificate Upload */}
        <div>
          <label htmlFor="ngo-cert" className="block text-sm font-medium text-slate-800">
            Registration Certificate (Optional · Image or PDF, max 5MB)
          </label>
          <label
            htmlFor="ngo-cert"
            className="mt-1.5 flex min-h-[64px] cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 hover:border-[#D32F2F]"
          >
            <span className="flex items-center gap-2.5 truncate">
              <FileUp className="h-5 w-5 shrink-0 text-[#D32F2F]" />
              <span className="truncate">
                {certificate ? certificate.name : 'Choose JPG, PNG, WebP or PDF file'}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-[#D32F2F]">Browse</span>
          </label>
          <input
            id="ngo-cert"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setCertificate(e.target.files?.[0] || null)}
            className="sr-only"
          />
          {errors.certificate && (
            <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.certificate)}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-base font-semibold text-white transition-colors hover:bg-[#B71C1C] disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
          <span>{submitting ? 'Submitting Registration...' : `Submit ${orgType} for Approval`}</span>
        </button>
      </form>
    </div>
  );
};
