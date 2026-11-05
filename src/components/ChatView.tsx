import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  Send,
  UserPlus,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { translations } from '../i18n';
import { ChatMessage, ChatThread, Language, UserProfile } from '../types';
import { compressImageFile, fileToDataUrl, getDeterministicId } from '../utils/media';
import { VerifiedBadge } from './VerifiedBadge';

interface ChatViewProps {
  currentUser: UserProfile;
  friendsList: UserProfile[];
  chatThreads: ChatThread[];
  selectedFriend: UserProfile | null;
  onSelectFriend: (friend: UserProfile | null) => void;
  onGoToFriends: () => void;
  lang: Language;
}

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '👏', '🙌'];
const MAX_CHAT_FILE_BYTES = 400 * 1024;

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentUser,
  friendsList,
  chatThreads,
  selectedFriend,
  onSelectFriend,
  onGoToFriends,
  lang,
}) => {
  const t = translations[lang];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeChatId = selectedFriend
    ? getDeterministicId(currentUser.uid, selectedFriend.uid)
    : null;

  const threadMap = new Map<string, ChatThread>();
  chatThreads.forEach((th) => threadMap.set(th.id, th));

  useEffect(() => {
    setUploadError(null);
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', activeChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        }));
        setMessages(list);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `chats/${activeChatId}/messages`);
      }
    );

    return () => unsub();
  }, [activeChatId]);

  const upsertChatThread = async (lastMsgPreview: string) => {
    if (!selectedFriend || !activeChatId) return;
    const chatRef = doc(db, 'chats', activeChatId);
    const chatSnap = await getDoc(chatRef);
    const participants = [currentUser.uid, selectedFriend.uid].sort();

    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        participants,
        lastMessage: lastMsgPreview.slice(0, 500),
        lastSenderId: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(chatRef, {
        lastMessage: lastMsgPreview.slice(0, 500),
        lastSenderId: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
    }
    return participants;
  };

  const sendMessage = async (msgText: string) => {
    if (!selectedFriend || !activeChatId || !msgText.trim() || sending) return;
    const cleanText = msgText.trim().slice(0, 2000);
    setSending(true);
    setUploadError(null);
    try {
      const participants = await upsertChatThread(cleanText);
      if (!participants) return;

      await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
        participants,
        senderId: currentUser.uid,
        text: cleanText,
        type: 'text',
        createdAt: serverTimestamp(),
      });

      setText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${activeChatId}/messages`);
    } finally {
      setSending(false);
    }
  };

  const handleSendAttachment = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedFriend || !activeChatId || sending) return;

    setUploadError(null);
    setSending(true);
    try {
      const isImg = kind === 'image' || file.type.startsWith('image/');
      if (isImg) {
        const compressed = await compressImageFile(file, 900, 0.8);
        const previewText = lang === 'ku' ? '📷 وێنە' : '📷 Photo';
        const participants = await upsertChatThread(previewText);
        if (!participants) return;

        await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
          participants,
          senderId: currentUser.uid,
          text: text.trim().slice(0, 2000) || previewText,
          type: 'image',
          mediaUrl: compressed,
          fileName: file.name.slice(0, 200),
          createdAt: serverTimestamp(),
        });
        setText('');
      } else {
        if (file.size > MAX_CHAT_FILE_BYTES) {
          setUploadError(
            lang === 'ku'
              ? 'قەبارەی فایلەکە نابێت لە ٤٠٠ کیلۆبایت زیاتر بێت.'
              : 'File size must be under 400 KB.'
          );
          setSending(false);
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        if (dataUrl.length > 590000) {
          setUploadError(
            lang === 'ku'
              ? 'قەبارەی فایلەکە زۆر گەورەیە.'
              : 'File is too large to send.'
          );
          setSending(false);
          return;
        }
        const previewText = `📎 ${file.name.slice(0, 120)}`;
        const participants = await upsertChatThread(previewText);
        if (!participants) return;

        await addDoc(collection(db, 'chats', activeChatId, 'messages'), {
          participants,
          senderId: currentUser.uid,
          text: text.trim().slice(0, 2000) || file.name.slice(0, 200),
          type: 'file',
          mediaUrl: dataUrl,
          fileName: file.name.slice(0, 200),
          fileSize: file.size,
          createdAt: serverTimestamp(),
        });
        setText('');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${activeChatId}/messages`);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(text);
  };

  return (
    <div className="h-full w-full bg-zinc-950 text-zinc-100 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden">
      {/* Left Friends & Threads List */}
      <div
        className={`lg:col-span-4 border-r border-zinc-800/80 flex flex-col h-full overflow-hidden ${
          selectedFriend ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-white">{t.chatTab}</h1>
          <button
            type="button"
            onClick={onGoToFriends}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-amber-400 flex items-center gap-1.5 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t.addFriend}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
          {friendsList.length === 0 ? (
            <div className="p-6 text-center space-y-4 mt-8">
              <MessageCircle className="w-10 h-10 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-400">{t.noFriendsYet}</p>
              <button
                type="button"
                onClick={onGoToFriends}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
              >
                {t.addFriend}
              </button>
            </div>
          ) : (
            friendsList.map((friend) => {
              const cid = getDeterministicId(currentUser.uid, friend.uid);
              const thread = threadMap.get(cid);
              const isSelected = selectedFriend?.uid === friend.uid;

              return (
                <button
                  key={friend.uid}
                  type="button"
                  onClick={() => onSelectFriend(friend)}
                  className={`w-full px-5 py-3.5 flex items-center gap-3.5 text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'
                  }`}
                >
                  {friend.photoURL ? (
                    <img
                      src={friend.photoURL}
                      alt={friend.displayName}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-amber-500 text-zinc-950 font-bold text-base flex items-center justify-center shrink-0">
                      {friend.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-white truncate">
                        {friend.displayName}
                      </p>
                      <VerifiedBadge followersCount={friend.followersCount} className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {thread?.lastMessage || `@${friend.username}`}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Active Conversation */}
      <div
        className={`lg:col-span-8 flex flex-col h-full overflow-hidden bg-zinc-950 ${
          selectedFriend ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {!selectedFriend ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 mb-4">
              <MessageCircle className="w-7 h-7" />
            </div>
            <p className="font-display text-lg font-bold text-white">{t.selectChat}</p>
            <p className="mt-1 text-sm text-zinc-400 max-w-sm">
              {lang === 'ku'
                ? 'نامە، وێنە، فایل و پۆستەکانی تیکتۆک ڕاستەوخۆ بۆ هاوڕێکانت بنێرە.'
                : 'Send real-time messages, photos, files, and reels directly with your friends.'}
            </p>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-zinc-800/80 flex items-center gap-3 bg-zinc-950">
              <button
                type="button"
                onClick={() => onSelectFriend(null)}
                aria-label="گەڕانەوە بۆ چاتەکان"
                className="lg:hidden min-h-[40px] min-w-[40px] rounded-xl text-zinc-300 hover:bg-zinc-900 flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {selectedFriend.photoURL ? (
                <img
                  src={selectedFriend.photoURL}
                  alt={selectedFriend.displayName}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-amber-500 text-zinc-950 font-bold text-sm flex items-center justify-center shrink-0">
                  {selectedFriend.displayName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    {selectedFriend.displayName}
                  </h2>
                  <VerifiedBadge followersCount={selectedFriend.followersCount} className="w-4 h-4" />
                </div>
                <p className="text-xs text-zinc-400 truncate">@{selectedFriend.username}</p>
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-zinc-500">
                  {lang === 'ku'
                    ? `سڵاو لە ${selectedFriend.displayName} بکە!`
                    : `Say hello to ${selectedFriend.displayName}!`}
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === currentUser.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      {msg.type === 'post_share' && msg.sharedPostMedia && (
                        <div className="mb-1.5 w-48 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-lg">
                          <div className="aspect-[9/16] relative bg-zinc-950">
                            <img
                              src={msg.sharedPostMedia}
                              alt={msg.sharedPostCaption || 'Shared reel'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-semibold text-white flex items-center gap-1">
                              <Film className="w-3 h-3 text-amber-400" />
                              <span>پۆست</span>
                            </div>
                          </div>
                          {msg.sharedPostCaption && (
                            <p className="p-2.5 text-xs text-zinc-200 line-clamp-2">
                              {msg.sharedPostCaption}
                            </p>
                          )}
                        </div>
                      )}

                      {msg.type === 'image' && msg.mediaUrl && (
                        <div className="mb-1.5 max-w-[260px] sm:max-w-xs rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-lg relative group">
                          <img
                            src={msg.mediaUrl}
                            alt={msg.fileName || 'وێنە'}
                            className="w-full max-h-80 object-cover"
                          />
                          <a
                            href={msg.mediaUrl}
                            download={msg.fileName || 'kurdtick-photo.jpg'}
                            title={lang === 'ku' ? 'داگرتنی وێنە' : 'Download photo'}
                            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/70 backdrop-blur-md text-white flex items-center justify-center hover:bg-black transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      )}

                      {msg.type === 'file' && msg.mediaUrl && (
                        <div
                          className={`mb-1 max-w-[280px] sm:max-w-sm p-3 rounded-2xl border flex items-center gap-3 ${
                            isMe
                              ? 'bg-amber-500/15 border-amber-500/40 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-100'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-semibold truncate">
                              {msg.fileName || 'فایل'}
                            </p>
                            {msg.fileSize && (
                              <p className="text-[11px] text-zinc-400 font-mono-tabular">
                                {formatFileSize(msg.fileSize)}
                              </p>
                            )}
                          </div>
                          <a
                            href={msg.mediaUrl}
                            download={msg.fileName || 'file'}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-500 text-zinc-950 text-xs font-bold flex items-center gap-1 hover:bg-amber-400 transition-colors shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{lang === 'ku' ? 'داگرتن' : 'Save'}</span>
                          </a>
                        </div>
                      )}

                      {(msg.type === 'text' ||
                        msg.type === 'post_share' ||
                        (msg.text && msg.text !== '📷 وێنە' && msg.text !== '📷 Photo' && msg.text !== msg.fileName)) && (
                        <div
                          className={`max-w-[78%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                            isMe
                              ? 'bg-amber-500 text-zinc-950 font-medium rounded-br-sm'
                              : 'bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-bl-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Emoji Bar & Message Input */}
            <div className="p-3 sm:p-4 border-t border-zinc-800/80 bg-zinc-950 space-y-2.5">
              {uploadError && (
                <div className="px-3.5 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
                  {uploadError}
                </div>
              )}

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => sendMessage(emoji)}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-sm transition-colors cursor-pointer shrink-0"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2">
                {/* Send Photo Button */}
                <label
                  title={lang === 'ku' ? 'ناردنی وێنە' : 'Send photo'}
                  className="h-11 w-11 sm:min-h-[46px] sm:min-w-[46px] rounded-xl bg-zinc-900 border border-zinc-800 text-amber-400 hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <ImageIcon className="w-5 h-5" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSendAttachment(e, 'image')}
                    disabled={sending}
                    className="hidden"
                  />
                </label>

                {/* Send File Button */}
                <label
                  title={lang === 'ku' ? 'ناردنی فایل' : 'Send file'}
                  className="h-11 w-11 sm:min-h-[46px] sm:min-w-[46px] rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                  <input
                    type="file"
                    onChange={(e) => handleSendAttachment(e, 'file')}
                    disabled={sending}
                    className="hidden"
                  />
                </label>

                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t.typeMessage}
                  maxLength={2000}
                  className="flex-1 min-w-0 h-11 sm:min-h-[46px] px-3 sm:px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  aria-label={t.send}
                  className="h-11 sm:min-h-[46px] px-3.5 sm:px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm flex items-center gap-2 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.send}</span>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
