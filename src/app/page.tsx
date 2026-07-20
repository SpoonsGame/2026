"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Skull, Crown, BookOpen, Settings, RefreshCw, X, AlertTriangle, CheckCircle,
  ChevronDown, ChevronRight, LogOut, ArrowRight, UserPlus, Flame, Target, Maximize2, Minimize2,
  ZoomIn, ZoomOut
} from "lucide-react";
import { Player, KillLogEntry, GameState, fetchStateFromRemote, addPlayerToSheet, eliminatePlayerInSheet, assignTargetInSheet } from "./spoonsApi";
import Link from "next/link";

const CAMP_EMOJIS = ["⛺", "🌲", "🛶", "🐿️", "🐻", "🦌", "🔥", "🦅", "🦉"];

const getCampEmoji = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CAMP_EMOJIS[Math.abs(hash) % CAMP_EMOJIS.length];
};

// --- Toast Component ---
const Toast = ({ message }: { message: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 50, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 20, scale: 0.9 }}
    className="fixed bottom-6 right-6 z-50 bg-[#1b4332] border border-[#dce6e1] text-[#e9f5ed] px-5 py-3 rounded-2xl shadow-lg flex items-center gap-2 max-w-sm"
  >
    <CheckCircle className="text-amber-400 shrink-0" size={18} />
    <span className="font-semibold text-xs leading-snug">{message}</span>
  </motion.div>
);

// --- Campfire Graphic Component ---
const CampfireGraphic = () => (
  <div className="relative w-24 h-24 mx-auto flex items-end justify-center pb-4">
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
    // Card size: width = 160, height = 76
    // Horizontal spacing: start at 100px, shift by 80px per depth level
    const x = 100 + depth * 80;
    // Vertical spacing: start at 50px, gap of 95px per node
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

    // Traverse children in reverse chronological order (latest kill first)
    const reversedChildren = [...node.children].reverse();
    reversedChildren.forEach(child => {
      traverse(child, depth + 1, node.id);
    });
  };

  trees.forEach(tree => {
    traverse(tree, 0, null);
    currentY += 0.45; // visual gap spacing between separate trees in the forest
  });

  return flatNodes;
};

// Helper to compute active lineage in a type-safe way
const getLineageNames = (name: string, players: Player[]): Set<string> => {
  const lineage = new Set<string>();
  if (!name) return lineage;
  lineage.add(name);

  // Trace ancestors (killers)
  let current = players.find(p => p.name === name);
  while (current && current.isDead && current.eliminatedBy) {
    const killerName = current.eliminatedBy;
    lineage.add(killerName);
    current = players.find(p => p.name === killerName);
  }

  // Trace descendants (victims recursively)
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

// --- Forest Tree View Component ---
const KillLineageForest = ({ players, killLog }: { players: Player[]; killLog: KillLogEntry[] }) => {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const trees = useMemo(() => buildLineageTrees(players, killLog), [players, killLog]);

  const hasAnyKills = useMemo(() => {
    return players.some(p => p.isDead);
  }, [players]);

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

  // Drag-to-pan states (Google Maps style)
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Auto center the canvas in the viewport on mount / layout updates / full-screen toggle
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const x = Math.max(30, (containerWidth - canvasWidth * zoom) / 2);
      const y = Math.max(30, (containerHeight - canvasHeight * zoom) / 2);
      setOffset({ x, y });
    }
  }, [canvasWidth, canvasHeight, isFullScreen]);

  // Lock body scroll when full-screen is active to prevent scrolling page behind the map
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullScreen]);

  // Handle active wheel listener to prevent default page scrolling and support zooming/panning
  // Handle active touch listener to prevent default page scrolling when dragging the map on mobile
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zooming: zoom factor maps to deltaY
        const zoomFactor = 0.002;
        setZoom(prev => Math.min(2.5, Math.max(0.3, prev - e.deltaY * zoomFactor)));
      } else {
        // Panning: translate the map
        setOffset(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    const handleTouchMovePrevent = (e: TouchEvent) => {
      // If panning inside the map with one finger, prevent browser from scrolling the body
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchmove", handleTouchMovePrevent, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchmove", handleTouchMovePrevent);
    };
  }, []);

  const handleReset = () => {
    setZoom(1);
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const x = Math.max(30, (containerWidth - canvasWidth) / 2);
      const y = Math.max(30, (containerHeight - canvasHeight) / 2);
      setOffset({ x, y });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only drag on left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Find parents to draw paths
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

  // Compute highlighted lineage names
  const activeLineageNames = useMemo(() => {
    if (!hoveredName) return new Set<string>();
    return getLineageNames(hoveredName, players);
  }, [hoveredName, players]);

  const hasHighlight = hoveredName !== null;

  return (
    <div className={isFullScreen
      ? "fixed inset-0 z-[48] p-6 bg-[#fdfbf7] w-screen h-screen flex flex-col overflow-hidden"
      : "bg-white border border-[#dce6e1] rounded-3xl p-5 shadow-xs space-y-4 overflow-hidden relative flex flex-col"
    }>

      {/* Decorative Grid coordinates for HUD aesthetic */}
  


      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10">
        <div>
          <h3 className="text-xs font-black text-[#1b4332] uppercase tracking-wider flex items-center gap-1.5">
            <Flame size={14} className="text-[#2d6a4f]" />
            Killings Map
          </h3>
          <p className="text-[10px] text-slate-400">
            Drag to pan. Pinch or Ctrl+scroll to zoom. Tap cards to highlight streams.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Zoom controls */}
          <div className="flex items-center bg-[#f0f4f1] border border-[#dce6e1] rounded-xl overflow-hidden shadow-3xs">
            <button
              onClick={() => setZoom(prev => Math.min(2.5, prev + 0.15))}
              className="p-2 hover:bg-[#dce6e1] text-[#1b4332] transition-colors border-r border-[#dce6e1] flex items-center justify-center"
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={() => setZoom(prev => Math.max(0.3, prev - 0.15))}
              className="p-2 hover:bg-[#dce6e1] text-[#1b4332] transition-colors border-r border-[#dce6e1] flex items-center justify-center"
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <button
              onClick={handleReset}
              className="px-2.5 py-2 hover:bg-[#dce6e1] text-[#1b4332] text-[9px] font-black uppercase transition-colors"
              title="Reset Zoom & Pan"
            >
              Reset
            </button>
          </div>

          {/* Full Screen Page Link */}
          <Link
            href="/map"
            className="flex items-center gap-1.5 bg-[#f0f4f1] hover:bg-[#dce6e1] border border-[#dce6e1] text-[#1b4332] font-black text-[10px] uppercase px-3 py-2 rounded-xl transition-all shadow-3xs relative z-10"
          >
            <Maximize2 size={13} />
            <span>Full Screen Page</span>
          </Link>
        </div>
      </div>

      {!hasAnyKills ? (
        <div className="text-center py-12 space-y-3 bg-[#faf9f6] rounded-2xl border border-dashed border-[#dce6e1]">
          <CampfireGraphic />
          <div>
            <p className="text-xs font-black text-[#1b4332] uppercase">The Camp is Peaceful</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              No eliminations have been recorded yet.
            </p>
          </div>
        </div>
      ) : (
        <div className={isFullScreen ? "relative flex flex-col flex-1 min-h-0 mt-3" : "relative"}>
          {/* Drag helper for mobile */}
          <div className="absolute top-2 right-2 z-10 bg-[#1b4332]/95 backdrop-blur-xs text-[#e9f5ed] border border-[#dce6e1]/20 text-[8px] font-bold uppercase px-2.5 py-1 rounded-full shadow-xs pointer-events-none md:hidden animate-pulse">
            🖐️ Drag to explore map
          </div>

          <div
            ref={containerRef}
            className={`rounded-2xl border border-[#dce6e1]/60 bg-[#FAF9F5] overflow-hidden select-none relative ${isFullScreen ? "flex-1 w-full" : "h-[480px]"
              } ${isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={() => {
              handleMouseUpOrLeave();
              setHoveredName(null);
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Translated wrapper for Google-maps drag panning */}
            <div
              className="absolute origin-top-left transition-transform duration-75 ease-out grid-backdrop"
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
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
                    const isPathHighlighted = hasHighlight && activeLineageNames.has(path.from.name) && activeLineageNames.has(path.to.name);
                    const pathOpacity = hasHighlight ? (isPathHighlighted ? "1" : "0.12") : "0.45";

                    // Card width = 160, half width = 80. exit parent from left edge, enter child from left edge
                    const fromX = path.from.x - 80;
                    const fromY = path.from.y;
                    const toX = path.to.x - 80;
                    const toY = path.to.y;
                    const cx = fromX - 25; // swoop out 25px to the left in a loop

                    return (
                      <g key={path.key} style={{ transition: "all 0.4s ease" }} opacity={pathOpacity}>
                        {/* Underlying glow path */}
                        <path
                          d={`M ${fromX} ${fromY} C ${cx} ${fromY}, ${cx} ${toY}, ${toX} ${toY}`}
                          fill="none"
                          stroke={isPathHighlighted ? "#fbbf24" : "#b2d8c3"}
                          strokeWidth={isPathHighlighted ? "6" : "4"}
                          strokeLinecap="round"
                          opacity={isPathHighlighted ? "0.45" : "0.2"}
                          filter="url(#streamGlow)"
                        />
                        {/* Main path */}
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
                  const killCount = players.filter(p => p.isDead && p.eliminatedBy === node.name).length;
                  const isCardHighlighted = hasHighlight && activeLineageNames.has(node.name);
                  const cardOpacity = hasHighlight ? (isCardHighlighted ? "1" : "0.2") : "1";

                  // Compute victim order badge index if dead
                  const victimIndex = isDead && node.eliminatedBy
                    ? getVictimOrdinal(node.name, node.eliminatedBy, players, killLog)
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
                      <div className={`w-[160px] h-[76px] px-3 py-2 rounded-2xl border text-left relative select-none flex items-center gap-2.5 transition-all hover:scale-105 hover:shadow-md ${isDead
                          ? "bg-gradient-to-b from-[#fbfbfa] to-[#f4f2eb] border-slate-200 text-slate-400 opacity-80"
                          : "bg-gradient-to-b from-[#fdfbf7] via-[#faf7ee] to-[#f4efe0] border-amber-400 text-[#1b4332] shadow-sm ring-1 ring-amber-300/40"
                        }`}>
                        {/* Active survivor pulsing background sonar rings */}
                        {!isDead && (
                          <div className="absolute inset-0 rounded-2xl bg-amber-400/5 animate-ping pointer-events-none scale-105" />
                        )}

                        {/* Initials Avatar chip */}
                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-black text-2xs border relative ${isDead
                            ? "bg-slate-100 border-slate-200 text-slate-400 line-through"
                            : "bg-gradient-to-tr from-[#1b4332] to-[#2d6a4f] border-amber-300 text-white shadow-sm"
                          }`}>
                          {node.name.slice(0, 2).toUpperCase()}

                          {/* Alive / Dead status ring indicator */}
                          <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${isDead ? "bg-rose-500" : "bg-emerald-500"
                            }`} />
                        </div>

                        {/* Info column */}
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
};

export default function KillCamDashboard() {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    killLog: [],
    signUpEnabled: true,
    gameStarted: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!gameState.gameStarted) return;
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000); // update every 10 seconds
    return () => clearInterval(timer);
  }, [gameState.gameStarted]);

  // Compute elapsed time in hours and minutes
  const formattedElapsedTime = useMemo(() => {
    if (!gameState.gameStarted || !gameState.gameStartTime) return "0h 0m";
    const diffMs = currentTime - gameState.gameStartTime;
    if (diffMs < 0) return "0h 0m";
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffHrs}h ${diffMins}m`;
  }, [gameState.gameStarted, gameState.gameStartTime, currentTime]);

  // Compute time since last kill
  const formattedLastKillTime = useMemo(() => {
    if (!gameState.gameStarted) return "No game active";
    if (!gameState.lastKillTime || gameState.lastKillTime === 0) return "No kills yet";
    const diffMs = currentTime - gameState.lastKillTime;
    if (diffMs < 0) return "Just now";
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Last kill: < 1m ago";
    if (diffMins < 60) return `Last kill: ${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHrs < 24) return `Last kill: ${diffHrs}h ${remainingMins}m ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `Last kill: ${diffDays}d ago`;
  }, [gameState.gameStarted, gameState.lastKillTime, currentTime]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Camper Signup Modal States
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [signUpName, setSignUpName] = useState("");
  const [signUpSuccessCredentials, setSignUpSuccessCredentials] = useState<{ name: string; pin: string } | null>(null);

  // Camper Session States
  const [camperSession, setCamperSession] = useState<Player | null>(null);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [signInName, setSignInName] = useState("");
  const [signInPin, setSignInPin] = useState("");

  // Camper Self-Report Death Modal States
  const [isReportDeathOpen, setIsReportDeathOpen] = useState(false);

  const [isRulesExpanded, setIsRulesExpanded] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 1. Initial State Loading & Storage Syncing
  useEffect(() => {
    if (typeof window !== "undefined") {
      const loadState = () => {
        const storedLocal = localStorage.getItem("spoons_local_gamestate_v8");
        if (storedLocal) {
          setGameState(JSON.parse(storedLocal));
        } else {
          // Setup Demo Data as fallback
          const defaultPlayers: Player[] = [
            { id: "1", name: "Cody the Counselor", email: "cody@camp.org", phone: "5551111", targetId: "2", isDead: false, pin: "1111" },
            { id: "2", name: "Skylar the Scout", email: "skylar@camp.org", phone: "5552222", targetId: "3", isDead: false, pin: "2222" },
            { id: "3", name: "Oakley the Outdoorsman", email: "oakley@camp.org", phone: "5553333", targetId: "4", isDead: false, pin: "3333" },
            { id: "4", name: "River the Rower", email: "river@camp.org", phone: "5554444", targetId: "5", isDead: false, pin: "4444" },
            { id: "5", name: "Hunter the Hiker", email: "hunter@camp.org", phone: "5555555", targetId: "1", isDead: false, pin: "5555" },
          ];
          const initial = {
            players: defaultPlayers,
            killLog: [],
            signUpEnabled: true,
            gameStarted: false
          };
          setGameState(initial);
          localStorage.setItem("spoons_local_gamestate_v8", JSON.stringify(initial));
        }
      };

      loadState();

      // Background sync with Google Sheets
      const syncWithSheets = async () => {
        try {
          const remoteState = await fetchStateFromRemote();
          if (remoteState) {
            setGameState(prev => {
              const merged = {
                ...prev,
                players: remoteState.players,
                killLog: remoteState.killLog,
                gameStarted: remoteState.gameStarted,
                gameStartTime: remoteState.gameStartTime,
                lastKillTime: remoteState.lastKillTime,
                deathTimes: remoteState.deathTimes
              };
              localStorage.setItem("spoons_local_gamestate_v8", JSON.stringify(merged));
              return merged;
            });
          }
        } catch (error) {
          console.error("Failed to sync state from Google Sheets on load:", error);
        }
      };

      syncWithSheets();
      const syncInterval = setInterval(syncWithSheets, 15000);

      // Listen for updates from other tabs
      const handleStorage = (e: StorageEvent) => {
        if (e.key === "spoons_local_gamestate_v8" && e.newValue) {
          setGameState(JSON.parse(e.newValue));
        }
      };
      window.addEventListener("storage", handleStorage);

      // Check for signed-in session
      const storedSession = sessionStorage.getItem("spoons_camper_session");
      if (storedSession) {
        setCamperSession(JSON.parse(storedSession));
      }

      setIsLoading(false);
      return () => {
        window.removeEventListener("storage", handleStorage);
        clearInterval(syncInterval);
      };
    }
  }, []);

  // Sync camperSession state with latest gameState changes
  useEffect(() => {
    if (camperSession && gameState.players.length > 0) {
      const latestPlayer = gameState.players.find(p => p.id === camperSession.id);
      if (latestPlayer) {
        if (latestPlayer.isDead !== camperSession.isDead || latestPlayer.targetId !== camperSession.targetId || latestPlayer.name !== camperSession.name) {
          setCamperSession(latestPlayer);
          sessionStorage.setItem("spoons_camper_session", JSON.stringify(latestPlayer));
        }
      } else {
        // Player was deleted by Admin
        setCamperSession(null);
        sessionStorage.removeItem("spoons_camper_session");
      }
    }
  }, [gameState.players, camperSession]);

  const commitState = async (updated: GameState) => {
    setGameState(updated);
    localStorage.setItem("spoons_local_gamestate_v8", JSON.stringify(updated));
  };

  const alivePlayers = useMemo(() => gameState.players.filter(p => !p.isDead), [gameState.players]);
  const deadPlayers = useMemo(() => gameState.players.filter(p => p.isDead), [gameState.players]);

  const isGameOver = useMemo(() => gameState.gameStarted && alivePlayers.length === 1 && gameState.players.length >= 2, [gameState.players, alivePlayers, gameState.gameStarted]);
  const winner = useMemo(() => isGameOver ? alivePlayers[0] : null, [isGameOver, alivePlayers]);

  const deadTodayCount = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return gameState.players.filter(p => p.isDead && p.killDate && p.killDate.includes(todayStr)).length;
  }, [gameState.players]);

  const getTargetFor = useCallback((playerId: string) => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.targetId) return null;
    return gameState.players.find(p => p.id === player.targetId) ?? null;
  }, [gameState.players]);

  // Handle Camper Registration
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpName.trim()) return;

    const name = signUpName.trim();
    if (gameState.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      showToast("⚠️ A camper with that name already exists!");
      return;
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const newPlayer: Player = {
      id: Date.now().toString() + "-" + Math.random().toString(36).substr(2, 4),
      name,
      email: "",
      phone: "",
      targetId: null,
      isDead: false,
      pin
    };

    const updatedState = {
      ...gameState,
      players: [...gameState.players, newPlayer]
    };

    await commitState(updatedState);
    setSignUpSuccessCredentials({ name, pin });
    setSignUpName("");

    // Sync to Google Sheet (non-blocking background task)
    try {
      const parts = name.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || " ";
      addPlayerToSheet(firstName, lastName, pin);
    } catch (error) {
      console.error("Failed to sync new player to Google Sheets:", error);
    }
  };

  // Camper Dossier Sign In
  const handleCamperSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInName) return;

    const p = gameState.players.find(x => x.name === signInName);
    if (!p) return;

    if (p.pin === signInPin.trim()) {
      setCamperSession(p);
      sessionStorage.setItem("spoons_camper_session", JSON.stringify(p));
      setIsSignInOpen(false);
      setSignInPin("");
      showToast(`⛺ Welcome, ${p.name}! Dossier loaded.`);
    } else {
      showToast("❌ Incorrect PIN code.");
    }
  };

  // Camper Sign Out
  const handleCamperSignOut = () => {
    setCamperSession(null);
    sessionStorage.removeItem("spoons_camper_session");
    showToast("👋 Signed out.");
  };

  // Camper Self-Report Death Confirm
  const handleReportDeathSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camperSession) return;

    const victimId = camperSession.id;
    const victim = gameState.players.find(p => p.id === victimId);
    if (!victim || victim.isDead) return;

    const hunter = gameState.players.find(p => p.targetId === victimId && !p.isDead);
    if (!hunter) {
      showToast("⚠️ Could not find your active hunter. Contact Jonah.");
      return;
    }

    const killDate = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const reason = "Eliminated in the hunt";
    const killerName = hunter.name;

    const updatedPlayers = gameState.players.map(p => {
      if (p.id === victimId) {
        return {
          ...p,
          isDead: true,
          killDate,
          deathReason: reason,
          eliminatedBy: killerName
        };
      }
      if (p.id === hunter.id) {
        const targetId = victim.targetId === hunter.id ? null : victim.targetId;
        return {
          ...p,
          targetId
        };
      }
      return p;
    });

    const newLogEntry: KillLogEntry = {
      id: Date.now().toString() + "-" + victimId,
      killerName: killerName,
      victimName: victim.name,
      date: killDate,
      reason
    };

    const killTime = Date.now();
    const updatedDeathTimes = {
      ...(gameState.deathTimes || {}),
      [victimId]: killTime
    };
    const updatedState: GameState = {
      ...gameState,
      players: updatedPlayers,
      killLog: [...gameState.killLog, newLogEntry],
      lastKillTime: killTime,
      deathTimes: updatedDeathTimes
    };

    await commitState(updatedState);

    // Sync elimination to Google Sheets (non-blocking background task)
    try {
      eliminatePlayerInSheet(victim.pin, hunter.pin);

      // Update target assignment for the hunter in Google Sheets
      const targetId = victim.targetId === hunter.id ? null : victim.targetId;
      const targetPlayer = targetId ? gameState.players.find(p => p.id === targetId) : null;
      const targetName = targetPlayer ? targetPlayer.name : "None";

      const hunterParts = hunter.name.split(" ");
      const hunterFirst = hunterParts[0];
      const hunterLast = hunterParts.slice(1).join(" ") || " ";
      assignTargetInSheet(hunterFirst, hunterLast, targetName);

      // Update metadata with new kill time and death log
      const startTime = gameState.gameStartTime || Date.now();
      const deathsStr = Object.entries(updatedDeathTimes)
        .map(([pid, ts]) => `${pid}:${ts}`)
        .join(",");
      assignTargetInSheet("System", "Metadata", `START_${startTime}_LAST_${killTime}_DEATHS_${deathsStr}`);
    } catch (error) {
      console.error("Failed to sync self-reported elimination to Google Sheets:", error);
    }

    const updatedSelf = updatedPlayers.find(p => p.id === victimId) || null;
    setCamperSession(updatedSelf);
    if (updatedSelf) {
      sessionStorage.setItem("spoons_camper_session", JSON.stringify(updatedSelf));
    }

    setIsReportDeathOpen(false);
    showToast("💀 Death recorded. You are officially spooned.");
  };

  const sortedCamperNames = useMemo(() => {
    return [...gameState.players].sort((a, b) => a.name.localeCompare(b.name));
  }, [gameState.players]);

  // --- Render Blocks for Mobile/Desktop Responsiveness ---
  const renderWinner = () => {
    if (!isGameOver || !winner) return null;
    return (
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 border-2 border-amber-400 rounded-3xl p-6 text-center shadow-sm relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 text-7xl opacity-5">👑</div>
        <h2 className="text-2xl font-black text-[#1b4332] tracking-tight uppercase">We Have a Champion!</h2>
        <div className="mt-4 inline-block bg-white px-6 py-2 rounded-2xl border-2 border-amber-400 text-lg font-black text-[#1b4332] tracking-wider shadow-sm">
          👑 {winner.name} 👑
        </div>
        <p className="text-xs text-slate-500 mt-3 font-medium">All other staff members have been spooned out of the game loop.</p>
      </motion.div>
    );
  };

  const renderStats = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 shadow-sm text-center">
        <p className="text-4xs text-[#2d6a4f] font-black uppercase tracking-wider">Survivors</p>
        <h4 className="text-xl font-black text-[#1b4332] mt-1">{alivePlayers.length}</h4>
        <p className="text-[8px] text-slate-400 mt-0.7">/{gameState.players.length}</p>
      </div>

      <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 shadow-sm text-center">
        <p className="text-4xs text-rose-500 font-black uppercase tracking-wider">Spooned</p>
        <h4 className="text-xl font-black text-rose-600 mt-1">{deadPlayers.length}</h4>
        <p className="text-[8px] text-slate-400 mt-0.5">eliminated</p>
      </div>

      <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 shadow-sm text-center">
        <p className="text-4xs text-amber-500 font-black uppercase tracking-wider">Spooned Today</p>
        <h4 className="text-xl font-black text-amber-600 mt-1">{deadTodayCount}</h4>
        <p className="text-[8px] text-slate-400 mt-0.5">recent</p>
      </div>

      <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 shadow-sm text-center flex flex-col justify-between min-h-[82px]">
        <div>
          <p className="text-4xs text-emerald-600 font-black uppercase tracking-wider">Game Duration</p>
          <h4 className="text-xl font-black text-[#1b4332] mt-1">{formattedElapsedTime}</h4>
        </div>
        <p className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">{formattedLastKillTime}</p>
      </div>
    </div>
  );

  const renderDossier = () => (
    <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 h-16 w-16 bg-[#e9f5ed] rounded-full -mr-4 -mt-4 pointer-events-none" />

      {camperSession ? (
        // Signed In Camper Panel
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-[#dce6e1]/40 pb-2 relative z-10">
            <div className="flex items-center gap-1.5">
              <span>{getCampEmoji(camperSession.name)}</span>
              <h3 className="font-extrabold text-[#1b4332] text-sm uppercase">{camperSession.name}</h3>
            </div>
            <button
              onClick={handleCamperSignOut}
              className="text-slate-400 hover:text-slate-700 p-1 relative z-10 transition-colors"
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>

          {!camperSession.isDead ? (
            <div className="space-y-4">
              {/* SECRET TARGET DISPLAY */}
              <div className="bg-[#e9f5ed] border border-[#b2d8c3] rounded-2xl p-4 text-center space-y-1">
                <p className="text-[9px] text-[#2d6a4f] font-black uppercase tracking-widest">🎯 Your Secret Target</p>
                <h4 className="text-lg font-black text-[#1b4332]">
                  {getTargetFor(camperSession.id)?.name || "Winner (No Targets Left)"}
                </h4>
                <p className="text-[9px] text-slate-500 italic">Do not show this to anyone!</p>
              </div>

              <button
                onClick={() => {
                  setIsReportDeathOpen(true);
                }}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm"
              >
                🏳️ I AM DEAD (I WAS SPOONED)
              </button>
            </div>
          ) : (
            // Eliminated display
            <div className="space-y-3 text-center py-2">
              <Skull className="text-rose-500 mx-auto" size={32} />
              <div>
                <h4 className="font-extrabold text-rose-700 text-xs uppercase">Spooned Out</h4>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  You were spooned by <span className="font-bold text-slate-700">{camperSession.eliminatedBy}</span>.
                </p>
              </div>
              <button
                onClick={handleCamperSignOut}
                className="w-full mt-3 bg-slate-100 hover:bg-slate-200 border border-[#dce6e1] text-slate-700 font-extrabold py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition-all"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      ) : (
        // Sign In Prompt
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[#1b4332]">
            <Target size={20} />
            <h3 className="text-md font-black uppercase tracking-tight">🔎 See your Target</h3>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Check your target and self-report your elimination by signing in with your 4-digit PIN.
          </p>
          <button
            onClick={() => {
              setSignInName("");
              setSignInPin("");
              setIsSignInOpen(true);
            }}
            className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all"
          >
            Sign In
          </button>
        </div>
      )}
    </div>
  );

  const renderFlowChart = () => (
    <KillLineageForest players={gameState.players} killLog={gameState.killLog} />
  );

  const renderFeed = () => (
    <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm">
      <h3 className="text-xs font-black text-[#1b4332] uppercase tracking-widest mb-4 flex items-center gap-1.5">
        <Flame className="text-amber-500 fill-amber-500/20" size={14} />
        KILL FEED
      </h3>

      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
        {gameState.killLog.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-6">
            Quiet reigns in the forest. No spoonings logged.
          </p>
        ) : (
          [...gameState.killLog].reverse().map(log => (
            <div
              key={log.id}
              className="bg-[#fdfbf7] border-l-2 border-rose-500 rounded-xl p-3 space-y-1 relative overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <span className="text-[11px] text-slate-700 font-extrabold">{log.killerName}</span>
                <span className="text-[9px] text-slate-400 font-semibold">{log.date}</span>
              </div>

              <div className="text-[10px] text-rose-700 font-medium flex items-center gap-0.5">
                spooned <ArrowRight size={10} /> <span className="font-bold">{log.victimName}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderGraveyard = () => {
    if (deadPlayers.length === 0) return null;
    return (
      <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm">
        <h3 className="text-xs font-black text-[#1b4332] uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Skull className="text-rose-500" size={14} />
          GRAVEYARD ({deadPlayers.length})
        </h3>

        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
          {deadPlayers.map(p => (
            <div
              key={p.id}
              className="bg-[#fdfbf7] border border-rose-200/50 rounded-xl p-2.5 flex flex-col justify-between text-center relative overflow-hidden group hover:border-rose-300 transition-colors"
            >
              <div>
                <span className="text-xs font-black text-slate-400 line-through tracking-wide">
                  {p.name}
                </span>
                <p className="text-[9px] text-rose-800 font-bold uppercase mt-0.5">Spooned Out</p>
              </div>
              {p.killDate && (
                <span className="text-[9px] text-slate-400 font-semibold mt-1">
                  📅 {p.killDate.split(",")[0]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRules = () => (
    <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm">
      <button
        onClick={() => setIsRulesExpanded(!isRulesExpanded)}
        className="w-full flex items-center justify-between text-left focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="text-amber-600" size={18} />
          <div>
            <h3 className="text-md font-black text-[#1b4332] uppercase tracking-tight">CAMP GUIDE: THE RULES</h3>
            <p className="text-3xs text-slate-400 mt-0.5">Learn how to play and wear your spoon</p>
          </div>
        </div>
        {isRulesExpanded ? <ChevronDown className="text-slate-400" /> : <ChevronRight className="text-slate-400" />}
      </button>

      <AnimatePresence>
        {isRulesExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-[#dce6e1]/40 mt-4 space-y-4 text-xs text-slate-600 leading-relaxed">
              <div className="flex gap-2">
                <span>🥄</span>
                <div>
                  <h4 className="font-bold text-[#1b4332] text-xs">Wear Your Spoon</h4>
                  <p className="text-slate-500 text-3xs mt-0.5">
                    Your named spoon must be worn on your person (collar, pocket, belt, sock) at all times so it is clearly visible.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <span>🎯</span>
                <div>
                  <h4 className="font-bold text-[#1b4332] text-xs">Hunt in Secret</h4>
                  <p className="text-slate-500 text-3xs mt-0.5">
                    Log in to check your target. Keep it secret. To eliminate them, you must sneakily swipe the spoon off their person and yell &quot;SPOONED!&quot;.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex flex-col items-center justify-center text-slate-400">
        <Flame className="animate-spin text-[#2d6a4f] mb-2" size={32} />
        <p className="text-xs font-bold uppercase tracking-wider">Gathering Campfire Data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1c2826] font-sans pb-16 relative">

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

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#dce6e1] px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🥄</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Settings size={13} />
            </Link>
          </div>
        </div>
      </header>

      {/* 1. JOIN GAME PHASE */}
      {!gameState.gameStarted ? (
        <main className="max-w-xl mx-auto px-4 pt-16 text-center space-y-8">

          <div className="space-y-4">
            <CampfireGraphic />
            <h2 className="text-3xl font-black tracking-tight text-[#1b4332] uppercase">Join Spoons!</h2>
          </div>

          {gameState.signUpEnabled ? (
            <button
              onClick={() => {
                setSignUpSuccessCredentials(null);
                setIsSignUpOpen(true);
              }}
              className="w-full max-w-xs bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md hover:scale-[1.02] active:scale-95"
            >
              🏕️ Join Spoons Game
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs font-bold text-amber-800 max-w-xs mx-auto">
              🔒 Sign-ups closed.
            </div>
          )}

          {/* REGISTERED LIST */}
          <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm space-y-3 text-left">
            <h4 className="text-xs font-black text-[#1b4332] uppercase tracking-widest border-b border-[#dce6e1]/40 pb-2 flex justify-between">
              <span>Players ({gameState.players.length})</span>
              <span className="text-slate-400 lowercase font-medium">awaiting start</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {gameState.players.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 col-span-full text-center">No Players signed up yet.</p>
              ) : (
                sortedCamperNames.map(p => (
                  <div key={p.id} className="bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-3 py-2 text-xs flex items-center gap-1.5">
                    <span>{getCampEmoji(p.name)}</span>
                    <span className="font-extrabold text-slate-700 truncate">{p.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </main>
      ) : (
        /* 2. LIVE STATS PHASE */
        <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6">

          {/* Champion Alert (shared across view modes) */}
          {renderWinner()}

          <div className="mt-6">

            {/* DESKTOP-ONLY LAYOUT (2 Columns) */}
            <div className="hidden lg:grid grid-cols-12 gap-6 items-start">
              <div className="col-span-7 space-y-6">
                {renderFlowChart()}
                {renderGraveyard()}
                {renderRules()}
              </div>
              <div className="col-span-5 space-y-6">
                {renderStats()}
                {renderDossier()}
                {renderFeed()}
              </div>
            </div>

            {/* MOBILE-OPTIMIZED LAYOUT (Single Column with exact ordered elements) */}
            <div className="flex flex-col gap-6 lg:hidden">
              {renderStats()}
              {renderDossier()}
              {renderFlowChart()}
              {renderFeed()}
              {renderGraveyard()}
              {renderRules()}
            </div>

          </div>

        </main>
      )}

      {/* A. SIGN UP MODAL */}
      <AnimatePresence>
        {isSignUpOpen && (
          <div className="fixed inset-0 bg-[#1c2826]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-[#dce6e1] rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-[#dce6e1]/40 pb-2">
                <h4 className="font-extrabold text-[#1b4332] text-sm uppercase">⛺ Join Spoons Circle</h4>
                <button onClick={() => setIsSignUpOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>

              {!signUpSuccessCredentials ? (
                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div>
                    <label className="block text-4xs font-black text-slate-400 uppercase tracking-widest mb-1">Your Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Robin"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      className="w-full bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-3 py-2.5 text-base md:text-xs focus:outline-none focus:ring-1 focus:ring-[#1b4332] text-slate-800"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-2.5 rounded-xl text-xs uppercase transition-all shadow-sm"
                  >
                    Confirm Sign-up
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-3 py-2">
                  <CheckCircle className="text-[#52b788] mx-auto" size={40} />
                  <div>
                    <h5 className="font-extrabold text-[#1b4332] text-xs uppercase">Player Joined!</h5>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Welcome, {signUpSuccessCredentials.name}. Below is your unique PIN. Write this down; you will need it.
                    </p>
                  </div>
                  <div className="bg-[#e9f5ed] border border-[#b2d8c3] rounded-xl py-3 text-lg font-black text-[#1b4332] tracking-widest">
                    {signUpSuccessCredentials.pin}
                  </div>
                  <p className="text-[9px] text-rose-700 font-extrabold uppercase animate-pulse">
                    ⚠️ Write it down so you remember it!
                  </p>
                  <button
                    onClick={() => {
                      setIsSignUpOpen(false);
                      setSignUpSuccessCredentials(null);
                    }}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-3xs px-4 py-2 rounded-lg"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* B. DOSSIER SIGN IN MODAL */}
      <AnimatePresence>
        {isSignInOpen && (
          <div className="fixed inset-0 bg-[#1c2826]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-[#dce6e1] rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-[#dce6e1]/40 pb-2">
                <h4 className="font-extrabold text-[#1b4332] text-sm uppercase">🔎 Dossier Access</h4>
                <button onClick={() => setIsSignInOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCamperSignIn} className="space-y-4">
                <div>
                  <label className="block text-4xs font-black text-[#2d6a4f] uppercase tracking-widest mb-1">Select Your Name</label>
                  <select
                    value={signInName}
                    onChange={(e) => setSignInName(e.target.value)}
                    className="w-full bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-3 py-2 text-base md:text-xs focus:outline-none text-slate-750"
                    required
                  >
                    <option value="">-- Who are you? --</option>
                    {gameState.players.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-4xs font-black text-[#2d6a4f] uppercase tracking-widest mb-1">Enter your PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={signInPin}
                    onChange={(e) => setSignInPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-3 py-2 text-base md:text-xs focus:outline-none text-center font-bold tracking-widest text-slate-800"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-2.5 rounded-xl text-xs uppercase"
                >
                  Access Dossier
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* C. SELF REPORT DEATH MODAL */}
      <AnimatePresence>
        {isReportDeathOpen && camperSession && (
          <div className="fixed inset-0 bg-[#1c2826]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-[#dce6e1] rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-[#dce6e1]/40 pb-2">
                <h4 className="font-black text-[#1b4332] text-sm uppercase">🏳️ Declare Self Spooned</h4>
                <button onClick={() => setIsReportDeathOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleReportDeathSubmit} className="space-y-4">
                <p className="text-[10px] text-slate-500">
                  Confirm your elimination. Since target loops are tracked, your active hunter is automatically set as your killer.
                </p>


                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReportDeathOpen(false)}
                    className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-2xs py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!gameState.players.some(p => p.targetId === camperSession.id && !p.isDead)}
                    className="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-black text-2xs py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirm Spooned
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOAST PANEL */}
      <AnimatePresence>
        {toastMessage && <Toast message={toastMessage} />}
      </AnimatePresence>

    </div>
  );
}
