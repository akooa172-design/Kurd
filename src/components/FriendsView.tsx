import React, { useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  MessageCircle,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { translations } from '../i18n';
import { Friendship, Language, UserProfile } from '../types';
import { formatFollowersCount, VerifiedBadge } from './VerifiedBadge';

interface FriendsViewProps {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  friendships: Friendship[];
  followingIds: Set<string>;
  lang: Language;
  onSendFriendRequest: (targetUid: string) => Promise<void>;
  onAcceptFriendRequest: (friendshipId: string) => Promise<void>;
  onRemoveFriendship: (friendshipId: string) => Promise<void>;
  onToggleFollow: (targetUid: string) => Promise<void>;
  onOpenChatWithFriend: (friend: UserProfile) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUser,
  allUsers,
  friendships,
  followingIds,
  lang,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRemoveFriendship,
  onToggleFollow,
  onOpenChatWithFriend,
}) => {
  const t = translations[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUsername, setCopiedUsername] = useState(false);

  const normalizedQuery = searchQuery
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .split('@')[0];

  const userMap = new Map<string, UserProfile>();
  allUsers.forEach((u) => userMap.set(u.uid, u));

  const incomingRequests = friendships.filter(
    (f) => f.status === 'pending' && f.recipientId === currentUser.uid
  );

  const acceptedFriendships = friendships.filter((f) => f.status === 'accepted');

  const getFriendshipWith = (otherUid: string): Friendship | undefined =>
    friendships.find((f) => f.users.includes(otherUid));

  const otherUsers = allUsers.filter((u) => {
    if (u.uid === currentUser.uid) return false;
    if (!normalizedQuery) return true;
    return (
      u.displayName.toLowerCase().includes(normalizedQuery) ||
      u.username.toLowerCase().includes(normalizedQuery)
    );
  });

  const handleCopyHandle = () => {
    navigator.clipboard?.writeText(`@${currentUser.username}`);
    setCopiedUsername(true);
    setTimeout(() => setCopiedUsername(false), 2000);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Header & My Handle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {t.friendsTab}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {lang === 'ku'
                ? 'هاوڕێکانت بدۆزەرەوە، داوا بنێرە، و ڕاستەوخۆ لە چات قسە بکە.'
                : 'Find friends by name, @username, or email and start chatting.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyHandle}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-2 hover:bg-zinc-800 transition-colors self-start sm:self-auto cursor-pointer"
          >
            {copiedUsername ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">{t.copied}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-amber-400" />
                <span>@{currentUser.username}</span>
              </>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchFriendsPlaceholder}
            className="w-full min-h-[50px] pl-12 pr-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm sm:text-base text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Incoming Friend Requests */}
        {incomingRequests.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-base font-bold text-white">
              {t.incomingRequests} ({incomingRequests.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {incomingRequests.map((req) => {
                const sender = userMap.get(req.requesterId);
                if (!sender) return null;
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {sender.photoURL ? (
                        <img
                          src={sender.photoURL}
                          alt={sender.displayName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center shrink-0">
                          {sender.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {sender.displayName}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">@{sender.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onAcceptFriendRequest(req.id)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 hover:bg-amber-400 transition-colors cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>{t.accept}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFriendship(req.id)}
                        aria-label={t.decline}
                        className="min-h-[40px] min-w-[40px] rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* My Friends List */}
        <section className="space-y-3">
          <h2 className="font-display text-base font-bold text-white">
            {t.myFriends} ({acceptedFriendships.length})
          </h2>
          {acceptedFriendships.length === 0 ? (
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 text-sm text-zinc-400">
              {t.noFriendsYet}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {acceptedFriendships.map((f) => {
                const friendUid = f.users.find((u) => u !== currentUser.uid) || '';
                const friend = userMap.get(friendUid);
                if (!friend) return null;
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {friend.photoURL ? (
                        <img
                          src={friend.photoURL}
                          alt={friend.displayName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center shrink-0">
                          {friend.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-white truncate">
                            {friend.displayName}
                          </p>
                          <VerifiedBadge followersCount={friend.followersCount} className="w-4 h-4" />
                        </div>
                        <p className="text-xs text-zinc-400 truncate">
                          @{friend.username} · {formatFollowersCount(friend.followersCount)}{' '}
                          {lang === 'ku' ? 'فۆڵۆوەر' : 'followers'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenChatWithFriend(friend)}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 hover:bg-amber-400 transition-colors cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{t.message}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFriendship(f.id)}
                        title="لابردنی هاوڕێ"
                        className="min-h-[40px] min-w-[40px] rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center hover:text-red-400 hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Discover & Add Friends */}
        <section className="space-y-3 pb-12">
          <h2 className="font-display text-base font-bold text-white">
            {t.discoverPeople}
          </h2>
          {otherUsers.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">
              {lang === 'ku'
                ? 'هێشتا هیچ کەسێکی تر نەدۆزرایەوە. لینکی وێبسایتەکە بۆ هاوڕێکانت بنێرە!'
                : 'No other users found yet. Share the app link with your friends so they can sign in with Google!'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {otherUsers.map((person) => {
                const existingFriendship = getFriendshipWith(person.uid);
                return (
                  <div
                    key={person.uid}
                    className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {person.photoURL ? (
                        <img
                          src={person.photoURL}
                          alt={person.displayName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-zinc-800 text-amber-400 font-bold text-sm flex items-center justify-center shrink-0">
                          {person.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-white truncate">
                            {person.displayName}
                          </p>
                          <VerifiedBadge followersCount={person.followersCount} className="w-4 h-4" />
                        </div>
                        <p className="text-xs text-zinc-400 truncate">
                          @{person.username} · {formatFollowersCount(person.followersCount)}{' '}
                          {lang === 'ku' ? 'فۆڵۆوەر' : 'followers'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleFollow(person.uid)}
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          followingIds.has(person.uid)
                            ? 'bg-zinc-800 text-amber-400 border border-amber-500/30 hover:bg-zinc-700'
                            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        {followingIds.has(person.uid)
                          ? lang === 'ku'
                            ? 'فۆڵۆوکراوە'
                            : 'Following'
                          : lang === 'ku'
                          ? 'فۆڵۆو'
                          : 'Follow'}
                      </button>

                      {!existingFriendship ? (
                        <button
                          type="button"
                          onClick={() => onSendFriendRequest(person.uid)}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-200 transition-colors cursor-pointer"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>{t.addFriend}</span>
                        </button>
                      ) : existingFriendship.status === 'accepted' ? (
                        <button
                          type="button"
                          onClick={() => onOpenChatWithFriend(person)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-zinc-800 text-emerald-300 font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-700 transition-colors cursor-pointer"
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>{t.friendAdded}</span>
                        </button>
                      ) : existingFriendship.requesterId === currentUser.uid ? (
                        <button
                          type="button"
                          onClick={() => onRemoveFriendship(existingFriendship.id)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-semibold text-xs flex items-center gap-1.5 hover:bg-zinc-700 transition-colors cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{t.requestSent}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAcceptFriendRequest(existingFriendship.id)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 hover:bg-amber-400 transition-colors cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>{t.accept}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
