import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Droplet, HeartPulse, Lock, MapPin, Search, Users } from 'lucide-react';
import { ALL_DISTRICTS, BLOOD_GROUPS } from '../data/locations';
import { BloodGroup, PublicDonorSummary, PublicOrganizationSummary } from '../types/raktoseva';

interface SearchPageProps {
  onRequestBloodPrefill: (district?: string, bloodGroup?: BloodGroup) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onRequestBloodPrefill, onToast }) => {
  const [district, setDistrict] = useState('Kolkata');
  const [searchedDistrict, setSearchedDistrict] = useState('Kolkata');
  const [area, setArea] = useState('');
  const [bloodGroup, setBloodGroup] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [donors, setDonors] = useState<PublicDonorSummary[]>([]);
  const [organizations, setOrganizations] = useState<PublicOrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'donors' | 'blood_banks' | 'ngos'>('all');

  const fetchResults = async (d: string, a: string, bg: string, g: string) => {
    if (!d.trim()) {
      onToast('error', 'District is required', 'Please select a district to search.');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('district', d);
      if (a.trim()) params.set('area', a.trim());
      if (bg) params.set('bloodGroup', bg);
      if (g) params.set('gender', g);
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const data = (await res.json()) as {
        district?: string;
        donors: PublicDonorSummary[];
        organizations: PublicOrganizationSummary[];
      };
      setSearchedDistrict(data.district || d);
      setDonors(data.donors || []);
      setOrganizations(data.organizations || []);
    } catch {
      onToast('error', 'Unable to load directory', 'Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults('Kolkata', '', '', '');
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchResults(district, area, bloodGroup, gender);
  };

  const handleReset = () => {
    setDistrict('Kolkata');
    setArea('');
    setBloodGroup('');
    setGender('');
    fetchResults('Kolkata', '', '', '');
  };

  const bloodBanks = organizations.filter((o) => o.type === 'Blood Bank');
  const ngos = organizations.filter((o) => o.type !== 'Blood Bank');

  // If no donors are found in the district, always show approved NGOs & Blood Banks of that district instead
  const noDonorsFallback = !loading && donors.length === 0;
  const showDonors = activeTab === 'all' || activeTab === 'donors';
  const showBloodBanks = activeTab === 'all' || activeTab === 'blood_banks' || noDonorsFallback;
  const showNgos = activeTab === 'all' || activeTab === 'ngos' || noDonorsFallback;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Search Eligible Donors, Blood Banks &amp; NGOs
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Select a district to view all eligible donors (90+ days since last donation for Male, 120+ days for Female) and approved organizations across that entire district. Area or PIN code sorts local matches to the top without hiding other district donors.
        </p>
      </div>

      {/* Privacy Notice Banner */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
          <Lock className="h-4 w-4 shrink-0 text-[#D32F2F]" />
          <span>Submit a blood request to view contact numbers.</span>
        </div>
        <button
          type="button"
          onClick={() => onRequestBloodPrefill(searchedDistrict || undefined, (bloodGroup as BloodGroup) || undefined)}
          className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#D32F2F] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#B71C1C] whitespace-nowrap"
        >
          Submit Blood Request
        </button>
      </div>

      {/* Filter Bar */}
      <form
        onSubmit={handleFilterSubmit}
        className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="search-district" className="block text-sm font-medium text-slate-700">
              District <span className="text-[#D32F2F]">*</span>
            </label>
            <select
              id="search-district"
              required
              value={district}
              onChange={(e) => {
                const nextDist = e.target.value;
                setDistrict(nextDist);
                fetchResults(nextDist, area, bloodGroup, gender);
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              {ALL_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-area" className="block text-sm font-medium text-slate-700">
              Area or PIN Code <span className="text-xs font-normal text-slate-500">(Sort priority)</span>
            </label>
            <input
              id="search-area"
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. Salt Lake or 700091"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#D32F2F] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="search-blood" className="block text-sm font-medium text-slate-700">
              Blood Group <span className="text-xs font-normal text-slate-500">(Priority)</span>
            </label>
            <select
              id="search-blood"
              value={bloodGroup}
              onChange={(e) => {
                const nextBg = e.target.value;
                setBloodGroup(nextBg);
                fetchResults(district, area, nextBg, gender);
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              <option value="">All Blood Groups</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-gender" className="block text-sm font-medium text-slate-700">
              Gender <span className="text-xs font-normal text-slate-500">(Optional)</span>
            </label>
            <select
              id="search-gender"
              value={gender}
              onChange={(e) => {
                const nextGender = e.target.value;
                setGender(nextGender);
                fetchResults(district, area, bloodGroup, nextGender);
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#D32F2F] focus:outline-none"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B71C1C] whitespace-nowrap"
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>
      </form>

      {/* Total Count Summary + Segmented View Tabs */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-display text-lg font-bold text-slate-900">
            {loading
              ? `Searching ${district} district...`
              : `${donors.length} ${donors.length === 1 ? 'donor' : 'donors'} found in ${searchedDistrict} district`}
          </p>
          {!loading && (
            <p className="mt-0.5 text-xs text-slate-500">
              Also in {searchedDistrict}: {bloodBanks.length} Blood Bank{bloodBanks.length === 1 ? '' : 's'} · {ngos.length} NGO{ngos.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({donors.length + organizations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('donors')}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'donors' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Eligible Donors ({donors.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blood_banks')}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'blood_banks' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Blood Banks ({bloodBanks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ngos')}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'ngos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            NGOs ({ngos.length})
          </button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {showDonors && (
            <div>
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Users className="h-5 w-5 text-[#D32F2F]" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Eligible Blood Donors in {searchedDistrict} ({donors.length})
                </h2>
              </div>

              {donors.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
                  <Droplet className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    No eligible donors found in {searchedDistrict} district{gender ? ` for ${gender}` : ''}.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Displaying approved Blood Banks and NGOs registered in {searchedDistrict} district below.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {donors.map((d) => (
                    <div
                      key={d.id}
                      className={`flex flex-col justify-between rounded-2xl p-5 ${
                        d.isExactBloodMatch
                          ? 'border-2 border-[#D32F2F] bg-red-50/20'
                          : 'border border-slate-200 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {d.isSameArea && (
                            <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              Same area
                            </span>
                          )}
                          {d.isExactBloodMatch && (
                            <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-[#D32F2F]">
                              Matches {d.bloodGroup}
                            </span>
                          )}
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-display text-base font-bold text-slate-900">
                              {d.fullName}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {d.gender} ·{' '}
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Available
                              </span>
                            </p>
                          </div>
                          <span className="font-mono-nums text-base font-bold text-[#D32F2F]">
                            {d.bloodGroup}
                          </span>
                        </div>

                        <p className="mt-2.5 flex items-center gap-1.5 text-sm text-slate-600">
                          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                          <span>
                            {d.area} · {d.district} · <span className="font-mono-nums">{d.pinCode}</span>
                          </span>
                        </p>

                        <p className="mt-1.5 text-xs text-slate-500">
                          Last donation:{' '}
                          <span className="font-mono-nums font-medium text-slate-700">
                            {d.neverDonated || !d.lastDonationDate ? 'Never donated before' : d.lastDonationDate}
                          </span>
                        </p>
                      </div>

                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <p className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>Submit a blood request to view contact numbers.</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => onRequestBloodPrefill(d.district, d.bloodGroup)}
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-[#D32F2F] whitespace-nowrap"
                        >
                          <Droplet className="h-4 w-4" />
                          <span>Submit Blood Request</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showBloodBanks && (
            <div>
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <HeartPulse className="h-5 w-5 text-[#D32F2F]" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Approved Blood Banks in {searchedDistrict} ({bloodBanks.length})
                </h2>
              </div>

              {bloodBanks.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
                  <HeartPulse className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    No blood banks found in {searchedDistrict} district yet.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {bloodBanks.map((bank) => (
                    <div
                      key={bank.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-[#D32F2F]">
                            Blood Bank
                          </span>
                          {bank.isSameArea && (
                            <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              Same area
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-display text-base font-bold text-slate-900">
                          {bank.ngoName}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Reg. <span className="font-mono-nums">{bank.registrationNumber}</span> · Contact: {bank.contactPerson}
                        </p>
                        <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span>
                            {bank.area}, {bank.district} · <span className="font-mono-nums">{bank.pinCode}</span>
                          </span>
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          {bank.services.join(' · ')}
                        </p>
                      </div>

                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <p className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>Submit a blood request to view contact numbers.</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => onRequestBloodPrefill(bank.district, (bloodGroup as BloodGroup) || undefined)}
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:border-[#D32F2F] hover:text-[#D32F2F] whitespace-nowrap"
                        >
                          <Droplet className="h-4 w-4 text-[#D32F2F]" />
                          <span>Submit Blood Request</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showNgos && (
            <div>
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Building2 className="h-5 w-5 text-[#D32F2F]" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Approved Partner NGOs in {searchedDistrict} ({ngos.length})
                </h2>
              </div>

              {ngos.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    No approved NGOs found in {searchedDistrict} district yet.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Organizations registered by the community appear here once verified by an administrator.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ngos.map((ngo) => (
                    <div
                      key={ngo.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            NGO
                          </span>
                          {ngo.isSameArea && (
                            <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              Same area
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-display text-base font-bold text-slate-900">
                          {ngo.ngoName}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Reg. <span className="font-mono-nums">{ngo.registrationNumber}</span> · Contact: {ngo.contactPerson}
                        </p>
                        <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span>
                            {ngo.area}, {ngo.district} · <span className="font-mono-nums">{ngo.pinCode}</span>
                          </span>
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          {ngo.services.join(' · ')}
                        </p>
                      </div>

                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <p className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>Submit a blood request to view contact numbers.</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => onRequestBloodPrefill(ngo.district, (bloodGroup as BloodGroup) || undefined)}
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition-colors hover:border-[#D32F2F] hover:text-[#D32F2F] whitespace-nowrap"
                        >
                          <Droplet className="h-4 w-4 text-[#D32F2F]" />
                          <span>Submit Blood Request</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
