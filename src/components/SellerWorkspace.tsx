import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Home,
  ImagePlus,
  Inbox,
  MapPin,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  PlatformConfig,
  PropertyListing,
  PropertyLocation,
  RentalRequest,
  RequestStatus,
  UserProfile,
} from '../types.ts';
import { PropertyMap } from './PropertyMap.tsx';

export type SellerTab = 'dashboard' | 'listings' | 'add' | 'requests' | 'profile';

interface SellerWorkspaceProps {
  activeTab: SellerTab;
  onChangeTab: (tab: SellerTab) => void;
  config: PlatformConfig;
  mapsApiKey: string;
  currentUser: UserProfile;
  myListings: PropertyListing[];
  requests: RentalRequest[];
  onListingsChanged: () => void | Promise<void>;
  onRequestUpdated: (req: RentalRequest) => void;
  onOpenChat: (conversationId: string) => void;
  onProfileUpdated: (user: UserProfile) => void;
  onSignOut: () => void;
}

const FACILITY_LIST = [
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

async function resizePropertyPhoto(file: File): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not a valid image file.`);
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`"${file.name}" exceeds the 10 MB limit.`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing failed.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error(`Unable to read "${file.name}" as an image.`));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error(`Failed to load "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export const SellerWorkspace: React.FC<SellerWorkspaceProps> = ({
  activeTab,
  onChangeTab,
  config,
  mapsApiKey,
  currentUser,
  myListings,
  requests,
  onListingsChanged,
  onRequestUpdated,
  onOpenChat,
  onProfileUpdated,
  onSignOut,
}) => {
  // Property Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(config.categories[0] || 'House');
  const [rent, setRent] = useState('70000');
  const [negotiable, setNegotiable] = useState(true);
  const [deposit, setDeposit] = useState('140000');
  const [advanceRent, setAdvanceRent] = useState('70000');
  const [additionalCharges, setAdditionalCharges] = useState('');
  const [city, setCity] = useState(config.cities[0]?.name || 'Lahore');
  const [area, setArea] = useState(config.cities[0]?.areas[0] || 'DHA');
  const [society, setSociety] = useState('');
  const [addressVisibility, setAddressVisibility] = useState<'approximate' | 'exact_public'>(
    'approximate'
  );
  const [exactAddress, setExactAddress] = useState('');
  const [location, setLocation] = useState<PropertyLocation>({
    lat: config.cities[0]?.lat || 31.5204,
    lng: config.cities[0]?.lng || 74.3587,
  });
  const [bedrooms, setBedrooms] = useState('3');
  const [bathrooms, setBathrooms] = useState('2');
  const [floorPortion, setFloorPortion] = useState('Full House');
  const [coveredArea, setCoveredArea] = useState('10');
  const [coveredAreaUnit, setCoveredAreaUnit] = useState<'Sq. Ft.' | 'Marla' | 'Kanal'>('Marla');
  const [furnishing, setFurnishing] = useState<'Furnished' | 'Semi-Furnished' | 'Unfurnished'>(
    'Semi-Furnished'
  );
  const [facilities, setFacilities] = useState<string[]>(['Parking', 'Water', 'Gas']);
  const [parking, setParking] = useState(true);
  const [availabilityDate, setAvailabilityDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [contactPreference, setContactPreference] = useState<'In-app' | 'Phone' | 'WhatsApp'>(
    'In-app'
  );
  const [preferredTenant, setPreferredTenant] = useState('Families preferred');
  const [description, setDescription] = useState('');
  const [imageURLs, setImageURLs] = useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Request response state
  const [reqFilter, setReqFilter] = useState<string>('all');
  const [respondingReq, setRespondingReq] = useState<RentalRequest | null>(null);
  const [respStatus, setRespStatus] = useState<RequestStatus>('responded');
  const [respMessage, setRespMessage] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  // Seller Profile state
  const [showPhonePublicly, setShowPhonePublicly] = useState(currentUser.showPhonePublicly);
  const [showEmailPublicly, setShowEmailPublicly] = useState(currentUser.showEmailPublicly);
  const [sellerRoleLabel, setSellerRoleLabel] = useState<'Property Owner' | 'Authorized Agent'>(
    currentUser.sellerRoleLabel || 'Property Owner'
  );
  const [profileSavedMsg, setProfileSavedMsg] = useState('');

  const stats = useMemo(() => {
    return {
      total: myListings.length,
      pending: myListings.filter((p) => p.status === 'under_review').length,
      active: myListings.filter((p) => p.status === 'active' || p.status === 'approved').length,
      paused: myListings.filter((p) => p.status === 'paused').length,
      rented: myListings.filter((p) => p.status === 'rented').length,
      pendingRequests: requests.filter((r) => r.status === 'pending').length,
    };
  }, [myListings, requests]);

  const currentCityConfig = useMemo(
    () => config.cities.find((c) => c.name === city) || config.cities[0],
    [config.cities, city]
  );

  useEffect(() => {
    if (currentCityConfig && (!area || !currentCityConfig.areas.includes(area))) {
      setArea(currentCityConfig.areas[0] || currentCityConfig.name);
    }
  }, [currentCityConfig, area]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory(config.categories[0] || 'House');
    setRent('70000');
    setNegotiable(true);
    setDeposit('140000');
    setAdvanceRent('70000');
    setAdditionalCharges('');
    const c = config.cities[0];
    setCity(c?.name || 'Lahore');
    setArea(c?.areas[0] || 'DHA');
    setSociety('');
    setAddressVisibility('approximate');
    setExactAddress('');
    setLocation({ lat: c?.lat || 31.5204, lng: c?.lng || 74.3587 });
    setBedrooms('3');
    setBathrooms('2');
    setFloorPortion('Full House');
    setCoveredArea('10');
    setCoveredAreaUnit('Marla');
    setFurnishing('Semi-Furnished');
    setFacilities(['Parking', 'Water', 'Gas']);
    setParking(true);
    setAvailabilityDate(new Date().toISOString().slice(0, 10));
    setContactPreference('In-app');
    setPreferredTenant('Families preferred');
    setDescription('');
    setImageURLs([]);
    setFormError('');
    setDuplicateWarning(false);
  };

  const startEditListing = (prop: PropertyListing) => {
    setEditingId(prop.propertyId);
    setTitle(prop.title);
    setCategory(prop.category);
    setRent(String(prop.rent));
    setNegotiable(prop.negotiable);
    setDeposit(String(prop.deposit));
    setAdvanceRent(String(prop.advanceRent));
    setAdditionalCharges(prop.additionalCharges || '');
    setCity(prop.city);
    setArea(prop.area);
    setSociety(prop.society || '');
    setAddressVisibility(prop.addressVisibility);
    setExactAddress(prop.exactAddress || '');
    setLocation(prop.location);
    setBedrooms(String(prop.bedrooms));
    setBathrooms(String(prop.bathrooms));
    setFloorPortion(prop.floorPortion || 'Full House');
    setCoveredArea(String(prop.coveredArea));
    setCoveredAreaUnit(prop.coveredAreaUnit);
    setFurnishing(prop.furnishing);
    setFacilities(prop.facilities || []);
    setParking(prop.parking);
    setAvailabilityDate(prop.availabilityDate);
    setContactPreference(prop.contactPreference);
    setPreferredTenant(prop.preferredTenant || '');
    setDescription(prop.description);
    setImageURLs(prop.imageURLs || []);
    setFormError('');
    setDuplicateWarning(false);
    onChangeTab('add');
  };

  const handlePhotoSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFormError('');
    setUploadBusy(true);
    try {
      const remaining = config.maxPhotosPerListing - imageURLs.length;
      const toProcess = Array.from(files).slice(0, Math.max(0, remaining));
      const results: string[] = [];
      for (const file of toProcess) {
        const compressed = await resizePropertyPhoto(file);
        results.push(compressed);
      }
      setImageURLs((prev) => [...prev, ...results]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadBusy(false);
    }
  };

  const moveImage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= imageURLs.length) return;
    setImageURLs((prev) => {
      const next = prev.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleSaveProperty = async (
    targetStatus: 'draft' | 'under_review',
    confirmDuplicate = false
  ) => {
    setFormError('');
    setSuccessBanner('');
    if (!title.trim()) {
      setFormError('Please enter a Property Title.');
      return;
    }
    if (!Number.isFinite(Number(rent)) || Number(rent) < 1000) {
      setFormError('Please enter a valid Monthly Rent (PKR 1,000 or higher).');
      return;
    }
    if (!description.trim()) {
      setFormError('Please add an accurate property description.');
      return;
    }
    if (imageURLs.length < 1) {
      setFormError('Please upload at least 1 property photo (up to 15 photos).');
      return;
    }

    const resolvedArea = area.trim() || currentCityConfig?.areas[0] || city;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        rent: Number(rent),
        negotiable,
        deposit: Number(deposit || 0),
        advanceRent: Number(advanceRent || 0),
        additionalCharges: additionalCharges.trim(),
        city,
        area: resolvedArea,
        society: society.trim() || resolvedArea,
        addressVisibility,
        exactAddress: exactAddress.trim(),
        location,
        bedrooms: category === 'Commercial' ? 0 : Number(bedrooms || 0),
        bathrooms: Number(bathrooms || 0),
        floorPortion,
        coveredArea: Number(coveredArea || 0),
        coveredAreaUnit,
        furnishing,
        facilities,
        parking,
        availabilityDate,
        contactPreference,
        preferredTenant,
        description: description.trim(),
        imageURLs,
        status: targetStatus,
        confirmDuplicate,
      };

      const wasEditing = Boolean(editingId);
      if (editingId) {
        await api.updateProperty(editingId, payload);
      } else {
        await api.createProperty(payload);
      }
      resetForm();
      await onListingsChanged();
      setSuccessBanner(
        targetStatus === 'draft'
          ? 'Property saved as Draft. Submit it for review whenever you are ready to publish.'
          : wasEditing
            ? 'Listing updated and submitted for Admin moderation review.'
            : 'Property submitted! It is now Pending Review below and will go live to buyers once approved by an Admin.'
      );
      onChangeTab('listings');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save property.';
      if (msg.toLowerCase().includes('similar listing')) {
        setDuplicateWarning(true);
      }
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleListingQuickAction = async (
    prop: PropertyListing,
    action: 'pause' | 'resume' | 'rented' | 'confirm' | 'delete'
  ) => {
    if (action === 'delete') {
      await api.deleteProperty(prop.propertyId);
    } else if (action === 'pause') {
      await api.updateProperty(prop.propertyId, { status: 'paused' });
    } else if (action === 'resume') {
      await api.updateProperty(prop.propertyId, { status: 'active' });
    } else if (action === 'rented') {
      await api.updateProperty(prop.propertyId, { status: 'rented' });
    } else if (action === 'confirm') {
      await api.updateProperty(prop.propertyId, { confirmAvailability: true });
    }
    onListingsChanged();
  };

  const handleRespondRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondingReq) return;
    const res = await api.updateRequest(respondingReq.requestId, {
      status: respStatus,
      note: respMessage,
      declineReason: respStatus === 'declined' ? declineReason : undefined,
    });
    onRequestUpdated(res.request);
    setRespondingReq(null);
    setRespMessage('');
    setDeclineReason('');
  };

  const filteredRequests = useMemo(() => {
    if (reqFilter === 'all') return requests;
    return requests.filter((r) => r.status === reqFilter);
  }, [requests, reqFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10 space-y-6">
      {/* SELLER DASHBOARD TAB (Matches Screenshot #8) */}
      {activeTab === 'dashboard' && (
        <>
          <div className="rounded-3xl bg-gradient-to-r from-[#4338CA] to-[#5B3CF5] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-bold shrink-0">
                {currentUser.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display font-bold text-xl sm:text-2xl">
                    {currentUser.displayName}
                  </h1>
                  {currentUser.verificationStatus === 'verified' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-200">
                      <ShieldCheck className="w-4 h-4" />
                      Verified Profile
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-indigo-100">
                  {currentUser.sellerRoleLabel || 'Seller'} · {currentUser.preferredCity}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                onChangeTab('add');
              }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-[#5B3CF5] font-semibold text-sm hover:bg-indigo-50 transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              Add Property
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {[
              { label: 'My Properties', value: stats.total, color: 'text-slate-900' },
              { label: 'Pending Review', value: stats.pending, color: 'text-amber-600' },
              { label: 'Active', value: stats.active, color: 'text-emerald-600' },
              { label: 'Paused', value: stats.paused, color: 'text-slate-600' },
              { label: 'Rented', value: stats.rented, color: 'text-indigo-600' },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between"
              >
                <span className="text-xs font-medium text-slate-500">{card.label}</span>
                <span
                  className={`font-display font-bold text-2xl mt-2 tabular-nums ${card.color}`}
                >
                  {card.value}
                </span>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onChangeTab('add');
              }}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 transition-colors flex items-center gap-4 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#5B3CF5] flex items-center justify-center shrink-0">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <p className="font-display font-bold text-sm text-slate-900">Add Property</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload photos, rent & map pin
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('listings')}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 transition-colors flex items-center gap-4 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#5B3CF5] flex items-center justify-center shrink-0">
                <Home className="w-6 h-6" />
              </div>
              <div>
                <p className="font-display font-bold text-sm text-slate-900">My Listings</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Edit, pause or mark rented
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('requests')}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 transition-colors flex items-center gap-4 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#5B3CF5] flex items-center justify-center shrink-0">
                <Inbox className="w-6 h-6" />
              </div>
              <div>
                <p className="font-display font-bold text-sm text-slate-900">
                  Enquiry Inbox ({stats.pendingRequests} new)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reply & schedule visits
                </p>
              </div>
            </button>
          </div>

          {/* Recent Requests Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg text-slate-900">Recent Requests</h2>
              <button
                type="button"
                onClick={() => onChangeTab('requests')}
                className="text-xs font-semibold text-[#5B3CF5] hover:underline"
              >
                See All →
              </button>
            </div>
            {requests.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                No buyer enquiries received yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.slice(0, 4).map((r) => (
                  <div
                    key={r.requestId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-900">
                        {r.buyerName} ·{' '}
                        <span className="text-[#5B3CF5] font-mono tabular-nums">
                          PKR {r.propertyRent.toLocaleString()}/month
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.propertyTitle} · {r.message}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md capitalize ${
                          r.status === 'pending'
                            ? 'bg-amber-50 text-amber-800'
                            : r.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.status.replace('_', ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRespondingReq(r);
                          setRespStatus('responded');
                          setRespMessage(r.sellerResponse || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF]"
                      >
                        Respond
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* MY LISTINGS TAB */}
      {activeTab === 'listings' && (
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display font-bold text-2xl text-slate-900">My Listings</h1>
              <p className="text-sm text-slate-500">
                Manage moderation status, availability confirmation, and edits
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                onChangeTab('add');
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold hover:bg-[#4F32DF] self-start"
            >
              <Plus className="w-4 h-4" />
              Add New Property
            </button>
          </div>

          {successBanner && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessBanner('')}
                className="p-1 text-emerald-700 hover:text-emerald-950"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {myListings.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
              <Home className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="font-display font-bold text-lg text-slate-900">
                You have not listed any properties yet
              </h2>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  onChangeTab('add');
                }}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold"
              >
                Create Your First Listing
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myListings.map((prop) => (
                <div
                  key={prop.propertyId}
                  className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row gap-4 justify-between"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    {prop.imageURLs[0] ? (
                      <img
                        src={prop.imageURLs[0]}
                        alt={prop.title}
                        referrerPolicy="no-referrer"
                        className="w-full sm:w-36 h-28 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-full sm:w-36 h-28 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Home className="w-8 h-8" />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-bold text-base text-slate-900">
                          {prop.title}
                        </h3>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-md capitalize ${
                            prop.status === 'active' || prop.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : prop.status === 'under_review'
                                ? 'bg-amber-50 text-amber-800'
                                : prop.status === 'rejected'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {prop.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-[#5B3CF5] tabular-nums">
                        PKR {prop.rent.toLocaleString()} / month
                      </p>
                      <p className="text-xs text-slate-500">
                        {prop.category} · {prop.society || prop.area}, {prop.city} · Last confirmed{' '}
                        {new Date(prop.lastConfirmedAt).toLocaleDateString()}
                      </p>
                      {prop.status === 'rejected' && prop.rejectionReason && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2 mt-1">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Admin feedback: {prop.rejectionReason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                    <button
                      type="button"
                      onClick={() => startEditListing(prop)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {prop.status === 'rejected' ? 'Edit & Resubmit' : 'Edit'}
                    </button>

                    {(prop.status === 'active' || prop.status === 'approved') && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleListingQuickAction(prop, 'confirm')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Confirm Available
                        </button>
                        <button
                          type="button"
                          onClick={() => handleListingQuickAction(prop, 'pause')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <PauseCircle className="w-3.5 h-3.5" />
                          Pause
                        </button>
                        <button
                          type="button"
                          onClick={() => handleListingQuickAction(prop, 'rented')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark Rented
                        </button>
                      </>
                    )}

                    {(prop.status === 'paused' || prop.status === 'rented') && (
                      <button
                        type="button"
                        onClick={() => handleListingQuickAction(prop, 'resume')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        Reactivate
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleListingQuickAction(prop, 'delete')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ADD / EDIT PROPERTY TAB (Matches Screenshot #9 + Blueprint Appendix A) */}
      {activeTab === 'add' && (
        <section className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangeTab('listings')}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
                aria-label="Back to listings"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-display font-bold text-xl text-slate-900">
                  {editingId ? 'Edit Property Listing' : 'Add Property'}
                </h1>
                <p className="text-xs text-slate-500">
                  All submissions are reviewed by Admin moderation before going live
                </p>
              </div>
            </div>
          </div>

          {/* Photo Manager */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Upload Images (1–{config.maxPhotosPerListing} Photos) · {imageURLs.length}/
                {config.maxPhotosPerListing}
              </span>
              <span className="text-[11px] text-slate-500">
                At least 1 photo required
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handlePhotoSelect(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadBusy || imageURLs.length >= config.maxPhotosPerListing}
              className="w-full py-7 px-4 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/80 transition-colors flex flex-col items-center justify-center gap-1.5 text-center disabled:opacity-50"
            >
              <ImagePlus className="w-7 h-7 text-[#5B3CF5]" />
              <span className="text-sm font-semibold text-slate-800">
                {uploadBusy ? 'Compressing & validating images...' : 'Click to Upload Property Photos'}
              </span>
              <span className="text-xs text-slate-500">
                JPEG, PNG, WebP · Auto-resized for fast loading
              </span>
            </button>

            {imageURLs.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {imageURLs.map((url, idx) => (
                  <div
                    key={`${idx}-${url.slice(0, 24)}`}
                    className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100"
                  >
                    <img
                      src={url}
                      alt={`Property preview ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-1 bg-black/60 flex items-center justify-between text-white">
                      <button
                        type="button"
                        onClick={() => moveImage(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Move photo left"
                        className="p-0.5 disabled:opacity-30"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono">{idx === 0 ? 'Cover' : idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => moveImage(idx, 1)}
                        disabled={idx === imageURLs.length - 1}
                        aria-label="Move photo right"
                        className="p-0.5 disabled:opacity-30"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setImageURLs((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove photo"
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Core Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Property Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., 5 Marla Modern House in DHA Phase 6"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Property Type *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {config.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Rent (PKR) *
              </label>
              <input
                type="number"
                required
                min={1000}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Security Deposit (PKR)
              </label>
              <input
                type="number"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Advance Rent (PKR)
              </label>
              <input
                type="number"
                min={0}
                value={advanceRent}
                onChange={(e) => setAdvanceRent(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City *</label>
              <select
                value={city}
                onChange={(e) => {
                  const nextCity = e.target.value;
                  setCity(nextCity);
                  const found = config.cities.find((c) => c.name === nextCity);
                  if (found) {
                    setArea(found.areas[0] || '');
                    setLocation({ lat: found.lat, lng: found.lng });
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {config.cities.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Area / Neighbourhood *
              </label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {(currentCityConfig?.areas || []).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sector / Society Detail
              </label>
              <input
                type="text"
                value={society}
                onChange={(e) => setSociety(e.target.value)}
                placeholder="e.g., DHA Phase 6 Sector J"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address Visibility
              </label>
              <select
                value={addressVisibility}
                onChange={(e) =>
                  setAddressVisibility(e.target.value as 'approximate' | 'exact_public')
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                <option value="approximate">Approximate publicly (exact shared after approval)</option>
                <option value="exact_public">Show exact street address publicly</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Exact Street Address (kept private unless selected above)
              </label>
              <input
                type="text"
                value={exactAddress}
                onChange={(e) => setExactAddress(e.target.value)}
                placeholder="House #, Street #, Block..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            {/* Map Pin Picker */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#5B3CF5]" />
                  Approximate Neighborhood Map Pin (Click map to adjust)
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </span>
              </div>
              <PropertyMap
                apiKey={mapsApiKey}
                center={location}
                zoom={13}
                heightClass="h-52"
                pickerMode
                pickedLocation={location}
                onPickLocation={setLocation}
              />
            </div>

            {/* Category-relevant fields */}
            {category !== 'Commercial' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bedrooms</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bathrooms</label>
              <input
                type="number"
                min={0}
                max={20}
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Covered Area
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={coveredArea}
                  onChange={(e) => setCoveredArea(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200"
                />
                <select
                  value={coveredAreaUnit}
                  onChange={(e) =>
                    setCoveredAreaUnit(e.target.value as 'Sq. Ft.' | 'Marla' | 'Kanal')
                  }
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="Marla">Marla</option>
                  <option value="Kanal">Kanal</option>
                  <option value="Sq. Ft.">Sq. Ft.</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Floor / Portion
              </label>
              <input
                type="text"
                value={floorPortion}
                onChange={(e) => setFloorPortion(e.target.value)}
                placeholder="Full House / Upper Portion / 3rd Floor"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Furnishing</label>
              <select
                value={furnishing}
                onChange={(e) =>
                  setFurnishing(
                    e.target.value as 'Furnished' | 'Semi-Furnished' | 'Unfurnished'
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                <option value="Furnished">Furnished</option>
                <option value="Semi-Furnished">Semi-Furnished</option>
                <option value="Unfurnished">Unfurnished</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Available From *
              </label>
              <input
                type="date"
                value={availabilityDate}
                onChange={(e) => setAvailabilityDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Preference
              </label>
              <select
                value={contactPreference}
                onChange={(e) =>
                  setContactPreference(e.target.value as 'In-app' | 'Phone' | 'WhatsApp')
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                <option value="In-app">In-app</option>
                <option value="Phone">Phone</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Preferred Tenant
              </label>
              <input
                type="text"
                value={preferredTenant}
                onChange={(e) => setPreferredTenant(e.target.value)}
                placeholder="Families / Working professionals"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-5 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={negotiable}
                  onChange={(e) => setNegotiable(e.target.checked)}
                  className="accent-[#5B3CF5] w-4 h-4"
                />
                <span className="text-sm text-slate-700">Rent is negotiable</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={parking}
                  onChange={(e) => setParking(e.target.checked)}
                  className="accent-[#5B3CF5] w-4 h-4"
                />
                <span className="text-sm text-slate-700">Dedicated parking available</span>
              </label>
            </div>

            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Facilities & Utilities
              </span>
              <div className="flex flex-wrap gap-2">
                {FACILITY_LIST.map((fac) => {
                  const active = facilities.includes(fac);
                  return (
                    <button
                      key={fac}
                      type="button"
                      onClick={() =>
                        setFacilities((prev) =>
                          active ? prev.filter((f) => f !== fac) : [...prev, fac]
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                        active
                          ? 'bg-[#5B3CF5] text-white border-[#5B3CF5]'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {fac}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Charges (Maintenance, Society fee, etc.)
              </label>
              <input
                type="text"
                value={additionalCharges}
                onChange={(e) => setAdditionalCharges(e.target.value)}
                placeholder="e.g., Society maintenance PKR 3,500/month"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Accurate Property Description *
              </label>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe room layout, natural light, nearby parks/schools, utility meters..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
              <p>{formError}</p>
              {duplicateWarning && (
                <button
                  type="button"
                  onClick={() => handleSaveProperty('under_review', true)}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 text-white font-semibold"
                >
                  Confirm & Submit Anyway
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveProperty('draft')}
              className="px-5 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveProperty('under_review')}
              className="flex-1 py-3 px-6 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Submit Property'}
            </button>
          </div>
        </section>
      )}

      {/* ENQUIRY INBOX TAB */}
      {activeTab === 'requests' && (
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display font-bold text-2xl text-slate-900">Enquiry Inbox</h1>
              <p className="text-sm text-slate-500">
                Respond to tenant enquiries, arrange visits, or update request status
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {['all', 'pending', 'responded', 'viewing_arranged', 'accepted', 'declined'].map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setReqFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap ${
                      reqFilter === st
                        ? 'bg-[#5B3CF5] text-white'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                )
              )}
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              No enquiries match this filter.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((r) => (
                <div
                  key={r.requestId}
                  className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-bold text-base text-slate-900">
                        {r.buyerName}
                      </h3>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-medium text-slate-600">{r.propertyTitle}</span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-md capitalize ${
                          r.status === 'pending'
                            ? 'bg-amber-50 text-amber-800'
                            : r.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'declined'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{r.message}</p>
                    <p className="text-xs text-slate-500 inline-flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Preferred visit: {r.preferredVisit}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </p>
                    {r.sellerResponse && (
                      <p className="text-xs text-indigo-900 bg-indigo-50 p-2 rounded-lg">
                        Your response: {r.sellerResponse}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRespondingReq(r);
                        setRespStatus('viewing_arranged');
                        setRespMessage(r.sellerResponse || '');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF]"
                    >
                      Reply / Update
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const convRes = await api.getConversations();
                        const match = convRes.conversations.find(
                          (c) => c.propertyId === r.propertyId && c.buyerId === r.buyerId
                        );
                        if (match) onOpenChat(match.conversationId);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Chat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SELLER PROFILE & PRIVACY TAB */}
      {activeTab === 'profile' && (
        <section className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display font-bold text-xl text-slate-900">
                Seller Profile & Privacy Controls
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Verification status: {currentUser.verificationStatus}
                {currentUser.verifiedAt
                  ? ` (${new Date(currentUser.verifiedAt).toLocaleDateString()})`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
            <Eye className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              Clear note: Platform profile verification confirms account details only and does not automatically prove legal property ownership.
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Listing Capacity Role
              </label>
              <select
                value={sellerRoleLabel}
                onChange={(e) =>
                  setSellerRoleLabel(e.target.value as 'Property Owner' | 'Authorized Agent')
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="Property Owner">Property Owner</option>
                <option value="Authorized Agent">Authorized Agent</option>
              </select>
            </div>

            <label className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-slate-900">Show Phone Number Publicly</p>
                <p className="text-xs text-slate-500">
                  Allow buyers to view {currentUser.phone} on your active listings
                </p>
              </div>
              <input
                type="checkbox"
                checked={showPhonePublicly}
                onChange={(e) => setShowPhonePublicly(e.target.checked)}
                className="accent-[#5B3CF5] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-slate-900">Show Email Publicly</p>
                <p className="text-xs text-slate-500">
                  Keep email private if you prefer in-app enquiries only
                </p>
              </div>
              <input
                type="checkbox"
                checked={showEmailPublicly}
                onChange={(e) => setShowEmailPublicly(e.target.checked)}
                className="accent-[#5B3CF5] w-4 h-4"
              />
            </label>

            {profileSavedMsg && (
              <p className="text-xs text-emerald-700 font-medium">{profileSavedMsg}</p>
            )}

            <button
              type="button"
              onClick={async () => {
                const res = await api.updateProfile({
                  sellerRoleLabel,
                  showPhonePublicly,
                  showEmailPublicly,
                });
                onProfileUpdated(res.user);
                setProfileSavedMsg('Seller privacy settings updated.');
              }}
              className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold hover:bg-[#4F32DF]"
            >
              Save Settings
            </button>
          </div>
        </section>
      )}

      {/* RESPOND TO REQUEST MODAL */}
      {respondingReq && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-slate-900">
                Respond to {respondingReq.buyerName}
              </h3>
              <button
                type="button"
                onClick={() => setRespondingReq(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRespondRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Request Decision
                </label>
                <select
                  value={respStatus}
                  onChange={(e) => setRespStatus(e.target.value as RequestStatus)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="responded">Responded (Reply to buyer)</option>
                  <option value="viewing_arranged">Viewing Arranged (Shares exact address)</option>
                  <option value="accepted">Accepted (Willing to proceed)</option>
                  <option value="declined">Declined</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reply Message
                </label>
                <textarea
                  rows={3}
                  required
                  value={respMessage}
                  onChange={(e) => setRespMessage(e.target.value)}
                  placeholder="Share viewing schedule or details..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              {respStatus === 'declined' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Decline Reason (optional)
                  </label>
                  <input
                    type="text"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g., Property reserved for another family"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                Accepting inside the app indicates willingness to proceed and is not a legal tenancy lease.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRespondingReq(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF]"
                >
                  Send Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
