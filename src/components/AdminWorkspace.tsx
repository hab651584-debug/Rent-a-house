import React, { useEffect, useState } from 'react';
import {
  Activity,
  Building,
  CheckCircle,
  ClipboardList,
  Clock,
  Download,
  FileWarning,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type {
  AdminAuditLog,
  AdminMetrics,
  ModerationReport,
  PlatformConfig,
  PropertyListing,
  RentalRequest,
  SupportTicket,
  UserProfile,
} from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';

type AdminSection =
  | 'dashboard'
  | 'properties'
  | 'users'
  | 'requests'
  | 'reports'
  | 'settings'
  | 'audit';

interface AdminWorkspaceProps {
  currentUser: UserProfile;
  config: PlatformConfig;
  onConfigUpdated: (config: PlatformConfig) => void;
  onSignOut: () => void;
}

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  currentUser,
  config,
  onConfigUpdated,
  onSignOut,
}) => {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [propFilter, setPropFilter] = useState<string>('all');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [chartMetric, setChartMetric] = useState<'listings' | 'requests' | 'users'>('requests');

  // Moderation modal
  const [rejectTarget, setRejectTarget] = useState<PropertyListing | null>(null);
  const [rejectAction, setRejectAction] = useState<'reject' | 'unpublish'>('reject');
  const [rejectReason, setRejectReason] = useState('');

  // Report resolution
  const [resolvingReport, setResolvingReport] = useState<ModerationReport | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [reportStatus, setReportStatus] = useState<'action_taken' | 'dismissed'>('action_taken');

  // Config editor
  const [catInput, setCatInput] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [newCityAreas, setNewCityAreas] = useState('');
  const [maxPhotos, setMaxPhotos] = useState(String(config.maxPhotosPerListing));
  const [supportEmail, setSupportEmail] = useState(config.supportEmail);
  const [configMsg, setConfigMsg] = useState('');
  const [downloadingBundle, setDownloadingBundle] = useState(false);
  const [downloadingDb, setDownloadingDb] = useState(false);

  const loadAll = async () => {
    try {
      const [mRes, pRes, uRes, rRes, repRes, tRes, aRes] = await Promise.all([
        api.adminGetMetrics(),
        api.adminGetProperties(propFilter),
        api.adminGetUsers(),
        api.getRequests(),
        api.adminGetReports(),
        api.getSupportTickets(),
        api.adminGetAuditLogs(),
      ]);
      setMetrics(mRes.metrics);
      setProperties(pRes.properties);
      setUsers(uRes.users);
      setRequests(rRes.requests);
      setReports(repRes.reports);
      setTickets(tRes.tickets);
      setAuditLogs(aRes.logs);
    } catch {
      // handled per section
    }
  };

  useEffect(() => {
    loadAll();
  }, [propFilter]);

  const handleModerate = async (
    prop: PropertyListing,
    action: 'approve' | 'toggle_featured'
  ) => {
    await api.adminModerateProperty(prop.propertyId, action);
    await loadAll();
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    await api.adminModerateProperty(rejectTarget.propertyId, rejectAction, rejectReason);
    setRejectTarget(null);
    setRejectReason('');
    await loadAll();
  };

  const handleUserStatus = async (
    u: UserProfile,
    accountStatus: 'active' | 'restricted' | 'suspended'
  ) => {
    await api.adminUpdateUserStatus(u.uid, {
      accountStatus,
      reason: `Admin set status to ${accountStatus}`,
    });
    await loadAll();
  };

  const handleToggleVerification = async (u: UserProfile) => {
    const next = u.verificationStatus === 'verified' ? 'unverified' : 'verified';
    await api.adminUpdateUserStatus(u.uid, {
      verificationStatus: next,
      reason: `Admin set profile verification to ${next}`,
    });
    await loadAll();
  };

  const handleResolveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingReport) return;
    await api.adminResolveReport(resolvingReport.reportId, reportStatus, reportNote);
    setResolvingReport(null);
    setReportNote('');
    await loadAll();
  };

  const navItems: { id: AdminSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'properties',
      label: 'Properties',
      icon: <Home className="w-4 h-4" />,
      badge: metrics?.propertyStatusBreakdown.under_review || 0,
    },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'requests', label: 'Requests', icon: <ClipboardList className="w-4 h-4" /> },
    {
      id: 'reports',
      label: 'Reports',
      icon: <FileWarning className="w-4 h-4" />,
      badge: (metrics?.openReports || 0) + (metrics?.unresolvedTickets || 0),
    },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Log', icon: <Shield className="w-4 h-4" /> },
  ];

  // Build SVG polyline points for Growth Overview
  const growthSeries = metrics?.monthlyGrowth || [];
  const maxVal = Math.max(10, ...growthSeries.map((g) => g[chartMetric]));
  const svgPoints = growthSeries
    .map((g, idx) => {
      const x = 30 + (idx * 500) / Math.max(1, growthSeries.length - 1);
      const y = 160 - (g[chartMetric] / maxVal) * 125;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row">
      {/* Dark Indigo Sidebar matching Screenshot #10 */}
      <aside className="lg:w-64 bg-[#19163A] text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <BrandLogo variant="dark" />
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                section === item.id
                  ? 'bg-[#5B3CF5] text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                {item.icon}
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-white/10 hidden lg:block">
          <div className="text-xs text-slate-300 mb-3">
            <p className="font-semibold text-white truncate">{currentUser.displayName}</p>
            <p className="text-slate-400 truncate">{currentUser.email}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-5 sm:p-7 space-y-6 overflow-x-hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900 capitalize">
              {section === 'dashboard' ? 'Admin Dashboard' : section}
            </h1>
            <p className="text-xs text-slate-500">
              Platform moderation, user governance, and marketplace metrics
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="lg:hidden px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            Logout
          </button>
        </div>

        {/* DASHBOARD SECTION */}
        {section === 'dashboard' && metrics && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-[#5B3CF5] flex items-center justify-center mb-3">
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500">Total Users</p>
                <p className="font-display font-bold text-2xl text-slate-900 tabular-nums mt-0.5">
                  {metrics.totalUsers}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {metrics.roleBreakdown.buyer} buyers · {metrics.roleBreakdown.seller} sellers
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  <Building className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500">Total Properties</p>
                <p className="font-display font-bold text-2xl text-slate-900 tabular-nums mt-0.5">
                  {metrics.totalProperties}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {metrics.totalRequests} rental enquiries
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                  <Clock className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500">Pending Review</p>
                <p className="font-display font-bold text-2xl text-slate-900 tabular-nums mt-0.5">
                  {metrics.propertyStatusBreakdown.under_review}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {metrics.openReports} open reports
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500">Approved / Active</p>
                <p className="font-display font-bold text-2xl text-slate-900 tabular-nums mt-0.5">
                  {metrics.propertyStatusBreakdown.active + metrics.propertyStatusBreakdown.approved}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {metrics.propertyStatusBreakdown.rented} rented · {metrics.propertyStatusBreakdown.paused} paused
                </p>
              </div>
            </div>

            {/* Growth Overview Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display font-bold text-lg text-slate-900">
                    Growth Overview
                  </h2>
                  <p className="text-xs text-slate-500">
                    Monthly marketplace activity trend
                  </p>
                </div>
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                  {(['requests', 'listings', 'users'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setChartMetric(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                        chartMetric === m
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg viewBox="0 0 560 195" className="w-full h-52">
                  {[40, 80, 120, 160].map((y) => (
                    <line
                      key={y}
                      x1="20"
                      y1={y}
                      x2="540"
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray="4 4"
                    />
                  ))}
                  {svgPoints && (
                    <polyline
                      fill="none"
                      stroke="#5B3CF5"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={svgPoints}
                    />
                  )}
                  {growthSeries.map((g, idx) => {
                    const x = 30 + (idx * 500) / Math.max(1, growthSeries.length - 1);
                    const y = 160 - (g[chartMetric] / maxVal) * 125;
                    return (
                      <g key={g.month}>
                        <circle cx={x} cy={y} r="5" fill="#5B3CF5" stroke="#FFFFFF" strokeWidth="2" />
                        <text
                          x={x}
                          y={y - 10}
                          textAnchor="middle"
                          className="fill-slate-600 text-[10px] font-mono"
                        >
                          {g[chartMetric]}
                        </text>
                        <text
                          x={x}
                          y="185"
                          textAnchor="middle"
                          className="fill-slate-500 text-[11px]"
                        >
                          {g.month}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Recent Activities */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#5B3CF5]" />
                Recent Activities
              </h2>
              <div className="divide-y divide-slate-100">
                {metrics.recentActivities.map((act) => (
                  <div key={act.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{act.title}</p>
                      <p className="text-xs text-slate-500">{act.subtitle}</p>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap font-mono">
                      {new Date(act.at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* PROPERTIES MODERATION SECTION */}
        {section === 'properties' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {['all', 'under_review', 'active', 'rejected', 'paused', 'rented'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setPropFilter(st)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize ${
                    propFilter === st
                      ? 'bg-[#5B3CF5] text-white'
                      : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {properties.map((prop) => (
                <div
                  key={prop.propertyId}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row justify-between gap-4"
                >
                  <div className="flex gap-4">
                    <img
                      src={prop.imageURLs[0]}
                      alt={prop.title}
                      referrerPolicy="no-referrer"
                      className="w-28 h-24 rounded-xl object-cover shrink-0"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-bold text-base text-slate-900">
                          {prop.title}
                        </h3>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-md capitalize ${
                            prop.status === 'active'
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
                        {prop.featured && (
                          <span className="text-xs font-semibold text-indigo-700 inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">
                        Seller: {prop.sellerName} · {prop.category} · {prop.society || prop.area},{' '}
                        {prop.city}
                      </p>
                      <p className="text-sm font-bold text-[#5B3CF5] tabular-nums">
                        PKR {prop.rent.toLocaleString()}/month
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-2">{prop.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                    {prop.status !== 'active' && (
                      <button
                        type="button"
                        onClick={() => handleModerate(prop, 'approve')}
                        className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRejectTarget(prop);
                        setRejectAction(prop.status === 'active' ? 'unpublish' : 'reject');
                        setRejectReason('');
                      }}
                      className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {prop.status === 'active' ? 'Unpublish' : 'Reject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModerate(prop, 'toggle_featured')}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-semibold ${
                        prop.featured
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {prop.featured ? 'Unfeature' : 'Feature'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USERS MANAGEMENT SECTION */}
        {section === 'users' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">City</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{u.displayName}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-700">{u.role}</td>
                    <td className="py-3 px-4 text-slate-600">{u.preferredCity}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold capitalize ${
                          u.accountStatus === 'active'
                            ? 'text-emerald-700'
                            : u.accountStatus === 'suspended'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {u.accountStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleVerification(u)}
                        className="text-xs font-semibold text-indigo-600 hover:underline capitalize"
                      >
                        {u.verificationStatus}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {u.uid !== currentUser.uid && (
                        <>
                          {u.accountStatus !== 'active' && (
                            <button
                              type="button"
                              onClick={() => handleUserStatus(u, 'active')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold"
                            >
                              Activate
                            </button>
                          )}
                          {u.accountStatus !== 'restricted' && (
                            <button
                              type="button"
                              onClick={() => handleUserStatus(u, 'restricted')}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold"
                            >
                              Restrict
                            </button>
                          )}
                          {u.accountStatus !== 'suspended' && (
                            <button
                              type="button"
                              onClick={() => handleUserStatus(u, 'suspended')}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold"
                            >
                              Suspend
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* REQUESTS OVERSIGHT */}
        {section === 'requests' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4">Property</th>
                  <th className="py-3 px-4">Buyer</th>
                  <th className="py-3 px-4">Seller</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Rent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.requestId}>
                    <td className="py-3 px-4 font-medium text-slate-900">{r.propertyTitle}</td>
                    <td className="py-3 px-4 text-slate-600">{r.buyerName}</td>
                    <td className="py-3 px-4 text-slate-600">{r.sellerName}</td>
                    <td className="py-3 px-4 capitalize text-xs font-semibold text-indigo-700">
                      {r.status.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      PKR {r.propertyRent.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* REPORTS & SUPPORT TICKETS */}
        {section === 'reports' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-display font-bold text-lg text-slate-900">
                Moderation Reports ({reports.length})
              </h2>
              {reports.map((rep) => (
                <div key={rep.reportId} className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-900">{rep.targetLabel}</span>
                    <span className="text-xs font-semibold uppercase text-amber-700">
                      {rep.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Reason: <strong>{rep.reason}</strong> · Reported by {rep.reporterName}
                  </p>
                  <p className="text-xs text-slate-500">{rep.details}</p>
                  {rep.moderationNote && (
                    <p className="text-xs text-emerald-800 bg-emerald-50 p-2 rounded-lg">
                      Resolution: {rep.moderationNote}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setResolvingReport(rep);
                      setReportNote(rep.moderationNote || '');
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#5B3CF5] text-white text-xs font-semibold"
                  >
                    Investigate / Resolve
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-display font-bold text-lg text-slate-900">
                Support Tickets ({tickets.length})
              </h2>
              {tickets.map((t) => (
                <div key={t.ticketId} className="p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900">{t.subject}</span>
                    <span className="text-xs font-mono uppercase text-indigo-700">
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    From: {t.userName} ({t.userEmail})
                  </p>
                  <p className="text-xs text-slate-700">{t.message}</p>
                  {t.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.adminUpdateSupportTicket(
                          t.ticketId,
                          'resolved',
                          'Reviewed by Rent a House Support Team. Thank you for reaching out.'
                        );
                        await loadAll();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONFIGURATION SETTINGS */}
        {section === 'settings' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 max-w-3xl">
            <h2 className="font-display font-bold text-lg text-slate-900">
              Platform Categories, Cities & Limits
            </h2>

            {/* Categories */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Property Categories</p>
              <div className="flex flex-wrap gap-2">
                {config.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-800"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={async () => {
                        const next = config.categories.filter((c) => c !== cat);
                        if (next.length > 0) {
                          const res = await api.adminUpdateConfig({ categories: next });
                          onConfigUpdated(res.config);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={catInput}
                  onChange={(e) => setCatInput(e.target.value)}
                  placeholder="Add category (e.g., Penthouse)"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!catInput.trim()) return;
                    const res = await api.adminUpdateConfig({
                      categories: [...config.categories, catInput.trim()],
                    });
                    onConfigUpdated(res.config);
                    setCatInput('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold"
                >
                  Add Category
                </button>
              </div>
            </div>

            {/* Cities */}
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700">Configured Cities & Areas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {config.cities.map((c) => (
                  <div key={c.name} className="p-3 rounded-xl border border-slate-200">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    <p className="text-slate-500 mt-0.5">{c.areas.join(', ')}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <input
                  type="text"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="New City (e.g., Peshawar)"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <input
                  type="text"
                  value={newCityAreas}
                  onChange={(e) => setNewCityAreas(e.target.value)}
                  placeholder="Areas comma-separated (Hayatabad, University Town)"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm sm:col-span-2"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!newCityName.trim()) return;
                  const areas = newCityAreas
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const res = await api.adminUpdateConfig({
                    cities: [
                      ...config.cities,
                      {
                        name: newCityName.trim(),
                        lat: 34.0151,
                        lng: 71.5249,
                        areas: areas.length > 0 ? areas : ['City Center'],
                      },
                    ],
                  });
                  onConfigUpdated(res.config);
                  setNewCityName('');
                  setNewCityAreas('');
                }}
                className="px-4 py-2 rounded-xl border border-indigo-200 text-[#5B3CF5] text-xs font-semibold hover:bg-indigo-50"
              >
                Add City & Areas
              </button>
            </div>

            {/* Limits & Support */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Photos Per Listing (5–20)
                </label>
                <input
                  type="number"
                  min={5}
                  max={20}
                  value={maxPhotos}
                  onChange={(e) => setMaxPhotos(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Support Email
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
            </div>
            {configMsg && <p className="text-xs text-emerald-700">{configMsg}</p>}
            <button
              type="button"
              onClick={async () => {
                const res = await api.adminUpdateConfig({
                  maxPhotosPerListing: Number(maxPhotos),
                  supportEmail,
                });
                onConfigUpdated(res.config);
                setConfigMsg('Configuration updated.');
              }}
              className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold"
            >
              Save Platform Settings
            </button>

            {/* Export Single-File Project Archive & Database Backup */}
            <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-sm text-slate-900">
                  Export Complete App & Database Backup
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Download the clean source package (.zip) or a live SQLite snapshot (.db). Server environment secrets remain excluded for safety.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={downloadingBundle || downloadingDb}
                  onClick={async () => {
                    setDownloadingBundle(true);
                    setConfigMsg('');
                    try {
                      const blob = await api.adminDownloadBundle();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'rent-a-house-app.zip';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      setConfigMsg('Downloaded rent-a-house-app.zip.');
                    } catch (err) {
                      setConfigMsg(
                        err instanceof Error ? err.message : 'Unable to download app package.'
                      );
                    } finally {
                      setDownloadingBundle(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-xs font-semibold min-h-[44px]"
                >
                  <Download className="w-4 h-4 text-[#5B3CF5]" />
                  {downloadingBundle ? 'Preparing ZIP...' : 'Download Full App (.zip)'}
                </button>
                <button
                  type="button"
                  disabled={downloadingBundle || downloadingDb}
                  onClick={async () => {
                    setDownloadingDb(true);
                    setConfigMsg('');
                    try {
                      const blob = await api.adminDownloadDatabase();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'rent_a_house.db';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      setConfigMsg('Downloaded SQLite backup (rent_a_house.db).');
                    } catch (err) {
                      setConfigMsg(
                        err instanceof Error ? err.message : 'Unable to export database backup.'
                      );
                    } finally {
                      setDownloadingDb(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-xs font-semibold min-h-[44px]"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  {downloadingDb ? 'Exporting DB...' : 'Download Database (.db)'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AUDIT LOG SECTION */}
        {section === 'audit' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Admin</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.logId}>
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{log.adminName}</td>
                    <td className="py-3 px-4 font-mono text-indigo-700">{log.action}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {log.targetType}: {log.targetId}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Reject / Unpublish Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="font-display font-bold text-lg text-slate-900">
              {rejectAction === 'reject' ? 'Reject / Request Edits' : 'Unpublish Listing'}
            </h3>
            <p className="text-xs text-slate-500">{rejectTarget.title}</p>
            <form onSubmit={handleConfirmReject} className="space-y-3">
              <textarea
                required
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="State the reason clearly for the seller..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Report Modal */}
      {resolvingReport && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="font-display font-bold text-lg text-slate-900">Resolve Report</h3>
            <form onSubmit={handleResolveReport} className="space-y-3">
              <select
                value={reportStatus}
                onChange={(e) =>
                  setReportStatus(e.target.value as 'action_taken' | 'dismissed')
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="action_taken">Action Taken</option>
                <option value="dismissed">Dismiss Report</option>
              </select>
              <textarea
                required
                rows={3}
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                placeholder="Document moderation decision..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolvingReport(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold"
                >
                  Save Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
