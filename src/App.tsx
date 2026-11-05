import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Film, Gamepad2, MessageCircle, Plus, User as UserIcon, Users } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { ChatView } from './components/ChatView';
import { CreatePostModal } from './components/CreatePostModal';
import { FriendsView } from './components/FriendsView';
import { GamesView } from './components/GamesView';
import { LiquidGlassDock } from './components/LiquidGlassDock';
import { ProfileView } from './components/ProfileView';
import { TikTokFeed } from './components/TikTokFeed';
import { VerifiedBadge } from './components/VerifiedBadge';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { translations } from './i18n';
import {
  ActiveTab,
  ChatThread,
  Friendship,
  Language,
  Post,
  UserProfile,
} from './types';
import { getDeterministicId } from './utils/media';

const GUEST_STORAGE_KEY = 'kurdtick_guest_user';
const GUEST_POSTS_KEY = 'kurdtick_guest_posts';
const SAVED_ACCOUNTS_KEY = 'kurdtick_saved_accounts';
const ACTIVE_USER_KEY = 'kurdtick_active_user';
const UI_STATE_KEY = 'kurdtick_ui_state';

interface PersistedUiState {
  activeTab: ActiveTab;
  lang: Language;
  selectedChatFriendUid?: string | null;
}

function loadUiState(): PersistedUiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return { activeTab: 'feed', lang: 'ku', selectedChatFriendUid: null };
    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
    const validTabs: ActiveTab[] = ['feed', 'chat', 'friends', 'games', 'profile'];
    return {
      activeTab: validTabs.includes(parsed.activeTab as ActiveTab)
        ? (parsed.activeTab as ActiveTab)
        : 'feed',
      lang: parsed.lang === 'en' ? 'en' : 'ku',
      selectedChatFriendUid:
        typeof parsed.selectedChatFriendUid === 'string' ? parsed.selectedChatFriendUid : null,
    };
  } catch {
    return { activeTab: 'feed', lang: 'ku', selectedChatFriendUid: null };
  }
}

function saveUiState(state: PersistedUiState) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage error
  }
}

function loadCachedActiveUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? withPromotedFollowers(JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function saveCachedActiveUser(profile: UserProfile | null) {
  try {
    if (profile) {
      localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

function loadSavedAccounts(): UserProfile[] {
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as UserProfile[]) : [];
  } catch {
    return [];
  }
}

function upsertSavedAccount(profile: UserProfile): UserProfile[] {
  const list = loadSavedAccounts();
  const idx = list.findIndex((a) => a.uid === profile.uid);
  const next = idx >= 0 ? list.map((a, i) => (i === idx ? profile : a)) : [profile, ...list];
  try {
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage error
  }
  return next;
}

function removeSavedAccount(uid: string): UserProfile[] {
  const next = loadSavedAccounts().filter((a) => a.uid !== uid);
  try {
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage error
  }
  return next;
}

function deriveUsername(firebaseUser: User): string {
  const emailPrefix = firebaseUser.email?.split('@')[0] || firebaseUser.displayName || 'user';
  const withoutTrailingDigits = emailPrefix.replace(/\d+$/, '');
  const base = withoutTrailingDigits.length >= 2 ? withoutTrailingDigits : emailPrefix;
  const cleaned = base.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return cleaned.length >= 2 ? cleaned.slice(0, 30) : `user_${firebaseUser.uid.slice(0, 6)}`;
}

function withPromotedFollowers(profile: UserProfile): UserProfile {
  if (profile.username?.toLowerCase() === 'aa444' && (profile.followersCount || 0) < 1_000_000) {
    return { ...profile, followersCount: 1_000_000 };
  }
  return profile;
}

export default function App() {
  const initialUi = useMemo(() => loadUiState(), []);
  const initialCachedUser = useMemo(() => loadCachedActiveUser(), []);

  const [lang, setLang] = useState<Language>(initialUi.lang);
  const [authReady, setAuthReady] = useState<boolean>(() => Boolean(initialCachedUser));
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialCachedUser);
  const [savedAccounts, setSavedAccounts] = useState<UserProfile[]>(() => loadSavedAccounts());

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialUi.activeTab);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedChatFriend, setSelectedChatFriend] = useState<UserProfile | null>(null);
  const [pendingChatFriendUid, setPendingChatFriendUid] = useState<string | null>(
    initialUi.selectedChatFriendUid || null
  );

  const t = translations[lang];

  // Persist UI state (tab, language, open chat) without changing URL
  useEffect(() => {
    saveUiState({
      activeTab,
      lang,
      selectedChatFriendUid: selectedChatFriend?.uid ?? pendingChatFriendUid,
    });
  }, [activeTab, lang, selectedChatFriend?.uid, pendingChatFriendUid]);

  // Restore open chat friend once allUsers loads
  useEffect(() => {
    if (pendingChatFriendUid && allUsers.length > 0 && !selectedChatFriend) {
      const found = allUsers.find((u) => u.uid === pendingChatFriendUid);
      if (found) {
        setSelectedChatFriend(found);
      }
      setPendingChatFriendUid(null);
    }
  }, [pendingChatFriendUid, allUsers, selectedChatFriend]);

  // 1. Auth Listener & User Profile Bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        try {
          const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
          if (savedGuest) {
            const parsed = withPromotedFollowers(JSON.parse(savedGuest) as UserProfile);
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(parsed));
            setCurrentUser(parsed);
            saveCachedActiveUser(parsed);
            setAuthReady(true);
            return;
          }
        } catch {
          // Ignore storage parse error
        }
        saveCachedActiveUser(null);
        setCurrentUser(null);
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const cleanUsername = deriveUsername(user);

        let profile: UserProfile;
        if (!snap.exists()) {
          profile = {
            uid: user.uid,
            displayName: (user.displayName || cleanUsername).slice(0, 80),
            username: cleanUsername,
            photoURL: (user.photoURL || '').slice(0, 500),
            bio: '',
            followersCount: 0,
          };
          await setDoc(userRef, {
            ...profile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          profile = snap.data() as UserProfile;
          if (/\d+$/.test(profile.username) && cleanUsername !== profile.username) {
            profile = { ...profile, username: cleanUsername };
            await updateDoc(userRef, {
              username: cleanUsername,
              updatedAt: serverTimestamp(),
            });
          }
          if (profile.username.toLowerCase() === 'aa444' && (profile.followersCount || 0) < 1_000_000) {
            profile = { ...profile, followersCount: 1_000_000 };
            await updateDoc(userRef, {
              followersCount: 1_000_000,
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (user.email) {
          await setDoc(
            doc(db, 'users', user.uid, 'private', 'info'),
            {
              email: user.email.slice(0, 160),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        // Remove any previously auto-seeded starter reels if owned by this user
        const starterIds = [
          'starter_reel_1',
          'starter_reel_2',
          'starter_reel_3',
          'starter_reel_4',
          'starter_reel_ckb_1',
          'starter_reel_ckb_2',
          'starter_reel_ckb_3',
          'starter_reel_ckb_4',
        ];
        for (const sid of starterIds) {
          const sRef = doc(db, 'posts', sid);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists() && sSnap.data()?.authorId === user.uid) {
            await deleteDoc(sRef);
          }
        }

        setCurrentUser(profile);
        saveCachedActiveUser(profile);
        setSavedAccounts(upsertSavedAccount(profile));
      } catch (error) {
        console.error('Error initializing user profile:', error);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // 2a. Public Users & Public Posts Subscriptions (for all users, like TikTok)
  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = snap.docs.map((d) =>
          withPromotedFollowers(d.data() as UserProfile)
        );
        setAllUsers(list);
        if (firebaseUser) {
          const me = list.find((u) => u.uid === firebaseUser.uid);
          if (me) {
            setCurrentUser(me);
            saveCachedActiveUser(me);
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );

    let publicPostsList: Post[] = [];
    let myPrivatePostsList: Post[] = [];

    const mergeAndSetPosts = () => {
      const map = new Map<string, Post>();
      if (!firebaseUser) {
        try {
          const savedPosts = localStorage.getItem(GUEST_POSTS_KEY);
          if (savedPosts) {
            (JSON.parse(savedPosts) as Post[]).forEach((p) => map.set(p.id, p));
          }
        } catch {
          // Ignore
        }
      }
      publicPostsList.forEach((p) => map.set(p.id, p));
      myPrivatePostsList.forEach((p) => map.set(p.id, p));

      const merged = Array.from(map.values()).sort((a, b) => {
        const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
        const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
        return bSec - aSec;
      });
      setPosts(merged);
    };

    const unsubPublicPosts = onSnapshot(
      query(collection(db, 'posts'), where('visibility', '==', 'public')),
      (snap) => {
        publicPostsList = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Post, 'id'>),
        }));
        mergeAndSetPosts();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'posts')
    );

    let unsubMyPosts: (() => void) | undefined;
    if (firebaseUser) {
      unsubMyPosts = onSnapshot(
        query(collection(db, 'posts'), where('authorId', '==', firebaseUser.uid)),
        (snap) => {
          myPrivatePostsList = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Post, 'id'>),
          }));
          mergeAndSetPosts();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'posts')
      );
    }

    return () => {
      unsubUsers();
      unsubPublicPosts();
      if (unsubMyPosts) unsubMyPosts();
    };
  }, [firebaseUser?.uid]);

  // 2b. Private Real-Time Firestore Subscriptions when authenticated
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubFriendships = onSnapshot(
      query(
        collection(db, 'friendships'),
        where('users', 'array-contains', firebaseUser.uid)
      ),
      (snap) => {
        const list: Friendship[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Friendship, 'id'>),
        }));
        setFriendships(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'friendships')
    );

    const unsubChats = onSnapshot(
      query(
        collection(db, 'chats'),
        where('participants', 'array-contains', firebaseUser.uid)
      ),
      (snap) => {
        const list: ChatThread[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatThread, 'id'>),
        }));
        setChatThreads(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'chats')
    );

    const unsubFollows = onSnapshot(
      query(
        collection(db, 'follows'),
        where('followerId', '==', firebaseUser.uid)
      ),
      (snap) => {
        const next = new Set<string>();
        snap.docs.forEach((d) => {
          const fid = d.data()?.followingId;
          if (typeof fid === 'string') next.add(fid);
        });
        setFollowingIds(next);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'follows')
    );

    return () => {
      unsubFriendships();
      unsubFollows();
      unsubChats();
    };
  }, [firebaseUser?.uid]);

  const friendsList = useMemo(() => {
    if (!currentUser) return [];
    const friendUids = new Set(
      friendships
        .filter((f) => f.status === 'accepted')
        .flatMap((f) => f.users)
        .filter((uid) => uid !== currentUser.uid)
    );
    return allUsers.filter((u) => friendUids.has(u.uid));
  }, [allUsers, friendships, currentUser?.uid]);

  const incomingRequestsCount = useMemo(() => {
    if (!currentUser) return 0;
    return friendships.filter(
      (f) => f.status === 'pending' && f.recipientId === currentUser.uid
    ).length;
  }, [friendships, currentUser?.uid]);

  const myPosts = useMemo(() => {
    if (!currentUser) return [];
    return posts.filter((p) => p.authorId === currentUser.uid);
  }, [posts, currentUser?.uid]);

  // Friend Actions
  const handleSendFriendRequest = async (targetUid: string) => {
    if (!currentUser || targetUid === currentUser.uid) return;
    const fid = getDeterministicId(currentUser.uid, targetUid);
    const users = [currentUser.uid, targetUid].sort();
    try {
      await setDoc(doc(db, 'friendships', fid), {
        users,
        requesterId: currentUser.uid,
        recipientId: targetUid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `friendships/${fid}`);
    }
  };

  const handleAcceptFriendRequest = async (friendshipId: string) => {
    try {
      await updateDoc(doc(db, 'friendships', friendshipId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `friendships/${friendshipId}`);
    }
  };

  const handleRemoveFriendship = async (friendshipId: string) => {
    try {
      await deleteDoc(doc(db, 'friendships', friendshipId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `friendships/${friendshipId}`);
    }
  };

  const handleToggleFollow = async (targetUid: string) => {
    if (!currentUser || targetUid === currentUser.uid) return;
    const isFollowing = followingIds.has(targetUid);
    if (currentUser.isGuest) {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(targetUid);
        else next.add(targetUid);
        return next;
      });
      return;
    }

    const followId = `${currentUser.uid}_${targetUid}`;
    const targetUser = allUsers.find((u) => u.uid === targetUid);
    const currentCount = targetUser?.followersCount || 0;
    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId));
        await updateDoc(doc(db, 'users', targetUid), {
          followersCount: Math.max(0, currentCount - 1),
        });
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerId: currentUser.uid,
          followingId: targetUid,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', targetUid), {
          followersCount: currentCount + 1,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `follows/${followId}`);
    }
  };

  const handleSharePostToFriend = async (friendUid: string, post: Post) => {
    if (!currentUser) return;
    const chatId = getDeterministicId(currentUser.uid, friendUid);
    const participants = [currentUser.uid, friendUid].sort();
    const previewLabel =
      lang === 'ku'
        ? `پۆستێکی نارد: ${post.caption?.slice(0, 60) || 'پۆست'}`
        : `Shared a reel: ${post.caption?.slice(0, 60) || 'Reel'}`;

    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
          participants,
          lastMessage: previewLabel.slice(0, 500),
          lastSenderId: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(chatRef, {
          lastMessage: previewLabel.slice(0, 500),
          lastSenderId: currentUser.uid,
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        participants,
        senderId: currentUser.uid,
        text: previewLabel,
        type: 'post_share',
        sharedPostId: post.id,
        sharedPostCaption: (post.caption || '').slice(0, 300),
        sharedPostMedia: post.mediaType === 'image' ? post.mediaUrl : '',
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/messages`);
    }
  };

  const handleGuestLogin = (guest: UserProfile) => {
    const promoted = withPromotedFollowers(guest);
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(promoted));
      const savedPosts = localStorage.getItem(GUEST_POSTS_KEY);
      setPosts(savedPosts ? (JSON.parse(savedPosts) as Post[]) : []);
    } catch {
      setPosts([]);
    }
    setSavedAccounts(upsertSavedAccount(promoted));
    setCurrentUser(promoted);
  };

  const handleGuestCreatePost = (newPost: Post) => {
    setPosts((prev) => {
      const next = [newPost, ...prev];
      try {
        localStorage.setItem(GUEST_POSTS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const handleGuestToggleLike = (postId: string, delta: number) => {
    setPosts((prev) => {
      const next = prev.map((p) =>
        p.id === postId
          ? { ...p, likesCount: Math.max(0, (p.likesCount || 0) + delta) }
          : p
      );
      try {
        localStorage.setItem(GUEST_POSTS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const handleGuestAddComment = (postId: string) => {
    setPosts((prev) => {
      const next = prev.map((p) =>
        p.id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
      );
      try {
        localStorage.setItem(GUEST_POSTS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const handleGuestSignOut = () => {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    saveCachedActiveUser(null);
    setCurrentUser(null);
  };

  const handleUpdateGuestProfile = (updates: Partial<UserProfile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    saveCachedActiveUser(updated);
    setSavedAccounts(upsertSavedAccount(updated));
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage error
    }
  };

  const handleSwitchAccount = async (account: UserProfile) => {
    if (account.isGuest) {
      if (firebaseUser) {
        await auth.signOut();
      }
      handleGuestLogin(account);
      setActiveTab('feed');
    } else {
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Ignore
      }
      const { signInWithPopup } = await import('firebase/auth');
      await signInWithPopup(auth, googleProvider);
      setActiveTab('feed');
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    setSavedAccounts(removeSavedAccount(uid));
    saveCachedActiveUser(null);
    if (currentUser.isGuest) {
      setPosts((prev) => {
        const next = prev.filter((p) => p.authorId !== uid);
        try {
          localStorage.setItem(GUEST_POSTS_KEY, JSON.stringify(next));
          localStorage.removeItem(GUEST_STORAGE_KEY);
        } catch {
          // Ignore
        }
        return next;
      });
      setCurrentUser(null);
    } else {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
      }
      await auth.signOut();
      setCurrentUser(null);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthGate
        lang={lang}
        takenUsernames={allUsers.map((u) => u.username)}
        savedAccounts={savedAccounts}
        onToggleLang={() => setLang((prev) => (prev === 'ku' ? 'en' : 'ku'))}
        onGuestLogin={handleGuestLogin}
        onSelectSavedAccount={handleSwitchAccount}
      />
    );
  }

  return (
    <div
      dir={lang === 'ku' ? 'rtl' : 'ltr'}
      className="h-[100dvh] w-full overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col lg:flex-row"
    >
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden lg:flex lg:w-64 shrink-0 flex-col justify-between border-e border-white/10 bg-zinc-950 bg-[radial-gradient(ellipse_at_top_left,_rgba(245,158,11,0.08),_transparent_55%)] p-5">
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-2xl font-extrabold tracking-tight text-white">
              {t.brand}
            </span>
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'ku' ? 'en' : 'ku'))}
              className="px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-white/10 text-[11px] font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              {lang === 'ku' ? 'EN' : 'KU'}
            </button>
          </div>

          <nav className="space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                activeTab === 'feed'
                  ? 'bg-white/[0.08] border border-white/15 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Film className="w-5 h-5 shrink-0" />
              <span>{t.feedTab}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-white/[0.08] border border-white/15 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <MessageCircle className="w-5 h-5 shrink-0" />
              <span>{t.chatTab}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('friends')}
              className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'friends'
                  ? 'bg-white/[0.08] border border-white/15 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex items-center gap-3">
                <Users className="w-5 h-5 shrink-0" />
                <span>{t.friendsTab}</span>
              </span>
              {incomingRequestsCount > 0 && (
                <span className="font-mono-tabular text-xs font-bold text-amber-400">
                  {incomingRequestsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('games')}
              className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                activeTab === 'games'
                  ? 'bg-white/[0.08] border border-white/15 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Gamepad2 className="w-5 h-5 shrink-0" />
              <span>{t.gamesTab}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-white/[0.08] border border-white/15 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <UserIcon className="w-5 h-5 shrink-0" />
              <span>{t.profileTab}</span>
            </button>
          </nav>

          <button
            type="button"
            onClick={() => setShowCreatePost(true)}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 hover:from-amber-300 hover:to-amber-400 transition-all cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_25px_-5px_rgba(245,158,11,0.35)]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t.createPost}</span>
          </button>
        </div>

        {/* Bottom User Card */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-colors text-left cursor-pointer"
        >
          {currentUser.photoURL ? (
            <img
              src={currentUser.photoURL}
              alt={currentUser.displayName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center shrink-0">
              {currentUser.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white truncate">
                {currentUser.displayName}
              </p>
              <VerifiedBadge followersCount={currentUser.followersCount} className="w-4 h-4" />
            </div>
            <p className="text-xs text-zinc-400 truncate">@{currentUser.username}</p>
          </div>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 relative overflow-hidden">
        {activeTab === 'feed' && (
          <TikTokFeed
            currentUser={currentUser}
            allUsers={allUsers}
            posts={posts}
            friendships={friendships}
            friendsList={friendsList}
            followingIds={followingIds}
            lang={lang}
            onOpenCreatePost={() => setShowCreatePost(true)}
            onSendFriendRequest={handleSendFriendRequest}
            onToggleFollow={handleToggleFollow}
            onSharePostToFriend={handleSharePostToFriend}
            onGuestToggleLike={handleGuestToggleLike}
            onGuestAddComment={handleGuestAddComment}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView
            currentUser={currentUser}
            friendsList={friendsList}
            chatThreads={chatThreads}
            selectedFriend={selectedChatFriend}
            onSelectFriend={setSelectedChatFriend}
            onGoToFriends={() => setActiveTab('friends')}
            lang={lang}
          />
        )}

        {activeTab === 'friends' && (
          <FriendsView
            currentUser={currentUser}
            allUsers={allUsers}
            friendships={friendships}
            followingIds={followingIds}
            lang={lang}
            onSendFriendRequest={handleSendFriendRequest}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onRemoveFriendship={handleRemoveFriendship}
            onToggleFollow={handleToggleFollow}
            onOpenChatWithFriend={(friend) => {
              setSelectedChatFriend(friend);
              setActiveTab('chat');
            }}
          />
        )}

        {activeTab === 'games' && (
          <GamesView
            currentUser={currentUser}
            friendsList={friendsList}
            lang={lang}
            onGoToFriends={() => setActiveTab('friends')}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            currentUser={currentUser}
            savedAccounts={savedAccounts}
            myPosts={myPosts}
            friendsCount={friendsList.length}
            lang={lang}
            onToggleLang={() => setLang((prev) => (prev === 'ku' ? 'en' : 'ku'))}
            onOpenCreatePost={() => setShowCreatePost(true)}
            onGuestSignOut={handleGuestSignOut}
            onSwitchAccount={handleSwitchAccount}
            onDeleteAccount={handleDeleteAccount}
            onUpdateGuestProfile={handleUpdateGuestProfile}
          />
        )}
      </main>

      {/* Mobile & Tablet iOS 26 Liquid Glass Bottom Dock */}
      <LiquidGlassDock
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        incomingRequestsCount={incomingRequestsCount}
        lang={lang}
        labels={{
          feedTab: t.feedTab,
          chatTab: t.chatTab,
          friendsTab: t.friendsTab,
          gamesTab: t.gamesTab,
          profileTab: t.profileTab,
        }}
      />

      {/* Create Post Modal */}
      {showCreatePost && (
        <CreatePostModal
          currentUser={currentUser}
          friendsList={friendsList}
          lang={lang}
          onClose={() => setShowCreatePost(false)}
          onPublished={() => setActiveTab('feed')}
          onGuestPostCreated={handleGuestCreatePost}
        />
      )}
    </div>
  );
}
