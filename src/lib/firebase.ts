import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

const ENV_MAP = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const ENV_VAR_NAMES: Record<keyof typeof ENV_MAP, string> = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

function isValidEnvValue(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('my_') ||
    lower.startsWith('your_') ||
    lower.includes('placeholder') ||
    lower.includes('example') ||
    lower === 'changeme'
  ) {
    return false;
  }
  return true;
}

const REQUIRED_FIRESTORE_KEYS: Array<keyof typeof ENV_MAP> = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
];

export const missingFirebaseVars: string[] = (Object.keys(ENV_MAP) as Array<keyof typeof ENV_MAP>)
  .filter((key) => !isValidEnvValue(ENV_MAP[key]))
  .map((key) => ENV_VAR_NAMES[key]);

export const isFirebaseConfigured: boolean = REQUIRED_FIRESTORE_KEYS.every((key) =>
  isValidEnvValue(ENV_MAP[key])
);

export const isFirebaseStorageConfigured: boolean =
  isFirebaseConfigured && isValidEnvValue(ENV_MAP.storageBucket);

let firebaseApp: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let firebaseInitError: { code: string; message: string } | null = null;

if (isFirebaseConfigured) {
  try {
    const firebaseConfig = {
      apiKey: ENV_MAP.apiKey!.trim(),
      authDomain: ENV_MAP.authDomain!.trim(),
      projectId: ENV_MAP.projectId!.trim(),
      ...(isValidEnvValue(ENV_MAP.storageBucket)
        ? { storageBucket: ENV_MAP.storageBucket!.trim() }
        : {}),
      ...(isValidEnvValue(ENV_MAP.messagingSenderId)
        ? { messagingSenderId: ENV_MAP.messagingSenderId!.trim() }
        : {}),
      appId: ENV_MAP.appId!.trim(),
    };

    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    if (isValidEnvValue(ENV_MAP.storageBucket)) {
      storage = getStorage(firebaseApp);
    }
  } catch (err: unknown) {
    const errObj = err as { code?: string; message?: string };
    firebaseInitError = {
      code: errObj?.code || 'firebase/init-failed',
      message: errObj?.message || 'Failed to initialize Firebase SDK.',
    };
    console.log('Firebase initialization failed:', firebaseInitError);
  }
} else {
  firebaseInitError = {
    code: 'firebase/not-configured',
    message: `Missing or placeholder Firebase environment variables: ${missingFirebaseVars.join(', ')}`,
  };
}

export { firebaseApp, db, storage, auth, firebaseInitError };
