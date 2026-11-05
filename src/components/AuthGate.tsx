import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { RefreshCw, User } from 'lucide-react';
import reelMountainDrive from '../assets/images/reel_mountain_drive_1793883221081.jpg';
import { auth, googleProvider } from '../firebase';
import { translations } from '../i18n';
import { Language, UserProfile } from '../types';

interface AuthGateProps {
  lang: Language;
  takenUsernames: string[];
  savedAccounts: UserProfile[];
  onToggleLang: () => void;
  onGuestLogin: (guest: UserProfile) => void;
  onSelectSavedAccount: (account: UserProfile) => void;
}

const USED_GUEST_NAMES_KEY = 'kurdtick_used_usernames';

function getUsedLocalUsernames(): string[] {
  try {
    const raw = localStorage.getItem(USED_GUEST_NAMES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveUsedLocalUsername(username: string) {
  try {
    const current = getUsedLocalUsernames();
    if (!current.includes(username)) {
      localStorage.setItem(USED_GUEST_NAMES_KEY, JSON.stringify([...current, username]));
    }
  } catch {
    // Ignore storage error
  }
}

export const AuthGate: React.FC<AuthGateProps> = ({
  lang,
  takenUsernames,
  savedAccounts,
  onToggleLang,
  onGuestLogin,
  onSelectSavedAccount,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestUsername, setGuestUsername] = useState('');
  const [guestAge, setGuestAge] = useState('');
  const t = translations[lang];

  const allTaken = new Set([
    ...takenUsernames.map((u) => u.toLowerCase()),
    ...getUsedLocalUsernames().map((u) => u.toLowerCase()),
  ]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('auth/unauthorized-domain')) {
        setError(
          `ئەم دۆمەینە (${window.location.hostname}) لە Firebase ڕێگەپێدراو نییە. لە Firebase Console -> Authentication -> Settings -> Authorized domains زیادی بکە.`
        );
      } else {
        setError(
          raw || 'ناتوانرێت بە گووگڵ بچیتە ژوورەوە. تکایە دووبارە هەوڵ بدە.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const generateUniqueWithDigits = (baseInput: string) => {
    const cleanBase =
      baseInput
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/\d+$/, '') || 'user';

    let candidate = `${cleanBase}${Math.floor(100 + Math.random() * 900)}`;
    while (allTaken.has(candidate)) {
      candidate = `${cleanBase}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    setGuestUsername(candidate);
    setError(null);
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let cleaned = guestUsername
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');

    if (cleaned.length < 2) {
      setError(
        lang === 'ku'
          ? 'تکایە ناوی بەکارهێنەر بە پیتی ئینگلیزی بنووسە (بۆ نموونە: akoo12).'
          : 'Please enter a username (at least 2 letters, e.g. akoo12).'
      );
      return;
    }

    // Ensure it has numbers attached if user didn't include any
    if (!/\d/.test(cleaned)) {
      let withDigits = `${cleaned}${Math.floor(100 + Math.random() * 900)}`;
      while (allTaken.has(withDigits)) {
        withDigits = `${cleaned}${Math.floor(1000 + Math.random() * 9000)}`;
      }
      cleaned = withDigits;
    } else if (allTaken.has(cleaned)) {
      setError(
        lang === 'ku'
          ? `ناوی @${cleaned} پێشتر لەلایەن کەسێکی ترەوە بەکارهێنراوە! تکایە ژمارەکانی بگۆڕە.`
          : `Username @${cleaned} is already taken! Please choose different numbers.`
      );
      return;
    }

    const parsedAge = Number(guestAge);
    if (!guestAge || Number.isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
      setError(
        lang === 'ku'
          ? 'تکایە تەمەنێکی دروست بنووسە (بۆ نموونە: ٢٠).'
          : 'Please enter a valid age (10 - 120).'
      );
      return;
    }

    saveUsedLocalUsername(cleaned);
    const displayBase = cleaned.replace(/\d+$/, '') || cleaned;

    onGuestLogin({
      uid: `guest_${cleaned}_${Date.now()}`,
      displayName: displayBase,
      username: cleaned,
      age: parsedAge,
      isGuest: true,
      bio: '',
    });
  };

  return (
    <div
      dir={lang === 'ku' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col lg:grid lg:grid-cols-12"
    >
      {/* Left Visual Showcase */}
      <div className="relative lg:col-span-7 min-h-[260px] lg:min-h-screen overflow-hidden bg-zinc-900 flex flex-col justify-between p-6 sm:p-10">
        <img
          src={reelMountainDrive}
          alt="KurdTick"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/45 to-zinc-950/30" />

        <div className="relative z-10 flex items-center justify-between">
          <span className="font-display text-2xl font-extrabold tracking-tight text-white">
            {t.brand}
          </span>
          <button
            type="button"
            onClick={onToggleLang}
            className="lg:hidden min-h-[40px] px-3.5 py-2 text-xs font-semibold text-zinc-100 bg-zinc-900/80 border border-white/15 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {lang === 'ku' ? 'English' : 'کوردی سۆرانی'}
          </button>
        </div>

        <div className="relative z-10 max-w-xl mt-auto pt-12">
          <h1 className="font-display text-3xl sm:text-5xl font-bold text-white leading-tight [text-wrap:balance]">
            {lang === 'ku' ? 'بەخێربێیت بۆ KurdTick' : 'Welcome to KurdTick'}
          </h1>
        </div>
      </div>

      {/* Right Sign-In Panel */}
      <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-12 bg-zinc-950">
        <div className="hidden lg:flex justify-end">
          <button
            type="button"
            onClick={onToggleLang}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {lang === 'ku' ? 'English' : 'کوردی سۆرانی'}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {lang === 'ku' ? 'بەخێربێیت بۆ KurdTick' : 'Welcome to KurdTick'}
          </h2>
          <p className="mt-2.5 text-sm sm:text-base text-zinc-400 leading-relaxed">
            {t.signInTitle}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs sm:text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {/* Google + Guest Buttons */}
          <div className="mt-8 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="sm:col-span-8 min-h-[52px] px-4 py-3.5 rounded-xl bg-white text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2.5 hover:bg-zinc-100 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-sm"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span className="truncate">
                  {loading ? t.signingIn : t.continueWithGoogle}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowGuestForm((v) => !v);
                  setError(null);
                }}
                className={`sm:col-span-4 min-h-[52px] px-4 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                  showGuestForm
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-zinc-900 text-zinc-100 border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span>{lang === 'ku' ? 'میوان' : 'Guest'}</span>
              </button>
            </div>

            {!showGuestForm && (
              <p className="text-center text-xs text-zinc-500">
                {t.googleAccountHint}
              </p>
            )}

            {/* Saved Accounts Quick Login */}
            {savedAccounts.length > 0 && !showGuestForm && (
              <div className="mt-5 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2.5">
                <p className="text-xs font-semibold text-zinc-400">
                  {lang === 'ku' ? 'هەژمارە پاشەکەوتکراوەکان' : 'Saved Accounts'}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedAccounts.map((acc) => (
                    <button
                      key={acc.uid}
                      type="button"
                      onClick={() => onSelectSavedAccount(acc)}
                      className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/90 hover:border-amber-500/50 flex items-center justify-between gap-3 transition-colors cursor-pointer text-start"
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
                      <span className="text-xs font-semibold text-amber-400 shrink-0">
                        {lang === 'ku' ? 'چوونە ژوورەوە' : 'Sign in'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Guest Username (with numbers & uniqueness) + Age Form */}
            {showGuestForm && (
              <form
                onSubmit={handleGuestSubmit}
                className="mt-4 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    {lang === 'ku'
                      ? 'ناوی بەکارهێنەر لەگەڵ ژمارە (دووبارە نەبێت)'
                      : 'Username with numbers (unique)'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={guestUsername}
                      onChange={(e) => setGuestUsername(e.target.value)}
                      placeholder="akoo482"
                      maxLength={30}
                      required
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => generateUniqueWithDigits(guestUsername)}
                      title={lang === 'ku' ? 'ژمارەیەکی تر دابنێ' : 'Generate random numbers'}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-800 text-amber-400 hover:bg-zinc-700 flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{lang === 'ku' ? 'ژمارە' : 'Random'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    {lang === 'ku' ? 'تەمەن' : 'Age'}
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={guestAge}
                    onChange={(e) => setGuestAge(e.target.value)}
                    placeholder="20"
                    required
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  {lang === 'ku' ? 'چوونە ژوورەوە وەک میوان' : 'Enter as Guest'}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="text-xs text-zinc-600 text-center lg:text-left">
          {t.brand} · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
};
