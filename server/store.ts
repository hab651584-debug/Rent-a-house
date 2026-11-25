import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AdminAuditLog,
  AppNotification,
  ChatMessage,
  Conversation,
  ModerationReport,
  PlatformConfig,
  PropertyListing,
  RentalRequest,
  SupportTicket,
  UserProfile,
} from '../src/types.ts';

export interface StoredUser extends UserProfile {
  passwordHash?: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SQLITE_FILE = path.join(DATA_DIR, 'rent_a_house.db');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'rent_a_house_db.json');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function getDefaultPlatformConfig(): PlatformConfig {
  return {
    categories: ['House', 'Flat', 'Portion', 'Room', 'Apartment', 'Commercial'],
    cities: [
      {
        name: 'Lahore',
        lat: 31.5204,
        lng: 74.3587,
        areas: ['DHA', 'Gulberg', 'Johar Town', 'Bahria Town', 'Model Town', 'Wapda Town'],
      },
      {
        name: 'Islamabad',
        lat: 33.6844,
        lng: 73.0479,
        areas: ['F-10', 'F-11', 'F-7', 'F-6', 'G-11', 'E-11', 'DHA Islamabad', 'Bahria Town'],
      },
      {
        name: 'Karachi',
        lat: 24.8607,
        lng: 67.0011,
        areas: ['Clifton', 'DHA Karachi', 'Gulshan-e-Iqbal', 'PECHS', 'North Nazimabad'],
      },
      {
        name: 'Rawalpindi',
        lat: 33.5651,
        lng: 73.0169,
        areas: ['Bahria Town', 'Chaklala Scheme III', 'Satellite Town', 'Saddar'],
      },
      {
        name: 'Faisalabad',
        lat: 31.4504,
        lng: 73.135,
        areas: ['Peoples Colony', 'D Ground', 'Madina Town', 'Canal Road'],
      },
      {
        name: 'Multan',
        lat: 30.1575,
        lng: 71.5249,
        areas: ['Cantt', 'Model Town', 'DHA Multan', 'Bosan Road'],
      },
    ],
    maxPhotosPerListing: 15,
    minPhotosPerListing: 1,
    supportEmail: 'support@rentahouse.pk',
    supportPhone: '+92 300 0000000',
    safetyNotice:
      'Never transfer rent, token money, or security deposits before inspecting the property in person, verifying the landlord/agent authority, and signing a written tenancy agreement.',
  };
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type DbRow = Record<string, unknown>;

function mapUserRow(row: DbRow): StoredUser {
  return {
    uid: String(row.uid),
    role: row.role as StoredUser['role'],
    displayName: String(row.displayName),
    email: String(row.email),
    phone: String(row.phone || ''),
    photoURL: String(row.photoURL || ''),
    preferredCity: String(row.preferredCity || 'Lahore'),
    accountStatus: row.accountStatus as StoredUser['accountStatus'],
    verificationStatus: row.verificationStatus as StoredUser['verificationStatus'],
    verifiedAt: row.verifiedAt ? String(row.verifiedAt) : undefined,
    showPhonePublicly: Boolean(row.showPhonePublicly),
    showEmailPublicly: Boolean(row.showEmailPublicly),
    sellerRoleLabel: row.sellerRoleLabel
      ? (String(row.sellerRoleLabel) as StoredUser['sellerRoleLabel'])
      : undefined,
    passwordHash: row.passwordHash ? String(row.passwordHash) : undefined,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapPropertyRow(row: DbRow): PropertyListing {
  return {
    propertyId: String(row.propertyId),
    sellerId: String(row.sellerId),
    sellerName: String(row.sellerName),
    sellerRoleLabel: (String(row.sellerRoleLabel || 'Property Owner') as PropertyListing['sellerRoleLabel']),
    sellerPhotoURL: String(row.sellerPhotoURL || ''),
    sellerVerified: Boolean(row.sellerVerified),
    sellerPhone: row.sellerPhone ? String(row.sellerPhone) : undefined,
    title: String(row.title),
    category: String(row.category),
    description: String(row.description),
    rent: Number(row.rent),
    negotiable: Boolean(row.negotiable),
    deposit: Number(row.deposit || 0),
    advanceRent: Number(row.advanceRent || 0),
    additionalCharges: String(row.additionalCharges || ''),
    city: String(row.city),
    area: String(row.area),
    society: String(row.society || ''),
    addressVisibility: (row.addressVisibility === 'exact_public' ? 'exact_public' : 'approximate'),
    exactAddress: row.exactAddress ? String(row.exactAddress) : undefined,
    location: { lat: Number(row.lat), lng: Number(row.lng) },
    bedrooms: Number(row.bedrooms || 0),
    bathrooms: Number(row.bathrooms || 0),
    floorPortion: String(row.floorPortion || 'Full House'),
    coveredArea: Number(row.coveredArea || 0),
    coveredAreaUnit: (String(row.coveredAreaUnit || 'Sq. Ft.') as PropertyListing['coveredAreaUnit']),
    furnishing: (String(row.furnishing || 'Unfurnished') as PropertyListing['furnishing']),
    facilities: parseJson<string[]>(row.facilitiesJson, []),
    parking: Boolean(row.parking),
    availabilityDate: String(row.availabilityDate),
    contactPreference: (String(row.contactPreference || 'In-app') as PropertyListing['contactPreference']),
    preferredTenant: String(row.preferredTenant || ''),
    imageURLs: parseJson<string[]>(row.imageURLsJson, []),
    status: row.status as PropertyListing['status'],
    rejectionReason: row.rejectionReason ? String(row.rejectionReason) : undefined,
    featured: Boolean(row.featured),
    lastConfirmedAt: String(row.lastConfirmedAt),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapRequestRow(row: DbRow): RentalRequest {
  return {
    requestId: String(row.requestId),
    propertyId: String(row.propertyId),
    propertyTitle: String(row.propertyTitle),
    propertyCity: String(row.propertyCity),
    propertyArea: String(row.propertyArea),
    propertyRent: Number(row.propertyRent),
    propertyImage: String(row.propertyImage || ''),
    buyerId: String(row.buyerId),
    buyerName: String(row.buyerName),
    buyerPhone: String(row.buyerPhone || ''),
    sellerId: String(row.sellerId),
    sellerName: String(row.sellerName),
    message: String(row.message),
    preferredVisit: String(row.preferredVisit || 'Flexible'),
    status: row.status as RentalRequest['status'],
    statusHistory: parseJson<RentalRequest['statusHistory']>(row.statusHistoryJson, []),
    sellerResponse: row.sellerResponse ? String(row.sellerResponse) : undefined,
    declineReason: row.declineReason ? String(row.declineReason) : undefined,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapConversationRow(row: DbRow): Conversation {
  return {
    conversationId: String(row.conversationId),
    propertyId: String(row.propertyId),
    propertyTitle: String(row.propertyTitle),
    propertyImage: String(row.propertyImage || ''),
    propertyRent: Number(row.propertyRent),
    buyerId: String(row.buyerId),
    buyerName: String(row.buyerName),
    sellerId: String(row.sellerId),
    sellerName: String(row.sellerName),
    lastMessage: String(row.lastMessage || ''),
    lastMessageAt: String(row.lastMessageAt),
    unreadByBuyer: Number(row.unreadByBuyer || 0),
    unreadBySeller: Number(row.unreadBySeller || 0),
    blockedBy: parseJson<string[]>(row.blockedByJson, []),
    createdAt: String(row.createdAt),
  };
}

function mapMessageRow(row: DbRow): ChatMessage {
  return {
    messageId: String(row.messageId),
    conversationId: String(row.conversationId),
    senderId: String(row.senderId),
    senderName: String(row.senderName),
    text: String(row.text),
    attachmentURL: row.attachmentURL ? String(row.attachmentURL) : undefined,
    readAt: row.readAt ? String(row.readAt) : undefined,
    createdAt: String(row.createdAt),
  };
}

function mapNotificationRow(row: DbRow): AppNotification {
  return {
    notificationId: String(row.notificationId),
    recipientId: String(row.recipientId),
    type: row.type as AppNotification['type'],
    title: String(row.title),
    body: String(row.body),
    relatedId: row.relatedId ? String(row.relatedId) : undefined,
    readAt: row.readAt ? String(row.readAt) : undefined,
    createdAt: String(row.createdAt),
  };
}

function mapReportRow(row: DbRow): ModerationReport {
  return {
    reportId: String(row.reportId),
    reporterId: String(row.reporterId),
    reporterName: String(row.reporterName),
    targetType: row.targetType as ModerationReport['targetType'],
    targetId: String(row.targetId),
    targetLabel: String(row.targetLabel),
    reason: String(row.reason),
    details: String(row.details || ''),
    status: row.status as ModerationReport['status'],
    moderationNote: row.moderationNote ? String(row.moderationNote) : undefined,
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : undefined,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapSupportTicketRow(row: DbRow): SupportTicket {
  return {
    ticketId: String(row.ticketId),
    userId: row.userId ? String(row.userId) : undefined,
    userName: String(row.userName),
    userEmail: String(row.userEmail),
    subject: String(row.subject),
    message: String(row.message),
    status: row.status as SupportTicket['status'],
    adminReply: row.adminReply ? String(row.adminReply) : undefined,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function mapAuditLogRow(row: DbRow): AdminAuditLog {
  return {
    logId: String(row.logId),
    adminId: String(row.adminId),
    adminName: String(row.adminName),
    action: String(row.action),
    targetType: row.targetType as AdminAuditLog['targetType'],
    targetId: String(row.targetId),
    reason: String(row.reason),
    createdAt: String(row.createdAt),
  };
}

class SqliteStore {
  private db: DatabaseSync;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.db = new DatabaseSync(SQLITE_FILE);
    this.initSchema();
    this.migrateLegacyJsonIfNeeded();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('buyer', 'seller', 'admin')),
        displayName TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL DEFAULT '',
        photoURL TEXT NOT NULL DEFAULT '',
        preferredCity TEXT NOT NULL DEFAULT 'Lahore',
        accountStatus TEXT NOT NULL DEFAULT 'active',
        verificationStatus TEXT NOT NULL DEFAULT 'unverified',
        verifiedAt TEXT,
        showPhonePublicly INTEGER NOT NULL DEFAULT 0,
        showEmailPublicly INTEGER NOT NULL DEFAULT 0,
        sellerRoleLabel TEXT,
        passwordHash TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS properties (
        propertyId TEXT PRIMARY KEY,
        sellerId TEXT NOT NULL,
        sellerName TEXT NOT NULL,
        sellerRoleLabel TEXT NOT NULL DEFAULT 'Property Owner',
        sellerPhotoURL TEXT NOT NULL DEFAULT '',
        sellerVerified INTEGER NOT NULL DEFAULT 0,
        sellerPhone TEXT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        rent INTEGER NOT NULL,
        negotiable INTEGER NOT NULL DEFAULT 0,
        deposit INTEGER NOT NULL DEFAULT 0,
        advanceRent INTEGER NOT NULL DEFAULT 0,
        additionalCharges TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL,
        area TEXT NOT NULL,
        society TEXT NOT NULL DEFAULT '',
        addressVisibility TEXT NOT NULL DEFAULT 'approximate',
        exactAddress TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        bedrooms INTEGER NOT NULL DEFAULT 0,
        bathrooms INTEGER NOT NULL DEFAULT 0,
        floorPortion TEXT NOT NULL DEFAULT 'Full House',
        coveredArea REAL NOT NULL DEFAULT 0,
        coveredAreaUnit TEXT NOT NULL DEFAULT 'Sq. Ft.',
        furnishing TEXT NOT NULL DEFAULT 'Unfurnished',
        facilitiesJson TEXT NOT NULL DEFAULT '[]',
        parking INTEGER NOT NULL DEFAULT 0,
        availabilityDate TEXT NOT NULL,
        contactPreference TEXT NOT NULL DEFAULT 'In-app',
        preferredTenant TEXT NOT NULL DEFAULT '',
        imageURLsJson TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'under_review',
        rejectionReason TEXT,
        featured INTEGER NOT NULL DEFAULT 0,
        lastConfirmedAt TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY(sellerId) REFERENCES users(uid)
      );

      CREATE TABLE IF NOT EXISTS rental_requests (
        requestId TEXT PRIMARY KEY,
        propertyId TEXT NOT NULL,
        propertyTitle TEXT NOT NULL,
        propertyCity TEXT NOT NULL,
        propertyArea TEXT NOT NULL,
        propertyRent INTEGER NOT NULL,
        propertyImage TEXT NOT NULL DEFAULT '',
        buyerId TEXT NOT NULL,
        buyerName TEXT NOT NULL,
        buyerPhone TEXT NOT NULL DEFAULT '',
        sellerId TEXT NOT NULL,
        sellerName TEXT NOT NULL,
        message TEXT NOT NULL,
        preferredVisit TEXT NOT NULL DEFAULT 'Flexible',
        status TEXT NOT NULL DEFAULT 'pending',
        statusHistoryJson TEXT NOT NULL DEFAULT '[]',
        sellerResponse TEXT,
        declineReason TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        conversationId TEXT PRIMARY KEY,
        propertyId TEXT NOT NULL,
        propertyTitle TEXT NOT NULL,
        propertyImage TEXT NOT NULL DEFAULT '',
        propertyRent INTEGER NOT NULL,
        buyerId TEXT NOT NULL,
        buyerName TEXT NOT NULL,
        sellerId TEXT NOT NULL,
        sellerName TEXT NOT NULL,
        lastMessage TEXT NOT NULL DEFAULT '',
        lastMessageAt TEXT NOT NULL,
        unreadByBuyer INTEGER NOT NULL DEFAULT 0,
        unreadBySeller INTEGER NOT NULL DEFAULT 0,
        blockedByJson TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        messageId TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        senderName TEXT NOT NULL,
        text TEXT NOT NULL,
        attachmentURL TEXT,
        readAt TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(conversationId) REFERENCES conversations(conversationId) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS favourites (
        favouriteId TEXT PRIMARY KEY,
        buyerId TEXT NOT NULL,
        propertyId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        UNIQUE(buyerId, propertyId)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        notificationId TEXT PRIMARY KEY,
        recipientId TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        relatedId TEXT,
        readAt TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reports (
        reportId TEXT PRIMARY KEY,
        reporterId TEXT NOT NULL,
        reporterName TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        targetLabel TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        moderationNote TEXT,
        reviewedBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS support_tickets (
        ticketId TEXT PRIMARY KEY,
        userId TEXT,
        userName TEXT NOT NULL,
        userEmail TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        adminReply TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        logId TEXT PRIMARY KEY,
        adminId TEXT NOT NULL,
        adminName TEXT NOT NULL,
        action TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        reason TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS platform_config (
        id TEXT PRIMARY KEY,
        categoriesJson TEXT NOT NULL,
        citiesJson TEXT NOT NULL,
        maxPhotosPerListing INTEGER NOT NULL,
        minPhotosPerListing INTEGER NOT NULL,
        supportEmail TEXT NOT NULL,
        supportPhone TEXT NOT NULL,
        safetyNotice TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS export_tokens (
        tokenHash TEXT PRIMARY KEY,
        expiresAt TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_properties_seller ON properties(sellerId);
      CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
      CREATE INDEX IF NOT EXISTS idx_requests_buyer ON rental_requests(buyerId);
      CREATE INDEX IF NOT EXISTS idx_requests_seller ON rental_requests(sellerId);
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversationId);
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipientId);
    `);

    const cfgRow = this.db
      .prepare('SELECT id FROM platform_config WHERE id = ?')
      .get('default');
    if (!cfgRow) {
      this.saveConfig(getDefaultPlatformConfig());
    }
  }

  private migrateLegacyJsonIfNeeded(): void {
    const userCountRow = this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (userCountRow.count > 0 || !fs.existsSync(LEGACY_JSON_FILE)) {
      return;
    }
    try {
      const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf8');
      const parsed = JSON.parse(raw) as {
        users?: StoredUser[];
        properties?: PropertyListing[];
        rentalRequests?: RentalRequest[];
        conversations?: Conversation[];
        messages?: ChatMessage[];
        favourites?: { favouriteId: string; buyerId: string; propertyId: string; createdAt: string }[];
        notifications?: AppNotification[];
        reports?: ModerationReport[];
        supportTickets?: SupportTicket[];
        adminAuditLogs?: AdminAuditLog[];
        config?: PlatformConfig;
      };

      if (parsed.config) {
        this.saveConfig(parsed.config);
      }
      for (const u of parsed.users || []) {
        this.createUser(u);
      }
      for (const p of parsed.properties || []) {
        this.createProperty(p);
      }
      for (const r of parsed.rentalRequests || []) {
        this.createRequest(r);
      }
      for (const c of parsed.conversations || []) {
        this.createConversation(c);
      }
      for (const m of parsed.messages || []) {
        this.createMessage(m);
      }
      for (const f of parsed.favourites || []) {
        this.db
          .prepare(
            'INSERT OR IGNORE INTO favourites (favouriteId, buyerId, propertyId, createdAt) VALUES (?, ?, ?, ?)'
          )
          .run(f.favouriteId, f.buyerId, f.propertyId, f.createdAt);
      }
      for (const n of parsed.notifications || []) {
        this.createNotificationRow(n);
      }
      for (const rep of parsed.reports || []) {
        this.createReport(rep);
      }
      for (const sup of parsed.supportTickets || []) {
        this.createSupportTicket(sup);
      }
      for (const log of parsed.adminAuditLogs || []) {
        this.addAuditLogRow(log);
      }
    } catch (err) {
      console.error('Legacy JSON to SQLite migration skipped:', err);
    }
  }

  // ---------------- USERS ----------------
  getUsers(includeDeleted = false): StoredUser[] {
    const sql = includeDeleted
      ? 'SELECT * FROM users ORDER BY createdAt DESC'
      : "SELECT * FROM users WHERE accountStatus != 'deleted' ORDER BY createdAt DESC";
    return (this.db.prepare(sql).all() as DbRow[]).map(mapUserRow);
  }

  findUserById(uid: string): StoredUser | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as DbRow | undefined;
    return row ? mapUserRow(row) : undefined;
  }

  findUserByEmail(email: string): StoredUser | undefined {
    const row = this.db
      .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND accountStatus != 'deleted'")
      .get(email) as DbRow | undefined;
    return row ? mapUserRow(row) : undefined;
  }

  emailExistsAnywhere(email: string): boolean {
    const row = this.db
      .prepare('SELECT uid FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as DbRow | undefined;
    return Boolean(row);
  }

  hasActiveAdmin(): boolean {
    const row = this.db
      .prepare("SELECT uid FROM users WHERE role = 'admin' AND accountStatus != 'deleted' LIMIT 1")
      .get() as DbRow | undefined;
    return Boolean(row);
  }

  getActiveAdminIds(): string[] {
    const rows = this.db
      .prepare("SELECT uid FROM users WHERE role = 'admin' AND accountStatus != 'deleted'")
      .all() as { uid: string }[];
    return rows.map((r) => r.uid);
  }

  createUser(user: StoredUser): void {
    this.db
      .prepare(
        `INSERT INTO users (
          uid, role, displayName, email, phone, photoURL, preferredCity,
          accountStatus, verificationStatus, verifiedAt, showPhonePublicly, showEmailPublicly,
          sellerRoleLabel, passwordHash, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.uid,
        user.role,
        user.displayName,
        user.email,
        user.phone,
        user.photoURL,
        user.preferredCity,
        user.accountStatus,
        user.verificationStatus,
        user.verifiedAt ?? null,
        user.showPhonePublicly ? 1 : 0,
        user.showEmailPublicly ? 1 : 0,
        user.sellerRoleLabel ?? null,
        user.passwordHash ?? null,
        user.createdAt,
        user.updatedAt
      );
  }

  updateUser(user: StoredUser): void {
    this.db
      .prepare(
        `UPDATE users SET
          displayName = ?, phone = ?, photoURL = ?, preferredCity = ?,
          accountStatus = ?, verificationStatus = ?, verifiedAt = ?,
          showPhonePublicly = ?, showEmailPublicly = ?, sellerRoleLabel = ?,
          passwordHash = ?, updatedAt = ?
         WHERE uid = ?`
      )
      .run(
        user.displayName,
        user.phone,
        user.photoURL,
        user.preferredCity,
        user.accountStatus,
        user.verificationStatus,
        user.verifiedAt ?? null,
        user.showPhonePublicly ? 1 : 0,
        user.showEmailPublicly ? 1 : 0,
        user.sellerRoleLabel ?? null,
        user.passwordHash ?? null,
        user.updatedAt,
        user.uid
      );
  }

  // ---------------- PROPERTIES ----------------
  getProperties(): PropertyListing[] {
    const rows = this.db
      .prepare('SELECT * FROM properties ORDER BY createdAt DESC')
      .all() as DbRow[];
    return rows.map(mapPropertyRow);
  }

  findPropertyById(propertyId: string): PropertyListing | undefined {
    const row = this.db
      .prepare('SELECT * FROM properties WHERE propertyId = ?')
      .get(propertyId) as DbRow | undefined;
    return row ? mapPropertyRow(row) : undefined;
  }

  findDuplicateProperty(sellerId: string, title: string, city: string, area: string): boolean {
    const row = this.db
      .prepare(
        `SELECT propertyId FROM properties
         WHERE sellerId = ? AND LOWER(title) = LOWER(?) AND LOWER(city) = LOWER(?) AND LOWER(area) = LOWER(?) AND status != 'rejected'
         LIMIT 1`
      )
      .get(sellerId, title, city, area) as DbRow | undefined;
    return Boolean(row);
  }

  createProperty(prop: PropertyListing): void {
    this.db
      .prepare(
        `INSERT INTO properties (
          propertyId, sellerId, sellerName, sellerRoleLabel, sellerPhotoURL, sellerVerified, sellerPhone,
          title, category, description, rent, negotiable, deposit, advanceRent, additionalCharges,
          city, area, society, addressVisibility, exactAddress, lat, lng,
          bedrooms, bathrooms, floorPortion, coveredArea, coveredAreaUnit, furnishing,
          facilitiesJson, parking, availabilityDate, contactPreference, preferredTenant,
          imageURLsJson, status, rejectionReason, featured, lastConfirmedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        prop.propertyId,
        prop.sellerId,
        prop.sellerName,
        prop.sellerRoleLabel,
        prop.sellerPhotoURL,
        prop.sellerVerified ? 1 : 0,
        prop.sellerPhone ?? null,
        prop.title,
        prop.category,
        prop.description,
        prop.rent,
        prop.negotiable ? 1 : 0,
        prop.deposit,
        prop.advanceRent,
        prop.additionalCharges,
        prop.city,
        prop.area,
        prop.society,
        prop.addressVisibility,
        prop.exactAddress ?? null,
        prop.location.lat,
        prop.location.lng,
        prop.bedrooms,
        prop.bathrooms,
        prop.floorPortion,
        prop.coveredArea,
        prop.coveredAreaUnit,
        prop.furnishing,
        JSON.stringify(prop.facilities),
        prop.parking ? 1 : 0,
        prop.availabilityDate,
        prop.contactPreference,
        prop.preferredTenant,
        JSON.stringify(prop.imageURLs),
        prop.status,
        prop.rejectionReason ?? null,
        prop.featured ? 1 : 0,
        prop.lastConfirmedAt,
        prop.createdAt,
        prop.updatedAt
      );
  }

  updateProperty(prop: PropertyListing): void {
    this.db
      .prepare(
        `UPDATE properties SET
          sellerName = ?, sellerRoleLabel = ?, sellerPhotoURL = ?, sellerVerified = ?, sellerPhone = ?,
          title = ?, category = ?, description = ?, rent = ?, negotiable = ?, deposit = ?, advanceRent = ?,
          additionalCharges = ?, city = ?, area = ?, society = ?, addressVisibility = ?, exactAddress = ?,
          lat = ?, lng = ?, bedrooms = ?, bathrooms = ?, floorPortion = ?, coveredArea = ?, coveredAreaUnit = ?,
          furnishing = ?, facilitiesJson = ?, parking = ?, availabilityDate = ?, contactPreference = ?,
          preferredTenant = ?, imageURLsJson = ?, status = ?, rejectionReason = ?, featured = ?,
          lastConfirmedAt = ?, updatedAt = ?
         WHERE propertyId = ?`
      )
      .run(
        prop.sellerName,
        prop.sellerRoleLabel,
        prop.sellerPhotoURL,
        prop.sellerVerified ? 1 : 0,
        prop.sellerPhone ?? null,
        prop.title,
        prop.category,
        prop.description,
        prop.rent,
        prop.negotiable ? 1 : 0,
        prop.deposit,
        prop.advanceRent,
        prop.additionalCharges,
        prop.city,
        prop.area,
        prop.society,
        prop.addressVisibility,
        prop.exactAddress ?? null,
        prop.location.lat,
        prop.location.lng,
        prop.bedrooms,
        prop.bathrooms,
        prop.floorPortion,
        prop.coveredArea,
        prop.coveredAreaUnit,
        prop.furnishing,
        JSON.stringify(prop.facilities),
        prop.parking ? 1 : 0,
        prop.availabilityDate,
        prop.contactPreference,
        prop.preferredTenant,
        JSON.stringify(prop.imageURLs),
        prop.status,
        prop.rejectionReason ?? null,
        prop.featured ? 1 : 0,
        prop.lastConfirmedAt,
        prop.updatedAt,
        prop.propertyId
      );
  }

  syncSellerOnProperties(seller: StoredUser): void {
    this.db
      .prepare(
        `UPDATE properties SET
          sellerName = ?, sellerRoleLabel = ?, sellerPhotoURL = ?, sellerVerified = ?, sellerPhone = ?
         WHERE sellerId = ?`
      )
      .run(
        seller.displayName,
        seller.sellerRoleLabel || 'Property Owner',
        seller.photoURL,
        seller.verificationStatus === 'verified' ? 1 : 0,
        seller.phone,
        seller.uid
      );
  }

  deleteProperty(propertyId: string): void {
    this.db.prepare('DELETE FROM favourites WHERE propertyId = ?').run(propertyId);
    this.db.prepare('DELETE FROM properties WHERE propertyId = ?').run(propertyId);
  }

  // ---------------- FAVOURITES ----------------
  getFavouriteIdsByBuyer(buyerId: string): string[] {
    const rows = this.db
      .prepare('SELECT propertyId FROM favourites WHERE buyerId = ? ORDER BY createdAt DESC')
      .all(buyerId) as { propertyId: string }[];
    return rows.map((r) => r.propertyId);
  }

  toggleFavourite(buyerId: string, propertyId: string): boolean {
    const existing = this.db
      .prepare('SELECT favouriteId FROM favourites WHERE buyerId = ? AND propertyId = ?')
      .get(buyerId, propertyId) as { favouriteId: string } | undefined;
    if (existing) {
      this.db
        .prepare('DELETE FROM favourites WHERE favouriteId = ?')
        .run(existing.favouriteId);
      return false;
    }
    this.db
      .prepare(
        'INSERT INTO favourites (favouriteId, buyerId, propertyId, createdAt) VALUES (?, ?, ?, ?)'
      )
      .run(`fav_${crypto.randomUUID().slice(0, 10)}`, buyerId, propertyId, new Date().toISOString());
    return true;
  }

  // ---------------- RENTAL REQUESTS ----------------
  getRequests(): RentalRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM rental_requests ORDER BY createdAt DESC')
      .all() as DbRow[];
    return rows.map(mapRequestRow);
  }

  getRequestsForUser(uid: string, role: StoredUser['role']): RentalRequest[] {
    if (role === 'buyer') {
      return (
        this.db
          .prepare('SELECT * FROM rental_requests WHERE buyerId = ? ORDER BY createdAt DESC')
          .all(uid) as DbRow[]
      ).map(mapRequestRow);
    }
    if (role === 'seller') {
      return (
        this.db
          .prepare('SELECT * FROM rental_requests WHERE sellerId = ? ORDER BY createdAt DESC')
          .all(uid) as DbRow[]
      ).map(mapRequestRow);
    }
    return this.getRequests();
  }

  hasApprovedVisit(propertyId: string, buyerId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT requestId FROM rental_requests
         WHERE propertyId = ? AND buyerId = ? AND status IN ('viewing_arranged', 'accepted')
         LIMIT 1`
      )
      .get(propertyId, buyerId) as DbRow | undefined;
    return Boolean(row);
  }

  findRequestById(requestId: string): RentalRequest | undefined {
    const row = this.db
      .prepare('SELECT * FROM rental_requests WHERE requestId = ?')
      .get(requestId) as DbRow | undefined;
    return row ? mapRequestRow(row) : undefined;
  }

  createRequest(req: RentalRequest): void {
    this.db
      .prepare(
        `INSERT INTO rental_requests (
          requestId, propertyId, propertyTitle, propertyCity, propertyArea, propertyRent, propertyImage,
          buyerId, buyerName, buyerPhone, sellerId, sellerName, message, preferredVisit,
          status, statusHistoryJson, sellerResponse, declineReason, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.requestId,
        req.propertyId,
        req.propertyTitle,
        req.propertyCity,
        req.propertyArea,
        req.propertyRent,
        req.propertyImage,
        req.buyerId,
        req.buyerName,
        req.buyerPhone,
        req.sellerId,
        req.sellerName,
        req.message,
        req.preferredVisit,
        req.status,
        JSON.stringify(req.statusHistory),
        req.sellerResponse ?? null,
        req.declineReason ?? null,
        req.createdAt,
        req.updatedAt
      );
  }

  updateRequest(req: RentalRequest): void {
    this.db
      .prepare(
        `UPDATE rental_requests SET
          status = ?, statusHistoryJson = ?, sellerResponse = ?, declineReason = ?, updatedAt = ?
         WHERE requestId = ?`
      )
      .run(
        req.status,
        JSON.stringify(req.statusHistory),
        req.sellerResponse ?? null,
        req.declineReason ?? null,
        req.updatedAt,
        req.requestId
      );
  }

  // ---------------- CONVERSATIONS & MESSAGES ----------------
  getConversationsForUser(uid: string, role: StoredUser['role']): Conversation[] {
    if (role === 'admin') {
      return (
        this.db
          .prepare('SELECT * FROM conversations ORDER BY lastMessageAt DESC')
          .all() as DbRow[]
      ).map(mapConversationRow);
    }
    return (
      this.db
        .prepare(
          'SELECT * FROM conversations WHERE buyerId = ? OR sellerId = ? ORDER BY lastMessageAt DESC'
        )
        .all(uid, uid) as DbRow[]
    ).map(mapConversationRow);
  }

  findConversationById(conversationId: string): Conversation | undefined {
    const row = this.db
      .prepare('SELECT * FROM conversations WHERE conversationId = ?')
      .get(conversationId) as DbRow | undefined;
    return row ? mapConversationRow(row) : undefined;
  }

  findConversationByParticipants(
    propertyId: string,
    buyerId: string,
    sellerId: string
  ): Conversation | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM conversations WHERE propertyId = ? AND buyerId = ? AND sellerId = ? LIMIT 1'
      )
      .get(propertyId, buyerId, sellerId) as DbRow | undefined;
    return row ? mapConversationRow(row) : undefined;
  }

  createConversation(conv: Conversation): void {
    this.db
      .prepare(
        `INSERT INTO conversations (
          conversationId, propertyId, propertyTitle, propertyImage, propertyRent,
          buyerId, buyerName, sellerId, sellerName, lastMessage, lastMessageAt,
          unreadByBuyer, unreadBySeller, blockedByJson, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        conv.conversationId,
        conv.propertyId,
        conv.propertyTitle,
        conv.propertyImage,
        conv.propertyRent,
        conv.buyerId,
        conv.buyerName,
        conv.sellerId,
        conv.sellerName,
        conv.lastMessage,
        conv.lastMessageAt,
        conv.unreadByBuyer,
        conv.unreadBySeller,
        JSON.stringify(conv.blockedBy),
        conv.createdAt
      );
  }

  updateConversation(conv: Conversation): void {
    this.db
      .prepare(
        `UPDATE conversations SET
          lastMessage = ?, lastMessageAt = ?, unreadByBuyer = ?, unreadBySeller = ?, blockedByJson = ?
         WHERE conversationId = ?`
      )
      .run(
        conv.lastMessage,
        conv.lastMessageAt,
        conv.unreadByBuyer,
        conv.unreadBySeller,
        JSON.stringify(conv.blockedBy),
        conv.conversationId
      );
  }

  getMessagesByConversation(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC')
      .all(conversationId) as DbRow[];
    return rows.map(mapMessageRow);
  }

  createMessage(msg: ChatMessage): void {
    this.db
      .prepare(
        `INSERT INTO messages (
          messageId, conversationId, senderId, senderName, text, attachmentURL, readAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        msg.messageId,
        msg.conversationId,
        msg.senderId,
        msg.senderName,
        msg.text,
        msg.attachmentURL ?? null,
        msg.readAt ?? null,
        msg.createdAt
      );
  }

  markMessagesRead(conversationId: string, readerUid: string, now: string): void {
    this.db
      .prepare(
        'UPDATE messages SET readAt = ? WHERE conversationId = ? AND senderId != ? AND readAt IS NULL'
      )
      .run(now, conversationId, readerUid);
  }

  // ---------------- NOTIFICATIONS ----------------
  getNotificationsForUser(recipientId: string, limit = 50): AppNotification[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE recipientId = ? ORDER BY createdAt DESC LIMIT ?')
      .all(recipientId, limit) as DbRow[];
    return rows.map(mapNotificationRow);
  }

  createNotificationRow(notif: AppNotification): void {
    this.db
      .prepare(
        `INSERT INTO notifications (
          notificationId, recipientId, type, title, body, relatedId, readAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        notif.notificationId,
        notif.recipientId,
        notif.type,
        notif.title,
        notif.body,
        notif.relatedId ?? null,
        notif.readAt ?? null,
        notif.createdAt
      );
  }

  markAllNotificationsRead(recipientId: string, now: string): void {
    this.db
      .prepare('UPDATE notifications SET readAt = ? WHERE recipientId = ? AND readAt IS NULL')
      .run(now, recipientId);
  }

  // ---------------- REPORTS ----------------
  getReports(): ModerationReport[] {
    return (
      this.db.prepare('SELECT * FROM reports ORDER BY createdAt DESC').all() as DbRow[]
    ).map(mapReportRow);
  }

  findReportById(reportId: string): ModerationReport | undefined {
    const row = this.db
      .prepare('SELECT * FROM reports WHERE reportId = ?')
      .get(reportId) as DbRow | undefined;
    return row ? mapReportRow(row) : undefined;
  }

  createReport(rep: ModerationReport): void {
    this.db
      .prepare(
        `INSERT INTO reports (
          reportId, reporterId, reporterName, targetType, targetId, targetLabel,
          reason, details, status, moderationNote, reviewedBy, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rep.reportId,
        rep.reporterId,
        rep.reporterName,
        rep.targetType,
        rep.targetId,
        rep.targetLabel,
        rep.reason,
        rep.details,
        rep.status,
        rep.moderationNote ?? null,
        rep.reviewedBy ?? null,
        rep.createdAt,
        rep.updatedAt
      );
  }

  updateReport(rep: ModerationReport): void {
    this.db
      .prepare(
        `UPDATE reports SET status = ?, moderationNote = ?, reviewedBy = ?, updatedAt = ?
         WHERE reportId = ?`
      )
      .run(
        rep.status,
        rep.moderationNote ?? null,
        rep.reviewedBy ?? null,
        rep.updatedAt,
        rep.reportId
      );
  }

  // ---------------- SUPPORT TICKETS ----------------
  getSupportTickets(userId?: string): SupportTicket[] {
    if (userId) {
      return (
        this.db
          .prepare('SELECT * FROM support_tickets WHERE userId = ? ORDER BY createdAt DESC')
          .all(userId) as DbRow[]
      ).map(mapSupportTicketRow);
    }
    return (
      this.db.prepare('SELECT * FROM support_tickets ORDER BY createdAt DESC').all() as DbRow[]
    ).map(mapSupportTicketRow);
  }

  findSupportTicketById(ticketId: string): SupportTicket | undefined {
    const row = this.db
      .prepare('SELECT * FROM support_tickets WHERE ticketId = ?')
      .get(ticketId) as DbRow | undefined;
    return row ? mapSupportTicketRow(row) : undefined;
  }

  createSupportTicket(ticket: SupportTicket): void {
    this.db
      .prepare(
        `INSERT INTO support_tickets (
          ticketId, userId, userName, userEmail, subject, message, status, adminReply, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ticket.ticketId,
        ticket.userId ?? null,
        ticket.userName,
        ticket.userEmail,
        ticket.subject,
        ticket.message,
        ticket.status,
        ticket.adminReply ?? null,
        ticket.createdAt,
        ticket.updatedAt
      );
  }

  updateSupportTicket(ticket: SupportTicket): void {
    this.db
      .prepare(
        'UPDATE support_tickets SET status = ?, adminReply = ?, updatedAt = ? WHERE ticketId = ?'
      )
      .run(ticket.status, ticket.adminReply ?? null, ticket.updatedAt, ticket.ticketId);
  }

  // ---------------- AUDIT LOGS ----------------
  getAuditLogs(limit = 100): AdminAuditLog[] {
    return (
      this.db
        .prepare('SELECT * FROM admin_audit_logs ORDER BY createdAt DESC LIMIT ?')
        .all(limit) as DbRow[]
    ).map(mapAuditLogRow);
  }

  addAuditLogRow(log: AdminAuditLog): void {
    this.db
      .prepare(
        `INSERT INTO admin_audit_logs (
          logId, adminId, adminName, action, targetType, targetId, reason, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        log.logId,
        log.adminId,
        log.adminName,
        log.action,
        log.targetType,
        log.targetId,
        log.reason,
        log.createdAt
      );
  }

  // ---------------- PLATFORM CONFIG ----------------
  getConfig(): PlatformConfig {
    const row = this.db
      .prepare('SELECT * FROM platform_config WHERE id = ?')
      .get('default') as DbRow | undefined;
    if (!row) {
      const defaults = getDefaultPlatformConfig();
      this.saveConfig(defaults);
      return defaults;
    }
    const defaults = getDefaultPlatformConfig();
    return {
      categories: parseJson<string[]>(row.categoriesJson, defaults.categories),
      cities: parseJson<PlatformConfig['cities']>(row.citiesJson, defaults.cities),
      maxPhotosPerListing: Number(row.maxPhotosPerListing || defaults.maxPhotosPerListing),
      minPhotosPerListing: Number(row.minPhotosPerListing || defaults.minPhotosPerListing),
      supportEmail: String(row.supportEmail || defaults.supportEmail),
      supportPhone: String(row.supportPhone || defaults.supportPhone),
      safetyNotice: String(row.safetyNotice || defaults.safetyNotice),
    };
  }

  saveConfig(cfg: PlatformConfig): void {
    this.db
      .prepare(
        `INSERT INTO platform_config (
          id, categoriesJson, citiesJson, maxPhotosPerListing, minPhotosPerListing,
          supportEmail, supportPhone, safetyNotice
        ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          categoriesJson = excluded.categoriesJson,
          citiesJson = excluded.citiesJson,
          maxPhotosPerListing = excluded.maxPhotosPerListing,
          minPhotosPerListing = excluded.minPhotosPerListing,
          supportEmail = excluded.supportEmail,
          supportPhone = excluded.supportPhone,
          safetyNotice = excluded.safetyNotice`
      )
      .run(
        JSON.stringify(cfg.categories),
        JSON.stringify(cfg.cities),
        cfg.maxPhotosPerListing,
        cfg.minPhotosPerListing,
        cfg.supportEmail,
        cfg.supportPhone,
        cfg.safetyNotice
      );
  }

  // ---------------- EXPORT TOKENS ----------------
  createExportToken(tokenHash: string, expiresAt: string): void {
    const now = new Date().toISOString();
    this.db.prepare('DELETE FROM export_tokens WHERE expiresAt <= ?').run(now);
    this.db
      .prepare('INSERT INTO export_tokens (tokenHash, expiresAt, createdAt) VALUES (?, ?, ?)')
      .run(tokenHash, expiresAt, now);
  }

  isValidExportToken(tokenHash: string): boolean {
    const now = new Date().toISOString();
    const row = this.db
      .prepare('SELECT tokenHash, expiresAt FROM export_tokens WHERE tokenHash = ?')
      .get(tokenHash) as { tokenHash: string; expiresAt: string } | undefined;
    if (!row) return false;
    if (row.expiresAt <= now) {
      this.db.prepare('DELETE FROM export_tokens WHERE tokenHash = ?').run(tokenHash);
      return false;
    }
    return true;
  }

  createDatabaseBackupBuffer(): Buffer {
    const tmpPath = path.join(os.tmpdir(), `rent_a_house_backup_${crypto.randomUUID()}.db`);
    try {
      this.db.prepare('VACUUM INTO ?').run(tmpPath);
      const snap = new DatabaseSync(tmpPath);
      try {
        snap.exec('DELETE FROM export_tokens;');
      } finally {
        snap.close();
      }
      return fs.readFileSync(tmpPath);
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }
}

export const dbStore = new SqliteStore();
