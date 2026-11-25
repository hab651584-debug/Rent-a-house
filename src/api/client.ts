import type {
  AdminAuditLog,
  AdminMetrics,
  AppNotification,
  ChatMessage,
  Conversation,
  ModerationReport,
  PlatformConfig,
  PropertyListing,
  RentalRequest,
  RequestStatus,
  SupportTicket,
  UserProfile,
  UserRole,
} from '../types.ts';

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getPublicConfig: () =>
    apiFetch<{ config: PlatformConfig; mapsApiKey: string }>('/api/public-config'),

  // Auth
  getAdminStatus: () =>
    apiFetch<{ claimed: boolean; hasEnvPasscode: boolean }>('/api/auth/admin-status'),

  claimAdmin: (payload: {
    displayName: string;
    email: string;
    password: string;
    passcode?: string;
  }) =>
    apiFetch<{ token: string; user: UserProfile }>('/api/auth/admin-claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  register: (payload: {
    role: 'buyer' | 'seller';
    displayName: string;
    email: string;
    phone: string;
    password: string;
    preferredCity?: string;
  }) =>
    apiFetch<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string; role?: UserRole }) =>
    apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  googleAuth: (payload: {
    idToken: string;
    role: 'buyer' | 'seller';
    preferredCity?: string;
    intent?: 'login' | 'signup';
  }) =>
    apiFetch<{ token: string; user: UserProfile; isNewUser?: boolean }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  forgotPassword: (email: string) =>
    apiFetch<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  updateProfile: (payload: Partial<UserProfile>) =>
    apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  requestAccountDeletion: () =>
    apiFetch<{ user: UserProfile }>('/api/auth/request-deletion', {
      method: 'POST',
    }),

  // Properties
  getProperties: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== false) {
        qs.set(k, String(v));
      }
    }
    const query = qs.toString();
    return apiFetch<{ properties: PropertyListing[] }>(
      `/api/properties${query ? `?${query}` : ''}`
    );
  },

  getProperty: (id: string) => apiFetch<{ property: PropertyListing }>(`/api/properties/${id}`),

  createProperty: (payload: Partial<PropertyListing> & { confirmDuplicate?: boolean }) =>
    apiFetch<{ property: PropertyListing }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProperty: (
    id: string,
    payload: Partial<PropertyListing> & { confirmAvailability?: boolean }
  ) =>
    apiFetch<{ property: PropertyListing }>(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProperty: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/properties/${id}`, { method: 'DELETE' }),

  // Favourites
  getFavourites: () =>
    apiFetch<{ favouriteIds: string[]; properties: PropertyListing[] }>('/api/favourites'),

  toggleFavourite: (propertyId: string) =>
    apiFetch<{ saved: boolean; propertyId: string }>(`/api/favourites/${propertyId}`, {
      method: 'POST',
    }),

  // Rental Requests
  getRequests: () => apiFetch<{ requests: RentalRequest[] }>('/api/requests'),

  createRequest: (payload: { propertyId: string; message: string; preferredVisit?: string }) =>
    apiFetch<{ request: RentalRequest; conversationId: string }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRequest: (
    id: string,
    payload: { status: RequestStatus; note?: string; declineReason?: string }
  ) =>
    apiFetch<{ request: RentalRequest }>(`/api/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Messaging
  getConversations: () => apiFetch<{ conversations: Conversation[] }>('/api/conversations'),

  startConversation: (propertyId: string) =>
    apiFetch<{ conversation: Conversation }>('/api/conversations/start', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    }),

  getMessages: (conversationId: string) =>
    apiFetch<{ conversation: Conversation; messages: ChatMessage[] }>(
      `/api/conversations/${conversationId}/messages`
    ),

  sendMessage: (conversationId: string, payload: { text: string; attachmentURL?: string }) =>
    apiFetch<{ message: ChatMessage }>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleBlockConversation: (conversationId: string) =>
    apiFetch<{ conversation: Conversation }>(`/api/conversations/${conversationId}/block`, {
      method: 'POST',
    }),

  // Notifications
  getNotifications: () => apiFetch<{ notifications: AppNotification[] }>('/api/notifications'),

  markAllNotificationsRead: () =>
    apiFetch<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  // Reports & Support
  submitReport: (payload: {
    targetType: 'property' | 'user' | 'message';
    targetId: string;
    targetLabel: string;
    reason: string;
    details: string;
  }) =>
    apiFetch<{ report: ModerationReport }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSupportTickets: () => apiFetch<{ tickets: SupportTicket[] }>('/api/support-tickets'),

  submitSupportTicket: (payload: {
    userName?: string;
    userEmail?: string;
    subject: string;
    message: string;
  }) =>
    apiFetch<{ ticket: SupportTicket }>('/api/support-tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin
  adminGetMetrics: () => apiFetch<{ metrics: AdminMetrics }>('/api/admin/metrics'),

  adminGetProperties: (status = 'all') =>
    apiFetch<{ properties: PropertyListing[] }>(
      `/api/admin/properties?status=${encodeURIComponent(status)}`
    ),

  adminModerateProperty: (
    id: string,
    action: 'approve' | 'reject' | 'unpublish' | 'toggle_featured',
    reason?: string
  ) =>
    apiFetch<{ property: PropertyListing }>(`/api/admin/properties/${id}/moderate`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    }),

  adminGetUsers: () => apiFetch<{ users: UserProfile[] }>('/api/admin/users'),

  adminUpdateUserStatus: (
    id: string,
    payload: {
      accountStatus?: 'active' | 'restricted' | 'suspended';
      verificationStatus?: 'verified' | 'unverified';
      reason?: string;
    }
  ) =>
    apiFetch<{ user: UserProfile }>(`/api/admin/users/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adminGetReports: () => apiFetch<{ reports: ModerationReport[] }>('/api/admin/reports'),

  adminResolveReport: (
    id: string,
    status: 'reviewing' | 'action_taken' | 'dismissed' | 'closed',
    moderationNote: string
  ) =>
    apiFetch<{ report: ModerationReport }>(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, moderationNote }),
    }),

  adminUpdateSupportTicket: (
    id: string,
    status: 'open' | 'in_progress' | 'resolved' | 'closed',
    adminReply: string
  ) =>
    apiFetch<{ ticket: SupportTicket }>(`/api/admin/support-tickets/${id}/update`, {
      method: 'POST',
      body: JSON.stringify({ status, adminReply }),
    }),

  adminUpdateConfig: (payload: Partial<PlatformConfig>) =>
    apiFetch<{ config: PlatformConfig }>('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  adminGetAuditLogs: () => apiFetch<{ logs: AdminAuditLog[] }>('/api/admin/audit-logs'),

  adminDownloadBundle: async (): Promise<Blob> => {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/export-bundle', { headers });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Download failed (${res.status})`);
    }
    return res.blob();
  },

  adminDownloadDatabase: async (): Promise<Blob> => {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch('/api/admin/export-database', { headers });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Database export failed (${res.status})`);
    }
    return res.blob();
  },
};

export function subscribeToEvents(onEvent: (event: string, data: unknown) => void): () => void {
  const controller = new AbortController();
  const token = authToken;
  if (!token) return () => {};

  (async () => {
    try {
      const response = await fetch('/api/events', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let eventName = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr += line.slice(5).trim();
            }
          }
          if (dataStr) {
            try {
              onEvent(eventName, JSON.parse(dataStr));
            } catch {
              // ignore malformed event chunk
            }
          }
        }
      }
    } catch {
      // aborted or disconnected
    }
  })();

  return () => controller.abort();
}
