import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardList,
  Compass,
  Heart,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogIn,
  MessageSquare,
  PlusSquare,
  Search,
  User,
  X,
} from 'lucide-react';
import { api, setAuthToken, subscribeToEvents } from './api/client.ts';
import { signOutGoogle } from './auth/googleAuth.ts';
import { AdminWorkspace } from './components/AdminWorkspace.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { BrandLogo } from './components/BrandLogo.tsx';
import { BuyerMarketplace, type BuyerTab } from './components/BuyerMarketplace.tsx';
import { ChatWorkspace } from './components/ChatWorkspace.tsx';
import { HelpSafetyModal } from './components/HelpSafetyModal.tsx';
import { SellerWorkspace, type SellerTab } from './components/SellerWorkspace.tsx';
import { SplashWelcome } from './components/SplashWelcome.tsx';
import type {
  AppNotification,
  Conversation,
  PlatformConfig,
  PropertyListing,
  RentalRequest,
  UserProfile,
  UserRole,
} from './types.ts';

type ScreenMode = 'splash' | 'app' | 'auth';
type BuyerNavTab = BuyerTab | 'messages';
type SellerNavTab = SellerTab | 'messages';

const DEFAULT_CONFIG: PlatformConfig = {
  categories: ['House', 'Flat', 'Portion', 'Room', 'Apartment', 'Commercial'],
  cities: [
    { name: 'Lahore', lat: 31.5204, lng: 74.3587, areas: ['DHA', 'Gulberg', 'Johar Town', 'Bahria Town', 'Model Town', 'Wapda Town'] },
    { name: 'Islamabad', lat: 33.6844, lng: 73.0479, areas: ['F-10', 'F-11', 'F-7', 'F-6', 'G-11', 'E-11', 'DHA Islamabad', 'Bahria Town'] },
    { name: 'Karachi', lat: 24.8607, lng: 67.0011, areas: ['Clifton', 'DHA Karachi', 'Gulshan-e-Iqbal', 'PECHS', 'North Nazimabad'] },
    { name: 'Rawalpindi', lat: 33.5651, lng: 73.0169, areas: ['Bahria Town', 'Chaklala Scheme III', 'Satellite Town', 'Saddar'] },
    { name: 'Faisalabad', lat: 31.4504, lng: 73.135, areas: ['Peoples Colony', 'D Ground', 'Madina Town', 'Canal Road'] },
    { name: 'Multan', lat: 30.1575, lng: 71.5249, areas: ['Cantt', 'Model Town', 'DHA Multan', 'Bosan Road'] },
  ],
  maxPhotosPerListing: 15,
  minPhotosPerListing: 1,
  supportEmail: 'support@rentahouse.pk',
  supportPhone: '+92 300 0000000',
  safetyNotice: 'Never transfer advance rent or security deposit before inspecting the property in person.',
};

export default function App() {
  const [screen, setScreen] = useState<ScreenMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('property') ? 'app' : 'splash';
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authRole, setAuthRole] = useState<UserRole>('buyer');

  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [buyerTab, setBuyerTab] = useState<BuyerNavTab>('home');
  const [sellerTab, setSellerTab] = useState<SellerNavTab>('dashboard');

  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Listen for Google Maps Platform quota / auth failure signal (Case A)
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  const refreshProperties = useCallback(async (userOverride?: UserProfile | null) => {
    setLoadingProperties(true);
    try {
      const user = userOverride !== undefined ? userOverride : currentUser;
      const res = await api.getProperties(
        user?.role === 'seller' ? { mine: true } : {}
      );
      setProperties(res.properties);
    } catch {
      // Keep existing properties on transient error
    } finally {
      setLoadingProperties(false);
    }
  }, [currentUser]);

  const refreshAuthenticatedData = useCallback(async (userOverride?: UserProfile | null) => {
    const user = userOverride !== undefined ? userOverride : currentUser;
    if (!user) return;
    try {
      const [favRes, reqRes, convRes, notifRes] = await Promise.all([
        user.role === 'buyer' ? api.getFavourites() : Promise.resolve({ favouriteIds: [], properties: [] }),
        api.getRequests(),
        api.getConversations(),
        api.getNotifications(),
      ]);
      if (user.role === 'buyer') {
        setFavouriteIds(favRes.favouriteIds);
      }
      setRequests(reqRes.requests);
      setConversations(convRes.conversations);
      setNotifications(notifRes.notifications);
    } catch {
      // ignore transient refresh failure
    }
  }, [currentUser]);

  // Initial public config & properties load
  useEffect(() => {
    api
      .getPublicConfig()
      .then((res) => {
        setConfig(res.config);
        if (res.mapsApiKey) {
          setMapsApiKey(res.mapsApiKey);
        }
      })
      .catch(() => {});

    refreshProperties(null);
  }, [refreshProperties]);

  // Real-time SSE updates when signed in
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = subscribeToEvents((event) => {
      if (event === 'notification' || event === 'message' || event === 'request_updated') {
        refreshAuthenticatedData(currentUser);
      }
      if (event === 'property_updated') {
        refreshProperties(currentUser);
      }
    });
    return unsubscribe;
  }, [currentUser, refreshAuthenticatedData, refreshProperties]);

  const handleAuthenticated = useCallback(
    async (token: string, user: UserProfile) => {
      setAuthToken(token);
      setCurrentUser(user);
      setScreen('app');
      if (user.role === 'seller') {
        setSellerTab('dashboard');
      } else if (user.role === 'buyer') {
        setBuyerTab('home');
      }
      await Promise.all([refreshProperties(user), refreshAuthenticatedData(user)]);
    },
    [refreshAuthenticatedData, refreshProperties]
  );

  const handleSignOut = useCallback(() => {
    void signOutGoogle();
    setAuthToken(null);
    setCurrentUser(null);
    setFavouriteIds([]);
    setRequests([]);
    setConversations([]);
    setSelectedConversationId(null);
    setNotifications([]);
    setNotifOpen(false);
    setBuyerTab('home');
    setScreen('app');
    refreshProperties(null);
  }, [refreshProperties]);

  const handleToggleFavourite = useCallback(
    async (propertyId: string) => {
      if (!currentUser) {
        setAuthMode('login');
        setAuthRole('buyer');
        setScreen('auth');
        return;
      }
      try {
        const res = await api.toggleFavourite(propertyId);
        setFavouriteIds((prev) =>
          res.saved
            ? prev.includes(propertyId)
              ? prev
              : [...prev, propertyId]
            : prev.filter((id) => id !== propertyId)
        );
      } catch {
        // ignore
      }
    },
    [currentUser]
  );

  const handleRecordView = useCallback((propertyId: string) => {
    setRecentlyViewedIds((prev) => [propertyId, ...prev.filter((id) => id !== propertyId)].slice(0, 10));
  }, []);

  const handleOpenChat = useCallback(
    async (conversationId: string) => {
      setSelectedConversationId(conversationId);
      if (currentUser?.role === 'seller') {
        setSellerTab('messages');
      } else {
        setBuyerTab('messages');
      }
      await refreshAuthenticatedData();
    },
    [currentUser?.role, refreshAuthenticatedData]
  );

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    } catch {
      // ignore
    }
  };

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  const unreadMessages = useMemo(
    () =>
      conversations.reduce((acc, c) => {
        if (!currentUser) return acc;
        if (currentUser.role === 'seller') return acc + (c.unreadBySeller || 0);
        return acc + (c.unreadByBuyer || 0);
      }, 0),
    [conversations, currentUser]
  );

  const publicProperties = useMemo(
    () => properties.filter((p) => p.status === 'active'),
    [properties]
  );

  const sellerListings = useMemo(
    () =>
      currentUser?.role === 'seller'
        ? properties.filter((p) => p.sellerId === currentUser.uid)
        : [],
    [properties, currentUser]
  );

  const quotaBanner = quotaExceeded ? (
    <div
      role="alert"
      className="sticky top-0 z-50 w-full bg-amber-50 border-b border-amber-200 text-amber-950 px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          Google Maps Platform quota reached. If you are the app owner, visit{' '}
          <a
            href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline text-amber-900 hover:text-amber-700"
          >
            maps developer site
          </a>{' '}
          for instructions to update your account.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setQuotaExceeded(false)}
        aria-label="Dismiss maps quota notice"
        className="p-1 text-amber-700 hover:text-amber-950 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  ) : null;

  if (screen === 'splash') {
    return (
      <>
        {quotaBanner}
        <SplashWelcome
          onGetStarted={() => {
            setAuthMode('signup');
            setAuthRole('buyer');
            setScreen('auth');
          }}
          onBrowsePublic={() => setScreen('app')}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <HelpSafetyModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          config={config}
          currentUser={currentUser}
        />
      </>
    );
  }

  if (screen === 'auth') {
    return (
      <>
        {quotaBanner}
        <AuthScreen
          initialMode={authMode}
          initialRole={authRole}
          cities={config.cities.map((c) => c.name)}
          onAuthenticated={handleAuthenticated}
          onBackToBrowse={() => setScreen('app')}
        />
      </>
    );
  }

  // Admin Console (Dedicated Workspace)
  if (currentUser?.role === 'admin') {
    return (
      <>
        {quotaBanner}
        <AdminWorkspace
          currentUser={currentUser}
          config={config}
          onConfigUpdated={setConfig}
          onSignOut={handleSignOut}
        />
      </>
    );
  }

  const isSeller = currentUser?.role === 'seller';

  const buyerNavItems: { id: BuyerNavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'search', label: 'Search', icon: <Search className="w-4 h-4" /> },
    { id: 'favourites', label: 'Favourites', icon: <Heart className="w-4 h-4" /> },
    { id: 'requests', label: 'Requests', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" />, badge: unreadMessages },
  ];

  const sellerNavItems: { id: SellerNavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'listings', label: 'Listings', icon: <Building2 className="w-4 h-4" /> },
    { id: 'add', label: 'Add Property', icon: <PlusSquare className="w-4 h-4" /> },
    { id: 'requests', label: 'Requests', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" />, badge: unreadMessages },
  ];

  return (
    <div className="min-h-screen bg-[#F6F7FB] text-slate-900 flex flex-col">
      {quotaBanner}

      {/* Top Navigation Bar (Desktop 3-Zone Contract + Clean Mobile Header) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => (isSeller ? setSellerTab('dashboard') : setBuyerTab('home'))}
            className="text-left focus:outline-none"
          >
            <BrandLogo variant="compact" />
          </button>

          {/* Desktop Center Navigation */}
          <nav className="hidden md:flex items-center gap-1.5">
            {(isSeller ? sellerNavItems : buyerNavItems).map((item) => {
              const active = isSeller ? sellerTab === item.id : buyerTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    isSeller
                      ? setSellerTab(item.id as SellerNavTab)
                      : setBuyerTab(item.id as BuyerNavTab)
                  }
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#EEF2FF] text-[#5B3CF5]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#5B3CF5] text-white tabular-nums">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Right Utility & Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Help and safety guide"
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {currentUser && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label="Notifications"
                  className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 relative transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {unreadNotifications}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="font-display font-bold text-sm text-slate-900">
                        Notifications
                      </span>
                      {unreadNotifications > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-xs font-semibold text-[#5B3CF5] hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="p-6 text-center text-xs text-slate-500">
                          No notifications yet.
                        </p>
                      ) : (
                        notifications.slice(0, 15).map((n) => (
                          <div
                            key={n.notificationId}
                            className={`px-4 py-3 text-xs ${n.readAt ? 'bg-white' : 'bg-indigo-50/50'}`}
                          >
                            <p className="font-semibold text-slate-900">{n.title}</p>
                            <p className="text-slate-600 mt-0.5">{n.body}</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentUser ? (
              <button
                type="button"
                onClick={() => (isSeller ? setSellerTab('profile') : setBuyerTab('profile'))}
                className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <span className="w-7 h-7 rounded-lg bg-[#5B3CF5] text-white text-xs font-bold flex items-center justify-center">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline text-xs font-semibold text-slate-800 max-w-[110px] truncate">
                  {currentUser.displayName}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthRole('buyer');
                  setScreen('auth');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10">
        {isSeller && currentUser ? (
          sellerTab === 'messages' ? (
            <ChatWorkspace
              currentUser={currentUser}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              onConversationsRefresh={() => refreshAuthenticatedData(currentUser)}
              onRequireAuth={() => {
                setAuthMode('login');
                setAuthRole('seller');
                setScreen('auth');
              }}
            />
          ) : (
            <SellerWorkspace
              activeTab={sellerTab}
              onChangeTab={(tab) => setSellerTab(tab)}
              config={config}
              mapsApiKey={mapsApiKey}
              currentUser={currentUser}
              myListings={sellerListings}
              requests={requests}
              onListingsChanged={() => refreshProperties(currentUser)}
              onRequestUpdated={(updated) => {
                setRequests((prev) => prev.map((r) => (r.requestId === updated.requestId ? updated : r)));
                refreshAuthenticatedData(currentUser);
              }}
              onOpenChat={handleOpenChat}
              onProfileUpdated={setCurrentUser}
              onSignOut={handleSignOut}
            />
          )
        ) : buyerTab === 'messages' ? (
          <ChatWorkspace
            currentUser={currentUser}
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            onConversationsRefresh={() => refreshAuthenticatedData(currentUser)}
            onRequireAuth={() => {
              setAuthMode('login');
              setAuthRole('buyer');
              setScreen('auth');
            }}
          />
        ) : (
          <BuyerMarketplace
            activeTab={buyerTab}
            onChangeTab={(tab) => setBuyerTab(tab)}
            config={config}
            mapsApiKey={mapsApiKey}
            currentUser={currentUser}
            properties={publicProperties}
            loadingProperties={loadingProperties}
            favouriteIds={favouriteIds}
            requests={requests}
            recentlyViewedIds={recentlyViewedIds}
            onRecordView={handleRecordView}
            onToggleFavourite={handleToggleFavourite}
            onRequireAuth={() => {
              setAuthMode('login');
              setAuthRole('buyer');
              setScreen('auth');
            }}
            onListProperty={() => {
              setAuthMode('signup');
              setAuthRole('seller');
              setScreen('auth');
            }}
            onRequestCreated={(req, conversationId) => {
              setRequests((prev) => [req, ...prev]);
              setSelectedConversationId(conversationId);
              refreshAuthenticatedData(currentUser);
            }}
            onRequestUpdated={(updated) => {
              setRequests((prev) => prev.map((r) => (r.requestId === updated.requestId ? updated : r)));
            }}
            onOpenChat={handleOpenChat}
            onProfileUpdated={setCurrentUser}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 h-16 px-1 flex items-center justify-around"
      >
        {isSeller ? (
          <>
            {(
              [
                { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
                { id: 'listings', label: 'Listings', icon: <Building2 className="w-5 h-5" /> },
                { id: 'add', label: 'Add', icon: <PlusSquare className="w-5 h-5" /> },
                { id: 'requests', label: 'Requests', icon: <ClipboardList className="w-5 h-5" /> },
                { id: 'messages', label: 'Chat', icon: <MessageSquare className="w-5 h-5" />, badge: unreadMessages },
              ] as { id: SellerNavTab; label: string; icon: React.ReactNode; badge?: number }[]
            ).map((tab) => {
              const active = sellerTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSellerTab(tab.id)}
                  className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium ${
                    active ? 'text-[#5B3CF5]' : 'text-slate-500'
                  }`}
                >
                  {tab.icon}
                  <span className="mt-0.5">{tab.label}</span>
                  {tab.badge ? (
                    <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#5B3CF5] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : (
          <>
            {(
              [
                { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
                { id: 'search', label: 'Search', icon: <Compass className="w-5 h-5" /> },
                { id: 'favourites', label: 'Favourites', icon: <Heart className="w-5 h-5" /> },
                { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-5 h-5" />, badge: unreadMessages },
                { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
              ] as { id: BuyerNavTab; label: string; icon: React.ReactNode; badge?: number }[]
            ).map((tab) => {
              const active = buyerTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBuyerTab(tab.id)}
                  className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] text-[11px] font-medium ${
                    active ? 'text-[#5B3CF5]' : 'text-slate-500'
                  }`}
                >
                  {tab.icon}
                  <span className="mt-0.5">{tab.label}</span>
                  {tab.badge ? (
                    <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#5B3CF5] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </>
        )}
      </nav>

      <HelpSafetyModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        config={config}
        currentUser={currentUser}
      />
    </div>
  );
}
