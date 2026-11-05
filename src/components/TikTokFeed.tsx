import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { translations } from '../i18n';
import { Friendship, Language, Post, PostComment, UserProfile } from '../types';
import { VerifiedBadge } from './VerifiedBadge';

interface TikTokFeedProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  posts: Post[];
  friendships: Friendship[];
  friendsList: UserProfile[];
  followingIds: Set<string>;
  lang: Language;
  onOpenCreatePost: () => void;
  onSendFriendRequest: (targetUid: string) => Promise<void>;
  onToggleFollow: (targetUid: string) => Promise<void>;
  onSharePostToFriend: (friendUid: string, post: Post) => Promise<void>;
  onGuestToggleLike?: (postId: string, incrementBy: number) => void;
  onGuestAddComment?: (postId: string) => void;
}

export const TikTokFeed: React.FC<TikTokFeedProps> = ({
  currentUser,
  allUsers,
  posts,
  friendships,
  friendsList,
  followingIds,
  lang,
  onOpenCreatePost,
  onSendFriendRequest,
  onToggleFollow,
  onSharePostToFriend,
  onGuestToggleLike,
  onGuestAddComment,
}) => {
  const t = translations[lang];
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [shareModalPost, setShareModalPost] = useState<Post | null>(null);
  const [sharedToUid, setSharedToUid] = useState<string | null>(null);

  const [muted, setMuted] = useState(true);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [pausedPostIds, setPausedPostIds] = useState<Set<string>>(new Set());
  const [brokenMediaIds, setBrokenMediaIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const reelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const normalizeMusicUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    if (url.includes('v24044gl0000db8vfl7og65tujsg5d30_8ab8e4ba.mov')) {
      return '/assets/audio/arabic_song_1.mp3';
    }
    if (url.includes('v14044g50000dakrt7fog65h0qokkiu0_6d522dd0.mov')) {
      return '/assets/audio/arabic_song_2.mp3';
    }
    if (url.includes('v14044g50000d9qe2jfog65sq9grp6v0_6ef0ca1d.mov')) {
      return '/assets/audio/arabic_song_3.mp3';
    }
    return url;
  };

  const friendUids = new Set(
    friendships
      .filter((f) => f.status === 'accepted')
      .flatMap((f) => f.users)
      .filter((uid) => uid !== currentUser.uid)
  );

  const pendingOrFriendUids = new Set(
    friendships.flatMap((f) => f.users).filter((uid) => uid !== currentUser.uid)
  );

  const rawQ = searchQuery.trim().toLowerCase();
  const cleanQ = rawQ.replace(/^@/, '');

  const matchedUsers = cleanQ
    ? allUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(cleanQ) ||
          u.displayName.toLowerCase().includes(cleanQ)
      )
    : [];

  const filteredPosts = posts.filter((p) => {
    const matchesTab =
      feedFilter === 'all' || friendUids.has(p.authorId) || p.authorId === currentUser.uid;
    if (!matchesTab) return false;
    if (!rawQ) return true;
    return (
      (p.caption || '').toLowerCase().includes(rawQ) ||
      (p.authorUsername || '').toLowerCase().includes(cleanQ) ||
      (p.authorName || '').toLowerCase().includes(cleanQ) ||
      (p.taggedUsers || []).some(
        (u) => `@${u}`.toLowerCase().includes(rawQ) || u.toLowerCase().includes(cleanQ)
      )
    );
  });

  useEffect(() => {
    if (filteredPosts.length > 0 && (!activePostId || !filteredPosts.some((p) => p.id === activePostId))) {
      setActivePostId(filteredPosts[0].id);
    }
  }, [filteredPosts.map((p) => p.id).join(',')]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const pid = entry.target.getAttribute('data-post-id');
            if (pid) setActivePostId(pid);
          }
        });
      },
      { root, threshold: 0.6 }
    );

    Object.values(reelRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredPosts.map((p) => p.id).join(',')]);

  // Check which posts current user has liked
  useEffect(() => {
    if (currentUser.isGuest) return;
    const unsubs: (() => void)[] = [];
    filteredPosts.forEach((post) => {
      const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.uid);
      const unsub = onSnapshot(
        likeRef,
        (snap) => {
          setLikedPostIds((prev) => {
            const next = new Set(prev);
            if (snap.exists()) {
              next.add(post.id);
            } else {
              next.delete(post.id);
            }
            return next;
          });
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `posts/${post.id}/likes/${currentUser.uid}`);
        }
      );
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
  }, [filteredPosts.map((p) => p.id).join(','), currentUser.uid]);

  // Listen to comments when comments drawer is open
  useEffect(() => {
    if (!activeCommentsPost) {
      setComments([]);
      return;
    }
    const q = query(
      collection(db, 'posts', activeCommentsPost.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PostComment[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PostComment, 'id'>),
        }));
        setComments(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `posts/${activeCommentsPost.id}/comments`);
      }
    );
    return () => unsub();
  }, [activeCommentsPost?.id]);

  const handleToggleLike = async (post: Post) => {
    const isLiked = likedPostIds.has(post.id);
    if (currentUser.isGuest) {
      setLikedPostIds((prev) => {
        const next = new Set(prev);
        if (isLiked) next.delete(post.id);
        else next.add(post.id);
        return next;
      });
      onGuestToggleLike?.(post.id, isLiked ? -1 : 1);
      return;
    }
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.uid);
    const postRef = doc(db, 'posts', post.id);
    try {
      if (isLiked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, {
          likesCount: Math.max(0, (post.likesCount || 0) - 1),
        });
      } else {
        await setDoc(likeRef, {
          userId: currentUser.uid,
          createdAt: serverTimestamp(),
        });
        await updateDoc(postRef, {
          likesCount: increment(1),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${post.id}/likes`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommentsPost || !commentText.trim() || submittingComment) return;
    if (currentUser.isGuest) {
      const newComment: PostComment = {
        id: `guest_comment_${Date.now()}`,
        postId: activeCommentsPost.id,
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        authorPhoto: currentUser.photoURL || '',
        text: commentText.trim().slice(0, 500),
      };
      setComments((prev) => [...prev, newComment]);
      onGuestAddComment?.(activeCommentsPost.id);
      setCommentText('');
      return;
    }
    setSubmittingComment(true);
    try {
      await addDoc(collection(db, 'posts', activeCommentsPost.id, 'comments'), {
        postId: activeCommentsPost.id,
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        authorPhoto: currentUser.photoURL || '',
        text: commentText.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', activeCommentsPost.id), {
        commentsCount: increment(1),
      });
      setCommentText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `posts/${activeCommentsPost.id}/comments`);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
    }
  };

  const scrollByReel = (direction: 'up' | 'down') => {
    const el = containerRef.current;
    if (!el) return;
    const height = el.clientHeight;
    el.scrollBy({
      top: direction === 'down' ? height : -height,
      behavior: 'smooth',
    });
  };

  const togglePlayPause = (postId: string) => {
    const vid = videoRefs.current[postId];
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setPausedPostIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    } else {
      vid.pause();
      setPausedPostIds((prev) => {
        const next = new Set(prev);
        next.add(postId);
        return next;
      });
    }
  };

  return (
    <div className="relative h-full w-full bg-zinc-950 flex flex-col overflow-hidden">
      {/* Top Floating Filter, Search & Create Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-col gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 p-1 bg-zinc-900/55 backdrop-blur-2xl saturate-180 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.28),0_8px_24px_rgba(0,0,0,0.45)] rounded-2xl pointer-events-auto">
            <button
              type="button"
              onClick={() => setFeedFilter('all')}
              className={`px-3 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                feedFilter === 'all'
                  ? 'bg-white/22 text-white border border-white/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              {t.forYou}
            </button>
            <button
              type="button"
              onClick={() => setFeedFilter('friends')}
              className={`px-3 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                feedFilter === 'friends'
                  ? 'bg-white/22 text-white border border-white/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              {t.friendsOnly}
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              aria-label="گەڕان لە پۆست و هاشتاگ"
              className={`min-h-[38px] min-w-[38px] sm:min-h-[40px] sm:min-w-[40px] rounded-2xl backdrop-blur-2xl saturate-180 border flex items-center justify-center transition-all cursor-pointer ${
                showSearch || searchQuery
                  ? 'bg-amber-500 text-zinc-950 border-amber-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]'
                  : 'bg-zinc-900/55 text-white border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.28)] hover:bg-zinc-800/70'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenCreatePost}
              className="min-h-[38px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 font-semibold text-[11px] sm:text-sm flex items-center gap-1 sm:gap-1.5 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_rgba(245,158,11,0.28)]"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span>{t.createPost}</span>
            </button>
          </div>
        </div>

        {(showSearch || searchQuery) && (
          <div className="pointer-events-auto max-w-md w-full mx-auto space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'ku'
                    ? 'گەڕان بۆ @یوزەر، ناو، پۆست یان #هاشتاگ...'
                    : 'Search @username, name, posts or #hashtags...'
                }
                className="w-full min-h-[40px] pl-10 pr-9 py-1.5 rounded-xl bg-zinc-900/90 backdrop-blur-xl border border-white/15 text-xs sm:text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {matchedUsers.length > 0 && (
              <div className="rounded-xl bg-zinc-900/95 backdrop-blur-xl border border-white/15 p-2 space-y-1.5 max-h-52 overflow-y-auto shadow-2xl">
                <p className="px-2 text-[11px] font-semibold text-zinc-400">
                  {lang === 'ku' ? 'هەژمارەکان' : 'Accounts'} ({matchedUsers.length})
                </p>
                {matchedUsers.slice(0, 6).map((person) => {
                  const isMe = person.uid === currentUser.uid;
                  const isFollowing = followingIds.has(person.uid);
                  return (
                    <div
                      key={person.uid}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setSearchQuery(`@${person.username}`)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
                      >
                        {person.photoURL ? (
                          <img
                            src={person.photoURL}
                            alt={person.displayName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-amber-500 text-zinc-950 font-bold text-xs flex items-center justify-center shrink-0">
                            {person.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-semibold text-white truncate">
                              {person.displayName}
                            </p>
                            <VerifiedBadge followersCount={person.followersCount} className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate">
                            @{person.username}
                          </p>
                        </div>
                      </button>

                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => onToggleFollow(person.uid)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                            isFollowing
                              ? 'bg-zinc-800 text-amber-400 border border-amber-500/30'
                              : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                          }`}
                        >
                          {isFollowing
                            ? lang === 'ku'
                              ? 'فۆڵۆوکراوە'
                              : 'Following'
                            : lang === 'ku'
                            ? 'فۆڵۆو'
                            : 'Follow'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vertical Snap Feed */}
      <div
        ref={containerRef}
        className="flex-1 w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
      >
        {filteredPosts.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
            <p className="text-zinc-400 text-sm sm:text-base max-w-sm">
              {feedFilter === 'friends'
                ? t.noFriendsYet
                : lang === 'ku'
                ? 'هێشتا هیچ پۆستێک نییە. یەکەم پۆست بڵاو بکەرەوە!'
                : 'No reels yet. Be the first to publish a reel!'}
            </p>
            <button
              type="button"
              onClick={onOpenCreatePost}
              className="mt-4 min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
            >
              {t.createPost}
            </button>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isLiked = likedPostIds.has(post.id);
            const isOwnPost = post.authorId === currentUser.uid;
            const isConnected = pendingOrFriendUids.has(post.authorId);
            const isFollowing = followingIds.has(post.authorId);
            const authorUser = allUsers.find((u) => u.uid === post.authorId);
            const isPaused = pausedPostIds.has(post.id);
            const isBroken = brokenMediaIds.has(post.id);
            const isActive = activePostId === post.id;
            const resolvedMusicUrl = normalizeMusicUrl(post.musicUrl);

            return (
              <div
                key={post.id}
                data-post-id={post.id}
                ref={(el) => {
                  reelRefs.current[post.id] = el;
                }}
                className="h-full w-full snap-start snap-always flex items-center justify-center md:py-3 relative"
              >
                {/* 9:16 Vertical Reel Frame */}
                <div className="relative w-full h-full md:max-w-[430px] md:max-h-[820px] md:rounded-2xl overflow-hidden bg-zinc-900 md:border md:border-white/10 shadow-2xl">
                  {/* Background Music Track if selected & active */}
                  {isActive && resolvedMusicUrl && (
                    <audio
                      ref={audioRef}
                      src={resolvedMusicUrl}
                      autoPlay
                      loop
                      muted={muted}
                      className="hidden"
                    />
                  )}

                  {/* Media Layer */}
                  {isBroken ? (
                    <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 flex flex-col items-center justify-center p-8 text-center">
                      <Music2 className="w-12 h-12 text-amber-400 mb-3" />
                      <p className="text-sm text-zinc-300 font-medium">{post.caption}</p>
                    </div>
                  ) : post.mediaType === 'video' ? (
                    <div
                      onClick={() => togglePlayPause(post.id)}
                      className="w-full h-full relative cursor-pointer"
                    >
                      {isActive ? (
                        <video
                          ref={(el) => {
                            videoRefs.current[post.id] = el;
                          }}
                          src={post.mediaUrl}
                          autoPlay
                          loop
                          muted={muted || Boolean(post.musicUrl)}
                          playsInline
                          onError={() =>
                            setBrokenMediaIds((prev) => new Set(prev).add(post.id))
                          }
                          className={`w-full h-full object-cover ${
                            post.videoFilter === 'warm'
                              ? 'sepia-[.25] saturate-125 brightness-105'
                              : post.videoFilter === 'dramatic'
                              ? 'contrast-125 saturate-110 brightness-95'
                              : post.videoFilter === 'bw'
                              ? 'grayscale contrast-115'
                              : post.videoFilter === 'vivid'
                              ? 'saturate-150 contrast-105'
                              : ''
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                          <Film className="w-10 h-10 text-zinc-700" />
                        </div>
                      )}
                      {isPaused && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white">
                            <Play className="w-7 h-7 fill-white ml-0.5" />
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextMuted = !muted;
                          setMuted(nextMuted);
                          if (!nextMuted && audioRef.current) {
                            audioRef.current.muted = false;
                            audioRef.current.play().catch(() => {});
                          }
                        }}
                        aria-label={muted ? 'Dang bkara' : 'Bêdang bka'}
                        className="absolute top-16 right-4 z-20 min-h-[40px] min-w-[40px] rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
                      >
                        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full relative">
                      <img
                        src={post.mediaUrl}
                        alt={post.caption || 'Vertical reel'}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenMediaIds((prev) => new Set(prev).add(post.id))
                        }
                        className={`w-full h-full object-cover animate-reel-motion ${
                          post.videoFilter === 'warm'
                            ? 'sepia-[.25] saturate-125 brightness-105'
                            : post.videoFilter === 'dramatic'
                            ? 'contrast-125 saturate-110 brightness-95'
                            : post.videoFilter === 'bw'
                            ? 'grayscale contrast-115'
                            : post.videoFilter === 'vivid'
                            ? 'saturate-150 contrast-105'
                            : ''
                        }`}
                      />
                      {resolvedMusicUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextMuted = !muted;
                            setMuted(nextMuted);
                            if (!nextMuted && audioRef.current) {
                              audioRef.current.muted = false;
                              audioRef.current.play().catch(() => {});
                            }
                          }}
                          aria-label={muted ? 'Dang bkara' : 'Bêdang bka'}
                          className="absolute top-16 right-4 z-20 min-h-[40px] min-w-[40px] rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
                        >
                          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Text Overlay on Video/Photo */}
                  {post.overlayText && (
                    <div
                      className={`absolute inset-x-4 z-10 flex justify-center pointer-events-none ${
                        post.overlayPosition === 'top'
                          ? 'top-20'
                          : post.overlayPosition === 'bottom'
                          ? 'bottom-32'
                          : 'top-1/2 -translate-y-1/2'
                      }`}
                    >
                      <span
                        style={{ color: post.overlayColor || '#ffffff' }}
                        className="px-4 py-2 rounded-2xl bg-black/65 backdrop-blur-md text-sm sm:text-base font-bold text-center shadow-xl break-words max-w-full"
                      >
                        {post.overlayText}
                      </span>
                    </div>
                  )}

                  {/* Measured Contrast Scrim */}
                  <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />

                  {/* Bottom Left Author & Caption */}
                  <div className="absolute bottom-5 left-4 right-20 z-10 text-white">
                    <div className="flex items-center gap-1.5 text-sm font-semibold flex-wrap">
                      <span>@{post.authorUsername}</span>
                      <VerifiedBadge followersCount={authorUser?.followersCount} className="w-4 h-4" />
                      <span className="text-zinc-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-zinc-200 font-normal truncate">
                        {post.authorName}
                      </span>
                      {!isOwnPost && (
                        <button
                          type="button"
                          onClick={() => onToggleFollow(post.authorId)}
                          className={`ms-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isFollowing
                              ? 'bg-white/15 text-zinc-200 hover:bg-white/25'
                              : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                          }`}
                        >
                          {isFollowing
                            ? lang === 'ku'
                              ? 'فۆڵۆوکراوە'
                              : 'Following'
                            : lang === 'ku'
                            ? 'فۆڵۆو'
                            : 'Follow'}
                        </button>
                      )}
                    </div>

                    {post.caption && (
                      <p className="mt-1.5 text-sm text-zinc-100 leading-snug line-clamp-3">
                        {post.caption.split(/(\s+)/).map((part, i) =>
                          part.startsWith('#') && part.length > 1 ? (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setSearchQuery(part);
                                setShowSearch(true);
                              }}
                              className="text-amber-400 font-semibold hover:underline cursor-pointer"
                            >
                              {part}
                            </button>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </p>
                    )}

                    {post.taggedUsers && post.taggedUsers.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-amber-300 font-medium">
                        {post.taggedUsers.map((u) => (
                          <span key={u}>@{u}</span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center gap-2 text-xs text-zinc-300">
                      <Music2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">
                        {post.musicTitle || `دەنگی ڕەسەن — ${post.authorName}`}
                      </span>
                    </div>
                  </div>

                  {/* Right Side TikTok Action Rail */}
                  <div className="absolute bottom-5 right-3 z-10 flex flex-col items-center gap-4">
                    {/* Creator Avatar + Quick Add Friend */}
                    <div className="relative mb-1">
                      {post.authorPhoto ? (
                        <img
                          src={post.authorPhoto}
                          alt={post.authorName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover border-2 border-white"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center border-2 border-white">
                          {post.authorName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {!isOwnPost && !isConnected && (
                        <button
                          type="button"
                          onClick={() => onSendFriendRequest(post.authorId)}
                          title={t.addFriend}
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center shadow-md hover:bg-amber-400 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      )}
                    </div>

                    {/* Like Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleLike(post)}
                      className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-white group cursor-pointer"
                    >
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-2xl saturate-180 border transition-transform group-active:scale-90 ${
                          isLiked
                            ? 'bg-rose-500/30 border-rose-300/40 text-rose-400 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)]'
                            : 'bg-zinc-900/50 border-white/20 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.28)]'
                        }`}
                      >
                        <Heart
                          className={`w-6 h-6 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`}
                        />
                      </div>
                      <span className="text-xs font-mono-tabular font-semibold">
                        {post.likesCount || 0}
                      </span>
                    </button>

                    {/* Comments Button */}
                    <button
                      type="button"
                      onClick={() => setActiveCommentsPost(post)}
                      className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-white group cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center group-active:scale-90 transition-transform">
                        <MessageCircle className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-mono-tabular font-semibold">
                        {post.commentsCount || 0}
                      </span>
                    </button>

                    {/* Share to Friend in Chat Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setShareModalPost(post);
                        setSharedToUid(null);
                      }}
                      className="min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 text-white group cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center group-active:scale-90 transition-transform">
                        <Send className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium">{t.share}</span>
                    </button>

                    {/* Delete Own Post */}
                    {isOwnPost && (
                      <button
                        type="button"
                        onClick={() => handleDeletePost(post.id)}
                        title="سڕینەوەی پۆست"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-300 hover:text-red-400 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </div>
                      </button>
                    )}
                  </div>
                </div>

                {/* Desktop Up / Down Reel Controls */}
                <div className="hidden lg:flex flex-col gap-2 ml-4">
                  <button
                    type="button"
                    onClick={() => scrollByReel('up')}
                    aria-label="پۆستی پێشوو"
                    className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollByReel('down')}
                    aria-label="پۆستی دواتر"
                    className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Comments Bottom Sheet / Drawer */}
      {activeCommentsPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-display text-base font-bold text-white">
                {t.commentsTitle} ({comments.length})
              </h3>
              <button
                type="button"
                onClick={() => setActiveCommentsPost(null)}
                className="min-h-[40px] min-w-[40px] rounded-lg text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {comments.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-8">{t.noComments}</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    {c.authorPhoto ? (
                      <img
                        src={c.authorPhoto}
                        alt={c.authorName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-zinc-950 font-bold text-xs flex items-center justify-center shrink-0">
                        {c.authorName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-300">{c.authorName}</p>
                      <p className="text-sm text-white mt-0.5 break-words">{c.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleAddComment}
              className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center gap-2"
            >
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t.addCommentPlaceholder}
                maxLength={500}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submittingComment}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {t.send}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Post to Friend in Chat Modal */}
      {shareModalPost && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl max-h-[75vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-display text-base font-bold text-white">
                {t.shareToFriend}
              </h3>
              <button
                type="button"
                onClick={() => setShareModalPost(null)}
                className="min-h-[40px] min-w-[40px] rounded-lg text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {friendsList.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-8">{t.noFriendsYet}</p>
              ) : (
                friendsList.map((friend) => {
                  const isSent = sharedToUid === friend.uid;
                  return (
                    <div
                      key={friend.uid}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {friend.photoURL ? (
                          <img
                            src={friend.photoURL}
                            alt={friend.displayName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center shrink-0">
                            {friend.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {friend.displayName}
                          </p>
                          <p className="text-xs text-zinc-400 truncate">@{friend.username}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isSent}
                        onClick={async () => {
                          await onSharePostToFriend(friend.uid, shareModalPost);
                          setSharedToUid(friend.uid);
                        }}
                        className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isSent
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                        }`}
                      >
                        {isSent ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>{t.sentToChat}</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>{t.send}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
