import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Droplet,
  FileUp,
  HeartPulse,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  AVAILABLE_STATES,
  BLOOD_GROUPS,
  INDIAN_STATES_AND_DISTRICTS,
  URGENCY_LEVELS,
} from '../data/locations';
import {
  BloodGroup,
  DistrictContactsResponse,
  RequestCreateResponse,
  UrgencyLevel,
} from '../types/raktoseva';
import {
  BilingualError,
  formatBilingualError,
  normalizeIndianPhone,
  validatePhoneField,
  validatePinField,
  validatePrescriptionFile,
  validateRequiredText,
} from '../utils/validation';

interface BloodRequestFlowProps {
  initialDistrict?: string;
  initialBloodGroup?: BloodGroup;
  onToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
  onRequestSubmitted?: () => void;
}

interface CaptchaState {
  mode: 'challenge' | 'recaptcha';
  question: string;
  token: string;
}

export const BloodRequestFlow: React.FC<BloodRequestFlowProps> = ({
  initialDistrict,
  initialBloodGroup,
  onToast,
  onRequestSubmitted,
}) => {
  const [patientName, setPatientName] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(initialBloodGroup || 'O+');
  const [units, setUnits] = useState('1');
  const [urgency, setUrgency] = useState<UrgencyLevel>('Emergency');
  const [hospitalName, setHospitalName] = useState('');
  const [stateName, setStateName] = useState('West Bengal');
  const [district, setDistrict] = useState(initialDistrict || 'Kolkata');
  const [area, setArea] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [notes, setNotes] = useState('');
  const [prescription, setPrescription] = useState<File | null>(null);

  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const [errors, setErrors] = useState<Record<string, BilingualError>>({});
  const [submitting, setSubmitting] = useState(false);
  const [contactsResult, setContactsResult] = useState<DistrictContactsResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialBloodGroup) setBloodGroup(initialBloodGroup);
    if (initialDistrict) {
      for (const [st, distList] of Object.entries(INDIAN_STATES_AND_DISTRICTS)) {
        if (distList.includes(initialDistrict)) {
          setStateName(st);
          setDistrict(initialDistrict);
          break;
        }
      }
    }
  }, [initialDistrict, initialBloodGroup]);

  const loadCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const res = await fetch('/api/captcha');
      if (res.ok) {
        const data = (await res.json()) as CaptchaState;
        setCaptcha(data);
        setCaptchaAnswer('');
      }
    } catch {
      // silent
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const districts = INDIAN_STATES_AND_DISTRICTS[stateName] || [];

  const handleStateChange = (newState: string) => {
    setStateName(newState);
    const list = INDIAN_STATES_AND_DISTRICTS[newState] || [];
    setDistrict(list[0] || '');
  };

  const handleCopyNumber = async (id: string, phoneNum: string) => {
    try {
      await navigator.clipboard.writeText(phoneNum);
      setCopiedId(id);
      onToast('success', 'Phone number copied', phoneNum);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      onToast('info', 'Phone Number', phoneNum);
    }
  };

  const validate = (): boolean => {
    const next: Record<string, BilingualError> = {};

    const ePatient = validateRequiredText(patientName, 'Patient Name', 'রোগীর নাম');
    if (ePatient) next.patientName = ePatient;

    const eReq = validateRequiredText(requesterName, 'Requester Name', 'আবেদনকারীর নাম');
    if (eReq) next.requesterName = eReq;

    const ePhone = validatePhoneField(phone, true);
    if (ePhone) next.phone = ePhone;

    const parsedUnits = Number(units);
    if (!Number.isInteger(parsedUnits) || parsedUnits < 1 || parsedUnits > 20) {
      next.units = {
        en: 'Enter between 1 and 20 blood units.',
        bn: '১ থেকে ২০-এর মধ্যে রক্তের ইউনিট সংখ্যা লিখুন।',
      };
    }

    const eHosp = validateRequiredText(hospitalName, 'Hospital Name', 'হাসপাতালের নাম');
    if (eHosp) next.hospitalName = eHosp;

    const eArea = validateRequiredText(area, 'Area Name', 'এলাকার নাম');
    if (eArea) next.area = eArea;

    const ePin = validatePinField(pinCode);
    if (ePin) next.pinCode = ePin;

    const eFile = validatePrescriptionFile(prescription);
    if (eFile) next.prescription = eFile;

    if (!captchaAnswer.trim()) {
      next.captcha = {
        en: 'Please answer the security verification question.',
        bn: 'অনুগ্রহ করে নিরাপত্তা যাচাইকরণ প্রশ্নের উত্তর দিন।',
      };
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      onToast('error', 'Please fix the highlighted fields', 'Errors are shown in English and Bengali.');
      return;
    }
    if (!prescription || !captcha) return;

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('patientName', patientName.trim());
      fd.append('requesterName', requesterName.trim());
      fd.append('phone', normalizeIndianPhone(phone));
      fd.append('bloodGroup', bloodGroup);
      fd.append('units', String(Number(units)));
      fd.append('urgency', urgency);
      fd.append('hospitalName', hospitalName.trim());
      fd.append('state', stateName);
      fd.append('district', district);
      fd.append('area', area.trim());
      fd.append('pinCode', pinCode.trim());
      if (notes.trim()) fd.append('notes', notes.trim());
      fd.append('prescription', prescription);
      fd.append('captchaToken', captcha.token);
      fd.append('captchaAnswer', captchaAnswer.trim());

      const res = await fetch('/api/requests', {
        method: 'POST',
        body: fd,
      });
      const created = await res.json();
      if (!res.ok) {
        loadCaptcha();
        throw new Error(created.error || 'Failed to submit request.');
      }

      const { request, requestAccessToken } = created as RequestCreateResponse;

      // Fetch district contacts securely via getDistrictContacts endpoint
      const contactsRes = await fetch(
        `/api/requests/${encodeURIComponent(request.id)}/contacts?token=${encodeURIComponent(requestAccessToken)}`
      );
      const contactsData = await contactsRes.json();
      if (!contactsRes.ok) {
        throw new Error(contactsData.error || 'Unable to load district contacts.');
      }

      const matched = contactsData as DistrictContactsResponse;
      setContactsResult(matched);
      onToast(
        'success',
        'Blood Request Saved',
        `Showing ${matched.donors.length} donor(s), ${matched.bloodBanks.length} blood bank(s), and ${matched.ngos.length} NGO(s) in ${request.district}.`
      );
      onRequestSubmitted?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      onToast('error', 'Submission failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (contactsResult) {
    const exactMatches = contactsResult.donors.filter((d) => d.isExactBloodMatch);
    const otherDistrictDonors = contactsResult.donors.filter((d) => !d.isExactBloodMatch);

    return (
      <div className="mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
        {/* Request Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <span>Blood Request Saved · District Contacts Unlocked</span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                {contactsResult.request.bloodGroup} Blood Needed for {contactsResult.request.patientName}
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                {contactsResult.request.units} unit(s) · {contactsResult.request.urgency} ·{' '}
                {contactsResult.request.hospitalName} · {contactsResult.request.area},{' '}
                {contactsResult.request.district} -{' '}
                <span className="font-mono-nums">{contactsResult.request.pinCode}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setContactsResult(null);
                loadCaptcha();
              }}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Submit Another Request
            </button>
          </div>
        </div>

        {/* Section A: Donors */}
        <section className="mt-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-slate-900">
              <Users className="h-5 w-5 text-[#D32F2F]" />
              <span>Donors in {contactsResult.request.district} ({contactsResult.donors.length})</span>
            </h2>
            {exactMatches.length > 0 && (
              <span className="text-sm font-semibold text-[#D32F2F]">
                {exactMatches.length} Exact {contactsResult.request.bloodGroup} Match
              </span>
            )}
          </div>

          {contactsResult.donors.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Droplet className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                No eligible donors found in this district yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {exactMatches.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-[#D32F2F]">
                    Matching Blood Group ({contactsResult.request.bloodGroup})
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {exactMatches.map((donor) => (
                      <div
                        key={donor.id}
                        className="flex flex-col justify-between rounded-2xl border-2 border-[#D32F2F] bg-red-50/30 p-5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-[#D32F2F]">
                                  Exact Blood Group Match · {donor.gender}
                                </span>
                                {donor.isSameArea && (
                                  <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    Same area
                                  </span>
                                )}
                              </div>
                              <h3 className="mt-0.5 font-display text-lg font-bold text-slate-900">
                                {donor.fullName}
                              </h3>
                            </div>
                            <span className="font-mono-nums text-xl font-extrabold text-[#D32F2F]">
                              {donor.bloodGroup}
                            </span>
                          </div>
                          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
                            <MapPin className="h-4 w-4 shrink-0 text-[#D32F2F]" />
                            <span>
                              {donor.area}, {donor.district} · <span className="font-mono-nums">{donor.pinCode}</span>
                            </span>
                          </p>
                          <p className="mt-1.5 font-mono-nums text-base font-semibold text-slate-900">
                            +91 {donor.phoneNumber}
                            {donor.altPhone ? ` · Alt: +91 ${donor.altPhone}` : ''}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2.5 border-t border-red-200/70 pt-4">
                          <a
                            href={`tel:+91${donor.phoneNumber}`}
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-4 text-sm font-semibold text-white hover:bg-[#B71C1C] whitespace-nowrap"
                          >
                            <Phone className="h-4 w-4" />
                            <span>Call</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyNumber(donor.id, donor.phoneNumber)}
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap"
                          >
                            {copiedId === donor.id ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-600" />
                            )}
                            <span>{copiedId === donor.id ? 'Copied' : 'Copy number'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {otherDistrictDonors.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-700">
                    Other Eligible Donors in {contactsResult.request.district}
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {otherDistrictDonors.map((donor) => (
                      <div
                        key={donor.id}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-slate-500">{donor.gender}</span>
                                {donor.isSameArea && (
                                  <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    Same area
                                  </span>
                                )}
                              </div>
                              <h3 className="font-display text-base font-bold text-slate-900">
                                {donor.fullName}
                              </h3>
                            </div>
                            <span className="font-mono-nums text-base font-bold text-slate-800">
                              {donor.bloodGroup}
                            </span>
                          </div>
                          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                            <span>
                              {donor.area}, {donor.district} · <span className="font-mono-nums">{donor.pinCode}</span>
                            </span>
                          </p>
                          <p className="mt-1.5 font-mono-nums text-sm font-semibold text-slate-900">
                            +91 {donor.phoneNumber}
                            {donor.altPhone ? ` · Alt: +91 ${donor.altPhone}` : ''}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                          <a
                            href={`tel:+91${donor.phoneNumber}`}
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Phone className="h-4 w-4" />
                            <span>Call</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyNumber(donor.id, donor.phoneNumber)}
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap"
                          >
                            {copiedId === donor.id ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-600" />
                            )}
                            <span>{copiedId === donor.id ? 'Copied' : 'Copy number'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section B: Blood Banks */}
        <section className="mt-10">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <HeartPulse className="h-5 w-5 text-[#D32F2F]" />
            <h2 className="font-display text-xl font-bold text-slate-900">
              Blood Banks in {contactsResult.request.district} ({contactsResult.bloodBanks.length})
            </h2>
          </div>

          {contactsResult.bloodBanks.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <HeartPulse className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                No blood banks found in this district yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {contactsResult.bloodBanks.map((bank) => (
                <div
                  key={bank.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-slate-900">{bank.ngoName}</h3>
                      {bank.isSameArea && (
                        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Same area
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Services: {bank.services.join(' · ')}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>
                        {bank.area}, {bank.district} · <span className="font-mono-nums">{bank.pinCode}</span>
                      </span>
                    </p>
                    <p className="mt-1.5 font-mono-nums text-sm font-semibold text-slate-900">
                      +91 {bank.phone}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                    <a
                      href={`tel:+91${bank.phone}`}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-4 text-sm font-semibold text-white hover:bg-[#B71C1C] whitespace-nowrap"
                    >
                      <Phone className="h-4 w-4" />
                      <span>Call</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyNumber(bank.id, bank.phone)}
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {copiedId === bank.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-slate-600" />
                      )}
                      <span>{copiedId === bank.id ? 'Copied' : 'Copy number'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section C: NGOs */}
        <section className="mt-10">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Building2 className="h-5 w-5 text-[#D32F2F]" />
            <h2 className="font-display text-xl font-bold text-slate-900">
              NGOs in {contactsResult.request.district} ({contactsResult.ngos.length})
            </h2>
          </div>

          {contactsResult.ngos.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                No NGOs found in this district yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {contactsResult.ngos.map((ngo) => (
                <div
                  key={ngo.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-slate-900">{ngo.ngoName}</h3>
                      {ngo.isSameArea && (
                        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Same area
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Services: {ngo.services.join(' · ')}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>
                        {ngo.area}, {ngo.district} · <span className="font-mono-nums">{ngo.pinCode}</span>
                      </span>
                    </p>
                    <p className="mt-1.5 font-mono-nums text-sm font-semibold text-slate-900">
                      +91 {ngo.phone}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                    <a
                      href={`tel:+91${ngo.phone}`}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Phone className="h-4 w-4" />
                      <span>Call</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyNumber(ngo.id, ngo.phone)}
                      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {copiedId === ngo.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-slate-600" />
                      )}
                      <span>{copiedId === ngo.id ? 'Copied' : 'Copy number'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Disclaimer */}
        <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-900">Disclaimer:</span> RaktoSeva only connects people. We do not sell blood. Please verify the patient&apos;s details before donating.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#D32F2F]">
          <Droplet className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Request Blood Urgently
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Submit patient and hospital details to view direct contact numbers of eligible donors, blood banks, and NGOs in the same district.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8" noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="req-patient" className="block text-sm font-medium text-slate-800">
              Patient Name <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-patient"
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Full name of patient"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.patientName && (
              <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.patientName)}</p>
            )}
          </div>

          <div>
            <label htmlFor="req-requester" className="block text-sm font-medium text-slate-800">
              Requester Name (Relative) <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-requester"
              type="text"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Your full name"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.requesterName && (
              <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.requesterName)}</p>
            )}
          </div>

          <div>
            <label htmlFor="req-phone" className="block text-sm font-medium text-slate-800">
              Phone Number (10 digits) <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9830012345"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.phone && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.phone)}</p>}
          </div>

          <div>
            <label htmlFor="req-blood" className="block text-sm font-medium text-slate-800">
              Blood Group Needed <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="req-blood"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="req-units" className="block text-sm font-medium text-slate-800">
              Units Required <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-units"
              type="number"
              min={1}
              max={20}
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.units && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.units)}</p>}
          </div>

          <div>
            <label htmlFor="req-urgency" className="block text-sm font-medium text-slate-800">
              Urgency <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="req-urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              {URGENCY_LEVELS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label} ({u.bengali})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="req-hospital" className="block text-sm font-medium text-slate-800">
              Hospital Name <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-hospital"
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              placeholder="e.g. SSKM Hospital / NRS Medical College"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.hospitalName && (
              <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.hospitalName)}</p>
            )}
          </div>

          <div>
            <label htmlFor="req-state" className="block text-sm font-medium text-slate-800">
              State <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="req-state"
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
            <label htmlFor="req-district" className="block text-sm font-medium text-slate-800">
              District <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="req-district"
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
            <label htmlFor="req-area" className="block text-sm font-medium text-slate-800">
              Area Name <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-area"
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. Bhawanipore, Salt Lake Sector V"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.area && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.area)}</p>}
          </div>

          <div>
            <label htmlFor="req-pin" className="block text-sm font-medium text-slate-800">
              PIN Code (6 digits) <span className="text-[#D32F2F]">*</span>
            </label>
            <input
              id="req-pin"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder="e.g. 700020"
              className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            />
            {errors.pinCode && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.pinCode)}</p>}
          </div>
        </div>

        {/* Prescription File Upload */}
        <div>
          <label htmlFor="req-prescription" className="block text-sm font-medium text-slate-800">
            Doctor&apos;s Prescription / Requisition Slip (Image or PDF, max 5MB) <span className="text-[#D32F2F]">*</span>
          </label>
          <label
            htmlFor="req-prescription"
            className="mt-1.5 flex min-h-[72px] cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:border-[#D32F2F]"
          >
            <span className="flex items-center gap-3 truncate">
              <FileUp className="h-5 w-5 shrink-0 text-[#D32F2F]" />
              <span className="truncate">
                {prescription
                  ? `${prescription.name} (${(prescription.size / 1024 / 1024).toFixed(2)} MB)`
                  : 'Upload JPG, PNG, WebP or PDF prescription'}
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-[#D32F2F]">Choose File</span>
          </label>
          <input
            id="req-prescription"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setPrescription(e.target.files?.[0] || null)}
            className="sr-only"
          />
          <p className="mt-1 text-xs text-slate-500">
            Viewable only by administrators for verification.
          </p>
          {errors.prescription && (
            <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.prescription)}</p>
          )}
        </div>

        {/* Additional Notes */}
        <div>
          <label htmlFor="req-notes" className="block text-sm font-medium text-slate-800">
            Additional Notes (Optional)
          </label>
          <textarea
            id="req-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ward/Bed number, blood bank counter timing, or special instructions"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
          />
        </div>

        {/* Spam Prevention Captcha */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldAlert className="h-4 w-4 text-[#D32F2F]" />
              <span>Human Verification (Spam Protection)</span>
            </span>
            <button
              type="button"
              onClick={loadCaptcha}
              disabled={captchaLoading}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${captchaLoading ? 'animate-spin' : ''}`} />
              <span>New Question</span>
            </button>
          </div>
          {captcha && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="req-captcha" className="text-sm font-medium text-slate-700">
                {captcha.question}
              </label>
              <input
                id="req-captcha"
                type="text"
                inputMode="numeric"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Enter answer"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono-nums text-sm text-slate-900 sm:w-40 focus:border-[#D32F2F] focus:outline-none"
              />
            </div>
          )}
          {errors.captcha && (
            <p className="mt-2 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.captcha)}</p>
          )}
        </div>

        {/* Disclaimer Notice */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span>
            RaktoSeva only connects people. We do not sell blood. Please verify the patient&apos;s details before donating.
          </span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-base font-semibold text-white transition-colors hover:bg-[#B71C1C] disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
          <span>{submitting ? 'Finding District Donors & Organizations...' : 'Submit Request & View Contacts'}</span>
        </button>
      </form>
    </div>
  );
};
