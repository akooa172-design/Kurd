import { Timestamp } from 'firebase/firestore';

export type Language = 'ku' | 'en';

export type ActiveTab = 'feed' | 'chat' | 'friends' | 'games' | 'profile';

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  age?: number;
  isGuest?: boolean;
  photoURL?: string;
  bio?: string;
  followersCount?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Friendship {
  id: string;
  users: string[];
  requesterId: string;
  recipientId: string;
  status: 'pending' | 'accepted';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ChatThread {
  id: string;
  participants: string[];
  lastMessage: string;
  lastSenderId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ChatMessage {
  id: string;
  participants: string[];
  senderId: string;
  text: string;
  type: 'text' | 'post_share' | 'image' | 'file';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  sharedPostId?: string;
  sharedPostCaption?: string;
  sharedPostMedia?: string;
  createdAt?: Timestamp;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto?: string;
  caption: string;
  mediaType: 'video' | 'image';
  mediaUrl: string;
  musicTitle?: string;
  musicUrl?: string;
  overlayText?: string;
  overlayColor?: string;
  overlayPosition?: 'top' | 'center' | 'bottom';
  videoFilter?: string;
  taggedUsers?: string[];
  likesCount: number;
  commentsCount: number;
  visibility: 'public' | 'friends';
  createdAt?: Timestamp;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  createdAt?: Timestamp;
}

export interface GameSession {
  id: string;
  gameType: 'tictactoe' | 'rps';
  players: string[];
  creatorId: string;
  turnUid?: string;
  board?: string[];
  rpsChoices?: Record<string, string>;
  scores?: Record<string, number>;
  status: 'playing' | 'finished';
  winnerUid?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
