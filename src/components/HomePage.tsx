import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Droplet,
  HeartHandshake,
  Phone,
  ShieldCheck,
  Users,
  CheckCircle2,
  Mail,
} from 'lucide-react';
import { AppRoute, PublicStats } from '../types/raktoseva';

interface HomePageProps {
  stats: PublicStats;
  statsLoading: boolean;
  onNavigate: (route: AppRoute) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ stats, statsLoading, onNavigate }) => {
  const [heroImgError, setHeroImgError] = useState(false);
  const [supportImgError, setSupportImgError] = useState(false);

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left Copy & Primary Actions */}
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-sm font-semibold tracking-wide text-[#D32F2F]">
                India Community Blood Network · West Bengal &amp; Beyond
              </p>

              <h1
                className="mt-4 font-display font-extrabold tracking-tight text-slate-900"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', lineHeight: 1.1, textWrap: 'balance' }}
              >
                Give blood, give life—every drop can save a life
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Connect directly with verified voluntary blood donors, blood banks, and registered NGOs across your district.
              </p>

              {/* Two Large Primary Buttons + Smaller NGO Button */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => onNavigate('request')}
                  className="inline-flex min-h-[54px] flex-1 items-center justify-center gap-2.5 rounded-xl bg-[#D32F2F] px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#B71C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F] whitespace-nowrap"
                >
                  <Droplet className="h-5 w-5 shrink-0" />
                  <span>I Need Blood</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('donor')}
                  className="inline-flex min-h-[54px] flex-1 items-center justify-center gap-2.5 rounded-xl border-2 border-slate-900 bg-white px-6 py-3.5 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap"
                >
                  <HeartHandshake className="h-5 w-5 shrink-0 text-[#D32F2F]" />
                  <span>Become a Donor</span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('ngo')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Building2 className="h-4 w-4 text-[#D32F2F]" />
                  <span>Register as NGO</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('search')}
                  className="inline-flex min-h-[44px] items-center gap-1.5 px-2 py-2 text-sm font-medium text-slate-600 underline-offset-4 hover:text-[#D32F2F] hover:underline whitespace-nowrap"
                >
                  <span>Browse District Directory</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Right Visual Carrier */}
            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:min-h-[360px]">
                {!heroImgError ? (
                  <img
                    src="/src/assets/images/hero_blood_donation_1795543206372.jpg"
                    alt="Volunteers and medical staff welcoming blood donors at a community center"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="h-full w-full object-cover lg:h-full"
                  />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gradient-to-br from-red-50 via-white to-slate-100 p-8 text-center">
                    <Droplet className="h-14 w-14 text-[#D32F2F]" />
                    <p className="mt-4 font-display text-lg font-bold text-slate-900">
                      RaktoSeva Community Blood Network
                    </p>
                    <p className="mt-1 max-w-xs text-sm text-slate-600">
                      Direct district-level donor &amp; NGO coordination across India
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Counters Row (Full-Width Strip Below Hero) */}
          <div className="mt-12 grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 sm:grid-cols-3 sm:gap-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Registered Donors</span>
                <Users className="h-5 w-5 text-[#D32F2F]" />
              </div>
              <p className="mt-3 font-mono-nums text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {statsLoading ? '—' : stats.totalDonors.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Verified volunteer profiles ready to help
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">NGOs &amp; Blood Banks</span>
                <Building2 className="h-5 w-5 text-[#D32F2F]" />
              </div>
              <p className="mt-3 font-mono-nums text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {statsLoading ? '—' : stats.totalNgos.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Approved blood banks, camps &amp; NGO partners
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Requests Fulfilled</span>
                <CheckCircle2 className="h-5 w-5 text-[#D32F2F]" />
              </div>
              <p className="mt-3 font-mono-nums text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {statsLoading ? '—' : stats.totalFulfilled.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Completed patient-to-donor connections
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (3 Steps) */}
      <section className="border-b border-slate-200/80 bg-slate-50/50 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              How RaktoSeva works
            </h2>
            <p className="mt-3 text-base text-slate-600">
              Three straightforward steps to connect directly with local blood donors, blood banks, and NGOs without middlemen.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="font-mono-nums text-sm font-semibold text-[#D32F2F]">01. Submit Request</p>
              <h3 className="mt-3 font-display text-xl font-bold text-slate-900">
                Share patient &amp; hospital details
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Enter the required blood group, units, hospital name, district, and upload the doctor&apos;s prescription for verification.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="font-mono-nums text-sm font-semibold text-[#D32F2F]">02. Instant District Match</p>
              <h3 className="mt-3 font-display text-xl font-bold text-slate-900">
                View eligible donors, blood banks &amp; NGOs
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                RaktoSeva immediately finds every eligible donor, approved blood bank, and NGO in the same district, highlighting exact blood group matches at the top.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="font-mono-nums text-sm font-semibold text-[#D32F2F]">03. Direct Connection</p>
              <h3 className="mt-3 font-display text-xl font-bold text-slate-900">
                Call &amp; coordinate directly
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Use one-tap calling or copy contact numbers directly from the results screen, verify patient details at the hospital, and donate safely.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy & Trust Safeguards */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {!supportImgError ? (
                  <img
                    src="/src/assets/images/community_donor_support_1795543206949.jpg"
                    alt="Volunteer healthcare coordinator verifying blood request details"
                    referrerPolicy="no-referrer"
                    onError={() => setSupportImgError(true)}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 p-8">
                    <ShieldCheck className="h-14 w-14 text-[#D32F2F]" />
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Built on donor privacy and prescription verification
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                Every blood request is verified before contact phone numbers are shared, protecting volunteers from spam while keeping emergency coordination fast.
              </p>

              <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-900">Protected Contact Numbers</dt>
                  <dd className="mt-1 text-sm text-slate-600">
                    Public search hides phone numbers. Contacts are revealed only after a verified blood request is submitted.
                  </dd>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-900">Admin-Only Prescriptions</dt>
                  <dd className="mt-1 text-sm text-slate-600">
                    Uploaded doctor prescriptions are viewable strictly by administrators via signed verification links.
                  </dd>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-900">Verified NGO Partners</dt>
                  <dd className="mt-1 text-sm text-slate-600">
                    Every NGO registration stays pending until reviewed and approved by the moderation team.
                  </dd>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <dt className="text-sm font-semibold text-slate-900">100% Non-Commercial</dt>
                  <dd className="mt-1 text-sm text-slate-600">
                    Voluntary blood donation only. Buying or selling blood is strictly prohibited under Indian law.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 pb-24 pt-12 md:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <p className="font-display text-lg font-bold text-slate-900">RaktoSeva</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
                Community blood donation connector platform serving West Bengal and neighboring states across India.
              </p>
              <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#D32F2F]" />
                  <span className="font-mono-nums">+91 33 4000 1080</span>
                  <span className="text-slate-400">·</span>
                  <span>24x7 Coordination Desk</span>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#D32F2F]" />
                  <span>support@raktoseva.org</span>
                </p>
              </div>
            </div>

            <div className="md:col-span-3">
              <p className="text-sm font-semibold text-slate-900">Quick Actions</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <button type="button" onClick={() => onNavigate('request')} className="hover:text-[#D32F2F]">
                    Request Blood
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('donor')} className="hover:text-[#D32F2F]">
                    Become a Donor / Login
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('ngo')} className="hover:text-[#D32F2F]">
                    Register an NGO
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('search')} className="hover:text-[#D32F2F]">
                    Search Directory
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-4">
              <p className="text-sm font-semibold text-slate-900">Important Disclaimer</p>
              <p className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
                RaktoSeva only connects people. We do not sell blood. Please verify the patient&apos;s details before donating.
              </p>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} RaktoSeva. Voluntary blood donation initiative.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
