export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type UrgencyLevel = 'Emergency' | 'Within 24 hrs' | 'Within 3 days';

export type RequestStatus = 'active' | 'fulfilled';

export type NgoStatus = 'pending' | 'approved' | 'rejected';

export type OrganizationType = 'NGO' | 'Blood Bank';

export type DonorGender = 'Male' | 'Female';

export interface BloodRequestPayload {
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
}

export interface BloodRequestRecord extends BloodRequestPayload {
  id: string;
  status: RequestStatus;
  prescriptionFileName: string;
  prescriptionMimeType: string;
  prescriptionUrl: string;
  createdAt: string;
  fulfilledAt?: string;
}

export interface DonorRecord {
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

export interface PublicDonorSummary {
  id: string;
  fullName: string;
  gender: DonorGender;
  bloodGroup: BloodGroup;
  state: string;
  district: string;
  area: string;
  pinCode: string;
  lastDonationDate?: string;
  neverDonated: boolean;
  nextEligibleDate: string | null;
  isEligible: boolean;
  available: boolean;
  isSameArea?: boolean;
  isExactBloodMatch?: boolean;
}

export interface MatchedDonorResult extends PublicDonorSummary {
  phoneNumber: string;
  altPhone?: string;
  isExactBloodMatch: boolean;
  isSameArea: boolean;
}

export interface NgoRecord {
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
  isSameArea?: boolean;
}

export interface PublicOrganizationSummary {
  id: string;
  type: OrganizationType;
  ngoName: string;
  registrationNumber: string;
  contactPerson: string;
  address: string;
  state: string;
  district: string;
  area: string;
  pinCode: string;
  services: string[];
  status: NgoStatus;
  isSameArea?: boolean;
}

export interface PublicStats {
  totalDonors: number;
  totalNgos: number;
  totalFulfilled: number;
  activeRequests: number;
}

export interface RequestCreateResponse {
  request: BloodRequestRecord;
  requestAccessToken: string;
}

export interface DistrictContactsResponse {
  request: {
    id: string;
    patientName: string;
    bloodGroup: BloodGroup;
    units: number;
    urgency: UrgencyLevel;
    hospitalName: string;
    district: string;
    area: string;
    pinCode: string;
    createdAt: string;
  };
  donors: MatchedDonorResult[];
  bloodBanks: NgoRecord[];
  ngos: NgoRecord[];
}

export type AppRoute = 'home' | 'request' | 'donor' | 'ngo' | 'search' | 'admin';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
