import { useRef } from 'react';
import { motion } from 'motion/react';
import {
  FileText,
  LogIn,
  LogOut,
  MessageSquarePlus,
  Paperclip,
  Trash2,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { AppUser, LanguageCode, StudySession, UploadedPaperContext } from '../types';
import { groupSessionsByDate, isGuestUser } from '../utils/wbbseResearch';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  sessions: StudySession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  user: FirebaseUser | AppUser | null;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  authLoading: boolean;
  attachment: UploadedPaperContext | null;
  onUploadFile: (file: File) => void;
  onRemoveAttachment: () => void;
  isUploading: boolean;
  uploadError: string | null;
  language: LanguageCode;
  onRequireSignIn?: (reason?: string) => void;
}

export function Sidebar({
  isOpen,
  onCloseMobile,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  user,
  onGoogleSignIn,
  onSignOut,
  authLoading,
  attachment,
  onUploadFile,
  onRemoveAttachment,
  isUploading,
  uploadError,
  language,
  onRequireSignIn,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const grouped = groupSessionsByDate(sessions);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
    }
    e.target.value = '';
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 bg-[#141517]/45 backdrop-blur-[1px] z-30 lg:hidden"
        />
      )}

      <aside
        aria-label="Study Sessions & Paper Uploads"
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-[#F3F1EC] border-r border-[#E4E2DC] flex flex-col transition-transform duration-200 ease-out shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        {/* Top Action & Upload Section */}
        <div className="p-4 border-b border-[#E4E2DC] space-y-2.5">
          <div className="flex items-center justify-between lg:hidden mb-1">
            <span className="font-display text-sm font-semibold text-[#141517]">
              {language === 'bn' ? 'অধ্যয়ন মেনু' : 'Study Workspace'}
            </span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="p-1.5 rounded-lg text-[#5A5C60] hover:text-[#141517] hover:bg-[#E7E4DC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            type="button"
            onClick={() => {
              onNewSession();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#141517] hover:bg-[#0F4C5C] text-[#F7F6F2] text-sm font-medium transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">
              {language === 'bn' ? 'নতুন আলোচনা শুরু করো' : 'New Study Session'}
            </span>
          </motion.button>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,application/pdf,text/plain"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload PYQ, Syllabus PDF, or Problem Image"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                if (!user && onRequireSignIn) {
                  onRequireSignIn(
                    language === 'bn'
                      ? 'সিলেবাস, প্রশ্নপত্র PDF বা সমস্যার ছবি আপলোড করতে Google দিয়ে সাইন ইন করো।'
                      : 'Sign in with Google first to upload and analyze a PDF or problem image.'
                  );
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#DCD8CE] bg-white hover:bg-[#FAF9F6] text-[#27292D] text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
            >
              <Paperclip className="w-3.5 h-3.5 shrink-0 text-[#0F4C5C]" />
              <span className="whitespace-nowrap truncate">
                {isUploading
                  ? language === 'bn'
                    ? 'ডকুমেন্ট বিশ্লেষণ হচ্ছে...'
                    : 'Analyzing document...'
                  : language === 'bn'
                    ? 'PDF বা সমস্যার ছবি আপলোড করো'
                    : 'Upload PDF / Problem Image'}
              </span>
            </button>

            {uploadError && (
              <p role="alert" className="text-[11px] text-rose-700 mt-1.5 px-1">
                {uploadError}
              </p>
            )}

            {attachment && (
              <div className="mt-2 p-2.5 rounded-xl bg-white border border-[#0F4C5C]/25 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 font-medium text-[#141517]">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-[#0F4C5C]" />
                    <span className="truncate">{attachment.fileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onRemoveAttachment}
                    aria-label={`Remove ${attachment.fileName}`}
                    className="text-[#5A5C60] hover:text-rose-700 shrink-0 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {attachment.summary && (
                  <p className="text-[11px] text-[#5A5C60] mt-1 line-clamp-3 leading-snug">
                    {attachment.summary}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Past Chat Sessions */}
        <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4">
          {grouped.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-[#6B6E75] leading-relaxed">
              {language === 'bn'
                ? 'তোমার আগের প্রশ্নোত্তর ও ব্ল্যাকবোর্ড পাঠ এখানে সংরক্ষিত থাকবে।'
                : 'Your past PYQ analyses and study chats will appear here.'}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <h3 className="px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] font-semibold text-[#73767D]">
                  {group.label}
                </h3>
                <ul className="space-y-1">
                  {group.sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    return (
                      <li key={session.id} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession(session.id);
                            onCloseMobile();
                          }}
                          className={`flex-1 min-w-0 text-left px-2.5 py-2 rounded-xl transition-colors cursor-pointer border ${
                            isActive
                              ? 'bg-white text-[#141517] border-[#D7D4CB] shadow-[0_2px_10px_-6px_rgba(20,21,23,0.14)]'
                              : 'text-[#3A3D42] hover:bg-[#EAE7DF] border-transparent'
                          }`}
                        >
                          <div className="text-[13px] font-medium truncate">
                            {session.title}
                          </div>
                          <div className="text-[11px] text-[#6B6E75] truncate mt-0.5">
                            {session.subject}
                            <span aria-hidden="true"> · </span>
                            <span className="tabular-nums font-mono">
                              {session.messageCount}{' '}
                              {session.messageCount === 1 ? 'msg' : 'msgs'}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSession(session.id)}
                          aria-label={`Delete session ${session.title}`}
                          className="p-1.5 rounded-lg text-[#73767D] hover:text-rose-700 hover:bg-rose-50 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Auth Footer */}
        <div className="p-3.5 border-t border-[#E4E2DC] bg-[#ECE9E1]/80">
          {user ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#141517] truncate">
                    {isGuestUser(user) ? (
                      <User className="w-3.5 h-3.5 text-[#0F4C5C] shrink-0" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5 text-[#143326] shrink-0" />
                    )}
                    <span className="truncate">
                      {user.displayName || (isGuestUser(user) ? 'Guest Student' : 'Student')}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5A5C60] truncate">
                    {isGuestUser(user)
                      ? language === 'bn'
                        ? 'গেস্ট মোড (শুধুমাত্র এই সেশনের জন্য)'
                        : 'Guest Mode · Current Session Only'
                      : user.email || 'Cloud Firestore Synced'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label={
                    isGuestUser(user)
                      ? language === 'bn'
                        ? 'গেস্ট সেশন শেষ করো'
                        : 'Exit Guest Session'
                      : language === 'bn'
                        ? 'সাইন আউট'
                        : 'Sign out'
                  }
                  title={
                    isGuestUser(user)
                      ? language === 'bn'
                        ? 'গেস্ট সেশন শেষ করো'
                        : 'Exit Guest Session'
                      : language === 'bn'
                        ? 'সাইন আউট'
                        : 'Sign out'
                  }
                  className="p-2 rounded-lg text-[#5A5C60] hover:text-[#141517] hover:bg-[#DFDCD2] transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              {isGuestUser(user) && (
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-[#D7D4CB] hover:bg-[#FAF9F6] text-[#141517] text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <LogIn className="w-3 h-3 text-[#143326]" />
                  <span>
                    {language === 'bn'
                      ? 'ক্লাউড সিঙ্কের জন্য Google দিয়ে সাইন ইন'
                      : 'Sign in with Google for Cloud Sync'}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-[#5A5C60]">
                {language === 'bn'
                  ? 'AI ব্যবহার ও চ্যাট সেভ করতে Google দিয়ে সাইন ইন করো'
                  : 'Sign in with Google to use AI & save your study chats'}
              </div>
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#D7D4CB] hover:bg-[#FAF9F6] text-[#141517] text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in with Google</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
