import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Heart,
  Home,
  Hotel,
  Layers,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageSquare,
  Phone,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  PlatformConfig,
  PropertyListing,
  RentalRequest,
  UserProfile,
} from '../types.ts';
import { PropertyMap } from './PropertyMap.tsx';

export type BuyerTab = 'home' | 'search' | 'favourites' | 'requests' | 'profile';

interface BuyerMarketplaceProps {
  activeTab: BuyerTab;
  onChangeTab: (tab: BuyerTab) => void;
  config: PlatformConfig;
  mapsApiKey: string;
  currentUser: UserProfile | null;
  properties: PropertyListing[];
  loadingProperties: boolean;
  favouriteIds: string[];
  requests: RentalRequest[];
  recentlyViewedIds: string[];
  onRecordView: (propertyId: string) => void;
  onToggleFavourite: (propertyId: string) => void;
  onRequireAuth: () => void;
  onListProperty?: () => void;
  onRequestCreated: (req: RentalRequest, conversationId: string) => void;
  onRequestUpdated: (req: RentalRequest) => void;
  onOpenChat: (conversationId: string) => void;
  onProfileUpdated: (user: UserProfile) => void;
  onSignOut: () => void;
}

const FACILITY_OPTIONS = [
  'WiFi',
  'AC',
  'Parking',
  'Garden',
  'Water',
  'Gas',
  'Electricity Backup',
  'Lift',
  'Security',
  'Terrace',
];

function CategoryIcon({ category }: { category: string }) {
  const cls = 'w-5 h-5';
  switch (category.toLowerCase()) {
    case 'house':
      return <Home className={cls} />;
    case 'flat':
      return <Building2 className={cls} />;
    case 'room':
      return <Hotel className={cls} />;
    case 'apartment':
      return <Layers className={cls} />;
    case 'portion':
      return <Home className={cls} />;
    default:
      return <Store className={cls} />;
  }
}

export const BuyerMarketplace: React.FC<BuyerMarketplaceProps> = ({
  activeTab,
  onChangeTab,
  config,
  mapsApiKey,
  currentUser,
  properties,
  loadingProperties,
  favouriteIds,
  requests,
  recentlyViewedIds,
  onRecordView,
  onToggleFavourite,
  onRequireAuth,
  onListProperty,
  onRequestCreated,
  onRequestUpdated,
  onOpenChat,
  onProfileUpdated,
  onSignOut,
}) => {
  // Search & Filter states
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [keyword, setKeyword] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minRent, setMinRent] = useState<number>(0);
  const [maxRent, setMaxRent] = useState<number>(250000);
  const [minBeds, setMinBeds] = useState<number>(0);
  const [minBaths, setMinBaths] = useState<number>(0);
  const [furnishingFilter, setFurnishingFilter] = useState<string>('Any');
  const [parkingOnly, setParkingOnly] = useState<boolean>(false);
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'rent_asc' | 'rent_desc'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(9);

  // Selected Property Detail
  const [detailProperty, setDetailProperty] = useState<PropertyListing | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number>(0);
  const [shareToast, setShareToast] = useState<string>('');

  // Enquiry / Rental Request modal
  const [enquiryOpen, setEnquiryOpen] = useState<boolean>(false);
  const [enquiryMsg, setEnquiryMsg] = useState<string>('');
  const [preferredVisit, setPreferredVisit] = useState<string>('');
  const [enquirySubmitting, setEnquirySubmitting] = useState<boolean>(false);
  const [enquiryFeedback, setEnquiryFeedback] = useState<string>('');

  // Report listing modal
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('Misleading price or photos');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [reportSuccess, setReportSuccess] = useState<string>('');

  // Profile editing states
  const [editName, setEditName] = useState(currentUser?.displayName || '');
  const [editPhone, setEditPhone] = useState(currentUser?.phone || '');
  const [editCity, setEditCity] = useState(currentUser?.preferredCity || 'Lahore');
  const [profileMsg, setProfileMsg] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  // Active city's available areas
  const availableAreas = useMemo(() => {
    if (selectedCity === 'All') {
      return Array.from(new Set(config.cities.flatMap((c) => c.areas)));
    }
    return config.cities.find((c) => c.name === selectedCity)?.areas || [];
  }, [config.cities, selectedCity]);

  // Filtered properties (predictable AND logic; category & facilities multi-select)
  const filteredProperties = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const list = properties.filter((p) => {
      if (selectedCity !== 'All' && p.city !== selectedCity) return false;
      if (
        selectedArea !== 'All' &&
        !p.area.toLowerCase().includes(selectedArea.toLowerCase()) &&
        !p.society.toLowerCase().includes(selectedArea.toLowerCase())
      ) {
        return false;
      }
      if (selectedCategories.length > 0 && !selectedCategories.includes(p.category)) {
        return false;
      }
      if (minRent > 0 && p.rent < minRent) return false;
      if (maxRent > 0 && maxRent < 250000 && p.rent > maxRent) return false;
      if (minBeds > 0 && p.bedrooms < minBeds) return false;
      if (minBaths > 0 && p.bathrooms < minBaths) return false;
      if (furnishingFilter !== 'Any' && p.furnishing !== furnishingFilter) return false;
      if (parkingOnly && !p.parking) return false;
      if (
        selectedFacilities.length > 0 &&
        !selectedFacilities.every((f) => p.facilities.includes(f))
      ) {
        return false;
      }
      if (q) {
        const hay = [p.title, p.city, p.area, p.society, p.category, p.description]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      if (sortBy === 'rent_asc') return a.rent - b.rent;
      if (sortBy === 'rent_desc') return b.rent - a.rent;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [
    properties,
    selectedCity,
    selectedArea,
    selectedCategories,
    minRent,
    maxRent,
    minBeds,
    minBaths,
    furnishingFilter,
    parkingOnly,
    selectedFacilities,
    keyword,
    sortBy,
  ]);

  const featuredProperties = useMemo(
    () => filteredProperties.filter((p) => p.featured),
    [filteredProperties]
  );

  const favouriteProperties = useMemo(
    () => properties.filter((p) => favouriteIds.includes(p.propertyId)),
    [properties, favouriteIds]
  );

  const recentlyViewedProperties = useMemo(
    () =>
      recentlyViewedIds
        .map((id) => properties.find((p) => p.propertyId === id))
        .filter((p): p is PropertyListing => Boolean(p)),
    [recentlyViewedIds, properties]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCity !== 'All') count++;
    if (selectedArea !== 'All') count++;
    if (selectedCategories.length > 0) count++;
    if (minRent > 0) count++;
    if (maxRent < 250000) count++;
    if (minBeds > 0) count++;
    if (minBaths > 0) count++;
    if (furnishingFilter !== 'Any') count++;
    if (parkingOnly) count++;
    if (selectedFacilities.length > 0) count++;
    if (keyword.trim()) count++;
    return count;
  }, [
    selectedCity,
    selectedArea,
    selectedCategories,
    minRent,
    maxRent,
    minBeds,
    minBaths,
    furnishingFilter,
    parkingOnly,
    selectedFacilities,
    keyword,
  ]);

  const clearAllFilters = () => {
    setSelectedCity('All');
    setSelectedArea('All');
    setKeyword('');
    setSelectedCategories([]);
    setMinRent(0);
    setMaxRent(250000);
    setMinBeds(0);
    setMinBaths(0);
    setFurnishingFilter('Any');
    setParkingOnly(false);
    setSelectedFacilities([]);
  };

  const openPropertyDetail = (prop: PropertyListing) => {
    setDetailProperty(prop);
    setGalleryIndex(0);
    setEnquiryFeedback('');
    setReportSuccess('');
    onRecordView(prop.propertyId);
  };

  const handleShareProperty = async (prop: PropertyListing) => {
    const shareUrl = `${window.location.origin}/?property=${encodeURIComponent(prop.propertyId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast('Listing link copied to clipboard');
    } catch {
      setShareToast(shareUrl);
    }
    setTimeout(() => setShareToast(''), 3000);
  };

  const handleContactSeller = async (prop: PropertyListing) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await api.startConversation(prop.propertyId);
      setDetailProperty(null);
      onOpenChat(res.conversation.conversationId);
    } catch (err) {
      setEnquiryFeedback(err instanceof Error ? err.message : 'Unable to start chat.');
    }
  };

  const handleSendRentalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!detailProperty) return;
    setEnquirySubmitting(true);
    setEnquiryFeedback('');
    try {
      const res = await api.createRequest({
        propertyId: detailProperty.propertyId,
        message: enquiryMsg,
        preferredVisit,
      });
      onRequestCreated(res.request, res.conversationId);
      setEnquiryMsg('');
      setPreferredVisit('');
      setEnquiryOpen(false);
      setEnquiryFeedback('Rental request sent! You can track status or chat with the seller.');
    } catch (err) {
      setEnquiryFeedback(err instanceof Error ? err.message : 'Unable to send request.');
    } finally {
      setEnquirySubmitting(false);
    }
  };

  const handleCancelRequest = async (req: RentalRequest) => {
    try {
      const res = await api.updateRequest(req.requestId, {
        status: 'cancelled',
        note: 'Cancelled by buyer',
      });
      onRequestUpdated(res.request);
    } catch {
      // ignore
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !detailProperty) {
      onRequireAuth();
      return;
    }
    try {
      await api.submitReport({
        targetType: 'property',
        targetId: detailProperty.propertyId,
        targetLabel: detailProperty.title,
        reason: reportReason,
        details: reportDetails,
      });
      setReportSuccess('Report submitted to moderators for review.');
      setReportDetails('');
      setTimeout(() => setReportOpen(false), 1400);
    } catch {
      // ignore
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    try {
      const res = await api.updateProfile({
        displayName: editName,
        phone: editPhone,
        preferredCity: editCity,
      });
      onProfileUpdated(res.user);
      setProfileMsg('Profile saved.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Failed to save profile.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('');
    try {
      const res = await api.changePassword(currentPwd, newPwd);
      setPwdMsg(res.message);
      setCurrentPwd('');
      setNewPwd('');
    } catch (err) {
      setPwdMsg(err instanceof Error ? err.message : 'Failed to change password.');
    }
  };

  const mapCenter = useMemo(() => {
    if (selectedCity !== 'All') {
      const found = config.cities.find((c) => c.name === selectedCity);
      if (found) return { lat: found.lat, lng: found.lng };
    }
    return filteredProperties[0]?.location || { lat: 31.5204, lng: 74.3587 };
  }, [config.cities, selectedCity, filteredProperties]);

  const renderPropertyCard = (prop: PropertyListing, isFeaturedSection = false) => {
    const isSaved = favouriteIds.includes(prop.propertyId);
    return (
      <article
        key={`${isFeaturedSection ? 'feat-' : ''}${prop.propertyId}`}
        className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all flex flex-col"
      >
        <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
          <button
            type="button"
            onClick={() => openPropertyDetail(prop)}
            className="w-full h-full block text-left"
          >
            {prop.imageURLs[0] ? (
              <img
                src={prop.imageURLs[0]}
                alt={prop.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Home className="w-10 h-10" />
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!currentUser) onRequireAuth();
              else onToggleFavourite(prop.propertyId);
            }}
            aria-label={isSaved ? 'Remove from favourites' : 'Save to favourites'}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors"
          >
            <Heart
              className={`w-5 h-5 ${isSaved ? 'fill-[#5B3CF5] text-[#5B3CF5]' : 'text-slate-600'}`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => openPropertyDetail(prop)}
          className="p-4 text-left flex-1 flex flex-col justify-between"
        >
          <div>
            {isFeaturedSection && prop.featured && (
              <p className="text-[11px] font-semibold text-indigo-600 mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Promoted
              </p>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display font-bold text-lg text-[#5B3CF5] tabular-nums">
                PKR {prop.rent.toLocaleString()}{' '}
                <span className="text-xs font-medium text-slate-500">/ month</span>
              </p>
              <span className="text-xs text-slate-500 whitespace-nowrap">{prop.category}</span>
            </div>

            <h3 className="font-display font-semibold text-base text-slate-900 mt-1 line-clamp-1">
              {prop.title}
            </h3>

            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 line-clamp-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {prop.coveredArea > 0 ? `${prop.coveredArea} ${prop.coveredAreaUnit} · ` : ''}
                {prop.society || prop.area}, {prop.city}
              </span>
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="inline-flex items-center gap-3 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                {prop.bedrooms} Beds
              </span>
              <span className="inline-flex items-center gap-1">
                <Bath className="w-3.5 h-3.5 text-slate-400" />
                {prop.bathrooms} Baths
              </span>
            </span>
            <span className="text-slate-400">{prop.furnishing}</span>
          </div>
        </button>
      </article>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10 space-y-7">
      {/* HOME & SEARCH TABS */}
      {(activeTab === 'home' || activeTab === 'search') && (
        <>
          {/* City + Search + Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="flex items-center gap-2">
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#5B3CF5] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  aria-label="Select city"
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value);
                    setSelectedArea('All');
                  }}
                  className="pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                >
                  <option value="All">All Cities</option>
                  {config.cities.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setViewMode((v) => (v === 'grid' ? 'map' : 'grid'))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 min-h-[44px] whitespace-nowrap"
              >
                <MapIcon className="w-4 h-4 text-[#5B3CF5]" />
                {viewMode === 'grid' ? 'Map View' : 'Grid View'}
              </button>
            </div>

            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Search houses, DHA, Gulberg, F-10..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white text-sm font-semibold transition-colors min-h-[44px] whitespace-nowrap"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
              </button>
            </div>
          </div>

          {/* Category Quick Selector */}
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {config.categories.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    setSelectedCategories((prev) =>
                      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                    )
                  }
                  className="flex flex-col items-center gap-1.5 min-w-[74px] group shrink-0"
                >
                  <span
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                      active
                        ? 'bg-[#5B3CF5] text-white border-[#5B3CF5] shadow-sm'
                        : 'bg-indigo-50/70 text-[#5B3CF5] border-indigo-100 group-hover:bg-indigo-100'
                    }`}
                  >
                    <CategoryIcon category={cat} />
                  </span>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      active ? 'text-[#5B3CF5] font-semibold' : 'text-slate-600'
                    }`}
                  >
                    {cat}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Filter Chips + Sort */}
          {(activeFilterCount > 0 || activeTab === 'search') && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-y border-slate-200/80">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  {filteredProperties.length} {filteredProperties.length === 1 ? 'listing' : 'listings'}
                </span>
                {selectedCity !== 'All' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCity('All');
                      setSelectedArea('All');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium"
                  >
                    {selectedCity}
                    <X className="w-3 h-3" />
                  </button>
                )}
                {selectedArea !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setSelectedArea('All')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium"
                  >
                    {selectedArea}
                    <X className="w-3 h-3" />
                  </button>
                )}
                {selectedCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCategories((prev) => prev.filter((x) => x !== c))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium"
                  >
                    {c}
                    <X className="w-3 h-3" />
                  </button>
                ))}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 ml-1"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="rent_asc">Rent: Low to High</option>
                  <option value="rent_desc">Rent: High to Low</option>
                </select>
              </label>
            </div>
          )}

          {/* Hero Banner on Home Tab when no search query active */}
          {activeTab === 'home' && activeFilterCount === 0 && viewMode === 'grid' && (
            <section className="relative rounded-3xl overflow-hidden bg-indigo-950 text-white min-h-[200px] sm:min-h-[240px] flex items-end">
              <img
                src="/src/assets/images/hero_modern_villa_1795510500677.jpg"
                alt="Find your dream rental home"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-80"
              />
              <div
                className="absolute inset-0 bg-gradient-to-r from-indigo-950/90 via-indigo-950/60 to-transparent"
                aria-hidden="true"
              />
              <div className="relative z-10 p-6 sm:p-8 max-w-xl">
                <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight">
                  Find Your Dream Home
                </h2>
                <p className="text-sm sm:text-base text-slate-200 mt-1.5">
                  Rent Smart, Live Better — explore vetted listings with transparent PKR pricing and direct landlord messaging.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onChangeTab('search')}
                    className="px-4 py-2 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Explore All Listings
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('map')}
                    className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-medium backdrop-blur-sm transition-colors"
                  >
                    Browse on Map
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Map View */}
          {viewMode === 'map' ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-lg text-slate-900">
                  Interactive Neighborhood Map
                </h2>
                <span className="text-xs text-slate-500">
                  Showing approximate pins for privacy
                </span>
              </div>
              <PropertyMap
                apiKey={mapsApiKey}
                properties={filteredProperties}
                center={mapCenter}
                zoom={selectedCity === 'All' ? 6 : 12}
                heightClass="h-[460px]"
                onOpenDetail={openPropertyDetail}
              />
            </section>
          ) : loadingProperties ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-80 rounded-2xl bg-white border border-slate-200 animate-pulse"
                />
              ))}
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <Home className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-display font-bold text-lg text-slate-900">
                {properties.length === 0 ? 'No properties listed yet' : 'No matching properties found'}
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                {properties.length === 0
                  ? 'Are you a property owner or authorized agent? Sign up as a Seller to publish the first rental listing.'
                  : 'Try widening your monthly rent range, switching cities, or clearing active facility filters.'}
              </p>
              {properties.length === 0 && onListProperty ? (
                <button
                  type="button"
                  onClick={onListProperty}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold hover:bg-[#4F32DF]"
                >
                  List a Property
                </button>
              ) : (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold hover:bg-[#4F32DF]"
                >
                  Reset All Filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Featured Section */}
              {activeTab === 'home' && featuredProperties.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display font-bold text-xl text-slate-900">
                        Featured Properties
                      </h2>
                      <p className="text-xs text-slate-500">
                        Clearly labelled promoted rentals across Pakistan
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onChangeTab('search')}
                      className="text-xs font-semibold text-[#5B3CF5] hover:underline"
                    >
                      See All →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {featuredProperties.slice(0, 3).map((p) => renderPropertyCard(p, true))}
                  </div>
                </section>
              )}

              {/* All / Latest Properties */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-xl text-slate-900">
                    {activeTab === 'home' ? 'Latest Properties' : 'Search Results'}
                  </h2>
                  {activeTab === 'home' && (
                    <span className="text-xs text-slate-500 tabular-nums">
                      {filteredProperties.length} active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredProperties
                    .slice(0, pageSize)
                    .map((p) => renderPropertyCard(p, false))}
                </div>

                {filteredProperties.length > pageSize && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setPageSize((s) => s + 9)}
                      className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
                    >
                      Load More Listings ({filteredProperties.length - pageSize} remaining)
                    </button>
                  </div>
                )}
              </section>

              {/* Recently Viewed */}
              {activeTab === 'home' && recentlyViewedProperties.length > 0 && (
                <section className="space-y-4 pt-2 border-t border-slate-200">
                  <h2 className="font-display font-bold text-lg text-slate-900">
                    Recently Viewed
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {recentlyViewedProperties.slice(0, 3).map((p) => renderPropertyCard(p, false))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* FAVOURITES TAB */}
      {activeTab === 'favourites' && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display font-bold text-2xl text-slate-900">My Favourites</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Shortlisted homes saved for easy comparison
              </p>
            </div>
            <span className="text-sm font-semibold text-[#5B3CF5] tabular-nums">
              {favouriteProperties.length} saved
            </span>
          </div>

          {!currentUser ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <Heart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="font-display font-bold text-lg text-slate-900">
                Sign in to save favourites
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Keep track of properties you want to visit or enquire about.
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold"
              >
                Sign In / Create Account
              </button>
            </div>
          ) : favouriteProperties.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <Heart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="font-display font-bold text-lg text-slate-900">
                No saved properties yet
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Tap the heart icon on any listing to add it here.
              </p>
              <button
                type="button"
                onClick={() => onChangeTab('home')}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold"
              >
                Browse Homes
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {favouriteProperties.map((p) => renderPropertyCard(p, false))}
            </div>
          )}
        </section>
      )}

      {/* RENTAL REQUESTS TAB */}
      {activeTab === 'requests' && (
        <section className="space-y-5">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900">My Rental Requests</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Track seller responses, scheduled property visits, and enquiry status
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-950 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              Reminder: An accepted in-app rental request expresses willingness to proceed, not a legally binding tenancy contract. Always inspect the property and execute a written rental agreement separately.
            </span>
          </div>

          {!currentUser ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <p className="text-sm text-slate-600 mb-4">
                Sign in to view and manage your rental enquiries.
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="px-6 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold"
              >
                Sign In
              </button>
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="font-display font-bold text-lg text-slate-900">
                No rental requests submitted yet
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Open a property listing and click &quot;Send Rental Request&quot; to arrange a visit.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => (
                <div
                  key={r.requestId}
                  className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between"
                >
                  <div className="flex gap-4">
                    {r.propertyImage && (
                      <img
                        src={r.propertyImage}
                        alt={r.propertyTitle}
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-xl object-cover shrink-0"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-bold text-base text-slate-900">
                          {r.propertyTitle}
                        </h3>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-md capitalize ${
                            r.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'declined' || r.status === 'cancelled'
                                ? 'bg-rose-50 text-rose-700'
                                : r.status === 'viewing_arranged'
                                  ? 'bg-indigo-50 text-indigo-700'
                                  : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {r.propertyArea}, {r.propertyCity} · PKR {r.propertyRent.toLocaleString()}/mo · Seller: {r.sellerName}
                      </p>
                      <p className="text-sm text-slate-700 pt-1">{r.message}</p>
                      {r.preferredVisit && (
                        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Preferred visit: {r.preferredVisit}
                        </p>
                      )}
                      {r.sellerResponse && (
                        <p className="text-xs text-indigo-900 bg-indigo-50 rounded-lg p-2 mt-2">
                          Seller reply: {r.sellerResponse}
                        </p>
                      )}
                      {r.declineReason && (
                        <p className="text-xs text-rose-800 bg-rose-50 rounded-lg p-2 mt-2">
                          Decline reason: {r.declineReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.startConversation(r.propertyId);
                        onOpenChat(res.conversation.conversationId);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF]"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Open Chat
                    </button>
                    {(r.status === 'pending' || r.status === 'responded') && (
                      <button
                        type="button"
                        onClick={() => handleCancelRequest(r)}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-600"
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* BUYER PROFILE TAB */}
      {activeTab === 'profile' && (
        <section className="space-y-6">
          {!currentUser ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <h1 className="font-display font-bold text-xl text-slate-900">
                Sign in to manage your Buyer Profile
              </h1>
              <button
                type="button"
                onClick={onRequireAuth}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold"
              >
                Sign In / Create Account
              </button>
            </div>
          ) : (
            <>
              {/* Indigo Header Banner matching Screenshot #7 */}
              <div className="rounded-3xl bg-gradient-to-r from-[#4338CA] to-[#5B3CF5] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-bold shrink-0">
                    {currentUser.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="font-display font-bold text-xl sm:text-2xl">
                      {currentUser.displayName}
                    </h1>
                    <p className="text-xs sm:text-sm text-indigo-100 capitalize">
                      {currentUser.role} · {currentUser.preferredCity} · {currentUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white self-start sm:self-auto"
                >
                  Sign Out
                </button>
              </div>

              {/* 2 Summary Cards matching Screenshot #7 */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => onChangeTab('favourites')}
                  className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-indigo-300 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                    <Heart className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-medium text-slate-500">My Favourites</p>
                  <p className="font-display font-bold text-2xl text-slate-900 tabular-nums mt-0.5">
                    {favouriteProperties.length}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeTab('requests')}
                  className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-indigo-300 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#5B3CF5] flex items-center justify-center mb-3">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-medium text-slate-500">My Requests</p>
                  <p className="font-display font-bold text-2xl text-slate-900 tabular-nums mt-0.5">
                    {requests.length}
                  </p>
                </button>
              </div>

              {/* Edit Profile & Security */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <form
                  onSubmit={handleSaveProfile}
                  className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
                >
                  <h2 className="font-display font-bold text-lg text-slate-900">
                    Account Details
                  </h2>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Preferred City
                    </label>
                    <select
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      {config.cities.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {profileMsg && <p className="text-xs text-emerald-700">{profileMsg}</p>}
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold hover:bg-[#4F32DF]"
                  >
                    Save Profile
                  </button>
                </form>

                <div className="space-y-6">
                  <form
                    onSubmit={handleChangePassword}
                    className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3"
                  >
                    <h2 className="font-display font-bold text-lg text-slate-900">
                      Change Password
                    </h2>
                    <input
                      type="password"
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      placeholder="Current Password (leave blank for demo account)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="New Password (min 6 chars)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                    {pwdMsg && <p className="text-xs text-indigo-700">{pwdMsg}</p>}
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                    >
                      Update Password
                    </button>
                  </form>

                  <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm text-slate-900">Account Deletion</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Status: {currentUser.accountStatus.replace('_', ' ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={currentUser.accountStatus === 'deletion_pending'}
                      onClick={async () => {
                        const res = await api.requestAccountDeletion();
                        onProfileUpdated(res.user);
                      }}
                      className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
                    >
                      {currentUser.accountStatus === 'deletion_pending'
                        ? 'Deletion Requested'
                        : 'Request Deletion'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* FILTER PROPERTIES MODAL / SHEET (Matches Screenshot #6) */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display font-bold text-base text-slate-900">
                Filter Properties
              </h2>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">City</label>
                  <select
                    value={selectedCity}
                    onChange={(e) => {
                      setSelectedCity(e.target.value);
                      setSelectedArea('All');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    <option value="All">All Cities</option>
                    {config.cities.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Area / Society
                  </label>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    <option value="All">All Areas</option>
                    {availableAreas.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rent Range */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">Monthly Rent Range</span>
                  <span className="text-xs font-semibold text-[#5B3CF5] font-mono tabular-nums">
                    PKR {minRent.toLocaleString()} – {maxRent >= 250000 ? '250,000+' : maxRent.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={minRent}
                    onChange={(e) => setMinRent(Math.max(0, Number(e.target.value)))}
                    placeholder="Min PKR"
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={maxRent}
                    onChange={(e) => setMaxRent(Math.max(0, Number(e.target.value)))}
                    placeholder="Max PKR"
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
                <input
                  type="range"
                  min={10000}
                  max={250000}
                  step={5000}
                  value={maxRent}
                  onChange={(e) => setMaxRent(Number(e.target.value))}
                  className="w-full accent-[#5B3CF5]"
                />
              </div>

              {/* Bedrooms & Bathrooms */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Bedrooms
                  </label>
                  <select
                    value={minBeds}
                    onChange={(e) => setMinBeds(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    <option value={0}>Any</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}+ Bedrooms
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Bathrooms
                  </label>
                  <select
                    value={minBaths}
                    onChange={(e) => setMinBaths(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    <option value={0}>Any</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}+ Bathrooms
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Property Types */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  Property Type
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {config.categories.map((cat) => {
                    const checked = selectedCategories.includes(cat);
                    return (
                      <label
                        key={cat}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedCategories((prev) =>
                              checked ? prev.filter((x) => x !== cat) : [...prev, cat]
                            )
                          }
                          className="accent-[#5B3CF5] w-4 h-4 rounded"
                        />
                        <span className="text-sm text-slate-800">{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Furnishing & Parking */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Furnished Status
                  </label>
                  <select
                    value={furnishingFilter}
                    onChange={(e) => setFurnishingFilter(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    <option value="Any">Any</option>
                    <option value="Furnished">Furnished</option>
                    <option value="Semi-Furnished">Semi-Furnished</option>
                    <option value="Unfurnished">Unfurnished</option>
                  </select>
                </div>

                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parkingOnly}
                    onChange={(e) => setParkingOnly(e.target.checked)}
                    className="accent-[#5B3CF5] w-4 h-4"
                  />
                  <span className="text-sm text-slate-800">Dedicated Parking</span>
                </label>
              </div>

              {/* Facilities */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  Facilities
                </span>
                <div className="flex flex-wrap gap-2">
                  {FACILITY_OPTIONS.map((fac) => {
                    const active = selectedFacilities.includes(fac);
                    return (
                      <button
                        key={fac}
                        type="button"
                        onClick={() =>
                          setSelectedFacilities((prev) =>
                            active ? prev.filter((f) => f !== fac) : [...prev, fac]
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-[#5B3CF5] text-white border-[#5B3CF5]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {fac}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="flex-1 py-3 px-5 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white text-sm font-semibold"
              >
                Apply Filters ({filteredProperties.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROPERTY DETAIL MODAL (Matches Screenshot #5) */}
      {detailProperty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center sm:p-4">
          <div className="w-full max-w-4xl bg-white sm:rounded-3xl shadow-2xl border border-slate-200 max-h-screen sm:max-h-[92vh] flex flex-col overflow-hidden">
            {/* Gallery Header */}
            <div className="relative h-64 sm:h-80 bg-slate-900 shrink-0">
              {detailProperty.imageURLs[galleryIndex] ? (
                <img
                  src={detailProperty.imageURLs[galleryIndex]}
                  alt={`${detailProperty.title} photo ${galleryIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <Home className="w-12 h-12" />
                </div>
              )}

              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDetailProperty(null)}
                  aria-label="Close property details"
                  className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleShareProperty(detailProperty)}
                    aria-label="Share listing"
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) onRequireAuth();
                      else onToggleFavourite(detailProperty.propertyId);
                    }}
                    aria-label="Save favourite"
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        favouriteIds.includes(detailProperty.propertyId)
                          ? 'fill-rose-400 text-rose-400'
                          : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) onRequireAuth();
                      else setReportOpen(true);
                    }}
                    aria-label="Report listing"
                    className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {detailProperty.imageURLs.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryIndex((i) =>
                        i === 0 ? detailProperty.imageURLs.length - 1 : i - 1
                      )
                    }
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/70"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryIndex((i) => (i + 1) % detailProperty.imageURLs.length)
                    }
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/70"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs font-mono tabular-nums">
                {galleryIndex + 1} / {Math.max(1, detailProperty.imageURLs.length)}
              </div>
            </div>

            {shareToast && (
              <div className="bg-emerald-600 text-white text-xs font-medium px-6 py-2 text-center">
                {shareToast}
              </div>
            )}

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h2 className="font-display font-bold text-2xl text-slate-900">
                    {detailProperty.title}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#5B3CF5] shrink-0" />
                    <span>
                      {detailProperty.exactAddress
                        ? detailProperty.exactAddress
                        : `${detailProperty.society || detailProperty.area}, ${detailProperty.city} (Approximate location)`}
                    </span>
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="font-display font-bold text-2xl text-[#5B3CF5] tabular-nums">
                    PKR {detailProperty.rent.toLocaleString()}
                    <span className="text-sm font-medium text-slate-500"> / month</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {detailProperty.negotiable ? 'Negotiable' : 'Fixed rent'} · Deposit PKR{' '}
                    {detailProperty.deposit.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Specs strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-slate-200 text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                  <BedDouble className="w-4 h-4 text-[#5B3CF5]" />
                  <span className="tabular-nums">{detailProperty.bedrooms} Beds</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Bath className="w-4 h-4 text-[#5B3CF5]" />
                  <span className="tabular-nums">{detailProperty.bathrooms} Baths</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Maximize2 className="w-4 h-4 text-[#5B3CF5]" />
                  <span className="tabular-nums">
                    {detailProperty.coveredArea} {detailProperty.coveredAreaUnit}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Calendar className="w-4 h-4 text-[#5B3CF5]" />
                  <span>From {detailProperty.availabilityDate}</span>
                </div>
              </div>

              {/* Description & Rent Terms */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">Description</h3>
                    <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                      {detailProperty.description}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900 mb-2">
                      Facilities & Utilities
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {detailProperty.facilities.map((fac) => (
                        <span
                          key={fac}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium"
                        >
                          <Check className="w-3.5 h-3.5 text-[#5B3CF5]" />
                          {fac}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
                  <h4 className="font-display font-bold text-sm text-slate-900">
                    Rent & Availability Terms
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Category</span>
                    <span className="font-semibold text-slate-800">{detailProperty.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Floor / Portion</span>
                    <span className="font-semibold text-slate-800">
                      {detailProperty.floorPortion}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Furnishing</span>
                    <span className="font-semibold text-slate-800">
                      {detailProperty.furnishing}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Security Deposit</span>
                    <span className="font-semibold text-slate-800 font-mono tabular-nums">
                      PKR {detailProperty.deposit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Advance Rent</span>
                    <span className="font-semibold text-slate-800 font-mono tabular-nums">
                      PKR {detailProperty.advanceRent.toLocaleString()}
                    </span>
                  </div>
                  {detailProperty.additionalCharges && (
                    <div className="pt-1 border-t border-slate-200">
                      <span className="text-slate-500 block">Additional Charges</span>
                      <span className="font-medium text-slate-800">
                        {detailProperty.additionalCharges}
                      </span>
                    </div>
                  )}
                  <div className="pt-1 border-t border-slate-200 text-slate-500">
                    Last confirmed:{' '}
                    {new Date(detailProperty.lastConfirmedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Approximate Neighborhood Google Map */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Approximate Neighborhood Location
                  </h3>
                  <span className="text-xs text-slate-500">
                    Exact street address is shared privately after viewing confirmation
                  </span>
                </div>
                <PropertyMap
                  apiKey={mapsApiKey}
                  properties={[detailProperty]}
                  center={detailProperty.location}
                  zoom={14}
                  heightClass="h-56"
                />
              </div>

              {/* Safety Warning */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{config.safetyNotice}</span>
              </div>

              {/* Seller Contact Card */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-[#5B3CF5] font-bold flex items-center justify-center shrink-0">
                    {detailProperty.sellerName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-display font-bold text-sm text-slate-900">
                        {detailProperty.sellerName}
                      </p>
                      {detailProperty.sellerVerified && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <UserCheck className="w-3.5 h-3.5" />
                          Verified Profile
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {detailProperty.sellerRoleLabel} · Preferred: {detailProperty.contactPreference}
                    </p>
                    {detailProperty.sellerPhone && (
                      <p className="text-xs text-slate-700 mt-0.5 inline-flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3" />
                        {detailProperty.sellerPhone}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Profile verification does not confirm legal property ownership.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleContactSeller(detailProperty)}
                    className="px-4 py-2.5 rounded-xl border border-indigo-200 text-[#5B3CF5] hover:bg-indigo-50 text-xs font-semibold whitespace-nowrap"
                  >
                    Contact
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth();
                      } else {
                        setEnquiryOpen(true);
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Send Rental Request
                  </button>
                </div>
              </div>

              {enquiryFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{enquiryFeedback}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SEND RENTAL REQUEST MODAL */}
      {enquiryOpen && detailProperty && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-900">
                Send Rental Request
              </h3>
              <button
                type="button"
                onClick={() => setEnquiryOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              For: <strong className="text-slate-800">{detailProperty.title}</strong> (PKR{' '}
              {detailProperty.rent.toLocaleString()}/month)
            </p>
            <form onSubmit={handleSendRentalRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preferred Viewing Date & Time (optional)
                </label>
                <input
                  type="text"
                  value={preferredVisit}
                  onChange={(e) => setPreferredVisit(e.target.value)}
                  placeholder="e.g., Saturday 4:00 PM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Message to {detailProperty.sellerName}
                </label>
                <textarea
                  required
                  rows={3}
                  value={enquiryMsg}
                  onChange={(e) => setEnquiryMsg(e.target.value)}
                  placeholder="Introduce yourself, family size, expected move-in date..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Note: Submitting or accepting a request is an enquiry, not a signed tenancy agreement.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEnquiryOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enquirySubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF] disabled:opacity-50"
                >
                  {enquirySubmitting ? 'Sending...' : 'Submit Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT LISTING MODAL */}
      {reportOpen && detailProperty && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-900">Report Listing</h3>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitReport} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option>Misleading price or photos</option>
                  <option>Suspected scam or advance fee demand</option>
                  <option>Property already rented</option>
                  <option>Inaccurate location</option>
                  <option>Offensive or inappropriate content</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Details</label>
                <textarea
                  required
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Provide details for our moderation team..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              {reportSuccess && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  {reportSuccess}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
