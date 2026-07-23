"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  Flame, ZoomIn, ZoomOut, RefreshCw, ArrowLeft
} from "lucide-react";
import Link from "next/link";
import {
  Player,
  KillLogEntry,
  GameState,
  fetchStateFromRemote
} from "../spoonsApi";

const CAMP_EMOJIS = ["⛺", "🌲", "🛶", "🐿️", "🐻", "🦌", "🔥", "🦅", "🦉"];

const getCampEmoji = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CAMP_EMOJIS[Math.abs(hash) % CAMP_EMOJIS.length];
};

// --- Campfire Graphic Component ---
const CampfireGraphic = () => (
  <div className="relative w-24 h-24 mx-auto flex items-end justify-center pb-4 animate-pulse">
    {/* Glow base */}
    <div className="absolute inset-0 bg-radial-gradient from-amber-500/20 to-transparent blur-xl rounded-full" />
    
    {/* Logs */}
    <div className="absolute w-10 h-2 bg-amber-900/60 rounded-full rotate-12 translate-y-1" />
    <div className="absolute w-10 h-2 bg-amber-950/80 rounded-full -rotate-12 translate-y-1" />
    
    {/* Flames */}
    <div className="flex items-end gap-0.5 z-10">
      <div className="w-2.5 h-12 bg-gradient-to-t from-red-600 via-amber-500 to-yellow-300 rounded-full animate-flicker opacity-90" />
      <div className="w-3.5 h-14 bg-gradient-to-t from-red-600 via-orange-500 to-yellow-200 rounded-full animate-flicker delay-75" />
      <div className="w-2.5 h-10 bg-gradient-to-t from-red-600 via-amber-500 to-yellow-300 rounded-full animate-flicker delay-150 opacity-90" />
    </div>

    {/* Spark particles */}
    <div className="absolute w-1 h-1 bg-yellow-300 rounded-full animate-spark" style={{ "--spark-x": "12px", left: "45%", animationDelay: "0s" } as React.CSSProperties} />
    <div className="absolute w-1.5 h-1.5 bg-amber-400 rounded-full animate-spark" style={{ "--spark-x": "-15px", left: "50%", animationDelay: "0.5s" } as React.CSSProperties} />
    <div className="absolute w-1 h-1 bg-yellow-200 rounded-full animate-spark" style={{ "--spark-x": "8px", left: "55%", animationDelay: "1.2s" } as React.CSSProperties} />
  </div>
);

// --- Lineage Tree Interface and Helpers ---
interface TreeNode {
  id: string;
  name: string;
  isDead: boolean;
  eliminatedBy?: string;
  children: TreeNode[];
}

const buildLineageTrees = (players: Player[], killLog: KillLogEntry[]): TreeNode[] => {
  const nodesMap: Record<string, TreeNode> = {};
  players.forEach(p => {
    nodesMap[p.name] = {
      id: p.id,
      name: p.name,
      isDead: p.isDead,
      eliminatedBy: p.eliminatedBy || undefined,
      children: []
    };
  });

  // Helper to find a node key in nodesMap matching name case-insensitively and trimmed
  const findNodeKey = (name: string): string | undefined => {
    const clean = name.trim().toLowerCase();
    return Object.keys(nodesMap).find(k => k.trim().toLowerCase() === clean);
  };

  // Link children to their killers
  players.forEach(p => {
    const node = nodesMap[p.name];
    if (p.isDead && p.eliminatedBy) {
      const killerKey = findNodeKey(p.eliminatedBy);
      if (killerKey && nodesMap[killerKey]) {
        nodesMap[killerKey].children.push(node);
      }
    }
  });

  // Sort children of each node chronologically by when they were killed
  players.forEach(p => {
    const node = nodesMap[p.name];
    if (node.children.length > 0) {
      node.children.sort((a, b) => {
        const idxA = killLog.findIndex(l => l.victimName === a.name);
        const idxB = killLog.findIndex(l => l.victimName === b.name);
        return idxA - idxB;
      });
    }
  });

  // Roots of lineages: Players who have made kills and have no parent in the forest
  const roots: TreeNode[] = [];
  players.forEach(p => {
    const node = nodesMap[p.name];
    if (node.children.length > 0) {
      const parentKey = p.isDead && p.eliminatedBy ? findNodeKey(p.eliminatedBy) : undefined;
      const hasParent = parentKey && nodesMap[parentKey];
      if (!hasParent) {
        roots.push(node);
      }
    }
  });

  return roots;
};

const getVictimOrdinal = (victimName: string, killerName: string, players: Player[], killLog: KillLogEntry[]): string | undefined => {
  const cleanKiller = killerName.trim().toLowerCase();
  const victims = players.filter(p => p.isDead && p.eliminatedBy && p.eliminatedBy.trim().toLowerCase() === cleanKiller);
  victims.sort((a, b) => {
    const idxA = killLog.findIndex(l => l.victimName === a.name);
    const idxB = killLog.findIndex(l => l.victimName === b.name);
    return idxA - idxB;
  });
  const index = victims.findIndex(v => v.name === victimName);
  if (index === -1) return undefined;
  const order = index + 1;
  if (order === 1) return "1st";
  if (order === 2) return "2nd";
  if (order === 3) return "3rd";
  return `${order}th`;
};

interface FlatLayoutNode {
  id: string;
  name: string;
  isDead: boolean;
  eliminatedBy?: string;
  x: number;
  y: number;
  parentId: string | null;
  depth: number;
}

const computeVerticalForestLayout = (trees: TreeNode[]): FlatLayoutNode[] => {
  const flatNodes: FlatLayoutNode[] = [];
  let currentY = 0;

  const traverse = (node: TreeNode, depth: number, parentId: string | null) => {
    const x = 100 + depth * 80;
    const y = 50 + currentY * 95;
    currentY++;

    flatNodes.push({
      id: node.id,
      name: node.name,
      isDead: node.isDead,
      eliminatedBy: node.eliminatedBy,
      x,
      y,
      parentId,
      depth
    });

    const reversedChildren = [...node.children].reverse();
    reversedChildren.forEach(child => {
      traverse(child, depth + 1, node.id);
    });
  };

  trees.forEach(tree => {
    traverse(tree, 0, null);
    currentY += 0.45;
  });

  return flatNodes;
};

const getLineageNames = (name: string, players: Player[]): Set<string> => {
  const lineage = new Set<string>();
  if (!name) return lineage;
  lineage.add(name);

  let current = players.find(p => p.name === name);
  while (current && current.isDead && current.eliminatedBy) {
    const killerName = current.eliminatedBy;
    lineage.add(killerName);
    current = players.find(p => p.name === killerName);
  }

  const addDescendants = (n: string) => {
    players.forEach(p => {
      if (p.isDead && p.eliminatedBy === n && !lineage.has(p.name)) {
        lineage.add(p.name);
        addDescendants(p.name);
      }
    });
  };
  addDescendants(name);

  return lineage;
};

export default function LiveMapPage() {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    killLog: [],
    signUpEnabled: true,
    gameStarted: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load from local storage immediately on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("spoons_local_gamestate_v8");
      if (stored) {
        setGameState(JSON.parse(stored));
      }
      setIsLoading(false);
    }
  }, []);

  // Fetch state helper from Google Sheet
  const syncWithRemote = useCallback(async () => {
    setIsSyncing(true);
    try {
      const remote = await fetchStateFromRemote();
      if (remote) {
        setGameState(prev => {
          const sanitizedPlayers = remote.players.map(p => ({
            ...p,
            pin: "",
            targetId: null
          }));
          const merged = {
            ...prev,
            players: sanitizedPlayers,
            killLog: remote.killLog,
            gameStarted: remote.gameStarted
          };
          localStorage.setItem("spoons_local_gamestate_v8", JSON.stringify(merged));
          return merged;
        });
        const dateStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSyncTime(dateStr);
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // background polling sync
  useEffect(() => {
    syncWithRemote();
    const interval = setInterval(() => {
      syncWithRemote();
    }, 15000);
    return () => clearInterval(interval);
  }, [syncWithRemote]);

  const trees = useMemo(() => buildLineageTrees(gameState.players, gameState.killLog), [gameState.players, gameState.killLog]);

  const hasAnyKills = useMemo(() => {
    return gameState.players.some(p => p.isDead);
  }, [gameState.players]);

  const maxDepth = useMemo(() => {
    if (trees.length === 0) return 0;
    const getMaxDepth = (node: TreeNode): number => {
      if (node.children.length === 0) return 0;
      return 1 + Math.max(...node.children.map(getMaxDepth));
    };
    return Math.max(...trees.map(getMaxDepth));
  }, [trees]);

  const layoutNodes = useMemo(() => {
    return computeVerticalForestLayout(trees);
  }, [trees]);

  const canvasWidth = useMemo(() => {
    return (maxDepth + 1) * 80 + 200;
  }, [maxDepth]);

  const canvasHeight = useMemo(() => {
    if (layoutNodes.length === 0) return 240;
    const maxY = Math.max(...layoutNodes.map(n => n.y));
    return maxY + 80;
  }, [layoutNodes]);

  const handleReset = () => {
    setZoom(1);
  };

  const connectionPaths = useMemo(() => {
    const paths: { 
      from: { x: number; y: number; name: string }; 
      to: { x: number; y: number; name: string }; 
      key: string 
    }[] = [];
    layoutNodes.forEach(node => {
      if (node.parentId) {
        const parent = layoutNodes.find(n => n.id === node.parentId);
        if (parent) {
          paths.push({
            from: { x: parent.x, y: parent.y, name: parent.name },
            to: { x: node.x, y: node.y, name: node.name },
            key: `path-${parent.id}-${node.id}`
          });
        }
      }
    });
    return paths;
  }, [layoutNodes]);

  const activeLineageNames = useMemo(() => {
    if (!hoveredName) return new Set<string>();
    return getLineageNames(hoveredName, gameState.players);
  }, [hoveredName, gameState.players]);

  const hasHighlight = false;

  const aliveCount = useMemo(() => gameState.players.filter(p => !p.isDead).length, [gameState.players]);
  const deadCount = useMemo(() => gameState.players.filter(p => p.isDead).length, [gameState.players]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex flex-col items-center justify-center text-slate-400 font-sans">
        <Flame className="animate-spin text-[#2d6a4f] mb-2" size={32} />
        <p className="text-xs font-bold uppercase tracking-wider">Gathering Campfire Data...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#fdfbf7] flex flex-col overflow-hidden relative p-4 md:p-6 font-sans text-[#1c2826]">
      {/* CSS animations for premium graphics */}
      <style>{`
        @keyframes flicker {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px #d97706); }
          50% { transform: scale(1.06) translateY(-1px); filter: drop-shadow(0 0 8px #f59e0b); }
        }
        @keyframes spark-rise {
          0% { transform: translateY(0) scale(1) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.8; }
          100% { transform: translateY(-60px) scale(0.2) translateX(var(--spark-x, 10px)); opacity: 0; }
        }
        .animate-flicker {
          animation: flicker 1.8s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .animate-spark {
          animation: spark-rise 2s ease-out infinite;
        }
        @keyframes flow {
          to {
            stroke-dashoffset: -20;
          }
        }
        .flow-active {
          stroke-dasharray: 8, 4;
          animation: flow 1.2s linear infinite;
        }
        .flow-active-fast {
          stroke-dasharray: 6, 3;
          animation: flow 0.6s linear infinite;
        }
        .grid-backdrop {
          position: relative;
          background-image: 
            radial-gradient(#2d6a4f 1.2px, transparent 1.2px),
            linear-gradient(to right, rgba(45, 106, 79, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(45, 106, 79, 0.04) 1px, transparent 1px);
          background-size: 24px 24px, 120px 120px, 120px 120px;
          background-position: center;
        }
        @keyframes float-particles {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.15; }
          50% { transform: translateY(-12px) rotate(180deg); opacity: 0.5; }
        }
        .particle {
          position: absolute;
          width: 3px;
          height: 3px;
          background: #d97706;
          border-radius: 50%;
          pointer-events: none;
          animation: float-particles 5s ease-in-out infinite;
          z-index: 1;
        }
      `}</style>

      {/* Decorative HUD coordinates for HUD aesthetic */}
      <div className="absolute top-2 left-6 text-[7px] font-mono text-[#2d6a4f]/35 pointer-events-none tracking-widest hidden md:block">
        COORD // 44.3142° N, 71.9751° W // ALT 1,280M
      </div>
      <div className="absolute bottom-2 right-6 text-[7px] font-mono text-[#2d6a4f]/35 pointer-events-none tracking-widest hidden md:block">
        SYS // GRID SEC-ALPHA // STATUS // LIVE STREAM SCREEN
      </div>

      {/* Top HUD panel */}
      <header className="z-10 bg-white/95 backdrop-blur-md border border-[#dce6e1] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link 
            href="/" 
            className="bg-[#f0f4f1] hover:bg-[#dce6e1] text-[#1b4332] font-black text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-3xs"
          >
            <ArrowLeft size={14} />
            <span>Cabin Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-slate-200 hidden md:block" />
          <div>
            <h1 className="text-sm font-black tracking-wider text-[#1b4332] uppercase flex items-center gap-2">
              <Flame size={16} className="text-[#2d6a4f]" />
              🌲 LIVE TACTICAL LINEAGE MAP
            </h1>
            <p className="text-[10px] text-slate-400">
              Interactive elimination timeline. Drag to explore. Pinch or Ctrl+scroll to zoom.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Stats quick HUD */}
          <div className="flex items-center gap-3 bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-3 py-2 text-[10px] font-black text-[#1b4332] uppercase">
            <span>Survivors: <span className="text-emerald-600">{aliveCount}</span></span>
            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
            <span>Fallen: <span className="text-rose-600">{deadCount}</span></span>
          </div>

          {/* Sync indicator */}
          <div className="flex items-center gap-2 bg-[#f0f4f1] border border-[#dce6e1] rounded-xl px-3 py-2 text-[10px] font-black text-[#2d6a4f]">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
            <span>{isSyncing ? "Syncing..." : lastSyncTime ? `Live (Synced ${lastSyncTime})` : "Live Sync Active"}</span>
            <button onClick={syncWithRemote} className="ml-1 text-slate-400 hover:text-[#1b4332] transition-colors" title="Force Refresh">
              <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center bg-[#f0f4f1] border border-[#dce6e1] rounded-xl overflow-hidden shadow-3xs">
            <button
              onClick={() => setZoom(prev => Math.min(2.5, prev + 0.15))}
              className="p-2.5 hover:bg-[#dce6e1] text-[#1b4332] transition-colors border-r border-[#dce6e1] flex items-center justify-center"
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={() => setZoom(prev => Math.max(0.3, prev - 0.15))}
              className="p-2.5 hover:bg-[#dce6e1] text-[#1b4332] transition-colors border-r border-[#dce6e1] flex items-center justify-center"
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2.5 hover:bg-[#dce6e1] text-[#1b4332] text-[9px] font-black uppercase transition-colors"
              title="Reset Zoom & Pan"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main map canvas container */}
      {!hasAnyKills ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white border border-[#dce6e1] rounded-3xl p-8 text-center space-y-4 shadow-xs">
          <CampfireGraphic />
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-black text-[#1b4332] uppercase">The Camp is Peaceful</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              No eliminations have been registered yet. Once the hunt starts and players begin logging their spoon grabs, the live elimination tree will compile and render automatically.
            </p>
            <Link 
              href="/" 
              className="inline-block mt-4 bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-extrabold text-xs uppercase px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              🏕️ Return to Dashboard
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative flex flex-col min-h-0">
          <div 
            ref={containerRef}
            className="flex-1 w-full rounded-3xl border border-[#dce6e1]/60 bg-[#FAF9F5] overflow-auto relative"
            style={{ scrollbarWidth: "thin" }}
            onMouseLeave={() => setHoveredName(null)}
          >
            {/* Native Scroll Wrapper */}
            <div 
              className="relative origin-top-left transition-all duration-200 ease-out grid-backdrop p-8"
              style={{
                width: `${canvasWidth * zoom}px`,
                height: `${canvasHeight * zoom}px`,
                transform: `scale(${zoom})`,
                transformOrigin: "top left"
              }}
            >
              {/* Micro floating sparks */}
              <div className="particle" style={{ left: "20%", top: "30%", animationDelay: "0s" } as React.CSSProperties} />
              <div className="particle" style={{ left: "80%", top: "40%", animationDelay: "1s" } as React.CSSProperties} />
              <div className="particle" style={{ left: "45%", top: "70%", animationDelay: "2s" } as React.CSSProperties} />

              <div className="relative w-full h-full">
                {/* SVG Overlay behind cards */}
                <svg width={canvasWidth} height={canvasHeight} className="absolute inset-0 pointer-events-none overflow-visible">
                  <defs>
                    <filter id="streamGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="streamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#d97706" />
                      <stop offset="100%" stopColor="#1b4332" />
                    </linearGradient>
                    <linearGradient id="activeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                  </defs>

                  {connectionPaths.map(path => {
                    const isPathHighlighted = true;
                    const pathOpacity = "1";

                    const fromX = path.from.x - 80;
                    const fromY = path.from.y;
                    const toX = path.to.x - 80;
                    const toY = path.to.y;
                    const cx = fromX - 25;

                    return (
                      <g key={path.key} style={{ transition: "all 0.4s ease" }} opacity={pathOpacity}>
                        {/* Glow path */}
                        <path
                          d={`M ${fromX} ${fromY} C ${cx} ${fromY}, ${cx} ${toY}, ${toX} ${toY}`}
                          fill="none"
                          stroke={isPathHighlighted ? "#fbbf24" : "#b2d8c3"}
                          strokeWidth={isPathHighlighted ? "6" : "4"}
                          strokeLinecap="round"
                          opacity={isPathHighlighted ? "0.45" : "0.2"}
                          filter="url(#streamGlow)"
                        />
                        {/* Main flow line */}
                        <path
                          d={`M ${fromX} ${fromY} C ${cx} ${fromY}, ${cx} ${toY}, ${toX} ${toY}`}
                          fill="none"
                          stroke={isPathHighlighted ? "url(#activeGrad)" : "url(#streamGrad)"}
                          strokeWidth={isPathHighlighted ? "2" : "1.5"}
                          strokeLinecap="round"
                          className={isPathHighlighted ? "flow-active-fast" : "flow-active"}
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Absolute Positioned Node Cards */}
                {layoutNodes.map(node => {
                  const isDead = node.isDead;
                  const killCount = gameState.players.filter(p => p.isDead && p.eliminatedBy === node.name).length;
                  const isCardHighlighted = true;
                  const cardOpacity = "1";
                  
                  const victimIndex = isDead && node.eliminatedBy 
                    ? getVictimOrdinal(node.name, node.eliminatedBy, gameState.players, gameState.killLog)
                    : undefined;

                  return (
                    <div
                      key={node.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      style={{ 
                        left: `${node.x}px`, 
                        top: `${node.y}px`,
                        opacity: cardOpacity,
                        transition: "opacity 0.4s ease, transform 0.3s ease"
                      }}
                      onMouseEnter={() => setHoveredName(node.name)}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setHoveredName(node.name);
                      }}
                    >
                      <div className={`w-[160px] h-[76px] px-3 py-2 rounded-2xl border text-left relative select-none flex items-center gap-2.5 transition-all hover:scale-105 hover:shadow-md ${
                        isDead 
                          ? "bg-gradient-to-b from-[#fbfbfa] to-[#f4f2eb] border-slate-200 text-slate-400 opacity-80" 
                          : "bg-gradient-to-b from-[#fdfbf7] via-[#faf7ee] to-[#f4efe0] border-amber-400 text-[#1b4332] shadow-sm ring-1 ring-amber-300/40"
                      }`}>
                        {!isDead && (
                          <div className="absolute inset-0 rounded-2xl bg-amber-400/5 animate-ping pointer-events-none scale-105" />
                        )}

                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-black text-2xs border relative ${
                          isDead 
                            ? "bg-slate-100 border-slate-200 text-slate-400 line-through" 
                            : "bg-gradient-to-tr from-[#1b4332] to-[#2d6a4f] border-amber-300 text-white shadow-sm"
                        }`}>
                          {node.name.slice(0, 2).toUpperCase()}
                          <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${
                            isDead ? "bg-rose-500" : "bg-emerald-500"
                          }`} />
                        </div>

                        <div className="flex flex-col min-w-0 flex-1 justify-center leading-tight">
                          <span className="font-extrabold text-[10px] text-slate-800 truncate w-full">{node.name}</span>
                          
                          {!isDead ? (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {killCount > 0 ? (
                                <span className="text-[7.5px] text-rose-600 font-extrabold flex items-center gap-0.5">
                                  🔥 {killCount} {killCount === 1 ? "Kill" : "Kills"}
                                </span>
                              ) : (
                                <span className="text-[7px] text-emerald-800 font-bold uppercase tracking-wider">
                                  Hunter
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <span className="text-[7px] text-slate-400 font-semibold truncate">
                                by {node.eliminatedBy?.split(" ")[0]}
                              </span>
                              {victimIndex && (
                                <span className="text-[6.5px] bg-rose-100 text-rose-700 border border-rose-200 px-1 py-0.2 rounded font-black w-max uppercase scale-90 origin-left">
                                  {victimIndex} Victim
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
