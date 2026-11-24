import React, { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Droplet,
  ExternalLink,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { BloodRequestRecord, DonorRecord, NgoRecord } from '../types/raktoseva';

interface AdminPanelProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
  onDataChanged?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onToast, onDataChanged }) => {
  const [statusLoading, setStatusLoading] = useState(true);
  const [claimed, setClaimed] = useState(true);
  const [configuredViaEnv, setConfiguredViaEnv] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Bearer token held strictly in React state memory
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'requests' | 'ngos' | 'donors'>('requests');
  const [dataLoading, setDataLoading] = useState(false);

  const [requests, setRequests] = useState<BloodRequestRecord[]>([]);
  const [ngos, setNgos] = useState<NgoRecord[]>([]);
  const [donors, setDonors] = useState<DonorRecord[]>([]);

  const checkAdminStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/admin/status');
      if (res.ok) {
        const data = (await res.json()) as { configuredViaEnv: boolean; claimed: boolean };
        setConfiguredViaEnv(data.configuredViaEnv);
        setClaimed(data.claimed);
      }
    } catch {
      // silent
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const fetchOverview = async (token: string) => {
    setDataLoading(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setAdminToken(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to load overview');
      const data = (await res.json()) as {
        requests: BloodRequestRecord[];
        ngos: NgoRecord[];
        donors: DonorRecord[];
      };
      setRequests(data.requests);
      setNgos(data.ngos);
      setDonors(data.donors);
    } catch {
      onToast('error', 'Failed to load admin records', 'Please refresh and try again.');
    } finally {
      setDataLoading(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      onToast('error', 'Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      onToast('error', 'Passwords do not match', 'Please confirm the same password.');
      return;
    }
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/admin/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      setAdminToken(data.token);
      setClaimed(true);
      setPassword('');
      setConfirmPassword('');
      await fetchOverview(data.token);
      onToast('success', 'Admin Password Claimed', 'Admin dashboard unlocked.');
    } catch (err) {
      onToast('error', 'Setup failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect password');
      setAdminToken(data.token);
      setPassword('');
      await fetchOverview(data.token);
      onToast('success', 'Admin Signed In', 'Moderation console ready.');
    } catch (err) {
      onToast('error', 'Login failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const openAdminFile = async (url: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error('Unable to open file');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    } catch {
      onToast('error', 'Could not open file', 'Please verify your admin session.');
    }
  };

  const handleNgoDecision = async (id: string, status: 'approved' | 'rejected') => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/ngos/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Action failed');
      await fetchOverview(adminToken);
      onDataChanged?.();
      onToast('success', `NGO ${status}`, status === 'approved' ? 'Now visible in public search.' : 'Marked as rejected.');
    } catch {
      onToast('error', 'Action failed', 'Could not update NGO status.');
    }
  };

  const handleFulfillRequest = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/requests/${id}/fulfill`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error('Action failed');
      await fetchOverview(adminToken);
      onDataChanged?.();
      onToast('success', 'Request Marked Fulfilled', 'Live fulfilled counter updated.');
    } catch {
      onToast('error', 'Action failed', 'Could not update request.');
    }
  };

  const handleDelete = async (type: 'requests' | 'ngos' | 'donors', id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/${type}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      await fetchOverview(adminToken);
      onDataChanged?.();
      onToast('info', 'Entry Deleted', 'Spam or invalid record removed.');
    } catch {
      onToast('error', 'Delete failed', 'Could not remove entry.');
    }
  };

  if (statusLoading) {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#D32F2F]" />
      </div>
    );
  }

  if (!adminToken) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 pb-24 sm:px-6 md:pb-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#D32F2F]">
            <Lock className="h-5 w-5" />
          </div>

          {!claimed && !configuredViaEnv ? (
            <>
              <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">
                Set Up Admin Password
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                No <span className="font-mono text-xs">ADMIN_PASSWORD</span> secret is set yet. Create your administrator password now to lock and manage the RaktoSeva moderation panel.
              </p>
              <form onSubmit={handleClaimAdmin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="adm-new" className="block text-sm font-medium text-slate-800">
                    New Admin Password (min 8 chars)
                  </label>
                  <input
                    id="adm-new"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-[#D32F2F] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="adm-confirm" className="block text-sm font-medium text-slate-800">
                    Confirm Password
                  </label>
                  <input
                    id="adm-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-[#D32F2F] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-sm font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-60"
                >
                  {authSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Claim Admin Access</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">
                Admin Panel Sign In
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Enter the administrator password to review blood requests, approve NGOs, and remove spam entries.
              </p>
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="adm-pass" className="block text-sm font-medium text-slate-800">
                    Administrator Password
                  </label>
                  <input
                    id="adm-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="mt-1.5 min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 text-sm focus:border-[#D32F2F] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#D32F2F] px-6 text-sm font-semibold text-white hover:bg-[#B71C1C] disabled:opacity-60"
                >
                  {authSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Unlock Admin Panel</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#D32F2F]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Moderation Console</h1>
            <p className="text-sm text-slate-600">
              Manage blood requests, approve NGO registrations, and remove spam records.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdminToken(null)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap ${
              activeTab === 'requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Droplet className="h-4 w-4 text-[#D32F2F]" />
            <span>Requests ({requests.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ngos')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap ${
              activeTab === 'ngos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Building2 className="h-4 w-4 text-[#D32F2F]" />
            <span>NGOs &amp; Blood Banks ({ngos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('donors')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap ${
              activeTab === 'donors' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Users className="h-4 w-4 text-[#D32F2F]" />
            <span>Donors ({donors.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => fetchOverview(adminToken)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh Records
        </button>
      </div>

      {dataLoading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#D32F2F]" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {activeTab === 'requests' &&
            (requests.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
                No blood requests submitted yet.
              </p>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className={r.status === 'fulfilled' ? 'text-emerald-700' : 'text-[#D32F2F]'}>
                        {r.status === 'fulfilled' ? 'Fulfilled' : `Active · ${r.urgency}`}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono-nums text-slate-600">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-900">
                      {r.patientName} ({r.bloodGroup}, {r.units} unit{r.units > 1 ? 's' : ''})
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {r.hospitalName} · {r.area}, {r.district} - <span className="font-mono-nums">{r.pinCode}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Requester: {r.requesterName} · Phone: <span className="font-mono-nums">+91 {r.phone}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openAdminFile(r.prescriptionUrl)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Prescription</span>
                    </button>
                    {r.status !== 'fulfilled' && (
                      <button
                        type="button"
                        onClick={() => handleFulfillRequest(r.id)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Mark Fulfilled</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete('requests', r.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 text-xs font-semibold text-[#D32F2F] hover:bg-red-100 whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            ))}

          {activeTab === 'ngos' &&
            (ngos.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
                No NGO registrations submitted yet.
              </p>
            ) : (
              ngos.map((ngo) => (
                <div
                  key={ngo.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span
                        className={
                          ngo.type === 'Blood Bank'
                            ? 'rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[#D32F2F]'
                            : 'rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-700'
                        }
                      >
                        {ngo.type || 'NGO'}
                      </span>
                      <span
                        className={
                          ngo.status === 'approved'
                            ? 'text-emerald-700'
                            : ngo.status === 'rejected'
                            ? 'text-slate-500'
                            : 'text-amber-700'
                        }
                      >
                        Status: {ngo.status.charAt(0).toUpperCase() + ngo.status.slice(1)}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono-nums text-slate-500">Reg: {ngo.registrationNumber}</span>
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-900">{ngo.ngoName}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {ngo.contactPerson} · <span className="font-mono-nums">+91 {ngo.phone}</span> · {ngo.email}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ngo.address}, {ngo.area}, {ngo.district} - {ngo.pinCode} · {ngo.services.join(', ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ngo.certificateUrl && (
                      <button
                        type="button"
                        onClick={() => openAdminFile(ngo.certificateUrl!)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Certificate</span>
                      </button>
                    )}
                    {ngo.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleNgoDecision(ngo.id, 'approved')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approve</span>
                      </button>
                    )}
                    {ngo.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleNgoDecision(ngo.id, 'rejected')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Reject</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete('ngos', ngo.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 text-xs font-semibold text-[#D32F2F] hover:bg-red-100 whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            ))}

          {activeTab === 'donors' &&
            (donors.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
                No donors registered yet.
              </p>
            ) : (
              donors.map((d) => {
                const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
                let daysLeft = 0;
                if (!d.isEligible && d.nextEligibleDate) {
                  const [y1, m1, d1] = today.split('-').map(Number);
                  const [y2, m2, d2] = d.nextEligibleDate.split('-').map(Number);
                  daysLeft = Math.max(
                    0,
                    Math.ceil((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (24 * 60 * 60 * 1000))
                  );
                }

                return (
                  <div
                    key={d.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        {d.isEligible ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-slate-700">
                            Available after {d.nextEligibleDate} ({daysLeft} days left)
                          </span>
                        )}
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-700">{d.gender}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono-nums text-[#D32F2F]">{d.bloodGroup}</span>
                      </div>
                      <h3 className="mt-1.5 font-display text-base font-bold text-slate-900">{d.fullName}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Phone: <span className="font-mono-nums">+91 {d.phoneNumber}</span>
                        {d.altPhone ? ` · Alt: +91 ${d.altPhone}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {d.area}, {d.district} - <span className="font-mono-nums">{d.pinCode}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Last Donation:{' '}
                        <span className="font-mono-nums font-medium">
                          {d.neverDonated || !d.lastDonationDate ? 'Never donated before' : d.lastDonationDate}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        Next Eligible:{' '}
                        <span className="font-mono-nums font-medium">
                          {d.isEligible ? 'Eligible now' : d.nextEligibleDate}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete('donors', d.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-xl border border-red-200 bg-red-50 px-3.5 text-xs font-semibold text-[#D32F2F] hover:bg-red-100 sm:self-center whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                );
              })
            ))}
        </div>
      )}
    </div>
  );
};
