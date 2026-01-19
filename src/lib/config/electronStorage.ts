/**
 * Storage adapter that works in both browser and Electron environments
 *
 * In Electron: Uses electron-store (persistent, encrypted)
 * In Browser: Uses localStorage (for web development)
 */

// Use isElectron from preload (already exposed)
const isElectron = () => {
  if (typeof window === "undefined") {
    console.log("[isElectron] Window undefined");
    return false;
  }
  const result = !!window.electron?.isElectron;
  console.log(
    "[isElectron] Check result:",
    result,
    "window.electron:",
    !!window.electron
  );
  return result;
};

export const storage = {
  /**
   * Get item from storage
   */
  async getItem(key: string): Promise<string | null> {
    console.log("[Storage] getItem:", key, "isElectron:", isElectron());

    if (isElectron() && window.electron) {
      try {
        const value = await window.electron.store.get(key);
        console.log("[Storage] Electron get result:", value);

        // Handle null and undefined
        if (value === null || value === undefined) {
          console.log("[Storage] Value is null/undefined");
          return null;
        }

        // If it's already a string, return as-is
        if (typeof value === "string") {
          console.log("[Storage] Value is string");
          return value;
        }

        // If it's an object, stringify it
        console.log("[Storage] Value is object, stringifying");
        return JSON.stringify(value);
      } catch (error) {
        console.error("[Storage] Electron get error:", error);
        return null;
      }
    }

    // Fallback to localStorage
    const value = localStorage.getItem(key);
    console.log("[Storage] localStorage get result:", value);
    return value;
  },

  /**
   * Set item in storage
   */
  async setItem(key: string, value: string): Promise<void> {
    console.log("[Storage] setItem:", key, "isElectron:", isElectron());

    if (isElectron() && window.electron) {
      try {
        // For specific keys that should be stored as plain strings
        const plainStringKeys = ["player_token", "token"];

        if (plainStringKeys.includes(key)) {
          // Store as plain string (no parsing)
          await window.electron.store.set(key, value);
          console.log("[Storage] ✓ Electron set (plain string):", key);
        } else {
          // Try to parse as JSON for other keys
          try {
            const parsed = JSON.parse(value);
            await window.electron.store.set(key, parsed);
            console.log("[Storage] ✓ Electron set (JSON):", key);
          } catch {
            // If not valid JSON, store as string
            await window.electron.store.set(key, value);
            console.log("[Storage] ✓ Electron set (string fallback):", key);
          }
        }
      } catch (error) {
        console.error("[Storage] ✗ Electron set error:", error);
        throw error;
      }
    } else {
      localStorage.setItem(key, value);
      console.log("[Storage] ✓ localStorage set:", key);
    }
  },

  /**
   * Remove item from storage
   */
  async removeItem(key: string): Promise<void> {
    console.log("[Storage] removeItem:", key);
    if (isElectron() && window.electron) {
      await window.electron.store.delete(key);
      console.log("[Storage] ✓ Electron delete:", key);
    } else {
      localStorage.removeItem(key);
      console.log("[Storage] ✓ localStorage remove:", key);
    }
  },

  /**
   * Clear all storage
   */
  async clear(): Promise<void> {
    console.log("[Storage] Clearing all storage...");
    if (isElectron() && window.electron) {
      await window.electron.store.clear();
      console.log("[Storage] ✓ Electron cleared");
    } else {
      localStorage.clear();
      console.log("[Storage] ✓ localStorage cleared");
    }
  },

  /**
   * Check if key exists
   */
  async hasItem(key: string): Promise<boolean> {
    if (isElectron() && window.electron) {
      const value = await window.electron.store.get(key);
      const exists = value !== undefined && value !== null;
      console.log("[Storage] hasItem (Electron):", key, exists);
      return exists;
    }
    const exists = localStorage.getItem(key) !== null;
    console.log("[Storage] hasItem (localStorage):", key, exists);
    return exists;
  },
};

/**
 * Helper functions for common storage operations
 */
export async function getPlayerToken(): Promise<string | null> {
  console.log("[Helper] 🔑 Getting player token...");
  try {
    const token = await storage.getItem("player_token");

    if (!token) {
      console.log("[Helper] ✗ No token found");
      return null;
    }

    // Clean up any quotes or whitespace
    const cleanToken = token.replace(/^["']|["']$/g, "").trim();
    console.log(
      "[Helper] ✓ Token retrieved:",
      cleanToken ? "Found" : "Empty after cleaning"
    );

    return cleanToken || null;
  } catch (error) {
    console.error("[Helper] ✗ Error getting token:", error);
    return null;
  }
}

export async function setPlayerToken(token: string): Promise<void> {
  console.log("[Helper] 🔑 Setting player token...");
  try {
    // Ensure token is clean string without quotes
    const cleanToken = token.replace(/^["']|["']$/g, "").trim();

    if (!cleanToken) {
      console.warn("[Helper] ⚠️ Attempted to set empty token");
      return;
    }

    await storage.setItem("player_token", cleanToken);
    console.log("[Helper] ✓ Token set successfully");
  } catch (error) {
    console.error("[Helper] ✗ Error setting token:", error);
    throw error;
  }
}

export async function getPlayerData(): Promise<any | null> {
  console.log("[Helper] 📦 Getting player data...");
  try {
    const data = await storage.getItem("player_data");
    console.log("[Helper] Raw data length:", data?.length || 0);

    if (!data || data === "null" || data === "undefined") {
      console.log("[Helper] ✗ No valid data found");
      return null;
    }

    try {
      const parsed = JSON.parse(data);
      console.log(
        "[Helper] ✓ Data parsed successfully, player_id:",
        parsed?.player_id
      );
      return parsed;
    } catch (parseError) {
      console.error("[Helper] ✗ JSON parse error:", parseError);
      console.error(
        "[Helper] Raw data that failed to parse:",
        data.substring(0, 100)
      );
      return null;
    }
  } catch (error) {
    console.error("[Helper] ✗ Error getting player data:", error);
    return null;
  }
}

export async function setPlayerData(data: any): Promise<void> {
  console.log("[Helper] 📦 Setting player data...");
  try {
    if (!data) {
      console.log("[Helper] ⚠️ Setting null/undefined data");
    }

    const jsonString = JSON.stringify(data);
    console.log("[Helper] JSON string length:", jsonString.length);

    await storage.setItem("player_data", jsonString);
    console.log("[Helper] ✓ Player data set successfully");
  } catch (error) {
    console.error("[Helper] ✗ Error setting player data:", error);
    throw error;
  }
}

export async function clearPlayerData(): Promise<void> {
  console.log("[Helper] 🗑️ Clearing player data...");
  await storage.removeItem("player_token");
  await storage.removeItem("player_data");
  console.log("[Helper] ✓ Player data cleared");
}

/**
 * Cache management for offline capability
 */
export async function cacheSlotData(slotId: string, data: any): Promise<void> {
  console.log("[Cache] Caching slot data:", slotId);
  const cache = {
    slotId,
    data,
    timestamp: Date.now(),
  };
  await storage.setItem("lastSlotCache", JSON.stringify(cache));
  console.log("[Cache] ✓ Slot cached");
}

export async function getCachedSlotData(slotId: string): Promise<any | null> {
  console.log("[Cache] Getting cached slot:", slotId);
  const cached = await storage.getItem("lastSlotCache");
  if (!cached || cached === "null") {
    console.log("[Cache] ✗ No cache found");
    return null;
  }

  try {
    const cache = JSON.parse(cached);
    // Return cache only if it's for the same slot and less than 1 hour old
    if (cache.slotId === slotId && Date.now() - cache.timestamp < 3600000) {
      console.log("[Cache] ✓ Valid cache found");
      return cache.data;
    }
    console.log("[Cache] ✗ Cache expired or different slot");
  } catch (error) {
    console.error("[Cache] ✗ Failed to parse cached slot data:", error);
  }

  return null;
}

export async function clearCache(): Promise<void> {
  console.log("[Cache] Clearing cache...");
  await storage.removeItem("lastSlotCache");
  console.log("[Cache] ✓ Cache cleared");
}

/**
 * Get environment info
 */
export function isElectronEnv(): boolean {
  const result = isElectron();
  console.log("[Helper] 🖥️ isElectronEnv:", result);
  return result;
}

export function getPlatform(): string {
  const platform =
    isElectron() && window.electron ? window.electron.platform : "web";
  console.log("[Helper] 🖥️ Platform:", platform);
  return platform;
}
