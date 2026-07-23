// --- spoonsApi.ts ---
// Google Sheets Database API client for the Spoons game Camptracker.

export interface Player {
  id: string;
  name: string;
  email: string;
  phone: string;
  targetId: string | null;
  isDead: boolean;
  pin: string;
  killDate?: string;
  deathReason?: string;
  eliminatedBy?: string;
}

export interface KillLogEntry {
  id: string;
  killerName: string;
  victimName: string;
  date: string;
  reason: string;
}

export interface GameState {
  players: Player[];
  killLog: KillLogEntry[];
  signUpEnabled: boolean;
  gameStarted: boolean;
  gameStartTime?: number;
  lastKillTime?: number;
  deathTimes?: Record<string, number>;
  systemMetadataExists?: boolean;
  deletedPlayerIds?: string[];
}

export const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxGS_5Zr0RZtBrd744l9ohEBdJE-fmJb4dtJnQlgEA1Xr5SG5VT6_kWKkeFkUWtJk34/exec";

// 1. Add Player to Google Sheets Database
export const addPlayerToSheet = async (firstName: string, lastName: string, pinCode: string): Promise<any> => {
  const payload = {
    action: "addPlayer",
    firstName,
    lastName,
    pinCode
  };

  try {
    const response = await fetch(SHEET_API_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain", // Required to bypass preflight CORS blocks in Google Apps Script
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Sheet addPlayer success:", result);
      return result;
    }
  } catch (error) {
    console.error("Error adding player to Google Sheet:", error);
  }
  return null;
};

// 2. Eliminate Player (Log a Kill) in Google Sheets Database
export const eliminatePlayerInSheet = async (targetPin: string, killerPin: string): Promise<any> => {
  const payload = {
    action: "eliminatePlayer",
    targetPin,
    killerPin
  };

  try {
    const response = await fetch(SHEET_API_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Sheet eliminatePlayer success:", result);
      return result;
    }
  } catch (error) {
    console.error("Error registering elimination in Google Sheet:", error);
  }
  return null;
};

// 3. Assign a Target in Google Sheets Database
export const assignTargetInSheet = async (firstName: string, lastName: string, targetName: string): Promise<any> => {
  const payload = {
    action: "assignTarget",
    firstName,
    lastName,
    targetName
  };

  try {
    const response = await fetch(SHEET_API_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Sheet assignTarget success:", result);
      return result;
    }
  } catch (error) {
    console.error("Error assigning target in Google Sheet:", error);
  }
  return null;
};

// 3. Fetch Raw Data from Google Sheets (defensive requests)
export const fetchStateFromSheet = async (): Promise<any> => {
  // Try GET request first (default behavior for public scripts returning JSON)
  try {
    const response = await fetch(SHEET_API_URL, { method: "GET" });
    if (response.ok) {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        console.warn("GET response is not valid JSON, trying POST instead.");
      }
    }
  } catch (error) {
    console.warn("GET request to Apps Script failed, trying POST actions:", error);
  }

  // Try POST with action "getState"
  try {
    const response = await fetch(SHEET_API_URL, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "getState" })
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn("POST getState action failed, trying getPlayers:", error);
  }

  // Try POST with action "getPlayers"
  try {
    const response = await fetch(SHEET_API_URL, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "getPlayers" })
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("All fetch attempts to Google Sheet Web App failed:", error);
  }

  return null;
};

// 4. Fetch State and Map to local interfaces
export const fetchStateFromRemote = async (roomId: string = "default", writeKey?: string): Promise<GameState | null> => {
  const data = await fetchStateFromSheet();
  if (!data) return null;

  let sheetPlayers: any[] = [];
  let sheetKillLog: any[] = [];

  // Parse variations of returned JSON formats
  if (Array.isArray(data)) {
    sheetPlayers = data;
  } else if (data && Array.isArray(data.players)) {
    sheetPlayers = data.players;
    sheetKillLog = Array.isArray(data.killLog) ? data.killLog : [];
  } else if (data && typeof data === "object") {
    // Fallback: look for any array inside the returned object
    const foundArray = Object.values(data).find(val => Array.isArray(val));
    if (foundArray) {
      sheetPlayers = foundArray as any[];
    }
  }

  if (sheetPlayers.length === 0) {
    return {
      players: [],
      killLog: [],
      signUpEnabled: true,
      gameStarted: false,
      gameStartTime: undefined,
      lastKillTime: undefined
    };
  }

  // Map sheet rows to Player interface defensively
  const mappedPlayers: Player[] = sheetPlayers.map((sp: any) => {
    const firstName = sp.firstName || sp.firstname || "";
    const lastName = sp.lastName || sp.lastname || "";
    const name = sp.name || `${firstName} ${lastName}`.trim() || "Unknown Camper";
    const pin = String(sp.pin || sp.pinCode || sp.pincode || "");

    return {
      id: name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      name,
      email: sp.email || "",
      phone: sp.phone || "",
      targetId: sp.targetId || null, // Loop will resolve this mapping using PINs
      targetPin: String(sp.targetPin || sp.target || ""), // temporary field to bridge target mapping
      isDead: sp.isDead === true || String(sp.isDead).toLowerCase() === "true" || sp.status === "Eliminated" || !!sp.eliminatedBy,
      pin,
      killDate: sp.killDate || sp.date || undefined,
      deathReason: sp.deathReason || sp.reason || undefined,
      eliminatedBy: sp.eliminatedBy ? String(sp.eliminatedBy).trim() : undefined
    };
  });

  // Resolve target IDs using target PINs or names
  mappedPlayers.forEach(p => {
    const tPin = (p as any).targetPin;
    if (tPin) {
      const target = mappedPlayers.find(tp => tp.pin === tPin || tp.name === tPin);
      if (target) {
        p.targetId = target.id;
      }
    }
  });

  // Build the kill log timeline
  let finalKillLog: KillLogEntry[] = [];
  if (sheetKillLog.length > 0) {
    finalKillLog = sheetKillLog.map((sl: any) => ({
      id: sl.id || String(Date.now() + Math.random()),
      killerName: sl.killerName || sl.killer || "Unknown",
      victimName: sl.victimName || sl.victim || "Unknown",
      date: sl.date || sl.time || new Date().toLocaleDateString(),
      reason: sl.reason || "Eliminated in the hunt"
    }));
  } else {
    // Reconstruct kill log timeline entries from dead players if log isn't outputted separately
    mappedPlayers.forEach(p => {
      if (p.isDead && p.eliminatedBy) {
        finalKillLog.push({
          id: `reconstructed-${p.pin || p.name}`,
          killerName: p.eliminatedBy,
          victimName: p.name,
          date: p.killDate || "Recent",
          reason: p.deathReason || "Eliminated in the hunt"
        });
      }
    });
  }

  // Find system player and extract metadata
  const systemPlayer = mappedPlayers.find(p => p.name === "System Metadata");
  let gameStartTime: number | undefined = undefined;
  let lastKillTime: number | undefined = undefined;
  const deathTimesMap: Record<string, number> = {};
  const deletedPlayerIds: string[] = [];

  if (systemPlayer) {
    const targetPin = (systemPlayer as any).targetPin || "";
    if (targetPin.startsWith("START_")) {
      const parts = targetPin.split("_");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === "START") gameStartTime = parseInt(parts[i + 1], 10);
        if (parts[i] === "LAST") lastKillTime = parseInt(parts[i + 1], 10);
        if (parts[i] === "DEATHS" && parts[i + 1]) {
          parts[i + 1].split(",").forEach((pair: string) => {
            const [pid, tsStr] = pair.split(":");
            if (pid && tsStr) {
              deathTimesMap[pid] = parseInt(tsStr, 10);
            }
          });
        }
        if (parts[i] === "DELETED" && parts[i + 1]) {
          parts[i + 1].split(",").forEach((id: string) => {
            if (id) deletedPlayerIds.push(id);
          });
        }
      }
    }
  }

  const deletedSet = new Set(deletedPlayerIds);

  // Remove System Metadata player and soft-deleted players from final list
  const filteredMappedPlayers = mappedPlayers.filter(p => p.name !== "System Metadata" && !deletedSet.has(p.id));

  // Assign killDate for each dead player using deathTimesMap
  filteredMappedPlayers.forEach(p => {
    if (p.isDead) {
      const ts = deathTimesMap[p.id];
      if (ts) {
        p.killDate = new Date(ts).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      } else {
        p.killDate = "Recent";
      }
    }
  });

  // Sort reconstructed kill log entries by their death timestamp (force workflow redeploy)
  finalKillLog.sort((a, b) => {
    const playerA = filteredMappedPlayers.find(p => p.name === a.victimName);
    const playerB = filteredMappedPlayers.find(p => p.name === b.victimName);
    const timeA = playerA ? (deathTimesMap[playerA.id] || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const timeB = playerB ? (deathTimesMap[playerB.id] || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });

  // Re-map the date in finalKillLog using the updated player killDates
  finalKillLog.forEach(log => {
    if (log.id.startsWith("reconstructed-")) {
      const victimName = log.victimName;
      const player = filteredMappedPlayers.find(p => p.name === victimName);
      if (player && player.killDate) {
        log.date = player.killDate;
      }
    }
  });

  return {
    players: filteredMappedPlayers,
    killLog: finalKillLog,
    signUpEnabled: true,
    gameStarted: filteredMappedPlayers.some(p => p.targetId !== null),
    gameStartTime,
    lastKillTime,
    deathTimes: deathTimesMap,
    systemMetadataExists: !!systemPlayer,
    deletedPlayerIds
  };
};

// 5. Keeps existing signatures happy, but handles saves on individual sheets API endpoints
export const saveStateToRemote = async (roomId: string, writeKey: string, state: GameState): Promise<boolean> => {
  return true;
};
