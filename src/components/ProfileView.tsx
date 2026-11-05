import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  ArrowLeftRight,
  Camera,
  Check,
  Film,
  LogOut,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { translations } from '../i18n';
import { Language, Post, UserProfile } from '../types';
import { compressImageFile } from '../utils/media';
import { formatFollowersCount, VerifiedBadge } from './VerifiedBadge';

interface ProfileViewProps {
  currentUser: UserProfile;
  savedAccounts: UserProfile[];
  myPosts: Post[];
  friendsCount: number;
  lang: Language;
  onToggleLang: () => void;
  onOpenCreatePost: () => void;
  onGuestSignOut: () => void;
  onSwitchAccount: (account: UserProfile) => void;
  onDeleteAccount: () => Promise<void>;
  onUpdateGuestProfile: (updates: Partial<UserProfile>) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  savedAccounts,
  myPosts,
  friendsCount,
  lang,
  onToggleLang,
  onOpenCreatePost,
  onGuestSignOut,
  onSwitchAccount,
  onDeleteAccount,
  onUpdateGuestProfile,
}) => {
  const t = translations[lang];
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImageFile(file, 256, 0.78);
      if (currentUser.isGuest) {
        onUpdateGuestProfile({ photoURL: compressed });
      } else {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          photoURL: compressed,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      if (!currentUser.isGuest) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || saving) return;
    if (currentUser.isGuest) {
      onUpdateGuestProfile({
        displayName: displayName.trim().slice(0, 80),
        bio: bio.trim().slice(0, 200),
      });
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: displayName.trim().slice(0, 80),
        bio: bio.trim().slice(0, 200),
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-8 pb-20">
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 sm:p-8 rounded-3xl bg-zinc-900/50 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Avatar with Change Photo Trigger */}
            <div className="relative shrink-0">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-full object-cover border-2 border-amber-500"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-amber-500 text-zinc-950 font-extrabold text-2xl flex items-center justify-center">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}

              <label
                title={lang === 'ku' ? 'گۆڕینی وێنەی پرۆفایل' : 'Change profile picture'}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-700 text-amber-400 flex items-center justify-center hover:bg-zinc-800 cursor-pointer shadow-md"
              >
                <Camera className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-white">
                  {currentUser.displayName}
                </h1>
                <VerifiedBadge followersCount={currentUser.followersCount} className="w-5 h-5" />
              </div>
              <p className="text-sm text-zinc-400">
                @{currentUser.username}
                {currentUser.age ? ` · تەمەن: ${currentUser.age}` : ''}
              </p>
              {currentUser.bio && (
                <p className="mt-2 text-sm text-zinc-200 max-w-md">{currentUser.bio}</p>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs font-mono-tabular text-zinc-400">
                <span>
                  <strong className="text-white">
                    {formatFollowersCount(currentUser.followersCount)}
                  </strong>{' '}
                  {lang === 'ku' ? 'فۆڵۆوەر' : 'Followers'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="text-white">{friendsCount}</strong> {t.friendsTab}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="text-white">{myPosts.length}</strong> {t.feedTab}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] text-xs font-semibold text-amber-300 flex items-center gap-1.5 hover:bg-white/[0.15] active:scale-[0.98] transition-all cursor-pointer">
              <Camera className="w-3.5 h-3.5" />
              <span>
                {uploadingPhoto
                  ? '...'
                  : lang === 'ku'
                  ? 'گۆڕینی وێنە'
                  : 'Change Photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={uploadingPhoto}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onToggleLang}
              className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] text-xs font-semibold text-zinc-100 hover:bg-white/[0.15] active:scale-[0.98] transition-all cursor-pointer"
            >
              {lang === 'ku' ? 'English' : 'کوردی سۆرانی'}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className={`min-h-[42px] px-4 py-2 rounded-2xl backdrop-blur-xl border text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer ${
                editing
                  ? 'bg-white/22 border-white/35 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)]'
                  : 'bg-white/[0.08] border-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] hover:bg-white/[0.15]'
              }`}
            >
              {t.editProfile}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSettings(true);
                setConfirmDelete(false);
              }}
              className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] text-xs font-semibold text-zinc-100 flex items-center gap-1.5 hover:bg-white/[0.15] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4 text-amber-300" />
              <span>{lang === 'ku' ? 'ڕێکخستنەکان' : 'Settings'}</span>
            </button>
          </div>
        </div>

        {/* Edit Profile Form (iOS 26 Liquid Glass) */}
        {editing && (
          <form
            onSubmit={handleSave}
            className="p-6 rounded-3xl bg-zinc-900/65 backdrop-blur-2xl saturate-180 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_20px_50px_rgba(0,0,0,0.65)] space-y-4 max-w-lg"
          >
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                ناوی دیار
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                required
                className="w-full min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.05] border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400/70"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                {t.bioLabel}
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                className="w-full px-4 py-2.5 rounded-2xl bg-white/[0.05] border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400/70 resize-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 text-xs font-bold flex items-center gap-1.5 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_8px_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{t.save}</span>
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/[0.08] border border-white/15 text-zinc-200 text-xs font-semibold hover:bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-all cursor-pointer"
              >
                پاشگەزبوونەوە
              </button>
            </div>
          </form>
        )}

        {/* My Reels Grid */}
        <section className="space-y-4 pb-12">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">{t.myPosts}</h2>
            <button
              type="button"
              onClick={onOpenCreatePost}
              className="min-h-[42px] px-4 py-2 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 text-xs font-bold flex items-center gap-1.5 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_8px_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.createPost}</span>
            </button>
          </div>

          {myPosts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-center">
              <Film className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">
                {lang === 'ku' ? 'هێشتا هیچ پۆستێکت نییە.' : 'You have not published any reels yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {myPosts.map((post) => (
                <div
                  key={post.id}
                  className="aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 relative group"
                >
                  {post.mediaType === 'video' ? (
                    <video
                      src={post.mediaUrl}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={post.mediaUrl}
                      alt={post.caption || 'Reel'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 to-transparent text-white">
                    <p className="text-xs line-clamp-2">{post.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Settings Modal (iOS 26 Liquid Glass: Switch Account, Logout, Delete Account) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-zinc-900/75 backdrop-blur-2xl saturate-180 border border-white/20 rounded-t-[32px] sm:rounded-[28px] max-h-[85vh] flex flex-col overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.28),0_24px_60px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-300" />
                <h2 className="font-display text-base font-bold text-white">
                  {lang === 'ku' ? 'ڕێکخستنەکانی هەژمار' : 'Account Settings'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 border border-white/15 text-zinc-300 hover:text-white hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* 1. Switch Account */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-amber-300" />
                    <span>{lang === 'ku' ? '١. گۆڕینی هەژمار' : '1. Switch Account'}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(false);
                      if (currentUser.isGuest) {
                        onGuestSignOut();
                      } else {
                        signOut(auth);
                      }
                    }}
                    className="px-2.5 py-1 rounded-full bg-white/[0.08] border border-white/15 text-xs font-semibold text-amber-300 hover:bg-white/[0.15] flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{lang === 'ku' ? 'هەژمارێکی تر' : 'Add account'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {savedAccounts.map((acc) => {
                    const isCurrent = acc.uid === currentUser.uid;
                    return (
                      <button
                        key={acc.uid}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          setShowSettings(false);
                          onSwitchAccount(acc);
                        }}
                        className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all text-start ${
                          isCurrent
                            ? 'bg-amber-400/15 border-amber-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] cursor-default'
                            : 'bg-white/[0.05] border-white/12 hover:bg-white/[0.1] cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {acc.photoURL ? (
                            <img
                              src={acc.photoURL}
                              alt={acc.displayName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-amber-500 text-zinc-950 font-bold text-xs flex items-center justify-center shrink-0">
                              {acc.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {acc.displayName}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">@{acc.username}</p>
                          </div>
                        </div>

                        {isCurrent ? (
                          <span className="text-[11px] font-bold text-amber-300 shrink-0">
                            {lang === 'ku' ? 'چالاکە' : 'Active'}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-zinc-300 shrink-0">
                            {lang === 'ku' ? 'گۆڕین' : 'Switch'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Logout */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {lang === 'ku' ? '٢. دەرچوون لە هەژمار' : '2. Logout'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    if (currentUser.isGuest) {
                      onGuestSignOut();
                    } else {
                      signOut(auth);
                    }
                  }}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-white/[0.08] border border-white/15 hover:bg-white/[0.15] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-amber-300" />
                  <span>{t.signOut}</span>
                </button>
              </div>

              {/* 3. Delete Account */}
              <div className="pt-3 border-t border-zinc-800 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-400">
                  {lang === 'ku' ? '٣. سڕینەوەی هەژمار' : '3. Delete Account'}
                </h3>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-300 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{lang === 'ku' ? 'سڕینەوەی هەژمار' : 'Delete Account'}</span>
                  </button>
                ) : (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 space-y-3">
                    <p className="text-xs text-red-200 leading-relaxed">
                      {lang === 'ku'
                        ? 'دڵنیایت دەتەوێت هەژمارەکەت بە یەکجاری بسڕیتەوە؟'
                        : 'Are you sure you want to permanently delete your account?'}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={deletingAccount}
                        onClick={async () => {
                          setDeletingAccount(true);
                          await onDeleteAccount();
                          setDeletingAccount(false);
                          setShowSettings(false);
                        }}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer"
                      >
                        {deletingAccount
                          ? '...'
                          : lang === 'ku'
                          ? 'بەڵێ، بیسڕەوە'
                          : 'Yes, Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="min-h-[40px] px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700 cursor-pointer"
                      >
                        {lang === 'ku' ? 'پاشگەزبوونەوە' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
