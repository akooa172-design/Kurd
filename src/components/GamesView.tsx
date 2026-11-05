import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bot,
  Gamepad2,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { GameSession, Language, UserProfile } from '../types';

interface GamesViewProps {
  currentUser: UserProfile;
  friendsList: UserProfile[];
  lang: Language;
  onGoToFriends: () => void;
}

type SelectedGame = 'menu' | 'tictactoe' | 'rps' | 'memory';
type PlayMode = 'bot' | 'local' | 'friend';

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkTicTacToeWinner(board: string[]): { winner: string | null; line: number[] | null } {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== '')) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

const MEMORY_SYMBOLS = [
  { id: 'sun', emoji: '☀️', label: 'خۆر' },
  { id: 'mountain', emoji: '🏔️', label: 'چیا' },
  { id: 'coffee', emoji: '☕', label: 'قاوە' },
  { id: 'pomegranate', emoji: '🍎', label: 'هەنار' },
  { id: 'music', emoji: '🎵', label: 'مۆسیقا' },
  { id: 'star', emoji: '⭐', label: 'ئەستێرە' },
  { id: 'heart', emoji: '❤️', label: 'دڵ' },
  { id: 'fire', emoji: '🔥', label: 'ئاگر' },
];

function playTone(freq: number, duration = 0.08, muted = false) {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio errors if blocked
  }
}

export const GamesView: React.FC<GamesViewProps> = ({
  currentUser,
  friendsList,
  lang,
  onGoToFriends,
}) => {
  const [selectedGame, setSelectedGame] = useState<SelectedGame>('menu');
  const [muted, setMuted] = useState(false);

  // Real-time 1v1 Friend Games from Firestore
  const [onlineGames, setOnlineGames] = useState<GameSession[]>([]);
  const [activeOnlineGameId, setActiveOnlineGameId] = useState<string | null>(null);
  const [selectedFriendToInvite, setSelectedFriendToInvite] = useState<string>('');

  // Tic-Tac-Toe Local / Bot State
  const [tttMode, setTttMode] = useState<PlayMode>('bot');
  const [tttBoard, setTttBoard] = useState<string[]>(Array(9).fill(''));
  const [tttTurn, setTttTurn] = useState<'X' | 'O'>('X');
  const [tttScores, setTttScores] = useState({ X: 0, O: 0 });

  // Rock-Paper-Scissors State
  const [rpsMode, setRpsMode] = useState<'bot' | 'friend'>('bot');
  const [rpsMyChoice, setRpsMyChoice] = useState<string | null>(null);
  const [rpsBotChoice, setRpsBotChoice] = useState<string | null>(null);
  const [rpsResult, setRpsResult] = useState<string | null>(null);
  const [rpsScores, setRpsScores] = useState({ me: 0, opponent: 0 });

  // Memory Match State
  const [memoryCards, setMemoryCards] = useState<
    { uid: number; id: string; emoji: string; label: string; flipped: boolean; matched: boolean }[]
  >([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [bestMemoryMoves, setBestMemoryMoves] = useState<number | null>(null);

  const friendMap = new Map<string, UserProfile>();
  friendsList.forEach((f) => friendMap.set(f.uid, f));

  // Subscribe to real-time 1v1 games
  useEffect(() => {
    const q = query(
      collection(db, 'games'),
      where('players', 'array-contains', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: GameSession[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GameSession, 'id'>),
        }));
        setOnlineGames(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'games')
    );
    return () => unsub();
  }, [currentUser.uid]);

  const activeOnlineGame = onlineGames.find((g) => g.id === activeOnlineGameId) || null;

  // Initialize Memory Game
  const initMemoryGame = () => {
    const deck = [...MEMORY_SYMBOLS, ...MEMORY_SYMBOLS]
      .sort(() => Math.random() - 0.5)
      .map((item, idx) => ({
        uid: idx,
        id: item.id,
        emoji: item.emoji,
        label: item.label,
        flipped: false,
        matched: false,
      }));
    setMemoryCards(deck);
    setFlippedIndices([]);
    setMemoryMoves(0);
  };

  useEffect(() => {
    if (selectedGame === 'memory' && memoryCards.length === 0) {
      initMemoryGame();
    }
  }, [selectedGame]);

  // Create Online 1v1 Game with Friend
  const handleCreateOnlineGame = async (gameType: 'tictactoe' | 'rps', friendUid: string) => {
    if (!friendUid) return;
    try {
      const docRef = await addDoc(collection(db, 'games'), {
        gameType,
        players: [currentUser.uid, friendUid],
        creatorId: currentUser.uid,
        turnUid: currentUser.uid,
        board: Array(9).fill(''),
        rpsChoices: { [currentUser.uid]: '', [friendUid]: '' },
        scores: { [currentUser.uid]: 0, [friendUid]: 0 },
        status: 'playing',
        winnerUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveOnlineGameId(docRef.id);
      if (gameType === 'tictactoe') {
        setTttMode('friend');
        setSelectedGame('tictactoe');
      } else {
        setRpsMode('friend');
        setSelectedGame('rps');
      }
      playTone(520, 0.1, muted);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'games');
    }
  };

  // Tic-Tac-Toe Local / Bot Move
  const handleTttCellClick = async (index: number) => {
    if (tttMode === 'friend' && activeOnlineGame) {
      if (
        activeOnlineGame.status !== 'playing' ||
        activeOnlineGame.turnUid !== currentUser.uid ||
        !activeOnlineGame.board ||
        activeOnlineGame.board[index] !== ''
      ) {
        return;
      }

      const mySymbol = activeOnlineGame.creatorId === currentUser.uid ? 'X' : 'O';
      const nextBoard = [...activeOnlineGame.board];
      nextBoard[index] = mySymbol;

      const { winner } = checkTicTacToeWinner(nextBoard);
      const opponentUid =
        activeOnlineGame.players.find((p) => p !== currentUser.uid) || currentUser.uid;

      const nextScores = { ...(activeOnlineGame.scores || {}) };
      let nextStatus: 'playing' | 'finished' = 'playing';
      let winnerUid = '';

      if (winner === mySymbol) {
        nextStatus = 'finished';
        winnerUid = currentUser.uid;
        nextScores[currentUser.uid] = (nextScores[currentUser.uid] || 0) + 1;
        playTone(660, 0.18, muted);
      } else if (winner === 'draw') {
        nextStatus = 'finished';
        winnerUid = 'draw';
        playTone(330, 0.15, muted);
      } else {
        playTone(440, 0.07, muted);
      }

      try {
        await updateDoc(doc(db, 'games', activeOnlineGame.id), {
          board: nextBoard,
          turnUid: opponentUid,
          scores: nextScores,
          status: nextStatus,
          winnerUid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `games/${activeOnlineGame.id}`);
      }
      return;
    }

    // Local or Bot mode
    const { winner: currentWinner } = checkTicTacToeWinner(tttBoard);
    if (currentWinner || tttBoard[index] !== '') return;

    const nextBoard = [...tttBoard];
    nextBoard[index] = tttTurn;
    setTttBoard(nextBoard);
    playTone(440, 0.07, muted);

    const { winner } = checkTicTacToeWinner(nextBoard);
    if (winner) {
      if (winner === 'X' || winner === 'O') {
        setTttScores((s) => ({ ...s, [winner]: s[winner] + 1 }));
        playTone(660, 0.18, muted);
      }
      return;
    }

    if (tttMode === 'local') {
      setTttTurn(tttTurn === 'X' ? 'O' : 'X');
    } else if (tttMode === 'bot') {
      setTttTurn('O');
      setTimeout(() => {
        const emptyIndices = nextBoard
          .map((v, i) => (v === '' ? i : -1))
          .filter((i) => i !== -1);
        if (emptyIndices.length === 0) return;
        const randomIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        const botBoard = [...nextBoard];
        botBoard[randomIdx] = 'O';
        setTttBoard(botBoard);
        playTone(380, 0.07, muted);
        const botCheck = checkTicTacToeWinner(botBoard);
        if (botCheck.winner === 'O') {
          setTttScores((s) => ({ ...s, O: s.O + 1 }));
        }
        setTttTurn('X');
      }, 380);
    }
  };

  const handleResetTtt = async () => {
    if (tttMode === 'friend' && activeOnlineGame) {
      try {
        await updateDoc(doc(db, 'games', activeOnlineGame.id), {
          board: Array(9).fill(''),
          turnUid: activeOnlineGame.creatorId,
          status: 'playing',
          winnerUid: '',
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `games/${activeOnlineGame.id}`);
      }
      return;
    }
    setTttBoard(Array(9).fill(''));
    setTttTurn('X');
  };

  // Rock Paper Scissors Handler
  const handleRpsPick = async (choice: 'rock' | 'paper' | 'scissors') => {
    playTone(480, 0.08, muted);

    if (rpsMode === 'friend' && activeOnlineGame) {
      const opponentUid =
        activeOnlineGame.players.find((p) => p !== currentUser.uid) || '';
      const nextChoices = {
        ...(activeOnlineGame.rpsChoices || {}),
        [currentUser.uid]: choice,
      };
      const oppChoice = nextChoices[opponentUid];
      const nextScores = { ...(activeOnlineGame.scores || {}) };
      let nextStatus: 'playing' | 'finished' = 'playing';
      let winnerUid = '';

      if (oppChoice) {
        nextStatus = 'finished';
        if (choice === oppChoice) {
          winnerUid = 'draw';
        } else if (
          (choice === 'rock' && oppChoice === 'scissors') ||
          (choice === 'paper' && oppChoice === 'rock') ||
          (choice === 'scissors' && oppChoice === 'paper')
        ) {
          winnerUid = currentUser.uid;
          nextScores[currentUser.uid] = (nextScores[currentUser.uid] || 0) + 1;
          playTone(660, 0.18, muted);
        } else {
          winnerUid = opponentUid;
          nextScores[opponentUid] = (nextScores[opponentUid] || 0) + 1;
        }
      }

      try {
        await updateDoc(doc(db, 'games', activeOnlineGame.id), {
          rpsChoices: nextChoices,
          scores: nextScores,
          status: nextStatus,
          winnerUid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `games/${activeOnlineGame.id}`);
      }
      return;
    }

    // Bot Mode
    const options: ('rock' | 'paper' | 'scissors')[] = ['rock', 'paper', 'scissors'];
    const botPick = options[Math.floor(Math.random() * 3)];
    setRpsMyChoice(choice);
    setRpsBotChoice(botPick);

    if (choice === botPick) {
      setRpsResult('یەکسانبوون!');
    } else if (
      (choice === 'rock' && botPick === 'scissors') ||
      (choice === 'paper' && botPick === 'rock') ||
      (choice === 'scissors' && botPick === 'paper')
    ) {
      setRpsResult('تۆ بردتەوە! 🎉');
      setRpsScores((s) => ({ ...s, me: s.me + 1 }));
      playTone(660, 0.16, muted);
    } else {
      setRpsResult('کۆمپیوتەر بردیەوە!');
      setRpsScores((s) => ({ ...s, opponent: s.opponent + 1 }));
    }
  };

  const handleResetRpsOnline = async () => {
    if (!activeOnlineGame) return;
    const resetChoices: Record<string, string> = {};
    activeOnlineGame.players.forEach((p) => {
      resetChoices[p] = '';
    });
    try {
      await updateDoc(doc(db, 'games', activeOnlineGame.id), {
        rpsChoices: resetChoices,
        status: 'playing',
        winnerUid: '',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `games/${activeOnlineGame.id}`);
    }
  };

  // Memory Card Click
  const handleMemoryCardClick = (idx: number) => {
    if (
      flippedIndices.length === 2 ||
      memoryCards[idx].flipped ||
      memoryCards[idx].matched
    ) {
      return;
    }

    playTone(500, 0.06, muted);
    const nextCards = memoryCards.map((c, i) =>
      i === idx ? { ...c, flipped: true } : c
    );
    setMemoryCards(nextCards);

    const nextFlipped = [...flippedIndices, idx];
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      const nextMoves = memoryMoves + 1;
      setMemoryMoves(nextMoves);
      const [first, second] = nextFlipped;

      if (nextCards[first].id === nextCards[second].id) {
        playTone(680, 0.14, muted);
        const matchedCards = nextCards.map((c, i) =>
          i === first || i === second ? { ...c, matched: true } : c
        );
        setMemoryCards(matchedCards);
        setFlippedIndices([]);

        if (matchedCards.every((c) => c.matched)) {
          setBestMemoryMoves((prev) =>
            prev === null ? nextMoves : Math.min(prev, nextMoves)
          );
        }
      } else {
        setTimeout(() => {
          setMemoryCards((prev) =>
            prev.map((c, i) =>
              i === first || i === second ? { ...c, flipped: false } : c
            )
          );
          setFlippedIndices([]);
        }, 650);
      }
    }
  };

  const rpsLabel = (c: string | null) => {
    if (c === 'rock') return '🪨 بەرد';
    if (c === 'paper') return '📄 کاغەز';
    if (c === 'scissors') return '✂️ مقەست';
    return '—';
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8 pb-20">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white flex items-center gap-2.5">
              <Gamepad2 className="w-7 h-7 text-amber-400" />
              <span>یارییەکان</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              بە تەنها یان بە شێوەی زیندوو لەگەڵ هاوڕێکانت یاری بکە!
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedGame !== 'menu' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGame('menu');
                  setActiveOnlineGameId(null);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-semibold text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                هەموو یارییەکان
              </button>
            )}
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'دەنگ بکەرەوە' : 'بێدەنگ بکە'}
              className="min-h-[42px] min-w-[42px] rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-800 cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Active Online 1v1 Games with Friends */}
        {selectedGame === 'menu' && onlineGames.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-base font-bold text-amber-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>یارییە زیندووەکان لەگەڵ هاوڕێکان ({onlineGames.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {onlineGames.map((g) => {
                const oppUid = g.players.find((p) => p !== currentUser.uid) || '';
                const opp = friendMap.get(oppUid);
                const gameName =
                  g.gameType === 'tictactoe' ? 'تیک-تاک-تۆ (X و O)' : 'بەرد، کاغەز، مقەست';
                return (
                  <div
                    key={g.id}
                    className="p-4 rounded-2xl bg-zinc-900 border border-amber-500/30 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{gameName}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        لەگەڵ: {opp?.displayName || 'هاوڕێ'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveOnlineGameId(g.id);
                          if (g.gameType === 'tictactoe') {
                            setTttMode('friend');
                            setSelectedGame('tictactoe');
                          } else {
                            setRpsMode('friend');
                            setSelectedGame('rps');
                          }
                        }}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 cursor-pointer"
                      >
                        بچۆ ناو یاری
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc(db, 'games', g.id))}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-xs hover:text-red-400 cursor-pointer"
                      >
                        داخستن
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Games Menu */}
        {selectedGame === 'menu' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Game 1: Tic-Tac-Toe */}
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between space-y-6">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 font-display font-extrabold text-xl flex items-center justify-center mb-4">
                  X/O
                </div>
                <h2 className="font-display text-xl font-bold text-white">
                  تیک-تاک-تۆ (X و O)
                </h2>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  یاری کلاسیکی X و O. دەتوانیت بە شێوەی زیندوو لەگەڵ هاوڕێکەت یان لەگەڵ کۆمپیوتەر یاری بکەیت.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTttMode('bot');
                  setSelectedGame('tictactoe');
                }}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
              >
                دەستپێکردن
              </button>
            </div>

            {/* Game 2: Rock Paper Scissors */}
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between space-y-6">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 text-2xl flex items-center justify-center mb-4">
                  ✂️
                </div>
                <h2 className="font-display text-xl font-bold text-white">
                  بەرد، کاغەز، مقەست
                </h2>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  بزانە کێ دەباتەوە! لەگەڵ هاوڕێکەت بە شێوەی ئۆنلاین یان لەگەڵ کۆمپیوتەر تاقی بکەرەوە.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRpsMode('bot');
                  setSelectedGame('rps');
                }}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
              >
                دەستپێکردن
              </button>
            </div>

            {/* Game 3: Memory Match */}
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between space-y-6">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-400 text-2xl flex items-center justify-center mb-4">
                  🏔️
                </div>
                <h2 className="font-display text-xl font-bold text-white">
                  یاری بیرەوەری
                </h2>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  هەموو وێنە هاوشێوەکان بە کەمترین جوڵە بدۆزەرەوە و ڕیکۆردی نوێ تۆمار بکە.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  initMemoryGame();
                  setSelectedGame('memory');
                }}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
              >
                دەستپێکردن
              </button>
            </div>
          </div>
        )}

        {/* GAME 1: TIC-TAC-TOE */}
        {selectedGame === 'tictactoe' && (() => {
          const isOnline = tttMode === 'friend' && activeOnlineGame;
          const board = isOnline ? activeOnlineGame.board || Array(9).fill('') : tttBoard;
          const { winner, line } = checkTicTacToeWinner(board);
          const mySymbol = isOnline
            ? activeOnlineGame.creatorId === currentUser.uid
              ? 'X'
              : 'O'
            : 'X';
          const oppUid = isOnline
            ? activeOnlineGame.players.find((p) => p !== currentUser.uid) || ''
            : '';
          const opp = friendMap.get(oppUid);

          return (
            <div className="max-w-lg mx-auto space-y-6">
              {/* Mode Selector */}
              <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setTttMode('bot');
                    setActiveOnlineGameId(null);
                    setTttBoard(Array(9).fill(''));
                    setTttTurn('X');
                  }}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    tttMode === 'bot' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  <span>لەگەڵ بۆت</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTttMode('local');
                    setActiveOnlineGameId(null);
                    setTttBoard(Array(9).fill(''));
                    setTttTurn('X');
                  }}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    tttMode === 'local' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>٢ یاریزان</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTttMode('friend')}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    tttMode === 'friend' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ئۆنلاین لەگەڵ هاوڕێ</span>
                </button>
              </div>

              {/* Invite Friend Picker if Friend Mode & no active game */}
              {tttMode === 'friend' && !activeOnlineGame && (
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <p className="text-sm font-semibold text-white">
                    هاوڕێیەک هەڵبژێرە بۆ یاری X و O:
                  </p>
                  {friendsList.length === 0 ? (
                    <button
                      type="button"
                      onClick={onGoToFriends}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 text-xs font-bold cursor-pointer"
                    >
                      زیادکردنی هاوڕێ
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedFriendToInvite}
                        onChange={(e) => setSelectedFriendToInvite(e.target.value)}
                        className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                      >
                        <option value="">هاوڕێیەک هەڵبژێرە...</option>
                        {friendsList.map((f) => (
                          <option key={f.uid} value={f.uid}>
                            {f.displayName} (@{f.username})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedFriendToInvite}
                        onClick={() =>
                          handleCreateOnlineGame('tictactoe', selectedFriendToInvite)
                        }
                        className="min-h-[44px] px-5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs disabled:opacity-50 cursor-pointer"
                      >
                        دەستپێکردن
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Score & Turn Status */}
              {(tttMode !== 'friend' || activeOnlineGame) && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <p className="text-xs text-zinc-400">
                        {isOnline ? `تۆ (${mySymbol})` : 'یاریزانی X'}
                      </p>
                      <p className="font-mono-tabular text-2xl font-bold text-amber-400 mt-1">
                        {isOnline
                          ? activeOnlineGame.scores?.[currentUser.uid] || 0
                          : tttScores.X}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <p className="text-xs text-zinc-400">
                        {isOnline
                          ? `${opp?.displayName || 'هاوڕێ'} (${mySymbol === 'X' ? 'O' : 'X'})`
                          : tttMode === 'bot'
                          ? 'کۆمپیوتەر (O)'
                          : 'یاریزانی O'}
                      </p>
                      <p className="font-mono-tabular text-2xl font-bold text-white mt-1">
                        {isOnline
                          ? activeOnlineGame.scores?.[oppUid] || 0
                          : tttScores.O}
                      </p>
                    </div>
                  </div>

                  {/* Turn / Result Banner */}
                  <div className="text-center py-2">
                    {winner ? (
                      <p className="font-display text-lg font-bold text-amber-400">
                        {winner === 'draw'
                          ? 'یەکسانبوون!'
                          : isOnline
                          ? activeOnlineGame.winnerUid === currentUser.uid
                            ? 'تۆ بردتەوە! 🎉'
                            : `${opp?.displayName || 'هاوڕێکەت'} بردیەوە!`
                          : `براوە: ${winner} 🎉`}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-zinc-300">
                        {isOnline
                          ? activeOnlineGame.turnUid === currentUser.uid
                            ? 'نۆرەی تۆیە'
                            : `نۆرەی ${opp?.displayName || 'هاوڕێکەتە'}...`
                          : `نۆرەی: ${tttTurn}`}
                      </p>
                    )}
                  </div>

                  {/* 3x3 Board */}
                  <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                    {board.map((cell, idx) => {
                      const isWinningCell = line?.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleTttCellClick(idx)}
                          className={`aspect-square min-h-[88px] rounded-2xl font-display text-4xl font-extrabold flex items-center justify-center border transition-all cursor-pointer ${
                            isWinningCell
                              ? 'bg-amber-500 text-zinc-950 border-amber-400 scale-105'
                              : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80'
                          } ${
                            !isWinningCell && cell === 'X'
                              ? 'text-amber-400'
                              : !isWinningCell && cell === 'O'
                              ? 'text-sky-400'
                              : ''
                          }`}
                        >
                          {cell}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={handleResetTtt}
                      className="min-h-[44px] px-6 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm font-semibold text-white flex items-center gap-2 hover:bg-zinc-800 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>دووبارە یاری بکە</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* GAME 2: ROCK PAPER SCISSORS */}
        {selectedGame === 'rps' && (() => {
          const isOnline = rpsMode === 'friend' && activeOnlineGame;
          const oppUid = isOnline
            ? activeOnlineGame.players.find((p) => p !== currentUser.uid) || ''
            : '';
          const opp = friendMap.get(oppUid);
          const myOnlineChoice = isOnline
            ? activeOnlineGame.rpsChoices?.[currentUser.uid] || ''
            : '';
          const oppOnlineChoice = isOnline
            ? activeOnlineGame.rpsChoices?.[oppUid] || ''
            : '';

          return (
            <div className="max-w-lg mx-auto space-y-6">
              <div className="flex items-center justify-center gap-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setRpsMode('bot');
                    setActiveOnlineGameId(null);
                  }}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    rpsMode === 'bot' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  <span>لەگەڵ بۆت</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRpsMode('friend')}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    rpsMode === 'friend' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ئۆنلاین لەگەڵ هاوڕێ</span>
                </button>
              </div>

              {rpsMode === 'friend' && !activeOnlineGame && (
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <p className="text-sm font-semibold text-white">
                    هاوڕێیەک هەڵبژێرە بۆ یاری بەرد، کاغەز، مقەست:
                  </p>
                  {friendsList.length === 0 ? (
                    <button
                      type="button"
                      onClick={onGoToFriends}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 text-xs font-bold cursor-pointer"
                    >
                      زیادکردنی هاوڕێ
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedFriendToInvite}
                        onChange={(e) => setSelectedFriendToInvite(e.target.value)}
                        className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                      >
                        <option value="">هاوڕێیەک هەڵبژێرە...</option>
                        {friendsList.map((f) => (
                          <option key={f.uid} value={f.uid}>
                            {f.displayName} (@{f.username})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedFriendToInvite}
                        onClick={() =>
                          handleCreateOnlineGame('rps', selectedFriendToInvite)
                        }
                        className="min-h-[44px] px-5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs disabled:opacity-50 cursor-pointer"
                      >
                        دەستپێکردن
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(rpsMode !== 'friend' || activeOnlineGame) && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <p className="text-xs text-zinc-400">تۆ</p>
                      <p className="font-mono-tabular text-2xl font-bold text-amber-400 mt-1">
                        {isOnline
                          ? activeOnlineGame.scores?.[currentUser.uid] || 0
                          : rpsScores.me}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                      <p className="text-xs text-zinc-400">
                        {isOnline ? opp?.displayName || 'هاوڕێ' : 'کۆمپیوتەر'}
                      </p>
                      <p className="font-mono-tabular text-2xl font-bold text-white mt-1">
                        {isOnline
                          ? activeOnlineGame.scores?.[oppUid] || 0
                          : rpsScores.opponent}
                      </p>
                    </div>
                  </div>

                  {/* Choice Buttons */}
                  <div className="grid grid-cols-3 gap-3">
                    {(
                      [
                        { id: 'rock', emoji: '🪨', label: 'بەرد' },
                        { id: 'paper', emoji: '📄', label: 'کاغەز' },
                        { id: 'scissors', emoji: '✂️', label: 'مقەست' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={Boolean(isOnline && myOnlineChoice)}
                        onClick={() => handleRpsPick(item.id)}
                        className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-amber-500 flex flex-col items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="text-3xl">{item.emoji}</span>
                        <span className="text-sm font-bold text-white">{item.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Result Area */}
                  {isOnline ? (
                    <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-3">
                      {!myOnlineChoice ? (
                        <p className="text-sm text-zinc-400">دانەیەک هەڵبژێرە!</p>
                      ) : !oppOnlineChoice ? (
                        <p className="text-sm text-amber-400">
                          تۆ {rpsLabel(myOnlineChoice)}ت هەڵبژارد. چاوەڕێی {opp?.displayName || 'هاوڕێکەت'} بکە...
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center justify-center gap-6 text-base font-bold">
                            <span>تۆ: {rpsLabel(myOnlineChoice)}</span>
                            <span className="text-zinc-500">·</span>
                            <span>
                              {opp?.displayName || 'هاوڕێ'}: {rpsLabel(oppOnlineChoice)}
                            </span>
                          </div>
                          <p className="font-display text-lg font-bold text-amber-400">
                            {activeOnlineGame.winnerUid === 'draw'
                              ? 'یەکسانبوون!'
                              : activeOnlineGame.winnerUid === currentUser.uid
                              ? 'تۆ بردتەوە! 🎉'
                              : `${opp?.displayName || 'هاوڕێکەت'} بردیەوە!`}
                          </p>
                          <button
                            type="button"
                            onClick={handleResetRpsOnline}
                            className="min-h-[42px] px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs cursor-pointer"
                          >
                            گەڕێکی تر
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    rpsResult && (
                      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-2">
                        <div className="flex items-center justify-center gap-6 text-sm font-semibold text-zinc-300">
                          <span>تۆ: {rpsLabel(rpsMyChoice)}</span>
                          <span className="text-zinc-500">·</span>
                          <span>کۆمپیوتەر: {rpsLabel(rpsBotChoice)}</span>
                        </div>
                        <p className="font-display text-xl font-bold text-amber-400">
                          {rpsResult}
                        </p>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* GAME 3: MEMORY MATCH */}
        {selectedGame === 'memory' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm">
              <div>
                <span className="text-zinc-400">جوڵەکان: </span>
                <strong className="font-mono-tabular text-white">{memoryMoves}</strong>
              </div>
              {bestMemoryMoves !== null && (
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Trophy className="w-4 h-4" />
                  <span className="font-mono-tabular font-bold">{bestMemoryMoves}</span>
                </div>
              )}
              <button
                type="button"
                onClick={initMemoryGame}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-zinc-800 text-xs font-semibold text-white flex items-center gap-1.5 hover:bg-zinc-700 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>دووبارە</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {memoryCards.map((card, idx) => {
                const isRevealed = card.flipped || card.matched;
                return (
                  <button
                    key={card.uid}
                    type="button"
                    onClick={() => handleMemoryCardClick(idx)}
                    className={`aspect-square min-h-[72px] rounded-2xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                      card.matched
                        ? 'bg-emerald-500/15 border-emerald-500/40'
                        : isRevealed
                        ? 'bg-zinc-800 border-amber-500'
                        : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800/70'
                    }`}
                  >
                    {isRevealed ? (
                      <>
                        <span className="text-2xl sm:text-3xl">{card.emoji}</span>
                        <span className="text-[10px] text-zinc-300 mt-1">{card.label}</span>
                      </>
                    ) : (
                      <span className="font-display text-lg font-bold text-zinc-600">؟</span>
                    )}
                  </button>
                );
              })}
            </div>

            {memoryCards.length > 0 && memoryCards.every((c) => c.matched) && (
              <div className="p-5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-center space-y-3">
                <p className="font-display text-lg font-bold text-amber-300">
                  ئافەرین! هەموو کارتەکانت بە {memoryMoves} جوڵە دۆزیەوە! 🎉
                </p>
                <button
                  type="button"
                  onClick={initMemoryGame}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs cursor-pointer"
                >
                  دووبارە یاری بکە
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
