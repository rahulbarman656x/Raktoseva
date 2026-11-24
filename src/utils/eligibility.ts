export type DonorGender = 'Male' | 'Female';

export interface EligibilityResult {
  isEligible: boolean;
  nextEligibleDate: string | null;
  daysLeft: number;
  cooldownDays: number;
}

export function getTodayIST(): string {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function diffDays(fromDateStr: string, toDateStr: string): number {
  const [y1, m1, d1] = fromDateStr.split('-').map(Number);
  const [y2, m2, d2] = toDateStr.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.ceil((ms2 - ms1) / (24 * 60 * 60 * 1000));
}

export function calculateDonorEligibility(
  gender: DonorGender,
  lastDonationDate: string | undefined | null,
  neverDonated: boolean,
  todayStr: string = getTodayIST()
): EligibilityResult {
  const cooldownDays = gender === 'Female' ? 120 : 90;

  if (neverDonated || !lastDonationDate) {
    return {
      isEligible: true,
      nextEligibleDate: null,
      daysLeft: 0,
      cooldownDays,
    };
  }

  const nextEligibleDate = addDaysToDateStr(lastDonationDate, cooldownDays);
  const daysLeft = Math.max(0, diffDays(todayStr, nextEligibleDate));
  const isEligible = todayStr >= nextEligibleDate;

  return {
    isEligible,
    nextEligibleDate,
    daysLeft,
    cooldownDays,
  };
}
