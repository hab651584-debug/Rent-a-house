export type UserRole = 'buyer' | 'seller' | 'admin';

export type AccountStatus =
  | 'active'
  | 'restricted'
  | 'suspended'
  | 'deletion_pending'
  | 'deleted';

export type PropertyStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'paused'
  | 'rented'
  | 'expired';

export type RequestStatus =
  | 'pending'
  | 'responded'
  | 'viewing_arranged'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'closed';

export type ReportStatus =
  | 'open'
  | 'reviewing'
  | 'action_taken'
  | 'dismissed'
  | 'closed';

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  phone: string;
  photoURL: string;
  preferredCity: string;
  accountStatus: AccountStatus;
  verificationStatus: 'unverified' | 'verified';
  verifiedAt?: string;
  showPhonePublicly: boolean;
  showEmailPublicly: boolean;
  sellerRoleLabel?: 'Property Owner' | 'Authorized Agent';
  createdAt: string;
  updatedAt: string;
}

export interface PropertyLocation {
  lat: number;
  lng: number;
}

export interface PropertyListing {
  propertyId: string;
  sellerId: string;
  sellerName: string;
  sellerRoleLabel: 'Property Owner' | 'Authorized Agent';
  sellerPhotoURL: string;
  sellerVerified: boolean;
  sellerPhone?: string;
  sellerEmail?: string;
  title: string;
  category: string;
  description: string;
  rent: number;
  negotiable: boolean;
  deposit: number;
  advanceRent: number;
  additionalCharges: string;
  city: string;
  area: string;
  society: string;
  addressVisibility: 'approximate' | 'exact_public';
  exactAddress?: string;
  location: PropertyLocation;
  bedrooms: number;
  bathrooms: number;
  floorPortion: string;
  coveredArea: number;
  coveredAreaUnit: 'Sq. Ft.' | 'Marla' | 'Kanal';
  furnishing: 'Furnished' | 'Semi-Furnished' | 'Unfurnished';
  facilities: string[];
  parking: boolean;
  availabilityDate: string;
  contactPreference: 'In-app' | 'Phone' | 'WhatsApp';
  preferredTenant: string;
  imageURLs: string[];
  status: PropertyStatus;
  rejectionReason?: string;
  featured: boolean;
  lastConfirmedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestStatusHistoryItem {
  status: RequestStatus;
  note?: string;
  at: string;
  by: string;
}

export interface RentalRequest {
  requestId: string;
  propertyId: string;
  propertyTitle: string;
  propertyCity: string;
  propertyArea: string;
  propertyRent: number;
  propertyImage: string;
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  sellerId: string;
  sellerName: string;
  message: string;
  preferredVisit: string;
  status: RequestStatus;
  statusHistory: RequestStatusHistoryItem[];
  sellerResponse?: string;
  declineReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  conversationId: string;
  propertyId: string;
  propertyTitle: string;
  propertyImage: string;
  propertyRent: number;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadByBuyer: number;
  unreadBySeller: number;
  blockedBy: string[];
  createdAt: string;
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  attachmentURL?: string;
  readAt?: string;
  createdAt: string;
}

export interface AppNotification {
  notificationId: string;
  recipientId: string;
  type:
    | 'new_enquiry'
    | 'enquiry_update'
    | 'new_message'
    | 'listing_approved'
    | 'listing_rejected'
    | 'report_update'
    | 'availability_reminder';
  title: string;
  body: string;
  relatedId?: string;
  readAt?: string;
  createdAt: string;
}

export interface ModerationReport {
  reportId: string;
  reporterId: string;
  reporterName: string;
  targetType: 'property' | 'user' | 'message';
  targetId: string;
  targetLabel: string;
  reason: string;
  details: string;
  status: ReportStatus;
  moderationNote?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  ticketId: string;
  userId?: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CityConfig {
  name: string;
  lat: number;
  lng: number;
  areas: string[];
}

export interface PlatformConfig {
  categories: string[];
  cities: CityConfig[];
  maxPhotosPerListing: number;
  minPhotosPerListing: number;
  supportEmail: string;
  supportPhone: string;
  safetyNotice: string;
}

export interface AdminAuditLog {
  logId: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: 'property' | 'user' | 'report' | 'support' | 'config';
  targetId: string;
  reason: string;
  createdAt: string;
}

export interface AdminMetrics {
  totalUsers: number;
  roleBreakdown: { buyer: number; seller: number; admin: number };
  totalProperties: number;
  propertyStatusBreakdown: Record<PropertyStatus, number>;
  totalRequests: number;
  openReports: number;
  unresolvedTickets: number;
  monthlyGrowth: { month: string; listings: number; requests: number; users: number }[];
  recentActivities: {
    id: string;
    title: string;
    subtitle: string;
    type: 'property' | 'request' | 'report' | 'user';
    at: string;
  }[];
}
