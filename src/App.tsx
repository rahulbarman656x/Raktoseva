import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Droplet,
  HeartHandshake,
  Home,
  Info,
  Search,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { BloodRequestFlow } from './components/BloodRequestFlow';
import { DonorPortal } from './components/DonorPortal';
import { HomePage } from './components/HomePage';
import { NgoRegistration } from './components/NgoRegistration';
import { SearchPage } from './components/SearchPage';
import { AppRoute, BloodGroup, PublicStats, ToastMessage } from './types/raktoseva';

export default function App() {
  const [route, setRoute] = useState<AppRoute>('home');
  const [prefillDistrict, setPrefillDistrict] = useState<string | undefined>(undefined);
  const [prefillBloodGroup, setPrefillBloodGroup] = useState<BloodGroup | undefined>(undefined);

  const [stats, setStats] = useState<PublicStats>({
    totalDonors: 0,
    totalNgos: 0,
    totalFulfilled: 0,
    activeRequests: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = (await res.json()) as PublicStats;
        setStats(data);
      }
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, description?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const navigate = (nextRoute: AppRoute) => {
    if (nextRoute !== 'request') {
      setPrefillDistrict(undefined);
      setPrefillBloodGroup(undefined);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRequestBloodPrefill = (district?: string, bloodGroup?: BloodGroup) => {
    setPrefillDistrict(district);
    setPrefillBloodGroup(bloodGroup);
    setRoute('request');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="font-display text-xl font-extrabold tracking-tight text-[#D32F2F] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D32F2F]"
          >
            RaktoSeva
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex" aria-label="Primary">
            <button
              type="button"
              onClick={() => navigate('home')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                route === 'home' ? 'font-semibold text-[#D32F2F]' : ''
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate('search')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                route === 'search' ? 'font-semibold text-[#D32F2F]' : ''
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => navigate('donor')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                route === 'donor' ? 'font-semibold text-[#D32F2F]' : ''
              }`}
            >
              Donor
            </button>
            <button
              type="button"
              onClick={() => navigate('ngo')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                route === 'ngo' ? 'font-semibold text-[#D32F2F]' : ''
              }`}
            >
              NGOs
            </button>
            <button
              type="button"
              onClick={() => navigate('admin')}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 ${
                route === 'admin' ? 'font-semibold text-[#D32F2F]' : ''
              }`}
            >
              Admin
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('request')}
              className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-[#D32F2F] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B71C1C] whitespace-nowrap shrink-0"
            >
              Request Blood
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {route === 'home' && (
          <HomePage stats={stats} statsLoading={statsLoading} onNavigate={navigate} />
        )}
        {route === 'request' && (
          <BloodRequestFlow
            initialDistrict={prefillDistrict}
            initialBloodGroup={prefillBloodGroup}
            onToast={addToast}
            onRequestSubmitted={fetchStats}
          />
        )}
        {route === 'donor' && (
          <DonorPortal onToast={addToast} onDonorChanged={fetchStats} />
        )}
        {route === 'ngo' && (
          <NgoRegistration onToast={addToast} onSuccessComplete={fetchStats} />
        )}
        {route === 'search' && (
          <SearchPage
            onRequestBloodPrefill={handleRequestBloodPrefill}
            onToast={addToast}
          />
        )}
        {route === 'admin' && (
          <AdminPanel onToast={addToast} onDataChanged={fetchStats} />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb Zone Ergonomics, <=15% aggregate sticky height) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 grid h-14 grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        aria-label="Mobile Navigation"
      >
        <button
          type="button"
          onClick={() => navigate('home')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            route === 'home' ? 'text-[#D32F2F]' : 'text-slate-600'
          }`}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('request')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            route === 'request' ? 'text-[#D32F2F]' : 'text-slate-600'
          }`}
        >
          <Droplet className="h-5 w-5" />
          <span>Need Blood</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('search')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            route === 'search' ? 'text-[#D32F2F]' : 'text-slate-600'
          }`}
        >
          <Search className="h-5 w-5" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('donor')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            route === 'donor' ? 'text-[#D32F2F]' : 'text-slate-600'
          }`}
        >
          <HeartHandshake className="h-5 w-5" />
          <span>Donor</span>
        </button>
      </nav>

      {/* Toast Container */}
      <div
        className="pointer-events-none fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2 md:bottom-6 md:top-auto"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
          >
            {t.type === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
            {t.type === 'error' && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#D32F2F]" />}
            {t.type === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" />}
            <div className="flex-1 text-sm">
              <p className="font-semibold text-slate-900">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-slate-600">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
