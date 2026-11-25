import React, { useEffect, useState } from 'react';
import { HelpCircle, LifeBuoy, ShieldAlert, X } from 'lucide-react';
import { api } from '../api/client.ts';
import type { PlatformConfig, SupportTicket, UserProfile } from '../types.ts';

interface HelpSafetyModalProps {
  open: boolean;
  onClose: () => void;
  config: PlatformConfig;
  currentUser: UserProfile | null;
}

export const HelpSafetyModal: React.FC<HelpSafetyModalProps> = ({
  open,
  onClose,
  config,
  currentUser,
}) => {
  const [tab, setTab] = useState<'safety' | 'faq' | 'support' | 'policies'>('safety');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (open && currentUser) {
      api
        .getSupportTickets()
        .then((res) => setTickets(res.tickets))
        .catch(() => {});
    }
  }, [open, currentUser]);

  if (!open) return null;

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg('');
    setErrMsg('');
    try {
      const res = await api.submitSupportTicket({
        userName: currentUser ? currentUser.displayName : guestName,
        userEmail: currentUser ? currentUser.email : guestEmail,
        subject,
        message,
      });
      setTickets((prev) => [res.ticket, ...prev]);
      setSubject('');
      setMessage('');
      setStatusMsg('Support ticket submitted. Our moderation team will review it shortly.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to submit ticket.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LifeBuoy className="w-5 h-5 text-indigo-600" />
            <h2 className="font-display font-bold text-lg text-slate-900">
              Help, Safety & Support
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help modal"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-3 border-b border-slate-100 flex gap-2 overflow-x-auto">
          {[
            { id: 'safety', label: 'Visit & Deposit Safety' },
            { id: 'faq', label: 'FAQ' },
            { id: 'support', label: 'Contact Support' },
            { id: 'policies', label: 'Privacy & Terms' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-[#5B3CF5] text-[#5B3CF5]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-sm text-slate-700">
          {tab === 'safety' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Important Deposit & Viewing Notice</p>
                  <p className="text-xs mt-1 leading-relaxed">{config.safetyNotice}</p>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm leading-relaxed list-disc pl-5">
                <li>
                  Confirm the identity and authority of the landlord or authorized property agent during your visit.
                </li>
                <li>
                  Schedule property visits during daylight hours and bring a trusted family member or friend.
                </li>
                <li>
                  Remember that an accepted in-app rental request expresses mutual willingness to proceed — it is not a signed legal tenancy agreement.
                </li>
                <li>
                  Report suspicious listings, misleading prices, or inappropriate chat behaviour immediately using the Report button.
                </li>
              </ul>
            </div>
          )}

          {tab === 'faq' && (
            <div className="space-y-4">
              {[
                {
                  q: 'Why is the exact street/house number hidden on public listings?',
                  a: 'By default, exact residential addresses stay private. Public pages display the city, society/area, and an approximate neighborhood map pin. Exact details are shared once a viewing is arranged or accepted.',
                },
                {
                  q: 'Does a "Verified Profile" label guarantee legal property ownership?',
                  a: 'No. Profile verification confirms account checks on the platform, not legal title or ownership deed verification. Always inspect ownership documents and CNIC before signing a lease.',
                },
                {
                  q: 'How long does it take for a new seller listing to appear in search?',
                  a: 'Every newly submitted listing enters Admin Moderation ("Under Review") to check photo quality, completeness, and pricing accuracy before becoming active.',
                },
              ].map((item) => (
                <div key={item.q} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70">
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                    {item.q}
                  </p>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'support' && (
            <div className="space-y-5">
              <div className="text-xs text-slate-500 flex flex-wrap gap-4">
                <span>Support Email: {config.supportEmail}</span>
                <span>Phone: {config.supportPhone}</span>
              </div>

              <form onSubmit={handleSubmitTicket} className="space-y-3">
                {!currentUser && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your Name"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                    <input
                      type="email"
                      required
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="Your Email"
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                )}
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject (e.g., Report suspicious listing or account help)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your question or issue..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
                {statusMsg && (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    {statusMsg}
                  </p>
                )}
                {errMsg && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {errMsg}
                  </p>
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF]"
                >
                  Submit Support Ticket
                </button>
              </form>

              {tickets.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-900">Your Support Tickets</p>
                  {tickets.map((t) => (
                    <div key={t.ticketId} className="p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{t.subject}</span>
                        <span className="uppercase font-mono text-[11px] text-indigo-700">
                          {t.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">{t.message}</p>
                      {t.adminReply && (
                        <p className="mt-2 p-2 rounded-lg bg-indigo-50 text-indigo-900">
                          Support Reply: {t.adminReply}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'policies' && (
            <div className="space-y-3 text-xs leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-900 text-sm">Community Rules & Privacy Policy</p>
              <p>
                1. Only list real properties that you own or are legally authorized to market for rent. Duplicate listings, misleading rent figures, or stock photos are removed by moderation.
              </p>
              <p>
                2. Personal contact details, private residential addresses, and account credentials are isolated by role and ownership rules. Users may request account deletion from their Profile settings at any time.
              </p>
              <p>
                3. Rent a House facilitates property discovery, rental enquiries, and viewing coordination. All tenancy contracts, security deposits, and legal compliance remain between tenant and landlord.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
