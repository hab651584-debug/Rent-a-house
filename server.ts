import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { dbStore, hashPassword, verifyPassword } from './server/store.ts';
import type { StoredUser } from './server/store.ts';
import { buildProjectZipBuffer } from './server/zipExport.ts';
import type {
  AdminMetrics,
  AppNotification,
  Conversation,
  ModerationReport,
  PropertyListing,
  PropertyStatus,
  RentalRequest,
  RequestStatus,
  UserProfile,
  UserRole,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface TokenPayload {
  uid: string;
  role: UserRole;
  exp: number;
}

interface AuthedRequest extends Request {
  user?: StoredUser;
}

function signToken(payload: TokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.uid || !parsed.role || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeUser(user: StoredUser): UserProfile {
  return {
    uid: user.uid,
    role: user.role,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    photoURL: user.photoURL,
    preferredCity: user.preferredCity,
    accountStatus: user.accountStatus,
    verificationStatus: user.verificationStatus,
    verifiedAt: user.verifiedAt,
    showPhonePublicly: user.showPhonePublicly,
    showEmailPublicly: user.showEmailPublicly,
    sellerRoleLabel: user.sellerRoleLabel,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2_500_000) return false;
  if (trimmed.startsWith('/src/assets/')) return true;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) return true;
  return false;
}

function cleanText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function getConfiguredAdminPasscode(): string {
  const raw = (process.env.ADMIN_PASSCODE || '').trim();
  if (!raw || raw === '""' || raw === "''" || raw === 'MY_ADMIN_PASSCODE') {
    return '';
  }
  return raw;
}

const FIREBASE_PROJECT_ID = (() => {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    return (parsed.projectId || '').trim();
  } catch {
    return '';
  }
})();

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedGoogleCerts && cachedGoogleCerts.expiresAt > now) {
    return cachedGoogleCerts.certs;
  }
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error('Failed to load Google public signing certificates.');
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedGoogleCerts = {
    certs,
    expiresAt: now + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

function safeGoogleAvatarUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.length > 512) return '';
  if (/^https:\/\/[a-z0-9.-]*googleusercontent\.com\/[A-Za-z0-9_./~=%?+-]+$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

async function verifyFirebaseGoogleIdToken(idToken: string): Promise<VerifiedGoogleClaims | null> {
  if (!FIREBASE_PROJECT_ID || typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || !header.kid) return null;

    let certs = await getGooglePublicCerts(false);
    let certPem = certs[header.kid];
    if (!certPem) {
      certs = await getGooglePublicCerts(true);
      certPem = certs[header.kid];
    }
    if (!certPem) return null;

    const sigValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
      certPem,
      Buffer.from(signatureB64, 'base64url')
    );
    if (!sigValid) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      aud?: unknown;
      iss?: unknown;
      sub?: unknown;
      exp?: unknown;
      iat?: unknown;
      auth_time?: unknown;
      email?: unknown;
      email_verified?: unknown;
      name?: unknown;
      picture?: unknown;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;
    if (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + 300) return null;
    if (payload.email_verified !== true || typeof payload.email !== 'string') return null;

    const email = payload.email.trim().toLowerCase();
    if (!isValidEmail(email)) return null;

    return {
      sub: payload.sub,
      email,
      name: cleanText(payload.name, 80) || email.split('@')[0],
      picture: safeGoogleAvatarUrl(payload.picture),
    };
  } catch {
    return null;
  }
}

// SSE subscribers keyed by uid
const sseClients = new Map<string, Set<Response>>();

function pushEvent(recipientIds: string[], event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const uid of recipientIds) {
    const set = sseClients.get(uid);
    if (!set) continue;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        // ignore broken pipe
      }
    }
  }
}

function createNotification(
  recipientId: string,
  type: AppNotification['type'],
  title: string,
  body: string,
  relatedId?: string
): void {
  const notif: AppNotification = {
    notificationId: `notif_${crypto.randomUUID().slice(0, 10)}`,
    recipientId,
    type,
    title,
    body,
    relatedId,
    createdAt: new Date().toISOString(),
  };
  dbStore.createNotificationRow(notif);
  pushEvent([recipientId], 'notification', { notification: notif });
}

function addAuditLog(
  admin: StoredUser,
  action: string,
  targetType: 'property' | 'user' | 'report' | 'support' | 'config',
  targetId: string,
  reason: string
): void {
  dbStore.addAuditLogRow({
    logId: `log_${crypto.randomUUID().slice(0, 10)}`,
    adminId: admin.uid,
    adminName: admin.displayName,
    action,
    targetType,
    targetId,
    reason,
    createdAt: new Date().toISOString(),
  });
}

function sanitizePropertyForViewer(
  prop: PropertyListing,
  viewer?: StoredUser
): PropertyListing {
  const seller = dbStore.findUserById(prop.sellerId);
  const isOwnerOrAdmin = viewer && (viewer.uid === prop.sellerId || viewer.role === 'admin');
  const hasApprovedVisit = Boolean(viewer && dbStore.hasApprovedVisit(prop.propertyId, viewer.uid));

  const canSeeExactAddress = Boolean(
    prop.addressVisibility === 'exact_public' || isOwnerOrAdmin || hasApprovedVisit
  );

  const canSeePhone = Boolean(isOwnerOrAdmin || seller?.showPhonePublicly);
  const canSeeEmail = Boolean(isOwnerOrAdmin || seller?.showEmailPublicly);

  return {
    ...prop,
    exactAddress: canSeeExactAddress ? prop.exactAddress : undefined,
    sellerPhone: canSeePhone ? seller?.phone || prop.sellerPhone : undefined,
    sellerEmail: canSeeEmail ? seller?.email : undefined,
    rejectionReason: isOwnerOrAdmin ? prop.rejectionReason : undefined,
  };
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const payload = verifyToken(token);
    if (payload) {
      const user = dbStore.findUserById(payload.uid);
      if (user && user.accountStatus !== 'deleted') {
        req.user = user;
      }
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  optionalAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.user.accountStatus === 'suspended') {
      res.status(403).json({ error: 'Your account is suspended. Contact support.' });
      return;
    }
    next();
  });
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }
    next();
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '40mb' }));

  // Public runtime config (non-secret Maps public key & platform metadata)
  app.get('/api/public-config', (_req: Request, res: Response) => {
    const mapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      config: dbStore.getConfig(),
      mapsApiKey,
    });
  });

  // Real-time event stream over fetch + Authorization Bearer header
  app.get('/api/events', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.user!.uid;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ uid })}\n\n`);

    let set = sseClients.get(uid);
    if (!set) {
      set = new Set<Response>();
      sseClients.set(uid, set);
    }
    set.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      const clientSet = sseClients.get(uid);
      if (clientSet) {
        clientSet.delete(res);
        if (clientSet.size === 0) {
          sseClients.delete(uid);
        }
      }
    });
  });

  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/admin-status', (_req: Request, res: Response) => {
    const adminExists = dbStore.hasActiveAdmin();
    const hasEnvPasscode = Boolean(getConfiguredAdminPasscode());
    res.json({
      claimed: adminExists,
      hasEnvPasscode,
    });
  });

  app.post('/api/auth/admin-claim', (req: Request, res: Response) => {
    const displayName = cleanText(req.body?.displayName, 80) || 'Platform Admin';
    const email = cleanText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

    if (!isValidEmail(email) || password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Valid email and password (min 6 chars) are required.' });
      return;
    }

    const envPasscode = getConfiguredAdminPasscode();
    const adminExists = dbStore.hasActiveAdmin();

    if (envPasscode) {
      const a = crypto.createHash('sha256').update(passcode).digest();
      const b = crypto.createHash('sha256').update(envPasscode).digest();
      if (!crypto.timingSafeEqual(a, b)) {
        res.status(403).json({ error: 'Invalid admin passcode.' });
        return;
      }
    } else if (adminExists) {
      res.status(403).json({ error: 'Admin account already initialized. Please sign in.' });
      return;
    }

    if (dbStore.emailExistsAnywhere(email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const now = new Date().toISOString();
    const adminUser: StoredUser = {
      uid: `admin_${crypto.randomUUID().slice(0, 8)}`,
      role: 'admin',
      displayName,
      email,
      phone: '+92 300 0000000',
      photoURL: '',
      preferredCity: 'Lahore',
      accountStatus: 'active',
      verificationStatus: 'verified',
      verifiedAt: now,
      showPhonePublicly: false,
      showEmailPublicly: false,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };
    dbStore.createUser(adminUser);
    addAuditLog(adminUser, 'ADMIN_CLAIMED', 'user', adminUser.uid, 'Initial admin account created');

    const token = signToken({
      uid: adminUser.uid,
      role: 'admin',
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.status(201).json({ token, user: sanitizeUser(adminUser) });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const role = req.body?.role;
    if (role !== 'buyer' && role !== 'seller') {
      res.status(403).json({ error: 'Public registration is limited to Buyer and Seller accounts.' });
      return;
    }

    const displayName = cleanText(req.body?.displayName, 80);
    const email = cleanText(req.body?.email, 160).toLowerCase();
    const phone = cleanText(req.body?.phone, 32);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const preferredCity = cleanText(req.body?.preferredCity, 60) || 'Lahore';

    if (!displayName || !isValidEmail(email) || password.length < 6 || password.length > 128) {
      res.status(400).json({
        error: 'Please enter a full name, valid email address, and password (at least 6 characters).',
      });
      return;
    }

    if (dbStore.emailExistsAnywhere(email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
      uid: `${role}_${crypto.randomUUID().slice(0, 8)}`,
      role,
      displayName,
      email,
      phone: phone || '+92 300 0000000',
      photoURL: '',
      preferredCity,
      accountStatus: 'active',
      verificationStatus: 'unverified',
      showPhonePublicly: role === 'seller',
      showEmailPublicly: false,
      sellerRoleLabel: role === 'seller' ? 'Property Owner' : undefined,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };

    dbStore.createUser(newUser);

    const token = signToken({
      uid: newUser.uid,
      role: newUser.role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = cleanText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const requestedRole = req.body?.role;

    const user = dbStore.findUserByEmail(email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (requestedRole && user.role !== requestedRole) {
      res.status(403).json({ error: `This account is registered as ${user.role}, not ${requestedRole}.` });
      return;
    }

    if (user.accountStatus === 'suspended') {
      res.status(403).json({ error: 'This account has been suspended by moderation.' });
      return;
    }

    const token = signToken({
      uid: user.uid,
      role: user.role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/google', async (req: Request, res: Response) => {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    const requestedRole: 'buyer' | 'seller' = req.body?.role === 'seller' ? 'seller' : 'buyer';
    const intent = req.body?.intent === 'signup' ? 'signup' : 'login';
    const preferredCity = cleanText(req.body?.preferredCity, 60) || 'Lahore';

    if (!idToken) {
      res.status(400).json({ error: 'Google sign-in token is required.' });
      return;
    }

    const verified = await verifyFirebaseGoogleIdToken(idToken);
    if (!verified) {
      res.status(401).json({ error: 'Unable to verify Google sign-in token. Please try again.' });
      return;
    }

    const existing = dbStore.findUserByEmail(verified.email);
    if (existing) {
      if (existing.role === 'admin') {
        res.status(403).json({
          error: 'Administrator accounts must sign in using the Admin tab and password.',
        });
        return;
      }
      if (existing.accountStatus === 'suspended') {
        res.status(403).json({ error: 'This account has been suspended by moderation.' });
        return;
      }
      if (intent === 'signup' && existing.role !== requestedRole) {
        res.status(409).json({
          error: `This Google email is already registered as ${existing.role}. Switch to Login or choose the ${existing.role} tab.`,
        });
        return;
      }

      let dirty = false;
      if (!existing.photoURL && verified.picture) {
        existing.photoURL = verified.picture;
        dirty = true;
      }
      if (!existing.displayName && verified.name) {
        existing.displayName = verified.name;
        dirty = true;
      }
      if (dirty) {
        existing.updatedAt = new Date().toISOString();
        dbStore.updateUser(existing);
        if (existing.role === 'seller') {
          dbStore.syncSellerOnProperties(existing);
        }
      }

      const token = signToken({
        uid: existing.uid,
        role: existing.role,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
      });
      res.json({ token, user: sanitizeUser(existing), isNewUser: false });
      return;
    }

    if (dbStore.emailExistsAnywhere(verified.email)) {
      res.status(409).json({ error: 'This email is associated with a deleted account.' });
      return;
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
      uid: `${requestedRole}_${crypto.randomUUID().slice(0, 8)}`,
      role: requestedRole,
      displayName: verified.name,
      email: verified.email,
      phone: '',
      photoURL: verified.picture,
      preferredCity,
      accountStatus: 'active',
      verificationStatus: 'unverified',
      showPhonePublicly: false,
      showEmailPublicly: false,
      sellerRoleLabel: requestedRole === 'seller' ? 'Property Owner' : undefined,
      createdAt: now,
      updatedAt: now,
    };
    dbStore.createUser(newUser);

    const token = signToken({
      uid: newUser.uid,
      role: newUser.role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    res.status(201).json({ token, user: sanitizeUser(newUser), isNewUser: true });
  });

  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const email = cleanText(req.body?.email, 160).toLowerCase();
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    res.json({
      message:
        'If an account exists for that email, password recovery instructions have been dispatched.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: sanitizeUser(req.user!) });
  });

  app.put('/api/auth/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = dbStore.findUserById(req.user!.uid);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const displayName = cleanText(req.body?.displayName, 80);
    const phone = cleanText(req.body?.phone, 32);
    const preferredCity = cleanText(req.body?.preferredCity, 60);
    if (displayName) user.displayName = displayName;
    if (phone) user.phone = phone;
    if (preferredCity) user.preferredCity = preferredCity;
    if (typeof req.body?.showPhonePublicly === 'boolean') {
      user.showPhonePublicly = req.body.showPhonePublicly;
    }
    if (typeof req.body?.showEmailPublicly === 'boolean') {
      user.showEmailPublicly = req.body.showEmailPublicly;
    }
    if (
      user.role === 'seller' &&
      (req.body?.sellerRoleLabel === 'Property Owner' ||
        req.body?.sellerRoleLabel === 'Authorized Agent')
    ) {
      user.sellerRoleLabel = req.body.sellerRoleLabel;
    }
    if (req.body?.photoURL === '' || isValidImageUrl(req.body?.photoURL)) {
      user.photoURL = req.body.photoURL;
    }
    user.updatedAt = new Date().toISOString();

    dbStore.updateUser(user);
    if (user.role === 'seller') {
      dbStore.syncSellerOnProperties(user);
    }

    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = dbStore.findUserById(req.user!.uid);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be 6–128 characters.' });
      return;
    }
    if (user.passwordHash && !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(403).json({ error: 'Current password is incorrect.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();
    dbStore.updateUser(user);
    res.json({ message: 'Password updated successfully.' });
  });

  app.post('/api/auth/request-deletion', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = dbStore.findUserById(req.user!.uid);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    user.accountStatus = 'deletion_pending';
    user.updatedAt = new Date().toISOString();
    dbStore.updateUser(user);
    res.json({ user: sanitizeUser(user) });
  });

  // ---------------- PROPERTIES ROUTES ----------------
  app.get('/api/properties', optionalAuth, (req: AuthedRequest, res: Response) => {
    const mine = req.query.mine === 'true' || req.query.includeMine === 'true';
    let list = dbStore.getProperties();

    if (mine) {
      if (!req.user) {
        res.status(401).json({ error: 'Sign in to view your listings.' });
        return;
      }
      list = list.filter((p) => p.sellerId === req.user!.uid);
    } else {
      list = list.filter((p) => p.status === 'active' || p.status === 'approved');
    }

    const city = cleanText(req.query.city, 60);
    const area = cleanText(req.query.area, 80);
    const category = cleanText(req.query.category, 60);
    const q = cleanText(req.query.q, 120).toLowerCase();
    const furnishing = cleanText(req.query.furnishing, 40);
    const minRent = Number(req.query.minRent || 0);
    const maxRent = Number(req.query.maxRent || 0);
    const bedrooms = Number(req.query.bedrooms || 0);
    const bathrooms = Number(req.query.bathrooms || 0);
    const parking = req.query.parking === 'true';
    const featuredOnly = req.query.featured === 'true';
    const facilitiesParam = cleanText(req.query.facilities, 300);
    const requiredFacilities = facilitiesParam
      ? facilitiesParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (city && city !== 'All') {
      list = list.filter((p) => p.city.toLowerCase() === city.toLowerCase());
    }
    if (area && area !== 'All') {
      list = list.filter(
        (p) =>
          p.area.toLowerCase().includes(area.toLowerCase()) ||
          p.society.toLowerCase().includes(area.toLowerCase())
      );
    }
    if (category && category !== 'All') {
      const cats = category.split(',').map((c) => c.trim().toLowerCase());
      list = list.filter((p) => cats.includes(p.category.toLowerCase()));
    }
    if (q) {
      list = list.filter((p) =>
        [p.title, p.city, p.area, p.society, p.category, p.description]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    if (minRent > 0) list = list.filter((p) => p.rent >= minRent);
    if (maxRent > 0) list = list.filter((p) => p.rent <= maxRent);
    if (bedrooms > 0) list = list.filter((p) => p.bedrooms >= bedrooms);
    if (bathrooms > 0) list = list.filter((p) => p.bathrooms >= bathrooms);
    if (furnishing && furnishing !== 'Any') {
      list = list.filter((p) => p.furnishing.toLowerCase() === furnishing.toLowerCase());
    }
    if (parking) list = list.filter((p) => p.parking);
    if (featuredOnly) list = list.filter((p) => p.featured);
    if (requiredFacilities.length > 0) {
      list = list.filter((p) =>
        requiredFacilities.every((f) =>
          p.facilities.some((pf) => pf.toLowerCase() === f.toLowerCase())
        )
      );
    }

    const sort = cleanText(req.query.sort, 20) || 'newest';
    list.sort((a, b) => {
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      if (sort === 'rent_asc') return a.rent - b.rent;
      if (sort === 'rent_desc') return b.rent - a.rent;
      return b.createdAt.localeCompare(a.createdAt);
    });

    res.json({
      properties: list.map((p) => sanitizePropertyForViewer(p, req.user)),
    });
  });

  app.get('/api/properties/:id', optionalAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid property ID.' });
      return;
    }
    const prop = dbStore.findPropertyById(id);
    if (!prop) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }
    const isPublic = prop.status === 'active' || prop.status === 'approved';
    const isOwnerOrAdmin = req.user && (req.user.uid === prop.sellerId || req.user.role === 'admin');
    if (!isPublic && !isOwnerOrAdmin) {
      res.status(403).json({ error: 'This listing is not currently public.' });
      return;
    }
    res.json({ property: sanitizePropertyForViewer(prop, req.user) });
  });

  app.post('/api/properties', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    if (user.role !== 'seller' && user.role !== 'admin') {
      res.status(403).json({ error: 'Only seller accounts can create property listings.' });
      return;
    }
    if (user.accountStatus === 'restricted') {
      res.status(403).json({ error: 'Your account is restricted from publishing new listings.' });
      return;
    }

    const cfg = dbStore.getConfig();
    const title = cleanText(req.body?.title, 120);
    const category = cleanText(req.body?.category, 40);
    const description = cleanText(req.body?.description, 2500);
    const rent = Number(req.body?.rent);
    const deposit = Number(req.body?.deposit || 0);
    const advanceRent = Number(req.body?.advanceRent || 0);
    const city = cleanText(req.body?.city, 60);
    const area = cleanText(req.body?.area, 80);
    const society = cleanText(req.body?.society, 100) || area;
    const rawImages = Array.isArray(req.body?.imageURLs) ? req.body.imageURLs : [];
    const imageURLs = rawImages.filter(isValidImageUrl).slice(0, cfg.maxPhotosPerListing);

    if (!title || !category || !description || !city || !area || !Number.isFinite(rent) || rent < 1000) {
      res.status(400).json({
        error: 'Title, category, city, area, description, and valid monthly rent (PKR >= 1,000) are required.',
      });
      return;
    }
    if (imageURLs.length < 1) {
      res.status(400).json({ error: 'Please attach at least one valid property photo.' });
      return;
    }

    const duplicate = dbStore.findDuplicateProperty(user.uid, title, city, area);
    if (duplicate && !req.body?.confirmDuplicate) {
      res.status(409).json({
        error: 'A very similar listing already exists under your account.',
        duplicateWarning: true,
      });
      return;
    }

    const cityPreset = cfg.cities.find((c) => c.name.toLowerCase() === city.toLowerCase());
    const lat = Number(req.body?.location?.lat);
    const lng = Number(req.body?.location?.lng);
    const location =
      Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
        ? { lat, lng }
        : { lat: cityPreset?.lat ?? 31.5204, lng: cityPreset?.lng ?? 74.3587 };

    const submitMode = req.body?.status === 'draft' ? 'draft' : 'under_review';
    const now = new Date().toISOString();

    const listing: PropertyListing = {
      propertyId: `prop_${crypto.randomUUID().slice(0, 10)}`,
      sellerId: user.uid,
      sellerName: user.displayName,
      sellerRoleLabel: user.sellerRoleLabel || 'Property Owner',
      sellerPhotoURL: user.photoURL,
      sellerVerified: user.verificationStatus === 'verified',
      sellerPhone: user.phone,
      title,
      category,
      description,
      rent: Math.round(rent),
      negotiable: Boolean(req.body?.negotiable),
      deposit: Math.max(0, Math.round(Number.isFinite(deposit) ? deposit : 0)),
      advanceRent: Math.max(0, Math.round(Number.isFinite(advanceRent) ? advanceRent : 0)),
      additionalCharges: cleanText(req.body?.additionalCharges, 200),
      city,
      area,
      society,
      addressVisibility: req.body?.addressVisibility === 'exact_public' ? 'exact_public' : 'approximate',
      exactAddress: cleanText(req.body?.exactAddress, 240),
      location,
      bedrooms: Math.max(0, Math.min(30, Number(req.body?.bedrooms || 0))),
      bathrooms: Math.max(0, Math.min(30, Number(req.body?.bathrooms || 0))),
      floorPortion: cleanText(req.body?.floorPortion, 60) || 'Full House',
      coveredArea: Math.max(0, Number(req.body?.coveredArea || 0)),
      coveredAreaUnit:
        req.body?.coveredAreaUnit === 'Marla' || req.body?.coveredAreaUnit === 'Kanal'
          ? req.body.coveredAreaUnit
          : 'Sq. Ft.',
      furnishing:
        req.body?.furnishing === 'Furnished' || req.body?.furnishing === 'Semi-Furnished'
          ? req.body.furnishing
          : 'Unfurnished',
      facilities: Array.isArray(req.body?.facilities)
        ? req.body.facilities.map((f: unknown) => cleanText(f, 40)).filter(Boolean).slice(0, 20)
        : [],
      parking: Boolean(req.body?.parking),
      availabilityDate: cleanText(req.body?.availabilityDate, 30) || now.slice(0, 10),
      contactPreference:
        req.body?.contactPreference === 'Phone' || req.body?.contactPreference === 'WhatsApp'
          ? req.body.contactPreference
          : 'In-app',
      preferredTenant: cleanText(req.body?.preferredTenant, 100) || 'Any lawful tenant',
      imageURLs,
      status: submitMode,
      featured: false,
      lastConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    dbStore.createProperty(listing);

    if (submitMode === 'under_review') {
      const admins = dbStore.getActiveAdminIds();
      pushEvent(admins, 'property_updated', { propertyId: listing.propertyId });
    }

    res.status(201).json({ property: sanitizePropertyForViewer(listing, user) });
  });

  app.put('/api/properties/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid property ID.' });
      return;
    }
    const prop = dbStore.findPropertyById(id);
    if (!prop) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }
    const user = req.user!;
    if (prop.sellerId !== user.uid && user.role !== 'admin') {
      res.status(403).json({ error: 'You can only edit your own property listings.' });
      return;
    }

    const cfg = dbStore.getConfig();
    const title = cleanText(req.body?.title, 120);
    const category = cleanText(req.body?.category, 40);
    const description = cleanText(req.body?.description, 2500);
    const city = cleanText(req.body?.city, 60);
    const area = cleanText(req.body?.area, 80);

    if (title) prop.title = title;
    if (category) prop.category = category;
    if (description) prop.description = description;
    if (city) prop.city = city;
    if (area) prop.area = area;
    if (typeof req.body?.society === 'string') prop.society = cleanText(req.body.society, 100);
    if (Number.isFinite(Number(req.body?.rent)) && Number(req.body.rent) >= 1000) {
      prop.rent = Math.round(Number(req.body.rent));
    }
    if (typeof req.body?.negotiable === 'boolean') prop.negotiable = req.body.negotiable;
    if (Number.isFinite(Number(req.body?.deposit))) prop.deposit = Math.max(0, Math.round(Number(req.body.deposit)));
    if (Number.isFinite(Number(req.body?.advanceRent))) {
      prop.advanceRent = Math.max(0, Math.round(Number(req.body.advanceRent)));
    }
    if (typeof req.body?.additionalCharges === 'string') {
      prop.additionalCharges = cleanText(req.body.additionalCharges, 200);
    }
    if (req.body?.addressVisibility === 'exact_public' || req.body?.addressVisibility === 'approximate') {
      prop.addressVisibility = req.body.addressVisibility;
    }
    if (typeof req.body?.exactAddress === 'string') {
      prop.exactAddress = cleanText(req.body.exactAddress, 240);
    }
    if (
      req.body?.location &&
      Number.isFinite(Number(req.body.location.lat)) &&
      Number.isFinite(Number(req.body.location.lng))
    ) {
      prop.location = { lat: Number(req.body.location.lat), lng: Number(req.body.location.lng) };
    }
    if (Number.isFinite(Number(req.body?.bedrooms))) prop.bedrooms = Math.max(0, Number(req.body.bedrooms));
    if (Number.isFinite(Number(req.body?.bathrooms))) prop.bathrooms = Math.max(0, Number(req.body.bathrooms));
    if (typeof req.body?.floorPortion === 'string') prop.floorPortion = cleanText(req.body.floorPortion, 60);
    if (Number.isFinite(Number(req.body?.coveredArea))) prop.coveredArea = Math.max(0, Number(req.body.coveredArea));
    if (
      req.body?.coveredAreaUnit === 'Sq. Ft.' ||
      req.body?.coveredAreaUnit === 'Marla' ||
      req.body?.coveredAreaUnit === 'Kanal'
    ) {
      prop.coveredAreaUnit = req.body.coveredAreaUnit;
    }
    if (
      req.body?.furnishing === 'Furnished' ||
      req.body?.furnishing === 'Semi-Furnished' ||
      req.body?.furnishing === 'Unfurnished'
    ) {
      prop.furnishing = req.body.furnishing;
    }
    if (Array.isArray(req.body?.facilities)) {
      prop.facilities = req.body.facilities.map((f: unknown) => cleanText(f, 40)).filter(Boolean).slice(0, 20);
    }
    if (typeof req.body?.parking === 'boolean') prop.parking = req.body.parking;
    if (typeof req.body?.availabilityDate === 'string') {
      prop.availabilityDate = cleanText(req.body.availabilityDate, 30);
    }
    if (
      req.body?.contactPreference === 'In-app' ||
      req.body?.contactPreference === 'Phone' ||
      req.body?.contactPreference === 'WhatsApp'
    ) {
      prop.contactPreference = req.body.contactPreference;
    }
    if (typeof req.body?.preferredTenant === 'string') {
      prop.preferredTenant = cleanText(req.body.preferredTenant, 100);
    }
    if (Array.isArray(req.body?.imageURLs)) {
      const valid = req.body.imageURLs.filter(isValidImageUrl).slice(0, cfg.maxPhotosPerListing);
      if (valid.length > 0) prop.imageURLs = valid;
    }

    const nextStatus = req.body?.status as PropertyStatus | undefined;
    if (nextStatus) {
      if (user.role === 'admin') {
        prop.status = nextStatus;
      } else if (nextStatus === 'paused' || nextStatus === 'rented' || nextStatus === 'draft') {
        prop.status = nextStatus;
      } else if (nextStatus === 'under_review') {
        prop.status = 'under_review';
        prop.rejectionReason = undefined;
      } else if (nextStatus === 'active' && (prop.status === 'paused' || prop.status === 'rented' || prop.status === 'approved')) {
        prop.status = 'active';
      }
    }

    if (req.body?.confirmAvailability) {
      prop.lastConfirmedAt = new Date().toISOString();
    }

    prop.updatedAt = new Date().toISOString();
    dbStore.updateProperty(prop);
    pushEvent([prop.sellerId], 'property_updated', { propertyId: prop.propertyId });
    res.json({ property: sanitizePropertyForViewer(prop, user) });
  });

  app.delete('/api/properties/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid property ID.' });
      return;
    }
    const prop = dbStore.findPropertyById(id);
    if (!prop) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }
    if (prop.sellerId !== req.user!.uid && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'You can only delete your own listings.' });
      return;
    }
    dbStore.deleteProperty(id);
    res.json({ deleted: true });
  });

  // ---------------- FAVOURITES ROUTES ----------------
  app.get('/api/favourites', requireAuth, (req: AuthedRequest, res: Response) => {
    const favIds = dbStore.getFavouriteIdsByBuyer(req.user!.uid);
    const items = dbStore
      .getProperties()
      .filter((p) => favIds.includes(p.propertyId) && (p.status === 'active' || p.status === 'approved'))
      .map((p) => sanitizePropertyForViewer(p, req.user));
    res.json({ favouriteIds: favIds, properties: items });
  });

  app.post('/api/favourites/:propertyId', requireAuth, (req: AuthedRequest, res: Response) => {
    const propertyId = req.params.propertyId;
    if (!isValidId(propertyId)) {
      res.status(400).json({ error: 'Invalid property ID.' });
      return;
    }
    const prop = dbStore.findPropertyById(propertyId);
    if (!prop) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }
    const saved = dbStore.toggleFavourite(req.user!.uid, propertyId);
    res.json({ saved, propertyId });
  });

  // ---------------- RENTAL REQUESTS ROUTES ----------------
  app.get('/api/requests', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    res.json({ requests: dbStore.getRequestsForUser(user.uid, user.role) });
  });

  app.post('/api/requests', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const propertyId = cleanText(req.body?.propertyId, 128);
    const message = cleanText(req.body?.message, 1000);
    const preferredVisit = cleanText(req.body?.preferredVisit, 80);

    if (!isValidId(propertyId) || !message) {
      res.status(400).json({ error: 'Property ID and enquiry message are required.' });
      return;
    }
    const prop = dbStore.findPropertyById(propertyId);
    if (!prop || (prop.status !== 'active' && prop.status !== 'approved')) {
      res.status(404).json({ error: 'Active property not found.' });
      return;
    }
    if (prop.sellerId === user.uid) {
      res.status(400).json({ error: 'You cannot send a rental request to your own listing.' });
      return;
    }

    const now = new Date().toISOString();
    const rentalReq: RentalRequest = {
      requestId: `req_${crypto.randomUUID().slice(0, 10)}`,
      propertyId: prop.propertyId,
      propertyTitle: prop.title,
      propertyCity: prop.city,
      propertyArea: prop.society || prop.area,
      propertyRent: prop.rent,
      propertyImage: prop.imageURLs[0] || '',
      buyerId: user.uid,
      buyerName: user.displayName,
      buyerPhone: user.phone,
      sellerId: prop.sellerId,
      sellerName: prop.sellerName,
      message,
      preferredVisit: preferredVisit || 'Flexible',
      status: 'pending',
      statusHistory: [{ status: 'pending', note: 'Enquiry submitted', at: now, by: user.uid }],
      createdAt: now,
      updatedAt: now,
    };
    dbStore.createRequest(rentalReq);

    let conv = dbStore.findConversationByParticipants(prop.propertyId, user.uid, prop.sellerId);
    if (!conv) {
      conv = {
        conversationId: `conv_${crypto.randomUUID().slice(0, 10)}`,
        propertyId: prop.propertyId,
        propertyTitle: prop.title,
        propertyImage: prop.imageURLs[0] || '',
        propertyRent: prop.rent,
        buyerId: user.uid,
        buyerName: user.displayName,
        sellerId: prop.sellerId,
        sellerName: prop.sellerName,
        lastMessage: message,
        lastMessageAt: now,
        unreadByBuyer: 0,
        unreadBySeller: 1,
        blockedBy: [],
        createdAt: now,
      };
      dbStore.createConversation(conv);
    } else {
      conv.lastMessage = message;
      conv.lastMessageAt = now;
      conv.unreadBySeller += 1;
      dbStore.updateConversation(conv);
    }

    const msgText = preferredVisit ? `${message} (Preferred visit: ${preferredVisit})` : message;
    const chatMsg = {
      messageId: `msg_${crypto.randomUUID().slice(0, 10)}`,
      conversationId: conv.conversationId,
      senderId: user.uid,
      senderName: user.displayName,
      text: msgText,
      createdAt: now,
    };
    dbStore.createMessage(chatMsg);

    createNotification(
      prop.sellerId,
      'new_enquiry',
      'New rental request received',
      `${user.displayName} sent an enquiry for ${prop.title} (PKR ${prop.rent.toLocaleString()}/month).`,
      rentalReq.requestId
    );

    pushEvent([prop.sellerId, user.uid], 'request_updated', { request: rentalReq });
    pushEvent([prop.sellerId, user.uid], 'message', {
      conversationId: conv.conversationId,
      message: chatMsg,
    });

    res.status(201).json({ request: rentalReq, conversationId: conv.conversationId });
  });

  app.patch('/api/requests/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid request ID.' });
      return;
    }
    const rentalReq = dbStore.findRequestById(id);
    if (!rentalReq) {
      res.status(404).json({ error: 'Rental request not found.' });
      return;
    }
    const user = req.user!;
    const isBuyer = rentalReq.buyerId === user.uid;
    const isSeller = rentalReq.sellerId === user.uid;
    const isAdmin = user.role === 'admin';
    if (!isBuyer && !isSeller && !isAdmin) {
      res.status(403).json({ error: 'Unauthorized to update this rental request.' });
      return;
    }

    const nextStatus = req.body?.status as RequestStatus;
    const note = cleanText(req.body?.note, 500);
    const declineReason = cleanText(req.body?.declineReason, 400);

    if (isBuyer && !isAdmin) {
      if (nextStatus !== 'cancelled') {
        res.status(403).json({ error: 'Buyers can only cancel their own requests.' });
        return;
      }
    } else if (isSeller && !isAdmin) {
      const allowed: RequestStatus[] = [
        'responded',
        'viewing_arranged',
        'accepted',
        'declined',
        'closed',
      ];
      if (!allowed.includes(nextStatus)) {
        res.status(400).json({ error: 'Invalid status update for seller.' });
        return;
      }
    }

    const now = new Date().toISOString();
    rentalReq.status = nextStatus;
    if (note) rentalReq.sellerResponse = note;
    if (declineReason) rentalReq.declineReason = declineReason;
    rentalReq.updatedAt = now;
    rentalReq.statusHistory.push({
      status: nextStatus,
      note: note || declineReason || undefined,
      at: now,
      by: user.uid,
    });
    dbStore.updateRequest(rentalReq);

    const recipient = isBuyer ? rentalReq.sellerId : rentalReq.buyerId;
    createNotification(
      recipient,
      'enquiry_update',
      `Rental request ${nextStatus.replace('_', ' ')}`,
      `${user.displayName} updated request for ${rentalReq.propertyTitle} to "${nextStatus.replace('_', ' ')}".`,
      rentalReq.requestId
    );

    if (note) {
      const conv = dbStore.findConversationByParticipants(
        rentalReq.propertyId,
        rentalReq.buyerId,
        rentalReq.sellerId
      );
      if (conv) {
        const msg = {
          messageId: `msg_${crypto.randomUUID().slice(0, 10)}`,
          conversationId: conv.conversationId,
          senderId: user.uid,
          senderName: user.displayName,
          text: note,
          createdAt: now,
        };
        dbStore.createMessage(msg);
        conv.lastMessage = note;
        conv.lastMessageAt = now;
        if (isBuyer) conv.unreadBySeller += 1;
        else conv.unreadByBuyer += 1;
        dbStore.updateConversation(conv);
        pushEvent([recipient, user.uid], 'message', {
          conversationId: conv.conversationId,
          message: msg,
        });
      }
    }

    pushEvent([rentalReq.buyerId, rentalReq.sellerId], 'request_updated', { request: rentalReq });
    res.json({ request: rentalReq });
  });

  // ---------------- MESSAGING ROUTES ----------------
  app.get('/api/conversations', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    res.json({ conversations: dbStore.getConversationsForUser(user.uid, user.role) });
  });

  app.post('/api/conversations/start', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const propertyId = cleanText(req.body?.propertyId, 128);
    if (!isValidId(propertyId)) {
      res.status(400).json({ error: 'Invalid property ID.' });
      return;
    }
    const prop = dbStore.findPropertyById(propertyId);
    if (!prop) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }
    if (prop.sellerId === user.uid) {
      res.status(400).json({ error: 'Cannot start a chat with yourself.' });
      return;
    }
    let conv: Conversation | undefined = dbStore.findConversationByParticipants(
      prop.propertyId,
      user.uid,
      prop.sellerId
    );
    if (!conv) {
      const now = new Date().toISOString();
      conv = {
        conversationId: `conv_${crypto.randomUUID().slice(0, 10)}`,
        propertyId: prop.propertyId,
        propertyTitle: prop.title,
        propertyImage: prop.imageURLs[0] || '',
        propertyRent: prop.rent,
        buyerId: user.uid,
        buyerName: user.displayName,
        sellerId: prop.sellerId,
        sellerName: prop.sellerName,
        lastMessage: 'Started conversation',
        lastMessageAt: now,
        unreadByBuyer: 0,
        unreadBySeller: 0,
        blockedBy: [],
        createdAt: now,
      };
      dbStore.createConversation(conv);
    }
    res.json({ conversation: conv });
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }
    const conv = dbStore.findConversationById(id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const user = req.user!;
    if (conv.buyerId !== user.uid && conv.sellerId !== user.uid && user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied to this conversation.' });
      return;
    }

    const now = new Date().toISOString();
    if (conv.buyerId === user.uid || conv.sellerId === user.uid) {
      dbStore.markMessagesRead(id, user.uid, now);
    }

    let changed = false;
    if (conv.buyerId === user.uid && conv.unreadByBuyer > 0) {
      conv.unreadByBuyer = 0;
      changed = true;
    } else if (conv.sellerId === user.uid && conv.unreadBySeller > 0) {
      conv.unreadBySeller = 0;
      changed = true;
    }
    if (changed) dbStore.updateConversation(conv);

    const msgs = dbStore.getMessagesByConversation(id);
    res.json({ conversation: conv, messages: msgs });
  });

  app.post('/api/conversations/:id/messages', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }
    const conv = dbStore.findConversationById(id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const user = req.user!;
    if (conv.buyerId !== user.uid && conv.sellerId !== user.uid) {
      res.status(403).json({ error: 'Only conversation participants can send messages.' });
      return;
    }
    if (conv.blockedBy.length > 0) {
      res.status(403).json({ error: 'Messaging is disabled because one participant blocked this chat.' });
      return;
    }

    const text = cleanText(req.body?.text, 2000);
    const attachmentURL = req.body?.attachmentURL;
    if (!text && !isValidImageUrl(attachmentURL)) {
      res.status(400).json({ error: 'Message text or valid image attachment is required.' });
      return;
    }

    const now = new Date().toISOString();
    const msg = {
      messageId: `msg_${crypto.randomUUID().slice(0, 10)}`,
      conversationId: id,
      senderId: user.uid,
      senderName: user.displayName,
      text: text || 'Shared an image',
      attachmentURL: isValidImageUrl(attachmentURL) ? attachmentURL : undefined,
      createdAt: now,
    };

    dbStore.createMessage(msg);
    conv.lastMessage = msg.text;
    conv.lastMessageAt = now;

    const recipientId = conv.buyerId === user.uid ? conv.sellerId : conv.buyerId;
    if (conv.buyerId === user.uid) conv.unreadBySeller += 1;
    else conv.unreadByBuyer += 1;
    dbStore.updateConversation(conv);

    createNotification(
      recipientId,
      'new_message',
      `New message from ${user.displayName}`,
      msg.text.slice(0, 120),
      conv.conversationId
    );

    pushEvent([conv.buyerId, conv.sellerId], 'message', {
      conversationId: conv.conversationId,
      message: msg,
    });
    res.status(201).json({ message: msg });
  });

  app.post('/api/conversations/:id/block', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }
    const conv = dbStore.findConversationById(id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const user = req.user!;
    if (conv.buyerId !== user.uid && conv.sellerId !== user.uid) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }
    const idx = conv.blockedBy.indexOf(user.uid);
    if (idx >= 0) conv.blockedBy.splice(idx, 1);
    else conv.blockedBy.push(user.uid);
    dbStore.updateConversation(conv);
    res.json({ conversation: conv });
  });

  // ---------------- NOTIFICATIONS ----------------
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ notifications: dbStore.getNotificationsForUser(req.user!.uid, 50) });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res: Response) => {
    dbStore.markAllNotificationsRead(req.user!.uid, new Date().toISOString());
    res.json({ ok: true });
  });

  // ---------------- REPORTS & SUPPORT TICKETS ----------------
  app.post('/api/reports', requireAuth, (req: AuthedRequest, res: Response) => {
    const targetType = req.body?.targetType;
    const targetId = cleanText(req.body?.targetId, 128);
    const targetLabel = cleanText(req.body?.targetLabel, 140);
    const reason = cleanText(req.body?.reason, 120);
    const details = cleanText(req.body?.details, 1000);

    if (
      (targetType !== 'property' && targetType !== 'user' && targetType !== 'message') ||
      !isValidId(targetId) ||
      !reason
    ) {
      res.status(400).json({ error: 'Valid report target and reason are required.' });
      return;
    }
    const now = new Date().toISOString();
    const report: ModerationReport = {
      reportId: `rep_${crypto.randomUUID().slice(0, 10)}`,
      reporterId: req.user!.uid,
      reporterName: req.user!.displayName,
      targetType,
      targetId,
      targetLabel: targetLabel || targetId,
      reason,
      details,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    dbStore.createReport(report);
    res.status(201).json({ report });
  });

  app.get('/api/support-tickets', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const tickets =
      user.role === 'admin'
        ? dbStore.getSupportTickets()
        : dbStore.getSupportTickets(user.uid);
    res.json({ tickets });
  });

  app.post('/api/support-tickets', optionalAuth, (req: AuthedRequest, res: Response) => {
    const userName = req.user?.displayName || cleanText(req.body?.userName, 80);
    const userEmail = req.user?.email || cleanText(req.body?.userEmail, 160);
    const subject = cleanText(req.body?.subject, 140);
    const message = cleanText(req.body?.message, 2000);

    if (!userName || !isValidEmail(userEmail) || !subject || !message) {
      res.status(400).json({ error: 'Name, valid email, subject, and message are required.' });
      return;
    }

    const now = new Date().toISOString();
    const ticket = {
      ticketId: `sup_${crypto.randomUUID().slice(0, 10)}`,
      userId: req.user?.uid,
      userName,
      userEmail,
      subject,
      message,
      status: 'open' as const,
      createdAt: now,
      updatedAt: now,
    };
    dbStore.createSupportTicket(ticket);
    res.status(201).json({ ticket });
  });

  // ---------------- ADMIN PANEL ROUTES ----------------
  app.get('/api/admin/metrics', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const users = dbStore.getUsers(false);
    const properties = dbStore.getProperties();
    const rentalRequests = dbStore.getRequests();
    const reports = dbStore.getReports();
    const supportTickets = dbStore.getSupportTickets();

    const roleBreakdown = { buyer: 0, seller: 0, admin: 0 };
    for (const u of users) {
      roleBreakdown[u.role] += 1;
    }

    const propertyStatusBreakdown: Record<PropertyStatus, number> = {
      draft: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      active: 0,
      paused: 0,
      rented: 0,
      expired: 0,
    };
    for (const p of properties) {
      propertyStatusBreakdown[p.status] = (propertyStatusBreakdown[p.status] || 0) + 1;
    }

    const openReports = reports.filter(
      (r) => r.status === 'open' || r.status === 'reviewing'
    ).length;
    const unresolvedTickets = supportTickets.filter(
      (t) => t.status === 'open' || t.status === 'in_progress'
    ).length;

    const recentActivities: AdminMetrics['recentActivities'] = [
      ...properties.slice(0, 4).map((p) => ({
        id: p.propertyId,
        title: `Property ${p.status === 'under_review' ? 'uploaded' : p.status}: ${p.title}`,
        subtitle: `${p.city} · PKR ${p.rent.toLocaleString()}/mo`,
        type: 'property' as const,
        at: p.updatedAt,
      })),
      ...rentalRequests.slice(0, 4).map((r) => ({
        id: r.requestId,
        title: `Rental request ${r.status}: ${r.propertyTitle}`,
        subtitle: `${r.buyerName} -> ${r.sellerName}`,
        type: 'request' as const,
        at: r.updatedAt,
      })),
      ...reports.slice(0, 3).map((rep) => ({
        id: rep.reportId,
        title: `Report (${rep.status}): ${rep.targetLabel}`,
        subtitle: rep.reason,
        type: 'report' as const,
        at: rep.updatedAt,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const nowDate = new Date();
    const monthlyGrowth: AdminMetrics['monthlyGrowth'] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const label = monthNames[m];
      monthlyGrowth.push({
        month: label,
        listings: properties.filter((p) => {
          const pd = new Date(p.createdAt);
          return pd.getFullYear() === y && pd.getMonth() === m;
        }).length,
        requests: rentalRequests.filter((r) => {
          const rd = new Date(r.createdAt);
          return rd.getFullYear() === y && rd.getMonth() === m;
        }).length,
        users: users.filter((u) => {
          const ud = new Date(u.createdAt);
          return ud.getFullYear() === y && ud.getMonth() === m;
        }).length,
      });
    }

    const metrics: AdminMetrics = {
      totalUsers: users.length,
      roleBreakdown,
      totalProperties: properties.length,
      propertyStatusBreakdown,
      totalRequests: rentalRequests.length,
      openReports,
      unresolvedTickets,
      monthlyGrowth,
      recentActivities,
    };

    res.json({ metrics });
  });

  app.get('/api/admin/properties', requireAdmin, (req: AuthedRequest, res: Response) => {
    const statusFilter = cleanText(req.query.status, 30);
    let list = dbStore.getProperties();
    if (statusFilter && statusFilter !== 'all') {
      list = list.filter((p) => p.status === statusFilter);
    }
    res.json({ properties: list.map((p) => sanitizePropertyForViewer(p, req.user)) });
  });

  app.post('/api/admin/properties/:id/moderate', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid property ID.' });
      return;
    }
    const prop = dbStore.findPropertyById(id);
    if (!prop) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }
    const action = req.body?.action;
    const reason = cleanText(req.body?.reason, 400);
    const now = new Date().toISOString();

    if (action === 'approve') {
      prop.status = 'active';
      prop.rejectionReason = undefined;
      prop.lastConfirmedAt = now;
      createNotification(
        prop.sellerId,
        'listing_approved',
        'Listing approved & live',
        `Your listing "${prop.title}" has been approved and is now visible in search.`,
        prop.propertyId
      );
    } else if (action === 'reject') {
      if (!reason) {
        res.status(400).json({ error: 'A rejection or edit-request reason is required.' });
        return;
      }
      prop.status = 'rejected';
      prop.rejectionReason = reason;
      createNotification(
        prop.sellerId,
        'listing_rejected',
        'Listing requires edits',
        `Admin feedback for "${prop.title}": ${reason}`,
        prop.propertyId
      );
    } else if (action === 'unpublish') {
      prop.status = 'paused';
      prop.rejectionReason = reason || 'Unpublished by moderator';
      createNotification(
        prop.sellerId,
        'listing_rejected',
        'Listing unpublished by moderator',
        `"${prop.title}" was unpublished: ${prop.rejectionReason}`,
        prop.propertyId
      );
    } else if (action === 'toggle_featured') {
      prop.featured = !prop.featured;
    } else {
      res.status(400).json({ error: 'Unsupported moderation action.' });
      return;
    }

    prop.updatedAt = now;
    dbStore.updateProperty(prop);
    addAuditLog(
      req.user!,
      `PROPERTY_${String(action).toUpperCase()}`,
      'property',
      prop.propertyId,
      reason || `Action ${action} applied`
    );
    pushEvent([prop.sellerId], 'property_updated', { propertyId: prop.propertyId, status: prop.status });
    res.json({ property: sanitizePropertyForViewer(prop, req.user) });
  });

  app.get('/api/admin/users', requireAdmin, (_req: AuthedRequest, res: Response) => {
    res.json({ users: dbStore.getUsers(false).map(sanitizeUser) });
  });

  app.post('/api/admin/users/:id/status', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    const target = dbStore.findUserById(id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.uid === req.user!.uid) {
      res.status(400).json({ error: 'Cannot change your own admin account status.' });
      return;
    }
    const status = req.body?.accountStatus;
    const verificationStatus = req.body?.verificationStatus;
    const reason = cleanText(req.body?.reason, 300) || 'Account status updated by administrator';

    if (status === 'active' || status === 'restricted' || status === 'suspended') {
      target.accountStatus = status;
    }
    if (verificationStatus === 'verified' || verificationStatus === 'unverified') {
      target.verificationStatus = verificationStatus;
      target.verifiedAt = verificationStatus === 'verified' ? new Date().toISOString() : undefined;
    }
    target.updatedAt = new Date().toISOString();
    dbStore.updateUser(target);
    if (target.role === 'seller') {
      dbStore.syncSellerOnProperties(target);
    }
    addAuditLog(req.user!, 'USER_MODERATION', 'user', target.uid, reason);
    res.json({ user: sanitizeUser(target) });
  });

  app.get('/api/admin/reports', requireAdmin, (_req: AuthedRequest, res: Response) => {
    res.json({ reports: dbStore.getReports() });
  });

  app.post('/api/admin/reports/:id/resolve', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid report ID.' });
      return;
    }
    const report = dbStore.findReportById(id);
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    const status = req.body?.status;
    const moderationNote = cleanText(req.body?.moderationNote, 500);
    if (
      status !== 'reviewing' &&
      status !== 'action_taken' &&
      status !== 'dismissed' &&
      status !== 'closed'
    ) {
      res.status(400).json({ error: 'Invalid report status.' });
      return;
    }
    report.status = status;
    report.moderationNote = moderationNote;
    report.reviewedBy = req.user!.uid;
    report.updatedAt = new Date().toISOString();
    dbStore.updateReport(report);

    createNotification(
      report.reporterId,
      'report_update',
      'Update on your report',
      `Your report on "${report.targetLabel}" is now marked "${status.replace('_', ' ')}".`,
      report.reportId
    );
    addAuditLog(
      req.user!,
      `REPORT_${status.toUpperCase()}`,
      'report',
      report.reportId,
      moderationNote || 'Report reviewed'
    );
    res.json({ report });
  });

  app.post('/api/admin/support-tickets/:id/update', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid ticket ID.' });
      return;
    }
    const ticket = dbStore.findSupportTicketById(id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const status = req.body?.status;
    const adminReply = cleanText(req.body?.adminReply, 1000);
    if (status === 'open' || status === 'in_progress' || status === 'resolved' || status === 'closed') {
      ticket.status = status;
    }
    if (adminReply) ticket.adminReply = adminReply;
    ticket.updatedAt = new Date().toISOString();
    dbStore.updateSupportTicket(ticket);
    addAuditLog(req.user!, 'SUPPORT_TICKET_UPDATE', 'support', ticket.ticketId, adminReply || status);
    res.json({ ticket });
  });

  app.put('/api/admin/config', requireAdmin, (req: AuthedRequest, res: Response) => {
    const cfg = dbStore.getConfig();
    if (Array.isArray(req.body?.categories)) {
      const cats = req.body.categories.map((c: unknown) => cleanText(c, 40)).filter(Boolean);
      if (cats.length > 0) cfg.categories = cats;
    }
    if (Array.isArray(req.body?.cities)) {
      const validCities = req.body.cities
        .filter(
          (c: unknown): c is { name: string; lat: number; lng: number; areas: string[] } =>
            Boolean(c && typeof c === 'object' && 'name' in c)
        )
        .map((c: { name: string; lat: number; lng: number; areas: string[] }) => ({
          name: cleanText(c.name, 60),
          lat: Number.isFinite(Number(c.lat)) ? Number(c.lat) : 31.5204,
          lng: Number.isFinite(Number(c.lng)) ? Number(c.lng) : 74.3587,
          areas: Array.isArray(c.areas)
            ? c.areas.map((a: unknown) => cleanText(a, 60)).filter(Boolean)
            : [],
        }))
        .filter((c: { name: string }) => Boolean(c.name));
      if (validCities.length > 0) cfg.cities = validCities;
    }
    if (Number.isFinite(Number(req.body?.maxPhotosPerListing))) {
      cfg.maxPhotosPerListing = Math.max(5, Math.min(20, Number(req.body.maxPhotosPerListing)));
    }
    if (typeof req.body?.supportEmail === 'string' && isValidEmail(req.body.supportEmail)) {
      cfg.supportEmail = req.body.supportEmail.trim();
    }
    if (typeof req.body?.supportPhone === 'string') {
      cfg.supportPhone = cleanText(req.body.supportPhone, 40);
    }

    dbStore.saveConfig(cfg);
    addAuditLog(req.user!, 'UPDATE_PLATFORM_CONFIG', 'config', 'platform_config', 'Updated platform settings');
    res.json({ config: cfg });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (_req: AuthedRequest, res: Response) => {
    res.json({ logs: dbStore.getAuditLogs(100) });
  });

  app.get('/api/admin/export-bundle', requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const zipBuffer = buildProjectZipBuffer(process.cwd());
      addAuditLog(
        req.user!,
        'EXPORT_APP_BUNDLE',
        'config',
        'project_zip',
        'Downloaded single-file project ZIP bundle'
      );
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="rent-a-house-app.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(zipBuffer);
    } catch {
      res.status(500).json({ error: 'Failed to generate application download package.' });
    }
  });

  app.get('/api/admin/export-database', requireAdmin, (req: AuthedRequest, res: Response) => {
    try {
      const dbBuffer = dbStore.createDatabaseBackupBuffer();
      addAuditLog(
        req.user!,
        'EXPORT_DATABASE_BACKUP',
        'config',
        'sqlite_db',
        'Downloaded SQLite database backup'
      );
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="rent_a_house.db"');
      res.setHeader('Content-Length', String(dbBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(dbBuffer);
    } catch {
      res.status(500).json({ error: 'Failed to export SQLite database backup.' });
    }
  });

  app.get('/api/export/package', (req: Request, res: Response) => {
    const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
      res.status(403).json({ error: 'Invalid or expired download link.' });
      return;
    }
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    if (!dbStore.isValidExportToken(tokenHash)) {
      res.status(403).json({ error: 'Invalid or expired download link.' });
      return;
    }
    try {
      const zipBuffer = buildProjectZipBuffer(process.cwd());
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="rent-a-house-app.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      res.send(zipBuffer);
    } catch {
      res.status(500).json({ error: 'Failed to generate application download package.' });
    }
  });

  // ---------------- VITE / STATIC SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rent a House server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
