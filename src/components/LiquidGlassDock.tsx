import React, { useRef, useState } from 'react';
import { Film, Gamepad2, MessageCircle, User as UserIcon, Users } from 'lucide-react';
import { ActiveTab, Language } from '../types';

interface LiquidGlassDockProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  incomingRequestsCount: number;
  lang: Language;
  labels: {
    feedTab: string;
    chatTab: string;
    friendsTab: string;
    gamesTab: string;
    profileTab: string;
  };
}

interface DockItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const LiquidGlassDock: React.FC<LiquidGlassDockProps> = ({
  activeTab,
  onSelectTab,
  incomingRequestsCount,
  lang,
  labels,
}) => {
  const isRtl = lang === 'ku';
  const trackRef = useRef<HTMLElement | null>(null);

  const tabs: DockItem[] = [
    { id: 'feed', label: labels.feedTab, icon: Film },
    { id: 'chat', label: labels.chatTab, icon: MessageCircle },
    {
      id: 'friends',
      label: labels.friendsTab,
      icon: Users,
      badge: incomingRequestsCount > 0 ? incomingRequestsCount : undefined,
    },
    { id: 'games', label: labels.gamesTab, icon: Gamepad2 },
    { id: 'profile', label: labels.profileTab, icon: UserIcon },
  ];

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeTab)
  );
  const restVisualIndex = isRtl ? tabs.length - 1 - activeIndex : activeIndex;

  const [isDragging, setIsDragging] = useState(false);
  const [dragVisualFloat, setDragVisualFloat] = useState<number>(restVisualIndex);
  const [hoveredTabIndex, setHoveredTabIndex] = useState<number>(activeIndex);
  const pointerState = useRef<{
    active: boolean;
    startX: number;
    moved: boolean;
  }>({ active: false, startX: 0, moved: false });

  const computePositionFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return { visualFloat: restVisualIndex, tabIndex: activeIndex };
    const rect = el.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const rawRatio = (clientX - rect.left) / width;
    const clampedRatio = Math.min(0.9999, Math.max(0, rawRatio));
    const visualFloat = Math.min(
      tabs.length - 1,
      Math.max(0, clampedRatio * tabs.length - 0.5)
    );
    const visualIndex = Math.min(
      tabs.length - 1,
      Math.max(0, Math.floor(clampedRatio * tabs.length))
    );
    const tabIndex = isRtl ? tabs.length - 1 - visualIndex : visualIndex;
    return { visualFloat, tabIndex };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { visualFloat, tabIndex } = computePositionFromClientX(e.clientX);
    pointerState.current = {
      active: true,
      startX: e.clientX,
      moved: false,
    };
    setDragVisualFloat(visualFloat);
    setHoveredTabIndex(tabIndex);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointerState.current.active) return;
    if (Math.abs(e.clientX - pointerState.current.startX) > 5) {
      pointerState.current.moved = true;
      if (!isDragging) setIsDragging(true);
    }
    const { visualFloat, tabIndex } = computePositionFromClientX(e.clientX);
    setDragVisualFloat(visualFloat);
    setHoveredTabIndex(tabIndex);
  };

  const finishPointerInteraction = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointerState.current.active) return;
    pointerState.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const { tabIndex } = computePositionFromClientX(e.clientX);
    setIsDragging(false);
    const targetTab = tabs[tabIndex];
    if (targetTab) {
      onSelectTab(targetTab.id);
    }
  };

  const currentVisualPos = isDragging ? dragVisualFloat : restVisualIndex;
  const highlightedTabIndex = isDragging ? hoveredTabIndex : activeIndex;

  return (
    <div className="lg:hidden shrink-0 px-3 pt-1 pb-[max(0.65rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent z-50">
      <nav
        ref={trackRef}
        aria-label="Primary Navigation"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        className="relative h-[60px] sm:h-[64px] rounded-[28px] bg-zinc-900/55 backdrop-blur-2xl saturate-180 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.32),inset_0_-1px_1px_rgba(0,0,0,0.4),0_14px_36px_-6px_rgba(0,0,0,0.8)] grid grid-cols-5 items-center p-1 touch-none select-none overflow-hidden"
      >
        {/* Top Specular Liquid Glass Sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/[0.14] via-white/[0.03] to-transparent"
        />

        {/* Sliding / Draggable iOS 26 Liquid Glass Lens */}
        <div
          aria-hidden="true"
          style={{
            width: 'calc(20% - 4px)',
            left: `calc(${currentVisualPos * 20}% + 2px)`,
          }}
          className={`pointer-events-none absolute top-1 bottom-1 rounded-[22px] ${
            isDragging
              ? 'scale-x-105 scale-y-95 bg-gradient-to-b from-amber-300/30 via-white/22 to-white/10 border border-white/50 shadow-[inset_0_2px_3px_rgba(255,255,255,0.7),0_8px_24px_rgba(245,158,11,0.28)]'
              : 'transition-[left,transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1.15,0.36,1)] bg-gradient-to-b from-white/24 via-white/14 to-white/8 border border-white/35 shadow-[inset_0_1.5px_1.5px_rgba(255,255,255,0.55),0_4px_16px_rgba(0,0,0,0.35)]'
          }`}
        />

        {tabs.map((tab, idx) => {
          const Icon = tab.icon;
          const isHighlighted = highlightedTabIndex === idx;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (!pointerState.current.moved) {
                  onSelectTab(tab.id);
                }
              }}
              className={`relative z-10 h-full rounded-[22px] flex flex-col items-center justify-center gap-0.5 min-w-0 transition-transform duration-150 cursor-pointer ${
                isHighlighted
                  ? 'text-amber-300 scale-105'
                  : 'text-zinc-300/85 hover:text-white'
              }`}
            >
              <div className="relative">
                <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5 shrink-0" />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-zinc-950 font-mono-tabular text-[10px] font-extrabold flex items-center justify-center shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-tight truncate max-w-full px-1">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
