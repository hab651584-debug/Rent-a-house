import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CheckCheck,
  Flag,
  ImagePlus,
  MessageSquare,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api/client.ts';
import type { ChatMessage, Conversation, UserProfile } from '../types.ts';

interface ChatWorkspaceProps {
  currentUser: UserProfile | null;
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onConversationsRefresh: () => void;
  onRequireAuth: () => void;
}

async function compressChatImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files (PNG, JPG, WebP) are permitted.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to process image.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  currentUser,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onConversationsRefresh,
  onRequireAuth,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reportNote, setReportNote] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser || !selectedConversationId) {
      setMessages([]);
      setActiveConv(null);
      return;
    }

    let cancelled = false;
    const load = () => {
      api
        .getMessages(selectedConversationId)
        .then((res) => {
          if (!cancelled) {
            setActiveConv(res.conversation);
            setMessages(res.messages);
          }
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 3500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentUser, selectedConversationId, conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!currentUser) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
          <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h1 className="font-display font-bold text-xl text-slate-900">
            Sign in to view Messages
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Chat directly with property owners or prospective tenants in real time.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="mt-4 px-6 py-2.5 rounded-xl bg-[#5B3CF5] text-white text-sm font-semibold"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversationId || (!text.trim() && !attachment)) return;
    setSending(true);
    setError('');
    try {
      const res = await api.sendMessage(selectedConversationId, {
        text: text.trim(),
        attachmentURL: attachment,
      });
      setMessages((prev) => [...prev, res.message]);
      setText('');
      setAttachment(undefined);
      onConversationsRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleBlock = async () => {
    if (!selectedConversationId) return;
    try {
      const res = await api.toggleBlockConversation(selectedConversationId);
      setActiveConv(res.conversation);
      onConversationsRefresh();
    } catch {
      // ignore
    }
  };

  const handleReportChat = async () => {
    if (!activeConv) return;
    const otherName =
      activeConv.buyerId === currentUser.uid ? activeConv.sellerName : activeConv.buyerName;
    try {
      await api.submitReport({
        targetType: 'message',
        targetId: activeConv.conversationId,
        targetLabel: `Chat with ${otherName} (${activeConv.propertyTitle})`,
        reason: 'Inappropriate behaviour or suspicious demand',
        details: 'Reported directly from conversation thread.',
      });
      setReportNote('Conversation reported to moderators.');
      setTimeout(() => setReportNote(''), 3000);
    } catch {
      // ignore
    }
  };

  const isBlocked = Boolean(activeConv && activeConv.blockedBy.length > 0);
  const blockedByMe = Boolean(activeConv && activeConv.blockedBy.includes(currentUser.uid));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10">
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[calc(100vh-170px)] min-h-[520px]">
        {/* Conversation List */}
        <aside
          className={`md:col-span-4 border-r border-slate-200 flex flex-col ${
            selectedConversationId ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b border-slate-200">
            <h1 className="font-display font-bold text-lg text-slate-900">Messages</h1>
            <p className="text-xs text-slate-500">Property enquiries & direct threads</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No conversations yet. Open any property listing and tap Contact or Send Rental Request.
              </div>
            ) : (
              conversations.map((c) => {
                const otherName =
                  c.buyerId === currentUser.uid ? c.sellerName : c.buyerName;
                const unread =
                  c.buyerId === currentUser.uid ? c.unreadByBuyer : c.unreadBySeller;
                const isSelected = c.conversationId === selectedConversationId;
                return (
                  <button
                    key={c.conversationId}
                    type="button"
                    onClick={() => onSelectConversation(c.conversationId)}
                    className={`w-full p-4 text-left flex items-start gap-3 hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-indigo-50/70' : ''
                    }`}
                  >
                    <div className="w-11 h-11 rounded-full bg-indigo-100 text-[#5B3CF5] font-bold flex items-center justify-center shrink-0">
                      {otherName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {otherName}
                        </p>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(c.lastMessageAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-indigo-600 truncate">
                        {c.propertyTitle}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-slate-500 truncate">{c.lastMessage}</p>
                        {unread > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#5B3CF5] text-white text-[10px] font-bold tabular-nums">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Active Chat Thread (Matches Screenshot #11) */}
        <section
          className={`md:col-span-8 flex flex-col bg-slate-50/70 ${
            selectedConversationId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">
                Select a conversation to start messaging
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectConversation(null)}
                    className="md:hidden p-1.5 text-slate-600"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-[#5B3CF5] font-bold flex items-center justify-center shrink-0">
                    {(activeConv.buyerId === currentUser.uid
                      ? activeConv.sellerName
                      : activeConv.buyerName
                    )
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm text-slate-900 truncate">
                      {activeConv.buyerId === currentUser.uid
                        ? activeConv.sellerName
                        : activeConv.buyerName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {activeConv.propertyTitle} · PKR {activeConv.propertyRent.toLocaleString()}/mo
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleBlock}
                    title={blockedByMe ? 'Unblock user' : 'Block conversation'}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 border ${
                      blockedByMe
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{blockedByMe ? 'Unblock' : 'Block'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReportChat}
                    title="Report inappropriate behaviour"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Report</span>
                  </button>
                </div>
              </div>

              {reportNote && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900">
                  {reportNote}
                </div>
              )}

              {/* Safety Reminder */}
              <div className="px-4 py-2 bg-indigo-50/80 border-b border-indigo-100 text-[11px] text-indigo-900 flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  Never send advance deposits online before visiting the property and signing a written agreement.
                </span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const isMine = m.senderId === currentUser.uid;
                  return (
                    <div
                      key={m.messageId}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[78%] sm:max-w-[68%] rounded-2xl px-4 py-2.5 text-sm shadow-xs ${
                          isMine
                            ? 'bg-[#5B3CF5] text-white rounded-br-sm'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
                        }`}
                      >
                        {m.attachmentURL && (
                          <img
                            src={m.attachmentURL}
                            alt="Shared attachment"
                            className="rounded-xl mb-2 max-h-48 object-cover"
                          />
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                            isMine ? 'text-indigo-200' : 'text-slate-400'
                          }`}
                        >
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isMine && m.readAt && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              {error && (
                <div className="px-4 py-2 bg-rose-50 text-rose-700 text-xs">{error}</div>
              )}

              {attachment && (
                <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-3">
                  <img
                    src={attachment}
                    alt="Attachment preview"
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <span className="text-xs text-slate-600 flex-1">Image ready to send</span>
                  <button
                    type="button"
                    onClick={() => setAttachment(undefined)}
                    className="text-xs text-rose-600 font-semibold"
                  >
                    Remove
                  </button>
                </div>
              )}

              <form
                onSubmit={handleSend}
                className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const compressed = await compressChatImage(file);
                      setAttachment(compressed);
                      setError('');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Invalid image.');
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={isBlocked}
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach photo"
                  className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  disabled={isBlocked}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={isBlocked ? 'Conversation is blocked' : 'Type a message...'}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || isBlocked || (!text.trim() && !attachment)}
                  aria-label="Send message"
                  className="w-11 h-11 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] disabled:opacity-50 text-white flex items-center justify-center shrink-0 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
