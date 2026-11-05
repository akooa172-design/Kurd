import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc } from 'firebase/firestore';
import reelMountainDrive from '../assets/images/reel_mountain_drive_1793883221081.jpg';
import reelMusicStudio from '../assets/images/reel_music_studio_1793883220901.jpg';
import reelNightCafe from '../assets/images/reel_night_cafe_1793883221757.jpg';
import reelStreetBazaar from '../assets/images/reel_street_bazaar_1793883222003.jpg';
import { db } from '../firebase';
import { UserProfile } from '../types';

export const STARTER_REELS = [
  {
    id: 'starter_reel_ckb_1',
    mediaType: 'image' as const,
    mediaUrl: reelMountainDrive,
    caption: 'گەشتی ئێواران بە ڕێگای شاخاویدا. دیمەنێکی بێوێنەیە! #کوردستان #شاخ #گەشت',
    musicTitle: 'خۆرئاوابوون — مۆسیقای هێمن',
  },
  {
    id: 'starter_reel_ckb_2',
    mediaType: 'image' as const,
    mediaUrl: reelNightCafe,
    caption: 'قاوەی ئێواران لەسەر بان لەگەڵ هاوڕێکان. قسەی خۆش و ڕووناکی گەرم. #قاوە #ئێوارە',
    musicTitle: 'قاوەی ئێواران — Lo-Fi',
  },
  {
    id: 'starter_reel_ckb_3',
    mediaType: 'image' as const,
    mediaUrl: reelMusicStudio,
    caption: 'کاری مۆسیقا لە ستۆدیۆ بە شەو. بیتێکی نوێ بە زوویی دێت! #مۆسیقا #ستۆدیۆ',
    musicTitle: 'خەونی ستۆدیۆ — بیتی نوێ',
  },
  {
    id: 'starter_reel_ckb_4',
    mediaType: 'image' as const,
    mediaUrl: reelStreetBazaar,
    caption: 'شەربەتی هەناری تازە و ڕووناکی بازاڕی شەو. #بازاڕ #خواردن #کوردستان',
    musicTitle: 'بازاڕی شەو — ڕیتمی فۆلک',
  },
];

export async function seedStarterPostsIfEmpty(user: UserProfile): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, 'posts'), limit(1)));
    if (!snap.empty) return;

    for (const reel of STARTER_REELS) {
      await setDoc(doc(db, 'posts', reel.id), {
        authorId: user.uid,
        authorName: user.displayName,
        authorUsername: user.username,
        authorPhoto: user.photoURL || '',
        caption: reel.caption,
        mediaType: reel.mediaType,
        mediaUrl: reel.mediaUrl,
        musicTitle: reel.musicTitle,
        likesCount: 0,
        commentsCount: 0,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Starter reels seed skipped:', err);
  }
}

export function compressImageFile(file: File, maxWidth = 720, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function getDeterministicId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}
