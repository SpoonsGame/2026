"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Skull, Settings, RefreshCcw, Plus, Trash2,
  X, Check, Lock, Unlock, ArrowLeft, Key, Shuffle, Search
} from "lucide-react";
import { Player, GameState, fetchStateFromRemote, addPlayerToSheet, eliminatePlayerInSheet, assignTargetInSheet } from "../spoonsApi";
import Link from "next/link";

// --- Toast Component ---
const Toast = ({ message }: { message: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 50, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 20, scale: 0.9 }}
    className="fixed bottom-6 right-6 z-50 bg-[#1b4332] border border-[#dce6e1] text-[#e9f5ed] px-5 py-3 rounded-2xl shadow-lg flex items-center gap-2 max-w-sm animate-bounce"
  >
    <Check className="text-amber-400 shrink-0" size={18} />
    <span className="font-semibold text-xs leading-snug">{message}</span>
  </motion.div>
);

export default function KillCamSettings() {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    killLog: [],
    signUpEnabled: true,
    gameStarted: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Authentication
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");

  // CRUD & Edits
  const [newCamperName, setNewCamperName] = useState("");
  const [bulkCamperNames, setBulkCamperNames] = useState("");
  
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");

  // Search filter state
  const [searchQuery, setSearchQuery] = useState("");

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
        }
      };

      loadState();

      // Background sync with Sheets
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
                lastKillTime: remoteState.lastKillTime
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

      // Synchronize in real-time if updated in another tab
      const handleStorage = (e: StorageEvent) => {
        if (e.key === "spoons_local_gamestate_v8" && e.newValue) {
          setGameState(JSON.parse(e.newValue));
        }
      };
      window.addEventListener("storage", handleStorage);
      setIsLoading(false);

      return () => window.removeEventListener("storage", handleStorage);
    }
  }, []);

  const commitState = async (updated: GameState) => {
    setGameState(updated);
    localStorage.setItem("spoons_local_gamestate_v8", JSON.stringify(updated));
  };

  // Derived metrics
  const alivePlayers = useMemo(() => gameState.players.filter(p => !p.isDead), [gameState.players]);
  const deadPlayers = useMemo(() => gameState.players.filter(p => p.isDead), [gameState.players]);

  // Filtered players by search query
  const filteredPlayers = useMemo(() => {
    return gameState.players.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [gameState.players, searchQuery]);
  
  const deadTodayCount = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return gameState.players.filter(p => p.isDead && p.killDate && p.killDate.includes(todayStr)).length;
  }, [gameState.players]);

  const getTargetFor = useCallback((playerId: string) => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.targetId) return null;
    return gameState.players.find(p => p.id === player.targetId) ?? null;
  }, [gameState.players]);

  // Authenticate Admin
  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPinInput === "swedishpaddle4life") {
      setIsAdminUnlocked(true);
      setAdminPinInput("");
      showToast("🔑 Settings Dashboard unlocked!");
    } else {
      showToast("❌ Incorrect passcode.");
    }
  };

  // Toggle Registrations Open/Closed
  const handleToggleSignUp = async () => {
    const updated = {
      ...gameState,
      signUpEnabled: !gameState.signUpEnabled
    };
    await commitState(updated);
    showToast(updated.signUpEnabled ? "📢 Registrations opened!" : "🔒 Registrations closed.");
  };

  // Add individual camper profile
  const handleAddPlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCamperName.trim()) return;

    const name = newCamperName.trim();
    if (gameState.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      showToast("⚠️ Camper name already exists.");
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

    const updated = {
      ...gameState,
      players: [...gameState.players, newPlayer]
    };

    setNewCamperName("");

    await commitState(updated);
    showToast(`⛺ Profile created for ${name}!`);

    // Sync to Google Sheet in background
    try {
      const parts = name.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "";
      addPlayerToSheet(firstName, lastName, pin);
    } catch (error) {
      console.error("Failed to sync individual player creation to Sheets:", error);
    }
  };

  // Bulk Camper Import
  const handleBulkImport = async () => {
    if (!bulkCamperNames.trim()) return;

    const names = bulkCamperNames
      .split(/[,\n]/)
      .map(n => n.trim())
      .filter(n => n.length > 0);

    let addedCount = 0;
    const updatedPlayers = [...gameState.players];

    names.forEach(name => {
      if (!updatedPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        updatedPlayers.push({
          id: Date.now().toString() + "-" + Math.random().toString(36).substr(2, 4),
          name,
          email: "",
          phone: "",
          targetId: null,
          isDead: false,
          pin
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      const updated = {
        ...gameState,
        players: updatedPlayers
      };
      setBulkCamperNames("");
      await commitState(updated);
      showToast(`⛺ Bulk imported ${addedCount} counselors!`);

      // Sync bulk creations to Google Sheets
      try {
        const addedPlayers = updatedPlayers.slice(updatedPlayers.length - addedCount);
        addedPlayers.forEach(p => {
          const parts = p.name.split(" ");
          const firstName = parts[0];
          const lastName = parts.slice(1).join(" ") || "";
          addPlayerToSheet(firstName, lastName, p.pin);
        });
      } catch (error) {
        console.error("Failed bulk sync to Google Sheets:", error);
      }
    } else {
      showToast("⚠️ No new unique names found.");
    }
  };

  // Remove player, bridging the loop gap
  const handleRemovePlayer = async (id: string) => {
    const targetPlayer = gameState.players.find(p => p.id === id);
    if (!targetPlayer) return;

    if (!window.confirm(`Are you sure you want to remove ${targetPlayer.name}?`)) return;

    const hunter = gameState.players.find(p => p.targetId === id);
    let updatedPlayers = gameState.players.filter(p => p.id !== id);

    if (hunter && targetPlayer.targetId) {
      updatedPlayers = updatedPlayers.map(p => {
        if (p.id === hunter.id) {
          return {
            ...p,
            targetId: targetPlayer.targetId === id ? null : targetPlayer.targetId
          };
        }
        return p;
      });
    }

    const updatedKillLog = gameState.killLog.filter(k => k.victimName !== targetPlayer.name);

    const updatedState = {
      ...gameState,
      players: updatedPlayers,
      killLog: updatedKillLog
    };

    await commitState(updatedState);
    showToast(`🌲 Removed ${targetPlayer.name} and healed loop.`);

    // Sync target assignment update in Google Sheets
    try {
      if (hunter && targetPlayer.targetId) {
        const targetId = targetPlayer.targetId === id ? null : targetPlayer.targetId;
        const target = gameState.players.find(p => p.id === targetId);
        const targetName = target ? target.name : "None";

        const hunterParts = hunter.name.split(" ");
        const hunterFirst = hunterParts[0];
        const hunterLast = hunterParts.slice(1).join(" ") || "";
        assignTargetInSheet(hunterFirst, hunterLast, targetName);
      }
    } catch (error) {
      console.error("Failed to sync target healing on remove to Sheets:", error);
    }
  };

  // Start Game, Shuffle targets, lock registration
  const handleStartGame = async () => {
    if (gameState.players.length < 2) {
      showToast("⚠️ Need at least 2 campers to shuffle!");
      return;
    }

    if (!window.confirm("Start Game? This shuffles targets and closes signups. Dashboard will switch to Live Stats.")) return;

    const basePlayers = gameState.players.map(p => ({
      ...p,
      isDead: false,
      killDate: undefined,
      deathReason: undefined,
      eliminatedBy: undefined,
      pin: p.pin || Math.floor(1000 + Math.random() * 9000).toString()
    }));

    const shuffled = [...basePlayers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      shuffled[i].targetId = shuffled[(i + 1) % shuffled.length].id;
    }

    const finalPlayers = basePlayers.map(bp => {
      const sp = shuffled.find(s => s.id === bp.id);
      return sp ? sp : bp;
    });

    const startTime = Date.now();
    const updated: GameState = {
      players: finalPlayers,
      killLog: [],
      signUpEnabled: false, // Close signups automatically on start
      gameStarted: true,
      gameStartTime: startTime,
      lastKillTime: 0
    };

    await commitState(updated);
    showToast("🚀 Game started! targets shuffled and signup roster locked.");

    // Sync all target assignments to Google Sheets
    try {
      // Sync game start time to Sheets via System Metadata player
      await assignTargetInSheet("System", "Metadata", `START_${startTime}_LAST_0`);

      finalPlayers.forEach(p => {
        const target = finalPlayers.find(t => t.id === p.targetId);
        const targetName = target ? target.name : "None";
        const parts = p.name.split(" ");
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ") || "";
        assignTargetInSheet(firstName, lastName, targetName);
      });
    } catch (error) {
      console.error("Failed to sync shuffled targets to Sheets:", error);
    }
  };

  // End game, revive players, return to Sign Up mode
  const handleEndGame = async () => {
    if (!window.confirm("End Game & Reset Board? This will revive all players, clear target loops, and open signups again.")) return;

    const resetPlayers = gameState.players.map(p => ({
      ...p,
      isDead: false,
      killDate: undefined,
      deathReason: undefined,
      eliminatedBy: undefined,
      targetId: null
    }));

    const updated: GameState = {
      players: resetPlayers,
      killLog: [],
      signUpEnabled: true,
      gameStarted: false
    };

    await commitState(updated);
    showToast("🌲 Game ended. Roster is open for sign-ups again.");

    // Sync target clearing to Google Sheets (set to "None")
    try {
      resetPlayers.forEach(p => {
        const parts = p.name.split(" ");
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ") || "";
        assignTargetInSheet(firstName, lastName, "None");
      });
    } catch (error) {
      console.error("Failed to clear targets in Sheets:", error);
    }
  };

  // Completely wipe roster and reset
  const handleHardWipe = async () => {
    if (!window.confirm("DELETE ALL CAMPERS? This wipes the entire game database!")) return;
    const updated = {
      players: [],
      killLog: [],
      signUpEnabled: true,
      gameStarted: false
    };
    await commitState(updated);
    showToast("🪵 Board completely wiped!");
  };

  // Revive / Make Undead eliminated camper and re-stitch them
  const handleReviveCamper = async (id: string) => {
    const victim = gameState.players.find(p => p.id === id);
    if (!victim || !victim.isDead) return;

    // Find the active alive player who is currently hunting the victim's target
    const activeHunter = gameState.players.find(p => !p.isDead && p.targetId === victim.targetId);

    const updatedPlayers = gameState.players.map(p => {
      if (p.id === id) {
        return {
          ...p,
          isDead: false,
          killDate: undefined,
          deathReason: undefined,
          eliminatedBy: undefined
        };
      }
      if (activeHunter && p.id === activeHunter.id) {
        return {
          ...p,
          targetId: id
        };
      }
      return p;
    });

    const updatedKillLog = gameState.killLog.filter(k => k.victimName !== victim.name);

    const updatedState = {
      ...gameState,
      players: updatedPlayers,
      killLog: updatedKillLog
    };

    await commitState(updatedState);
    showToast(`🌟 Revived ${victim.name} & re-stitched target loop!`);

    // Sync both target updates to Google Sheets
    try {
      // 1. Revived player gets their target (victim's original target)
      const target = gameState.players.find(p => p.id === victim.targetId);
      const targetName = target ? target.name : "None";
      const parts = victim.name.split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "";
      assignTargetInSheet(firstName, lastName, targetName);

      // 2. Active hunter targets the revived player
      if (activeHunter) {
        const hunterParts = activeHunter.name.split(" ");
        const hunterFirst = hunterParts[0];
        const hunterLast = hunterParts.slice(1).join(" ") || "";
        assignTargetInSheet(hunterFirst, hunterLast, victim.name);
      }
    } catch (error) {
      console.error("Failed to sync revived targets to Sheets:", error);
    }
  };

  // Edit player details inline
  const handleEditPlayerSave = async (id: string) => {
    const updatedPlayers = gameState.players.map(p => {
      if (p.id === id) {
        return {
          ...p,
          name: editName.trim(),
          pin: editPin.trim()
        };
      }
      return p;
    });

    const updatedState = {
      ...gameState,
      players: updatedPlayers
    };

    setEditingPlayerId(null);
    await commitState(updatedState);
    showToast("📝 Updated camper details.");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex flex-col items-center justify-center text-slate-400">
        <RefreshCcw className="animate-spin text-[#2d6a4f] mb-2" size={32} />
        <p className="text-xs font-bold uppercase tracking-wider">Loading Settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1c2826] font-sans pb-16 relative">
      
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#dce6e1] px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-xl border border-slate-200">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#1b4332] flex items-center gap-1.5 leading-none">
                KILL CAM
              </h1>
              <p className="text-[10px] text-[#2d6a4f] font-bold uppercase tracking-widest leading-none mt-1">Admin Controls</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6">
        
        {!isAdminUnlocked ? (
          // Auth Box
          <div className="max-w-md mx-auto bg-white border border-[#dce6e1] rounded-3xl p-8 shadow-sm text-center space-y-4">
            <Lock className="text-amber-600 mx-auto" size={36} />
            <div>
              <h3 className="text-md font-black text-[#1b4332] uppercase tracking-tight">Password</h3>
              <p className="text-xs text-slate-500 mt-1">
                Access settings to configure players and toggle game phases.
              </p>
            </div>

            <form onSubmit={handleAdminAuth} className="space-y-3">
              <input
                type="password"
                placeholder="Password"
                value={adminPinInput}
                onChange={(e) => setAdminPinInput(e.target.value)}
                className="w-full text-center bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-4 py-2.5 text-base md:text-xs focus:outline-none focus:ring-1 focus:ring-[#1b4332] text-slate-800 font-bold"
                required
              />
              <button
                type="submit"
                className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold py-2.5 rounded-xl text-xs uppercase"
              >
                Sign in
              </button>
            </form>
          </div>
        ) : (
          // GM Panels
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* GM COL 1: PLAYER MANAGEMENT */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* METRIC STRIP */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 text-center">
                  <p className="text-3xs text-slate-500 font-bold uppercase">Campers</p>
                  <span className="text-lg font-black text-[#1b4332]">{gameState.players.length}</span>
                </div>
                <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 text-center">
                  <p className="text-3xs text-[#2d6a4f] font-bold uppercase">Alive</p>
                  <span className="text-lg font-black text-emerald-600">{alivePlayers.length}</span>
                </div>
                <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 text-center">
                  <p className="text-3xs text-rose-500 font-bold uppercase">Dead</p>
                  <span className="text-xl font-black text-rose-600">{deadPlayers.length}</span>
                </div>
                <div className="bg-white border border-[#dce6e1] rounded-2xl p-4 text-center">
                  <p className="text-3xs text-amber-500 font-bold uppercase">Dead Today</p>
                  <span className="text-xl font-black text-amber-600">{deadTodayCount}</span>
                </div>
              </div>

              {/* ADD PLAYER */}
              <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-[#1b4332] uppercase tracking-widest flex items-center gap-1">
                  <Plus size={14} className="text-[#2d6a4f]" /> Add Individual Camper
                </h4>

                <form onSubmit={handleAddPlayerSubmit} className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Camper Name..."
                      value={newCamperName}
                      onChange={(e) => setNewCamperName(e.target.value)}
                      className="bg-[#fdfbf7] border border-[#dce6e1] rounded-xl px-4 py-2 text-base md:text-xs focus:outline-none text-slate-800 flex-1"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-bold text-2xs px-5 py-2.5 rounded-xl shadow-sm uppercase tracking-wider"
                    >
                      Add Profile
                    </button>
                  </div>
                </form>
              </div>

              {/* BULK IMPORT */}
              <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#1b4332] uppercase tracking-widest">Bulk Camper Roster Import</h4>
                  <span className="text-[9px] text-slate-400 font-bold">Commas or new lines</span>
                </div>
                
                <textarea
                  placeholder="E.g. Robin, Sage, Charlie, Oakley, River"
                  value={bulkCamperNames}
                  onChange={(e) => setBulkCamperNames(e.target.value)}
                  className="w-full h-16 bg-[#fdfbf7] border border-[#dce6e1] rounded-xl p-3 text-xs focus:outline-none text-slate-800 font-sans"
                />
                <button
                  onClick={handleBulkImport}
                  className="w-full bg-[#e9f5ed] border border-[#b2d8c3] text-[#2d6a4f] hover:bg-[#dcefe3] font-bold text-2xs py-2 rounded-lg transition-all"
                >
                  Import Camper Roster
                </button>
              </div>

              {/* PLAYER LIST */}
              <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-[#dce6e1]/40 pb-3">
                  <h4 className="text-xs font-black text-[#1b4332] uppercase tracking-widest">Camper Dossiers ({gameState.players.length})</h4>
                  <span className="text-3xs text-slate-400 font-bold uppercase">View credentials & statuses</span>
                </div>

                {/* SEARCH FILTER */}
                {gameState.players.length > 0 && (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search campers by name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#fdfbf7] border border-[#dce6e1] rounded-xl pl-9 pr-8 py-2 text-base md:text-xs focus:outline-none text-slate-800"
                    />
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {gameState.players.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">Roster is empty. Register campers in dashboard or import roster above.</p>
                  ) : filteredPlayers.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">No campers found matching "{searchQuery}"</p>
                  ) : (
                    filteredPlayers.map(p => {
                      const target = getTargetFor(p.id);
                      const isEditing = editingPlayerId === p.id;

                      return (
                        <div
                          key={p.id}
                          className="bg-[#fdfbf7] border border-[#dce6e1] rounded-2xl p-4 text-xs flex flex-col gap-3"
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-4xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Name</label>
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-white border border-[#dce6e1] rounded px-2 py-1 text-base md:text-3xs text-slate-700"
                                  />
                                </div>
                                <div>
                                  <label className="block text-4xs font-black text-slate-400 uppercase tracking-widest mb-0.5">PIN</label>
                                  <input
                                    type="text"
                                    maxLength={4}
                                    value={editPin}
                                    onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                                    className="w-full bg-white border border-[#dce6e1] rounded px-2 py-1 text-base md:text-3xs text-slate-700 text-center font-bold"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => setEditingPlayerId(null)}
                                  className="bg-white border border-slate-300 px-3 py-1 rounded text-3xs text-slate-500 font-bold"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleEditPlayerSave(p.id)}
                                  className="bg-[#1b4332] text-white px-3 py-1 rounded text-3xs font-bold"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center gap-3">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-slate-800 text-sm">{p.name}</span>
                                  <span className="text-[9px] bg-slate-200/60 border border-slate-300/40 text-slate-650 font-black px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    <Key size={8} /> PIN: {p.pin}
                                  </span>
                                  {p.isDead && (
                                    <span className="text-[9px] bg-rose-100 border border-rose-200 text-rose-700 font-black px-1.5 py-0.5 rounded">
                                      ☠️ ELIMINATED
                                    </span>
                                  )}
                                </div>
                                
                                <div className="text-3xs text-slate-400 font-medium mt-1 space-y-0.5">
                                  {!p.isDead && (
                                    <p className="text-[#d97706] font-bold">
                                      🎯 Target: {target ? target.name : "None (Start game required)"}
                                    </p>
                                  )}
                                  {p.isDead && p.eliminatedBy && (
                                    <p className="text-rose-800 font-bold">
                                      ☠️ Spooned by: {p.eliminatedBy}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* ACTIONS */}
                              <div className="flex items-center gap-1.5">
                                {p.isDead ? (
                                  <button
                                    onClick={() => handleReviveCamper(p.id)}
                                    className="text-emerald-700 hover:text-emerald-800 font-black text-3xs bg-white border border-[#b2d8c3] px-2.5 py-1.5 rounded uppercase tracking-wider"
                                    title="Revive player and place back in loop"
                                  >
                                    Make Undead
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Force eliminate ${p.name}?`)) {
                                        const killTime = Date.now();
                                        const updatedPlayers = gameState.players.map(x => x.id === p.id ? { ...x, isDead: true, eliminatedBy: "GM Override", killDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), deathReason: "Eliminated by Game Master" } : x);
                                        commitState({
                                          ...gameState,
                                          players: updatedPlayers,
                                          lastKillTime: killTime
                                        });
                                        showToast(`💀 Eliminated ${p.name}`);

                                        // Sync to Sheets
                                        try {
                                          const victim = p;
                                          const hunter = gameState.players.find(x => x.targetId === victim.id && !x.isDead);
                                          const killerPin = hunter ? hunter.pin : "0000";
                                          eliminatePlayerInSheet(victim.pin, killerPin);

                                          const startTime = gameState.gameStartTime || Date.now();
                                          assignTargetInSheet("System", "Metadata", `START_${startTime}_LAST_${killTime}`);
                                        } catch (error) {
                                          console.error("Failed to sync GM force elimination to Google Sheets:", error);
                                        }
                                      }
                                    }}
                                    className="text-rose-700 hover:text-rose-800 font-bold text-3xs bg-white border border-rose-200 px-2 py-1 rounded"
                                  >
                                    Spoil Kill
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setEditingPlayerId(p.id);
                                    setEditName(p.name);
                                    setEditPin(p.pin);
                                  }}
                                  className="text-[#2d6a4f] hover:text-[#1b4332] bg-white border border-[#dce6e1] px-2 py-1 rounded font-bold"
                                >
                                  Edit
                                </button>

                                <button
                                  onClick={() => handleRemovePlayer(p.id)}
                                  className="text-slate-400 hover:text-rose-600 bg-white border border-[#dce6e1] p-1.5 rounded"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* GM COL 2 (4 COLS): LOOP SETTINGS */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* GAME CONTROLS */}
              <div className="bg-white border border-[#dce6e1] rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-[#1b4332] uppercase tracking-widest">Sign-up Controls</h4>
                
                <div className="flex justify-between items-center bg-[#fdfbf7] p-4 border border-[#dce6e1] rounded-xl">
                  <div>
                    <span className="font-bold text-xs">Allow camper sign-ups</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Toggle sign-up button on dashboard</p>
                  </div>
                  
                  <button
                    onClick={handleToggleSignUp}
                    disabled={gameState.gameStarted}
                    className={`text-2xs font-extrabold px-3 py-1.5 rounded-lg border transition-all ${
                      gameState.signUpEnabled
                        ? "bg-emerald-100 border-[#b2d8c3] text-[#2d6a4f]"
                        : "bg-slate-100 border-slate-300 text-slate-500"
                    } disabled:opacity-50`}
                  >
                    {gameState.signUpEnabled ? "ENABLED" : "LOCKED"}
                  </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#dce6e1]/40">
                  {!gameState.gameStarted ? (
                    <button
                      onClick={handleStartGame}
                      className="w-full bg-[#1b4332] hover:bg-[#2d6a4f] text-white font-black text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase shadow-sm active:scale-95"
                    >
                      🚀 Start Game & Shuffle Loop
                    </button>
                  ) : (
                    <>
                      <div className="bg-[#e9f5ed] border border-[#b2d8c3] rounded-xl p-3 text-center text-xs font-bold text-[#2d6a4f] mb-2 uppercase">
                        🟢 Game is Live!
                      </div>
                      <button
                        onClick={handleEndGame}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase"
                      >
                        🛑 End Game & Reset Board
                      </button>
                      <button
                        onClick={handleStartGame}
                        className="w-full bg-white border border-[#dce6e1] hover:bg-slate-100 text-slate-700 font-bold text-2xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase"
                      >
                        <Shuffle size={12} className="shrink-0" /> Reshuffle Live Targets
                      </button>
                    </>
                  )}
                </div>

                <div className="border-t border-[#dce6e1]/40 pt-4">
                  <button
                    onClick={handleHardWipe}
                    className="w-full bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold text-2xs py-2 rounded-xl transition-all uppercase"
                  >
                    Wipe Roster (Wipe All)
                  </button>
                </div>
              </div>

              {/* GAME MASTER LOGOUT */}
              <div className="text-center bg-[#fdfbf7] p-4 rounded-2xl border border-[#dce6e1] text-3xs font-black text-slate-400 uppercase tracking-widest">
                <span>GM PIN: CAMP2026</span>
                <button
                  onClick={() => {
                    setIsAdminUnlocked(false);
                  }}
                  className="block mx-auto mt-2 text-[#2d6a4f] hover:text-[#1b4332]"
                >
                  Lock GM Dashboard
                </button>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* TOAST PANEL */}
      <AnimatePresence>
        {toastMessage && <Toast message={toastMessage} />}
      </AnimatePresence>

    </div>
  );
}
