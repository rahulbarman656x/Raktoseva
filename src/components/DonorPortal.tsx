import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Loader2,
  LogOut,
  Phone,
  Smartphone,
} from 'lucide-react';
import {
  AVAILABLE_STATES,
  BLOOD_GROUPS,
  INDIAN_STATES_AND_DISTRICTS,
} from '../data/locations';
import { BloodGroup, BloodRequestRecord, DonorGender, DonorRecord } from '../types/raktoseva';
import { calculateDonorEligibility, getTodayIST } from '../utils/eligibility';
import {
  BilingualError,
  formatBilingualError,
  normalizeIndianPhone,
  validateLastDonationDate,
  validatePhoneField,
  validatePinField,
  validateRequiredText,
} from '../utils/validation';

interface DonorPortalProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
  onDonorChanged?: () => void;
}

export const DonorPortal: React.FC<DonorPortalProps> = ({ onToast, onDonorChanged }) => {
  const [tab, setTab] = useState<'register' | 'login'>('register');
  const todayStr = useMemo(() => getTodayIST(), []);

  // Registration state
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<DonorGender | ''>('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [stateName, setStateName] = useState('West Bengal');
  const [district, setDistrict] = useState('Kolkata');
  const [area, setArea] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [lastDonationDate, setLastDonationDate] = useState('');
  const [neverDonated, setNeverDonated] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [errors, setErrors] = useState<Record<string, BilingualError>>({});
  const [submitting, setSubmitting] = useState(false);

  // OTP Login + Session state (in-memory Bearer token)
  const [loginPhone, setLoginPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [demoOtpHint, setDemoOtpHint] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const [donorToken, setDonorToken] = useState<string | null>(null);
  const [donorProfile, setDonorProfile] = useState<DonorRecord | null>(null);
  const [districtRequests, setDistrictRequests] = useState<BloodRequestRecord[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  const districts = INDIAN_STATES_AND_DISTRICTS[stateName] || [];

  const liveRegEligibility = useMemo(() => {
    if (!gender) return null;
    if (!neverDonated && (!lastDonationDate || lastDonationDate > todayStr)) return null;
    return calculateDonorEligibility(gender, lastDonationDate || undefined, neverDonated, todayStr);
  }, [gender, lastDonationDate, neverDonated, todayStr]);

  const handleStateChange = (newState: string) => {
    setStateName(newState);
    const list = INDIAN_STATES_AND_DISTRICTS[newState] || [];
    setDistrict(list[0] || '');
  };

  const loadDistrictRequests = async (token: string) => {
    try {
      const res = await fetch('/api/donors/me/requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { requests: BloodRequestRecord[] };
        setDistrictRequests(data.requests);
      }
    } catch {
      // ignore
    }
  };

  const validateRegistration = (): boolean => {
    const next: Record<string, BilingualError> = {};
    const eName = validateRequiredText(fullName, 'Full Name', 'সম্পূর্ণ নাম');
    if (eName) next.fullName = eName;

    if (!gender) {
      next.gender = {
        en: 'Please select your gender (Male or Female).',
        bn: 'অনুগ্রহ করে আপনার লিঙ্গ (পুরুষ বা মহিলা) নির্বাচন করুন।',
      };
    }

    const ePhone = validatePhoneField(phoneNumber, true);
    if (ePhone) next.phoneNumber = ePhone;

    if (altPhone.trim()) {
      const eAlt = validatePhoneField(altPhone, false);
      if (eAlt) next.altPhone = eAlt;
    }

    const eArea = validateRequiredText(area, 'Area Name', 'এলাকার নাম');
    if (eArea) next.area = eArea;

    const ePin = validatePinField(pinCode);
    if (ePin) next.pinCode = ePin;

    const eDate = validateLastDonationDate(lastDonationDate, neverDonated, todayStr);
    if (eDate) next.lastDonationDate = eDate;

    if (!consentGiven) {
      next.consent = {
        en: 'Please agree to share your details with people who need blood in your district.',
        bn: 'আপনার জেলার রক্তের প্রয়োজনে থাকা মানুষদের সাথে তথ্য শেয়ার করার সম্মতি দিন।',
      };
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRegistration()) {
      onToast('error', 'Please fix the highlighted fields', 'Check English & Bengali error hints.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          gender,
          bloodGroup,
          phoneNumber: normalizeIndianPhone(phoneNumber),
          altPhone: altPhone.trim() ? normalizeIndianPhone(altPhone) : undefined,
          state: stateName,
          district,
          area: area.trim(),
          pinCode: pinCode.trim(),
          lastDonationDate: neverDonated ? undefined : lastDonationDate,
          neverDonated,
          consentGiven,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      setDonorToken(data.token);
      setDonorProfile(data.donor);
      await loadDistrictRequests(data.token);
      onDonorChanged?.();
      onToast(
        'success',
        'Donor Registered',
        data.donor.isEligible
          ? 'You are eligible and active in your district directory.'
          : `Registered! You will become available after ${data.donor.nextEligibleDate}.`
      );
    } catch (err) {
      onToast('error', 'Registration failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePhoneField(loginPhone, true);
    if (err) {
      onToast('error', 'Invalid Phone Number', formatBilingualError(err));
      return;
    }

    setOtpLoading(true);
    try {
      const res = await fetch('/api/donors/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizeIndianPhone(loginPhone) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send OTP.');
      setOtpSent(true);
      setDemoOtpHint(data.demoOtp || null);
      onToast('success', 'OTP Ready', data.message);
    } catch (err) {
      onToast('error', 'OTP Error', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setOtpLoading(true);
    try {
      const res = await fetch('/api/donors/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizeIndianPhone(loginPhone),
          otp: otpCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OTP verification failed.');

      setDonorToken(data.token);
      setDonorProfile(data.donor);
      await loadDistrictRequests(data.token);
      onToast('success', 'Signed In', `Welcome back, ${data.donor.fullName}`);
    } catch (err) {
      onToast('error', 'Verification failed', err instanceof Error ? err.message : 'Incorrect OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorToken || !donorProfile) return;

    const dateErr = validateLastDonationDate(
      donorProfile.lastDonationDate || '',
      donorProfile.neverDonated,
      todayStr
    );
    if (dateErr) {
      onToast('error', 'Invalid Last Donation Date', formatBilingualError(dateErr));
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch('/api/donors/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${donorToken}`,
        },
        body: JSON.stringify({
          fullName: donorProfile.fullName,
          gender: donorProfile.gender,
          bloodGroup: donorProfile.bloodGroup,
          state: donorProfile.state,
          district: donorProfile.district,
          area: donorProfile.area,
          pinCode: donorProfile.pinCode,
          neverDonated: donorProfile.neverDonated,
          lastDonationDate: donorProfile.neverDonated ? undefined : donorProfile.lastDonationDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed.');
      setDonorProfile(data.donor);
      await loadDistrictRequests(donorToken);
      onDonorChanged?.();
      onToast('success', 'Profile Updated', 'Eligibility status automatically recalculated.');
    } catch (err) {
      onToast('error', 'Update failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (donorProfile && donorToken) {
    const profileDistricts =
      INDIAN_STATES_AND_DISTRICTS[donorProfile.state] || INDIAN_STATES_AND_DISTRICTS['West Bengal'];
    const currentElig = calculateDonorEligibility(
      donorProfile.gender || 'Male',
      donorProfile.lastDonationDate,
      donorProfile.neverDonated,
      todayStr
    );

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold text-[#D32F2F]">
              Verified Donor Account · {donorProfile.gender}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
              {donorProfile.fullName} · <span className="text-[#D32F2F]">{donorProfile.bloodGroup}</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Phone: <span className="font-mono-nums">+91 {donorProfile.phoneNumber}</span> · {donorProfile.area}, {donorProfile.district}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {donorProfile.neverDonated
                ? 'Last Donation: Never donated before'
                : `Last Donation: ${donorProfile.lastDonationDate} · Cooldown: ${currentElig.cooldownDays} days (${donorProfile.gender})`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {currentElig.isEligible ? (
              <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Available</span>
              </span>
            ) : (
              <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                <Clock className="h-4 w-4 text-slate-500" />
                <span>
                  Available after {currentElig.nextEligibleDate} ({currentElig.daysLeft} days left)
                </span>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setDonorToken(null);
                setDonorProfile(null);
                setOtpSent(false);
                setOtpCode('');
                setDemoOtpHint(null);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Edit Details & Log New Donation */}
        <form onSubmit={handleUpdateProfile} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Update Details &amp; Last Donation Date
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Availability is calculated automatically: {donorProfile.gender === 'Female' ? '120 days' : '90 days'} cooldown after your last donation date.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                value={donorProfile.fullName}
                onChange={(e) => setDonorProfile({ ...donorProfile, fullName: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Gender</label>
              <select
                value={donorProfile.gender}
                onChange={(e) => setDonorProfile({ ...donorProfile, gender: e.target.value as DonorGender })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="Male">Male (90-day interval)</option>
                <option value="Female">Female (120-day interval)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Blood Group</label>
              <select
                value={donorProfile.bloodGroup}
                onChange={(e) => setDonorProfile({ ...donorProfile, bloodGroup: e.target.value as BloodGroup })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">District</label>
              <select
                value={donorProfile.district}
                onChange={(e) => setDonorProfile({ ...donorProfile, district: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              >
                {profileDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Area</label>
              <input
                type="text"
                value={donorProfile.area}
                onChange={(e) => setDonorProfile({ ...donorProfile, area: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">PIN Code</label>
              <input
                type="text"
                maxLength={6}
                value={donorProfile.pinCode}
                onChange={(e) => setDonorProfile({ ...donorProfile, pinCode: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 font-mono-nums text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                Last Donation Date <span className="text-[#D32F2F]">*</span>
              </label>
              <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="date"
                  max={todayStr}
                  disabled={donorProfile.neverDonated}
                  value={donorProfile.neverDonated ? '' : donorProfile.lastDonationDate || ''}
                  onChange={(e) =>
                    setDonorProfile({
                      ...donorProfile,
                      lastDonationDate: e.target.value,
                      neverDonated: false,
                    })
                  }
                  className="min-h-[44px] rounded-xl border border-slate-300 px-3 font-mono-nums text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={donorProfile.neverDonated}
                    onChange={(e) =>
                      setDonorProfile({
                        ...donorProfile,
                        neverDonated: e.target.checked,
                        lastDonationDate: e.target.checked ? undefined : donorProfile.lastDonationDate,
                      })
                    }
                    className="h-4 w-4 accent-[#D32F2F]"
                  />
                  <span>I have never donated blood before</span>
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Save &amp; Recalculate Eligibility</span>
          </button>
        </form>

        {/* Active Requests in Donor's District */}
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Active Blood Requests in {donorProfile.district} ({districtRequests.length})
          </h2>
          {districtRequests.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No active emergency requests in your district right now.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {districtRequests.map((reqItem) => (
                <div key={reqItem.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#D32F2F]">{reqItem.urgency}</p>
                      <h3 className="mt-0.5 font-display text-base font-bold text-slate-900">
                        {reqItem.patientName}
                      </h3>
                    </div>
                    <span className="font-mono-nums text-lg font-bold text-[#D32F2F]">{reqItem.bloodGroup}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {reqItem.units} unit(s) · {reqItem.hospitalName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {reqItem.area}, {reqItem.district} - {reqItem.pinCode}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <a
                      href={`tel:+91${reqItem.phone}`}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#D32F2F] px-3.5 text-xs font-semibold text-white hover:bg-[#B71C1C]"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>Call Relative</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#D32F2F]">
          <HeartHandshake className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Donor Registration &amp; Portal
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Eligibility is verified automatically: Male donors can donate every 90 days and Female donors every 120 days.
          </p>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="mt-6 inline-flex rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setTab('register')}
          className={`min-h-[44px] rounded-lg px-5 text-sm font-semibold transition-colors whitespace-nowrap ${
            tab === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Become a Donor
        </button>
        <button
          type="button"
          onClick={() => setTab('login')}
          className={`min-h-[44px] rounded-lg px-5 text-sm font-semibold transition-colors whitespace-nowrap ${
            tab === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Donor Login (Phone OTP)
        </button>
      </div>

      {tab === 'register' ? (
        <form onSubmit={handleRegister} className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8" noValidate>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="dnr-name" className="block text-sm font-medium text-slate-800">
                Full Name <span className="text-[#D32F2F]">*</span>
              </label>
              <input
                id="dnr-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
              />
              {errors.fullName && (
                <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.fullName)}</p>
              )}
            </div>

            {/* Required Gender Selection */}
            <div>
              <span className="block text-sm font-medium text-slate-800">
                Gender <span className="text-[#D32F2F]">*</span>
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-2.5">
                {(['Male', 'Female'] as DonorGender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`min-h-[48px] rounded-xl border px-3.5 text-sm font-semibold transition-colors ${
                      gender === g
                        ? 'border-[#D32F2F] bg-red-50 text-[#D32F2F]'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Used to enforce safe donation intervals (90 days Male / 120 days Female).
              </p>
              {errors.gender && (
                <p className="mt-1 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.gender)}</p>
              )}
            </div>

            <div>
              <label htmlFor="dnr-blood" className="block text-sm font-medium text-slate-800">
                Blood Group <span className="text-[#D32F2F]">*</span>
              </label>
              <select
                id="dnr-blood"
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
              <label htmlFor="dnr-phone" className="block text-sm font-medium text-slate-800">
                Phone Number (10 digits) <span className="text-[#D32F2F]">*</span>
              </label>
              <input
                id="dnr-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 9830012345"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
              />
              {errors.phoneNumber && (
                <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.phoneNumber)}</p>
              )}
            </div>

            <div>
              <label htmlFor="dnr-alt" className="block text-sm font-medium text-slate-800">
                Alternative Phone Number (Optional)
              </label>
              <input
                id="dnr-alt"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="Optional backup number"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
              />
              {errors.altPhone && (
                <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.altPhone)}</p>
              )}
            </div>

            <div>
              <label htmlFor="dnr-state" className="block text-sm font-medium text-slate-800">
                State <span className="text-[#D32F2F]">*</span>
              </label>
              <select
                id="dnr-state"
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
              <label htmlFor="dnr-district" className="block text-sm font-medium text-slate-800">
                District <span className="text-[#D32F2F]">*</span>
              </label>
              <select
                id="dnr-district"
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
              <label htmlFor="dnr-area" className="block text-sm font-medium text-slate-800">
                Area <span className="text-[#D32F2F]">*</span>
              </label>
              <input
                id="dnr-area"
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Jadavpur, Dum Dum"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
              />
              {errors.area && <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.area)}</p>}
            </div>

            <div>
              <label htmlFor="dnr-pin" className="block text-sm font-medium text-slate-800">
                PIN Code <span className="text-[#D32F2F]">*</span>
              </label>
              <input
                id="dnr-pin"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="6-digit PIN"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
              />
              {errors.pinCode && (
                <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.pinCode)}</p>
              )}
            </div>

            {/* Mandatory Last Donation Date + Never Donated Checkbox */}
            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#D32F2F]" />
                <label htmlFor="dnr-last" className="text-sm font-medium text-slate-800">
                  Last Donation Date <span className="text-[#D32F2F]">*</span>
                </label>
              </div>

              <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  id="dnr-last"
                  type="date"
                  max={todayStr}
                  disabled={neverDonated}
                  value={neverDonated ? '' : lastDonationDate}
                  onChange={(e) => setLastDonationDate(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono-nums text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-200/70 disabled:text-slate-400 sm:w-56"
                />

                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={neverDonated}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNeverDonated(checked);
                      if (checked) setLastDonationDate('');
                    }}
                    className="h-5 w-5 shrink-0 accent-[#D32F2F]"
                  />
                  <span>I have never donated blood before</span>
                </label>
              </div>

              {errors.lastDonationDate && (
                <p className="mt-2 text-xs font-medium text-[#D32F2F]">
                  {formatBilingualError(errors.lastDonationDate)}
                </p>
              )}

              {liveRegEligibility && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Automatic Eligibility Status:</span>
                    {liveRegEligibility.isEligible ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Available</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-200/80 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        <span>
                          Available after {liveRegEligibility.nextEligibleDate} ({liveRegEligibility.daysLeft} days left)
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Updated Consent Checkbox */}
          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#D32F2F]"
              />
              <span>
                I agree to share my name, blood group and phone number with people who need blood in my district.
              </span>
            </label>
            {errors.consent && (
              <p className="mt-1.5 text-xs font-medium text-[#D32F2F]">{formatBilingualError(errors.consent)}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-base font-semibold text-white transition-colors hover:bg-[#B71C1C] disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
            <span>{submitting ? 'Registering Donor Profile...' : 'Complete Donor Registration'}</span>
          </button>
        </form>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Smartphone className="h-5 w-5 text-[#D32F2F]" />
            <h2 className="font-display text-lg font-bold">Sign in with Phone OTP</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Enter your registered 10-digit Phone Number to receive a one-time passcode and update your last donation date.
          </p>

          {!otpSent ? (
            <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
              <div>
                <label htmlFor="otp-phone" className="block text-sm font-medium text-slate-800">
                  Registered Phone Number
                </label>
                <input
                  id="otp-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-sm focus:border-[#D32F2F] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={otpLoading}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-sm font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-60"
              >
                {otpLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Send Verification OTP</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
              {demoOtpHint && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
                  Preview Verification OTP: <span className="font-mono-nums font-bold">{demoOtpHint}</span>
                </div>
              )}
              <div>
                <label htmlFor="otp-code" className="block text-sm font-medium text-slate-800">
                  Enter 6-Digit OTP
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit OTP"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 font-mono-nums text-base tracking-widest focus:border-[#D32F2F] focus:outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={otpLoading}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-sm font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-60"
                >
                  {otpLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Verify &amp; Login</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode('');
                    setDemoOtpHint(null);
                  }}
                  className="min-h-[48px] rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change Number
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
