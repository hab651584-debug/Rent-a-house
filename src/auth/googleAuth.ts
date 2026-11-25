import { getApp, getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_SIGN_IN_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_SIGN_IN_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

export async function signInWithGooglePopup(): Promise<{ idToken: string }> {
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  if (!idToken) {
    throw new Error('Unable to obtain a verified Google sign-in token.');
  }
  return { idToken };
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth).catch(() => {});
}
