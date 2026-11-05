import React, { useEffect, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Film,
  Hash,
  Image as ImageIcon,
  Link2,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { translations } from '../i18n';
import { Language, Post, UserProfile } from '../types';
import { compressImageFile, fileToDataUrl, STARTER_REELS } from '../utils/media';

interface CreatePostModalProps {
  currentUser: UserProfile;
  friendsList: UserProfile[];
  lang: Language;
  onClose: () => void;
  onPublished: () => void;
  onGuestPostCreated?: (post: Post) => void;
}

interface SongTrack {
  id: string;
  title: string;
  category: string;
  url: string;
}

const ARABIC_SONGS: SongTrack[] = [
  {
    id: 'ar_1',
    title: 'گۆرانی عەرەبی — قالوا فعل احنا مو شعارات',
    category: 'گۆرانی عەرەبی',
    url: '/assets/audio/arabic_song_1.mp3',
  },
  {
    id: 'ar_2',
    title: 'گۆرانی عەرەبی — ما نقتلك نحطك بالضلوع',
    category: 'گۆرانی عەرەبی',
    url: '/assets/audio/arabic_song_2.mp3',
  },
  {
    id: 'ar_3',
    title: 'گۆرانی عەرەبی — مهدينا العجل سيدي',
    category: 'گۆرانی عەرەبی',
    url: '/assets/audio/arabic_song_3.mp3',
  },
];

const VIDEO_FILTERS = [
  { id: 'none', labelKu: 'ئاسایی', labelEn: 'Normal', css: '' },
  { id: 'warm', labelKu: 'گەرم', labelEn: 'Warm', css: 'sepia-[.25] saturate-125 brightness-105' },
  { id: 'dramatic', labelKu: 'درامی', labelEn: 'Dramatic', css: 'contrast-125 saturate-110 brightness-95' },
  { id: 'bw', labelKu: 'ڕەش و سپی', labelEn: 'B&W', css: 'grayscale contrast-115' },
  { id: 'vivid', labelKu: 'ڕوون', labelEn: 'Vivid', css: 'saturate-150 contrast-105' },
];

const TEXT_COLORS = [
  { id: 'white', value: '#ffffff', label: 'سپی' },
  { id: 'amber', value: '#fbbf24', label: 'زەرد' },
  { id: 'sky', value: '#38bdf8', label: 'شین' },
  { id: 'rose', value: '#fb7185', label: 'سوور' },
  { id: 'emerald', value: '#34d399', label: 'سەوز' },
];

const SUGGESTED_HASHTAGS = ['#کوردستان', '#گەشت', '#مۆسیقا', '#یاری', '#تیکتۆک'];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  currentUser,
  friendsList,
  lang,
  onClose,
  onPublished,
  onGuestPostCreated,
}) => {
  const t = translations[lang];
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [editorTab, setEditorTab] = useState<'text' | 'music' | 'details'>('text');

  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState<string>(STARTER_REELS[0].mediaUrl);

  // Video/Photo Editor State
  const [overlayText, setOverlayText] = useState('');
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [overlayPosition, setOverlayPosition] = useState<'top' | 'center' | 'bottom'>('center');
  const [videoFilter, setVideoFilter] = useState('none');

  // Music Picker & Custom Song Creation
  const [musicSearch, setMusicSearch] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [showCreateSong, setShowCreateSong] = useState(false);
  const [customSongTitle, setCustomSongTitle] = useState('');
  const [customSongs, setCustomSongs] = useState<SongTrack[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Caption, Tags & Visibility
  const [caption, setCaption] = useState('');
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSongs = [...customSongs, ...ARABIC_SONGS];
  const filteredSongs = allSongs.filter((s) =>
    s.title.toLowerCase().includes(musicSearch.trim().toLowerCase())
  );

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
    };
  }, []);

  const handleTogglePreviewTrack = (track: SongTrack) => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (playingTrackId === track.id) {
      audio.pause();
      setPlayingTrackId(null);
    } else {
      audio.src = track.url;
      audio.load();
      audio.play().catch(() => {});
      setPlayingTrackId(track.id);
    }
  };

  const handleSelectTrack = (track: SongTrack) => {
    setMusicTitle(track.title);
    setMusicUrl(track.url);
    const audio = previewAudioRef.current;
    if (audio) {
      audio.src = track.url;
      audio.load();
      audio.play().catch(() => {});
      setPlayingTrackId(track.id);
    }
  };

  const handleCustomSongFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 450 * 1024) {
      setError(
        lang === 'ku'
          ? 'قەبارەی فایلی گۆرانییەکە نابێت لە ٤٥٠ کیلۆبایت زیاتر بێت.'
          : 'Audio file must be under 450 KB.'
      );
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const title =
        customSongTitle.trim() ||
        `گۆرانی عەرەبی — ${file.name.replace(/\.[^/.]+$/, '').slice(0, 40)}`;
      const newTrack: SongTrack = {
        id: `custom_${Date.now()}`,
        title,
        category: 'گۆرانی عەرەبی',
        url: dataUrl,
      };
      setCustomSongs((prev) => [newTrack, ...prev]);
      handleSelectTrack(newTrack);
      setCustomSongTitle('');
      setShowCreateSong(false);
    } catch {
      setError('ناتوانرێت ئەم فایلە بکرێتەوە.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      if (file.type.startsWith('video/')) {
        if (file.size > 450 * 1024) {
          setError(
            lang === 'ku'
              ? 'قەبارەی ڤیدیۆکە زۆر گەورەیە (زۆرترین ٤٥٠ کیلۆبایت). لینکی ڤیدیۆ دابنێ یان وێنە هەڵبژێرە.'
              : 'Video file is too large for direct upload (max 450KB). Paste a video URL or upload a photo.'
          );
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        setMediaType('video');
        setMediaUrl(dataUrl);
        setStep('edit');
      } else if (file.type.startsWith('image/')) {
        const compressed = await compressImageFile(file, 720, 0.78);
        setMediaType('image');
        setMediaUrl(compressed);
        setStep('edit');
      } else {
        setError('تکایە وێنەیەک یان ڤیدیۆیەک هەڵبژێرە.');
      }
    } catch {
      setError('ناتوانرێت ئەم فایلە بکرێتەوە.');
    }
  };

  const handleAddHashtag = (tag: string) => {
    if (caption.includes(tag)) return;
    setCaption((prev) => (prev.trim() ? `${prev.trim()} ${tag}` : tag));
  };

  const handleToggleTagUser = (username: string) => {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return;
    setTaggedUsers((prev) => {
      if (prev.includes(clean)) return prev.filter((u) => u !== clean);
      if (prev.length >= 10) return prev;
      return [...prev, clean];
    });
  };

  const handleAddManualTag = () => {
    const clean = tagInput
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');
    if (clean.length >= 2 && !taggedUsers.includes(clean) && taggedUsers.length < 10) {
      setTaggedUsers((prev) => [...prev, clean]);
    }
    setTagInput('');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl.trim() || submitting) return;
    if (mediaUrl.length > 580000) {
      setError('قەبارەی فایلەکە زۆر گەورەیە. وێنەیەکی بچووکتر یان لینک دابنێ.');
      return;
    }

    previewAudioRef.current?.pause();
    setSubmitting(true);
    setError(null);

    const postPayload = {
      authorId: currentUser.uid,
      authorName: currentUser.displayName,
      authorUsername: currentUser.username,
      authorPhoto: currentUser.photoURL || '',
      caption: caption.trim().slice(0, 500),
      mediaType,
      mediaUrl: mediaUrl.trim(),
      musicTitle:
        musicTitle.trim().slice(0, 120) || `دەنگی ڕەسەن — ${currentUser.displayName}`,
      ...(musicUrl ? { musicUrl } : {}),
      ...(overlayText.trim()
        ? {
            overlayText: overlayText.trim().slice(0, 200),
            overlayColor,
            overlayPosition,
          }
        : {}),
      ...(videoFilter !== 'none' ? { videoFilter } : {}),
      taggedUsers,
      likesCount: 0,
      commentsCount: 0,
      visibility,
    };

    if (currentUser.isGuest) {
      if (onGuestPostCreated) {
        onGuestPostCreated({
          id: `guest_post_${Date.now()}`,
          ...postPayload,
        });
      }
      onPublished();
      onClose();
      setSubmitting(false);
      return;
    }

    try {
      await addDoc(collection(db, 'posts'), {
        ...postPayload,
        createdAt: serverTimestamp(),
      });
      onPublished();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    } finally {
      setSubmitting(false);
    }
  };

  const activeFilterCss = VIDEO_FILTERS.find((f) => f.id === videoFilter)?.css || '';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <audio ref={previewAudioRef} loop className="hidden" />

      <div className="w-full sm:max-w-3xl bg-zinc-900/75 backdrop-blur-2xl saturate-180 border border-white/20 rounded-t-[32px] sm:rounded-[28px] max-h-[94dvh] flex flex-col overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.28),0_24px_60px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {step === 'edit' && (
              <button
                type="button"
                onClick={() => setStep('select')}
                className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 border border-white/15 text-zinc-100 hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
              >
                {lang === 'ku' ? (
                  <ArrowRight className="w-4 h-4" />
                ) : (
                  <ArrowLeft className="w-4 h-4" />
                )}
              </button>
            )}
            <h2 className="font-display text-base sm:text-lg font-bold text-white">
              {step === 'select'
                ? t.newPostTitle
                : lang === 'ku'
                ? 'ئێدیتکردنی ڤیدیۆ و گۆرانی'
                : 'Edit Video & Music'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              previewAudioRef.current?.pause();
              onClose();
            }}
            className="min-h-[36px] min-w-[36px] rounded-full bg-white/10 border border-white/15 text-zinc-300 hover:text-white hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: Select Media */}
        {step === 'select' ? (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
              <div className="sm:col-span-5">
                <div className="aspect-[9/16] w-full max-w-[200px] mx-auto rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 relative">
                  {mediaType === 'video' ? (
                    <video
                      src={mediaUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>

              <div className="sm:col-span-7 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-2">
                    {t.uploadMedia}
                  </label>
                  <label className="min-h-[56px] px-4 py-3.5 rounded-2xl bg-white/[0.05] border border-dashed border-white/25 hover:border-amber-400/70 hover:bg-white/[0.08] text-zinc-100 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span>{t.uploadMedia}</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    {t.orPasteUrl}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Link2 className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={mediaUrl.startsWith('data:') ? '' : mediaUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMediaUrl(val);
                          if (val.match(/\.(mp4|webm|mov)(\?|$)/i)) {
                            setMediaType('video');
                          } else {
                            setMediaType('image');
                          }
                        }}
                        placeholder="https://..."
                        className="w-full min-h-[44px] pl-10 pr-3 py-2 rounded-2xl bg-white/[0.05] border border-white/15 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400/70"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setMediaType((prev) => (prev === 'image' ? 'video' : 'image'))
                      }
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-white/[0.08] border border-white/15 text-xs font-semibold text-zinc-100 flex items-center gap-1.5 hover:bg-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-all cursor-pointer shrink-0"
                    >
                      {mediaType === 'video' ? (
                        <>
                          <Film className="w-3.5 h-3.5 text-amber-400" />
                          <span>ڤیدیۆ</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                          <span>وێنە</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!mediaUrl.trim()}
                  onClick={() => setStep('edit')}
                  className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_25px_-5px_rgba(245,158,11,0.4)]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {lang === 'ku'
                      ? 'ئێدیتکردنی ڤیدیۆ (نووسین و گۆرانی)'
                      : 'Edit Video (Text & Music)'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: Video/Photo Editor + Music + Publish */
          <form onSubmit={handlePublish} className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
              {/* Left 9:16 Live Editor Preview */}
              <div className="sm:col-span-5">
                <div className="aspect-[9/16] w-full max-w-[210px] mx-auto rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 relative shadow-xl">
                  {mediaType === 'video' ? (
                    <video
                      src={mediaUrl}
                      autoPlay
                      loop
                      muted={Boolean(musicUrl)}
                      playsInline
                      className={`w-full h-full object-cover ${activeFilterCss}`}
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover ${activeFilterCss}`}
                    />
                  )}

                  {/* Live Text Overlay Preview */}
                  {overlayText.trim() && (
                    <div
                      className={`absolute inset-x-3 z-10 flex justify-center pointer-events-none ${
                        overlayPosition === 'top'
                          ? 'top-5'
                          : overlayPosition === 'bottom'
                          ? 'bottom-16'
                          : 'top-1/2 -translate-y-1/2'
                      }`}
                    >
                      <span
                        style={{ color: overlayColor }}
                        className="px-3 py-1.5 rounded-xl bg-black/65 backdrop-blur-md text-xs sm:text-sm font-bold text-center shadow-lg break-words max-w-full"
                      >
                        {overlayText}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 to-transparent text-white">
                    <p className="text-xs font-semibold">@{currentUser.username}</p>
                    {musicTitle && (
                      <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5 truncate">
                        <Music2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{musicTitle}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Editor Tabs & Controls */}
              <div className="sm:col-span-7 space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                    {error}
                  </div>
                )}

                {/* 3 Editor Mode Tabs (iOS 26 Liquid Glass Segmented Control) */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/[0.05] backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <button
                    type="button"
                    onClick={() => setEditorTab('text')}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      editorTab === 'text'
                        ? 'bg-white/20 text-white border border-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)]'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5 text-amber-300" />
                    <span>{lang === 'ku' ? 'نووسین و فلتەر' : 'Text & Filter'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditorTab('music')}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      editorTab === 'music'
                        ? 'bg-white/20 text-white border border-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)]'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Music2 className="w-3.5 h-3.5 text-amber-300" />
                    <span>{lang === 'ku' ? 'بەشی گۆرانی' : 'Music'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditorTab('details')}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      editorTab === 'details'
                        ? 'bg-white/20 text-white border border-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)]'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5 text-amber-300" />
                    <span>{lang === 'ku' ? 'کەپشن و تاگ' : 'Caption'}</span>
                  </button>
                </div>

                {/* TAB 1: Text Overlay & Video Filters */}
                {editorTab === 'text' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        {lang === 'ku'
                          ? 'زیادکردنی نووسین لەسەر ڤیدیۆ'
                          : 'Add Text on Video'}
                      </label>
                      <input
                        type="text"
                        value={overlayText}
                        onChange={(e) => setOverlayText(e.target.value)}
                        placeholder={
                          lang === 'ku'
                            ? 'نووسینێک بنووسە لەسەر ڤیدیۆکە...'
                            : 'Write text to display on video...'
                        }
                        maxLength={200}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Text Color & Position */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                          {lang === 'ku' ? 'ڕەنگی نووسین' : 'Text Color'}
                        </label>
                        <div className="flex items-center gap-2">
                          {TEXT_COLORS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setOverlayColor(c.value)}
                              title={c.label}
                              style={{ backgroundColor: c.value }}
                              className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                                overlayColor === c.value
                                  ? 'border-amber-400 scale-110'
                                  : 'border-zinc-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                          {lang === 'ku' ? 'شوێنی نووسین' : 'Position'}
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          {(
                            [
                              { id: 'top', label: 'سەرەوە' },
                              { id: 'center', label: 'ناوەڕاست' },
                              { id: 'bottom', label: 'خوارەوە' },
                            ] as const
                          ).map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => setOverlayPosition(pos.id)}
                              className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                                overlayPosition === pos.id
                                  ? 'bg-amber-500 text-zinc-950 border-amber-400'
                                  : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Video Filters */}
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        {lang === 'ku' ? 'فلتەری ڤیدیۆ' : 'Video Filters'}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {VIDEO_FILTERS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setVideoFilter(f.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                              videoFilter === f.id
                                ? 'bg-amber-500 text-zinc-950 border-amber-400'
                                : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            {lang === 'ku' ? f.labelKu : f.labelEn}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Music Section (Search + Arabic Songs + Create Song) */}
                {editorTab === 'music' && (
                  <div className="space-y-3">
                    {/* Search Music at Top */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 min-w-0">
                        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={musicSearch}
                          onChange={(e) => setMusicSearch(e.target.value)}
                          placeholder={
                            lang === 'ku'
                              ? 'گەڕان بۆ گۆرانی عەرەبی...'
                              : 'Search Arabic songs...'
                          }
                          className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCreateSong((v) => !v)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {lang === 'ku' ? 'دروستکردنی گۆرانی' : 'Create Song'}
                        </span>
                      </button>
                    </div>

                    {/* Create Custom Song Box */}
                    {showCreateSong && (
                      <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/40 space-y-2.5">
                        <p className="text-xs font-bold text-amber-400">
                          {lang === 'ku'
                            ? 'دروستکردنی گۆرانی نوێ'
                            : 'Create / Upload Custom Song'}
                        </p>
                        <input
                          type="text"
                          value={customSongTitle}
                          onChange={(e) => setCustomSongTitle(e.target.value)}
                          placeholder={
                            lang === 'ku'
                              ? 'ناوی گۆرانی عەرەبی بنووسە...'
                              : 'Enter song title...'
                          }
                          maxLength={100}
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                        />
                        <label className="min-h-[40px] px-3 py-2 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-400 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {lang === 'ku'
                              ? 'هەڵبژاردنی فایلی دەنگ/ڤیدیۆ'
                              : 'Choose Audio/Video File'}
                          </span>
                          <input
                            type="file"
                            accept="audio/*,video/*"
                            onChange={handleCustomSongFile}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}

                    {/* Arabic Songs List */}
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                      {filteredSongs.map((track) => {
                        const isSelected =
                          musicTitle === track.title && musicUrl === track.url;
                        const isPlaying = playingTrackId === track.id;

                        return (
                          <div
                            key={track.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-500/50'
                                : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleTogglePreviewTrack(track)}
                              className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-zinc-800"
                            >
                              {isPlaying ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4 ml-0.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSelectTrack(track)}
                              className="flex-1 min-w-0 text-start cursor-pointer"
                            >
                              <p className="text-xs font-semibold text-white truncate">
                                {track.title}
                              </p>
                              <p className="text-[11px] text-amber-400/90">
                                {track.category}
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSelectTrack(track)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-500 text-zinc-950'
                                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                              }`}
                            >
                              {isSelected ? (
                                <span className="flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>هەڵبژێردرا</span>
                                </span>
                              ) : (
                                'هەڵبژاردن'
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 3: Caption, Hashtags, Tag Friends & Visibility */}
                {editorTab === 'details' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        {lang === 'ku'
                          ? 'کەپشن و بایۆی ڤیدیۆ (#هاشتاگ)'
                          : t.captionLabel}
                      </label>
                      <textarea
                        rows={2}
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder={t.captionPlaceholder}
                        maxLength={500}
                        className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {SUGGESTED_HASHTAGS.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleAddHashtag(tag)}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-amber-400 flex items-center gap-1 cursor-pointer"
                          >
                            <Hash className="w-3 h-3" />
                            <span>{tag.replace('#', '')}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tag Friends */}
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        {lang === 'ku' ? 'تاگکردنی هاوڕێکان (@)' : 'Tag Friends (@)'}
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 min-w-0">
                          <AtSign className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddManualTag();
                              }
                            }}
                            placeholder={
                              lang === 'ku' ? 'ناوی هاوڕێ بنووسە...' : 'Type username...'
                            }
                            className="w-full min-h-[40px] pl-10 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddManualTag}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-semibold text-white hover:bg-zinc-700 cursor-pointer shrink-0"
                        >
                          {lang === 'ku' ? 'تاگ بکە' : 'Tag'}
                        </button>
                      </div>

                      {friendsList.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {friendsList.map((f) => {
                            const active = taggedUsers.includes(f.username);
                            return (
                              <button
                                key={f.uid}
                                type="button"
                                onClick={() => handleToggleTagUser(f.username)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                                    : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                                }`}
                              >
                                @{f.username}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {taggedUsers.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {taggedUsers.map((u) => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => handleToggleTagUser(u)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <span>@{u}</span>
                              <X className="w-3 h-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Visibility */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setVisibility('public')}
                        className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          visibility === 'public'
                            ? 'bg-white text-zinc-950 border-white'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                        }`}
                      >
                        {t.forYou} (گشتی)
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisibility('friends')}
                        className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          visibility === 'friends'
                            ? 'bg-white text-zinc-950 border-white'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                        }`}
                      >
                        {t.friendsOnly}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="min-h-[44px] px-5 py-2 rounded-2xl bg-white/[0.08] border border-white/15 text-zinc-100 text-xs sm:text-sm font-semibold hover:bg-white/[0.15] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-all cursor-pointer"
              >
                {lang === 'ku' ? 'گەڕانەوە' : 'Back'}
              </button>
              <button
                type="submit"
                disabled={submitting || !mediaUrl.trim()}
                className="min-h-[44px] px-6 py-2 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 text-xs sm:text-sm font-bold hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_25px_-5px_rgba(245,158,11,0.4)]"
              >
                {submitting ? t.publishing : t.publishPost}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
