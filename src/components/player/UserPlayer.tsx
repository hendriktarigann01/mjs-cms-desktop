"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getActiveSlot } from "@/lib/helper/playerHelpers";
import UpdateNotification from "@/components/electron/UpdateNotification";
import {
  createRealtimeConnection,
  type RealtimeConnection,
} from "@/lib/config/realtime";
import { realtimeLogger } from "@/lib/config/realtime.logger";
import {
  setPlayerToken,
  setPlayerData as savePlayerData,
  cacheSlotData,
  isElectronEnv,
} from "@/lib/config/electronStorage";
import {
  PlayerData,
  ConnectionStatus,
  PlaybackState,
  ScreenState,
  Slot,
} from "@/components/player/types/player.types";
import {
  API_URL,
  SLOT_CHECK_INTERVAL,
  MAX_RECONNECT_ATTEMPTS,
  INITIAL_RECONNECT_DELAY,
  MAX_RECONNECT_DELAY,
} from "@/components/player/constants/player";
import { PlayerHeader } from "@/components/player/common/PlayerHeader";
import { PlayerSidenav } from "@/components/player/common/PlayerSidenav";
import { PlayerMedia } from "@/components/player/common/PlayerMedia";
import { navigateTo } from "@/lib/helper/routeHelpers";

const USE_PUSHER = process.env.NEXT_PUBLIC_USE_PUSHER === "true";

const saveFailedReport = async (
  playerId: number,
  report: { type: string; message: string; metadata: Record<string, unknown> },
) => {
  try {
    if (window.electron?.isElectron) {
      const existing =
        (await window.electron.store.get("failed_reports")) || [];
      const failed = Array.isArray(existing) ? existing : [];
      failed.push({ playerId, report, timestamp: new Date().toISOString() });
      await window.electron.store.set("failed_reports", failed);
    }
  } catch {
    // Silent fail
  }
};

const getScreenResolution = () => ({
  width: window.screen.width,
  height: window.screen.height,
});

export default function UserPlayer() {
  // Flag untuk memastikan component hanya render di client
  const [isClient, setIsClient] = useState(false);

  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("playing");
  const [screenState, setScreenState] = useState<ScreenState>("on");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [screenResolution, setScreenResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleReconnectRef = useRef<(() => void) | null>(null);
  const resolutionSentRef = useRef(false);
  const initStartedRef = useRef(false); // Prevent multiple init

  const commandOverrideRef = useRef<{
    playback_state?: PlaybackState;
    screen_state?: ScreenState;
    timestamp: number;
  } | null>(null);

  // Heartbeat failure tracking
  const heartbeatFailureCountRef = useRef(0);
  const hasReportedWarningRef = useRef(false);
  const hasReportedErrorRef = useRef(false);
  const disconnectTimeRef = useRef<number | null>(null);

  // ============================================
  // INITIALIZATION - CLIENT ONLY
  // ============================================
  useEffect(() => {
    // Set client flag dengan requestAnimationFrame untuk avoid cascading renders
    requestAnimationFrame(() => {
      setIsClient(true);
    });
  }, []);

  // ============================================
  // COMPUTE PLAYLIST ITEMS
  // ============================================
  const playlistItems = useMemo(() => {
    if (!playerData) return [];

    // Priority 1: Schedule dengan active slot
    if (playerData.schedule && activeSlot?.playlist?.items) {
      return activeSlot.playlist.items;
    }

    // Priority 2: Direct playlist
    if (playerData.playlist_id && playerData.playlist?.items) {
      return playerData.playlist.items;
    }

    // Priority 3: Direct content
    if (playerData.content_id && playerData.content) {
      return [
        {
          item_id: 0,
          playlist_id: 0,
          content_id: playerData.content.content_id,
          uid: playerData.uid,
          item_order: 0,
          duration: playerData.content.duration ?? 0,
          created_at: new Date().toISOString(),
          content: {
            ...playerData.content,
            upload_file: playerData.content.upload_file ?? "",
          },
        },
      ];
    }

    return [];
  }, [playerData, activeSlot]);

  // ============================================
  // REPORTING & HEARTBEAT
  // ============================================
  const sendScreenResolution = useCallback(
    async (resolution: { width: number; height: number }) => {
      if (!playerId || resolutionSentRef.current) return;

      try {
        await fetch(`${API_URL}/pusher/webhook/player-resolution`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, resolution }),
        });
        resolutionSentRef.current = true;
      } catch {
        // Silent fail
      }
    },
    [playerId],
  );

  const sendReport = useCallback(
    async (
      type: "warning" | "error",
      message: string,
      metadata?: Record<string, unknown>,
      retries = 3,
    ) => {
      if (!playerId) return;

      realtimeLogger.log(`Report ${type.toUpperCase()}: ${message}`);

      if (USE_PUSHER) {
        const endpoint = `${API_URL}/pusher/webhook/player-report`;

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerId,
                report: { type, message, metadata: metadata || {} },
              }),
            });

            if (response.ok) return;

            realtimeLogger.error(
              `Report failed (HTTP ${response.status}) - attempt ${attempt}/${retries}`,
            );
            if (attempt < retries) {
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * attempt),
              );
            }
          } catch (error) {
            realtimeLogger.error(
              `Report network error (attempt ${attempt}/${retries}):`,
              error,
            );
            if (attempt < retries) {
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * attempt),
              );
            }
          }
        }

        realtimeLogger.error(
          `All ${retries} report attempts failed - saving to electron store`,
        );
        await saveFailedReport(playerId, {
          type,
          message,
          metadata: metadata || {},
        });
      } else {
        const connection = connectionRef.current;
        const connectionState = connection?.getState();

        if (!connection || connectionState !== "connected") {
          realtimeLogger.warn(
            `Cannot send report - connection ${connectionState ?? "unavailable"}`,
          );
          await saveFailedReport(playerId, {
            type,
            message,
            metadata: metadata || {},
          });
          return;
        }

        try {
          connection.send("player:report", {
            type,
            message,
            metadata: metadata || {},
          });
        } catch (error) {
          realtimeLogger.error("Report WebSocket send failed:", error);
          await saveFailedReport(playerId, {
            type,
            message,
            metadata: metadata || {},
          });
        }
      }
    },
    [playerId],
  );

  // ✅ FIX: Heartbeat dengan failure tracking & auto-report seperti web
  const sendHeartbeat = useCallback(async () => {
    if (!playerId) {
      console.warn("[Heartbeat] No playerId, skipping");
      return;
    }

    if (!USE_PUSHER) return; // WebSocket mode: heartbeat handled by connection monitoring

    try {
      console.log("[Heartbeat] Sending...", {
        playerId,
        playback_state: playbackState,
        screen_state: screenState,
      });

      const response = await fetch(`${API_URL}/pusher/webhook/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          status: {
            playback_state: playbackState,
            screen_state: screenState,
            firmware: isElectronEnv()
              ? "electron-player-v1.0"
              : "web-player-v1.0",
          },
        }),
      });

      if (response.ok) {
        console.log("[Heartbeat] ✓ Success");
        setIsOnline(true);
        if (heartbeatFailureCountRef.current > 0) {
          realtimeLogger.log(
            `Heartbeat restored after ${heartbeatFailureCountRef.current} failures`,
          );
          heartbeatFailureCountRef.current = 0;
          hasReportedWarningRef.current = false;
          hasReportedErrorRef.current = false;
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      heartbeatFailureCountRef.current++;
      realtimeLogger.warn(
        `Heartbeat failed (${heartbeatFailureCountRef.current}x):`,
        error,
      );
      setIsOnline(false);

      if (
        heartbeatFailureCountRef.current === 3 &&
        !hasReportedWarningRef.current
      ) {
        await sendReport(
          "warning",
          "Connection unstable. Check network quality.",
          { heartbeatFailures: heartbeatFailureCountRef.current },
        );
        hasReportedWarningRef.current = true;
      }

      if (
        heartbeatFailureCountRef.current === 10 &&
        !hasReportedErrorRef.current
      ) {
        await sendReport(
          "error",
          "Connection lost. Check the connection and make sure the device is on.",
          { heartbeatFailures: heartbeatFailureCountRef.current },
        );
        hasReportedErrorRef.current = true;
      }
    }
  }, [playbackState, screenState, playerId, sendReport]);

  // ============================================
  // FETCH PLAYER DATA
  // ============================================
  const fetchPlayerData = useCallback(
    async (token: string): Promise<PlayerData | null> => {
      try {
        const response = await fetch(`${API_URL}/player/token/${token}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const result = await response.json();
          const data = result.data?.player;

          if (data) {
            // Save to electron store if available
            if (window.electron?.isElectron) {
              const currentData =
                await window.electron.store.get("player_data");
              const shouldSave =
                !currentData ||
                JSON.stringify(currentData) !== JSON.stringify(data);

              if (shouldSave) {
                await savePlayerData(data);
              }
            }

            // Set player data state
            setPlayerData(data);
            setPlayerId(data.player_id);
            setPlaybackState(data.playback_state || "playing");
            setScreenState(data.screen_state || "on");

            setIsOnline(true);
            return data;
          }
        } else {
          if (response.status === 401 || response.status === 404) {
            console.error("Token invalid!");
            if (isElectronEnv() && window.electron) {
              await window.electron.store.delete("player_token");
              await window.electron.store.set("player_data", null);
              await new Promise((resolve) => setTimeout(resolve, 100));
              navigateTo("/");
            }
            return null;
          }
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setIsOnline(false);

        // Try electron store for cached data
        if (window.electron?.isElectron) {
          const cached = await window.electron.store.get("player_data");
          if (cached && cached.player_id) {
            setPlayerData(cached);
            setPlayerId(cached.player_id);
            setPlaybackState(cached.playback_state || "playing");
            setScreenState(cached.screen_state || "on");
            return cached;
          }
        }
      }
      return null;
    },
    [],
  );

  // ============================================
  // RECONNECTION LOGIC
  // ============================================
  const getReconnectDelay = useCallback((attempt: number) => {
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY,
    );
    return delay;
  }, []);

  // ============================================
  // EVENT HANDLERS
  // ============================================
  const handleControlCommand = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;

    const commandData = data as {
      playback_state?: PlaybackState;
      screen_state?: ScreenState;
    };

    const { playback_state, screen_state } = commandData;

    commandOverrideRef.current = {
      playback_state,
      screen_state,
      timestamp: Date.now(),
    };

    if (playback_state !== undefined) {
      setPlaybackState(playback_state);
      if (playback_state === "stopped") {
        setCurrentItemIndex(0);
      }
    }

    if (screen_state !== undefined) {
      setScreenState(screen_state);
    }

    setPlayerData((prev) =>
      prev
        ? {
            ...prev,
            playback_state: playback_state || prev.playback_state,
            screen_state: screen_state || prev.screen_state,
          }
        : prev,
    );

    setTimeout(() => {
      if (
        commandOverrideRef.current &&
        Date.now() - commandOverrideRef.current.timestamp >= 5000
      ) {
        commandOverrideRef.current = null;
      }
    }, 5000);
  }, []);

  // ✅ FIX: Add logging
  const handleScheduleUpdate = useCallback(() => {
    console.log(
      "[Event] Schedule/Config update received, fetching fresh data...",
    );
    commandOverrideRef.current = null;
    if (token) {
      fetchPlayerData(token);
    }
  }, [fetchPlayerData, token]);

  const handleSystemCommand = useCallback(
    async (command: "shutdown" | "restart") => {
      console.log(`[System Command] ===== RECEIVED: ${command} =====`);
      console.log(`[System Command] Timestamp: ${new Date().toISOString()}`);
      console.log(`[System Command] Connection status: ${connectionStatus}`);
      console.log(`[System Command] Is Electron: ${isElectronEnv()}`);
      console.log(
        `[System Command] Window.electron exists: ${!!window.electron}`,
      );

      // Show immediate feedback
      alert(
        `System command received: ${command}\nConnection: ${connectionStatus}\nElectron: ${isElectronEnv()}`,
      );

      if (!isElectronEnv() || !window.electron) {
        console.warn(
          `[System Command] ❌ IGNORED - not in electron environment`,
        );
        alert(`❌ IGNORED: Not in electron environment`);
        return;
      }

      try {
        // Map "restart" to "reboot" for electron API
        const electronCommand = command === "restart" ? "reboot" : command;
        console.log(
          `[System Command] 🔄 Executing electron command: ${electronCommand}`,
        );

        const result = await window.electron.system[electronCommand]();
        console.log(`[System Command] Result:`, result);

        if (!result.success) {
          console.error(`[System Command] ❌ FAILED:`, result.error);
          alert(`❌ FAILED: ${result.error || "Unknown error"}`);
          sendReport(
            "error",
            `Failed to ${command}: ${result.error || "Unknown error"}`,
          );
        } else {
          console.log(`[System Command] ✅ SUCCESS: ${command} executed`);
          alert(`✅ SUCCESS: ${command} executed successfully`);
        }
      } catch (error) {
        console.error(`[System Command] 💥 ERROR:`, error);
        alert(
          `💥 ERROR: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        sendReport(
          "error",
          `Error executing ${command}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [connectionStatus, sendReport],
  );

  const handleClearCacheFromCommand = useCallback(async () => {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }

    if (window.electron?.isElectron) {
      const token = await window.electron.store.get("player_token");
      await window.electron.store.set("player_data", null);
      if (token) await window.electron.store.set("player_token", token);
      setTimeout(() => window.electron!.app.restart(), 500);
    }
  }, []);

  // ✅ FIX: Improved setupConnection dengan logging dan multiple events
  const setupConnection = useCallback(
    (token: string, playerId: number) => {
      console.log("[Setup] Setting up connection for player:", playerId);

      if (connectionRef.current) {
        console.log("[Setup] Disconnecting existing connection");
        connectionRef.current.disconnect();
      }

      const connection = createRealtimeConnection(token, "player", playerId);
      connectionRef.current = connection;

      // ✅ FIX: Listen to connection state changes
      if (connection.onStateChange) {
        connection.onStateChange((state) => {
          console.log("[Connection] State changed:", state);
          setConnectionStatus(state as ConnectionStatus);

          if (state === "connected") {
            reconnectAttemptsRef.current = 0;
            // ✅ Fetch fresh data when reconnected
            console.log("[Connection] Reconnected, fetching fresh data...");
            fetchPlayerData(token);
          }
        });
      }

      console.log("[Setup] Connecting...");
      connection.connect(); // ✅ Explicit connect

      console.log("[Setup] Subscribing to events...");
      // ✅ FIX: Subscribe to ALL possible config update events dengan logging
      connection.subscribe(`player-${playerId}`, {
        "player:control": (data: unknown) => {
          console.log("[Event] player:control received:", data);
          handleControlCommand(data);
        },
        "player:clear_cache": (data: unknown) => {
          console.log("[Event] player:clear_cache received");
          handleClearCacheFromCommand();
        },
        // ✅ TAMBAHAN: Event handler untuk system command dari web admin
        "player:command": (data: unknown) => {
          console.log("[Event] player:command received:", data);
          const commandData = data as { command?: "shutdown" | "restart" };
          const { command } = commandData;
          if (command === "shutdown" || command === "restart") {
            handleSystemCommand(command);
          }
        },
        "system:command": (data: unknown) => {
          console.log("[Event] system:command received:", data);
          const commandData = data as { command?: "shutdown" | "restart" };
          const { command } = commandData;
          if (command === "shutdown" || command === "restart") {
            handleSystemCommand(command);
          }
        },
        "player:system-command": (data: unknown) => {
          console.log("[Event] player:system-command received:", data);
          const commandData = data as { command?: "shutdown" | "restart" };
          const { command } = commandData;
          if (command === "shutdown" || command === "restart") {
            handleSystemCommand(command);
          }
        },
        system_command: (data: unknown) => {
          console.log("[Event] system_command received:", data);
          const commandData = data as { command?: "shutdown" | "restart" };
          const { command } = commandData;
          if (command === "shutdown" || command === "restart") {
            handleSystemCommand(command);
          }
        },
        shutdown: (data: unknown) => {
          console.log("[Event] shutdown received:", data);
          handleSystemCommand("shutdown");
        },
        restart: (data: unknown) => {
          console.log("[Event] restart received:", data);
          handleSystemCommand("restart");
        },
        "config:updated": (data: unknown) => {
          console.log("[Event] config:updated received:", data);
          handleScheduleUpdate();
        },
        // ✅ CRITICAL FIX: Tambahkan event ini!
        "player:schedule_updated": (data: unknown) => {
          console.log("[Event] player:schedule_updated received:", data);
          handleScheduleUpdate();
        },
        "player:config_updated": (data: unknown) => {
          console.log("[Event] player:config_updated received:", data);
          handleScheduleUpdate();
        },
        "schedule:updated": (data: unknown) => {
          console.log("[Event] schedule:updated received:", data);
          handleScheduleUpdate();
        },
      });

      console.log("[Setup] Connection setup complete");

      // Don't set status manually if using state listener
      if (!connection.onStateChange) {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      }
    },
    [
      handleControlCommand,
      handleScheduleUpdate,
      handleClearCacheFromCommand,
      fetchPlayerData,
    ],
  );

  const handleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus("disconnected");

      sendReport(
        "error",
        "Connection lost. Check the connection and make sure the device is turned on.",
        { reconnectAttempts: reconnectAttemptsRef.current },
      );
      return;
    }

    const delay = getReconnectDelay(reconnectAttemptsRef.current);
    reconnectAttemptsRef.current++;

    if (reconnectAttemptsRef.current === 3) {
      sendReport(
        "warning",
        "Connection unstable. Check the network quality or move the device closer to the internet source.",
        { reconnectAttempts: reconnectAttemptsRef.current },
      );
    }

    setConnectionStatus("connecting");

    reconnectTimeoutRef.current = setTimeout(() => {
      if (token && playerId) {
        try {
          setupConnection(token, playerId);
        } catch {
          handleReconnectRef.current?.();
        }
      }
    }, delay);
  }, [getReconnectDelay, setupConnection, sendReport, token, playerId]);

  useEffect(() => {
    handleReconnectRef.current = handleReconnect;
  }, [handleReconnect]);

  const handleClearCache = useCallback(async () => {
    if (confirm("Are you sure you want to clear cache?")) {
      if (connectionRef.current) {
        connectionRef.current.disconnect();
        connectionRef.current = null;
      }

      if (window.electron?.isElectron) {
        const token = await window.electron.store.get("player_token");
        await window.electron.store.set("player_data", null);
        if (token) await window.electron.store.set("player_token", token);
        alert("Cache cleared successfully!");
        setTimeout(() => window.electron!.app.restart(), 500);
      }
    }
  }, []);

  const toggleFullscreen = async () => {
    if (isElectronEnv()) {
      await window.electron!.window.toggleFullscreen();
    } else {
      try {
        if (!document.fullscreenElement) {
          await containerRef.current?.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch {
        // Silent fail
      }
    }
  };

  // ============================================
  // ELECTRON INITIALIZATION - HANYA JALAN SEKALI!
  // ============================================
  useEffect(() => {
    if (!isClient) return;
    if (initStartedRef.current) {
      console.log("[Init] Already started, skipping");
      return;
    }

    initStartedRef.current = true;
    console.log("[Init] Starting initialization...");

    const init = async () => {
      try {
        // Check if running in Electron
        if (!window.electron?.isElectron) {
          console.log("[Init] Not electron, redirecting to /");
          navigateTo("/");
          return;
        }

        const token = await window.electron.store.get("player_token");
        const cachedDataRaw = await window.electron.store.get("player_data");
        const cachedData =
          typeof cachedDataRaw === "string"
            ? JSON.parse(cachedDataRaw)
            : cachedDataRaw;

        console.log("[Init] Token:", token ? "Found" : "Not found");
        console.log("[Init] Cached data:", cachedData ? "Found" : "Not found");

        if (!token || token === "null" || token.trim() === "") {
          console.log("[Init] No valid token, redirecting to /");
          navigateTo("/");
          return;
        }

        setToken(token);

        // Set cached data immediately if exists
        if (cachedData && cachedData.player_id) {
          console.log("[Init] Loading cached data...");
          requestAnimationFrame(() => {
            setPlayerData(cachedData);
            setPlaybackState(cachedData.playback_state || "playing");
            setScreenState(cachedData.screen_state || "on");
          });
          setPlayerId(cachedData.player_id);
        }

        // Get resolution
        const resolution = getScreenResolution();
        setScreenResolution(resolution);

        // Fetch fresh data ONCE
        console.log("[Init] Fetching fresh player data...");
        await fetchPlayerData(token);
        console.log("[Init] Initialization complete");
      } catch (error) {
        console.error("[Init] Error:", error);
        initStartedRef.current = false; // Reset on error
      }
    };

    init();
  }, [isClient, fetchPlayerData]); // ✅ Tambahkan fetchPlayerData

  // ============================================
  // CONNECTION INITIALIZATION
  // ✅ FIX: Tambahkan fetchPlayerData untuk auto-refresh
  // ============================================
  useEffect(() => {
    if (!isClient || !token || !playerId) {
      console.log("[Connection Init] Skipping - missing token or playerId");
      return;
    }

    // ✅ TAMBAHAN: Fetch data untuk memastikan selalu update
    console.log("[Connection Init] Fetching fresh data before connection...");
    fetchPlayerData(token);

    const initTimer = setTimeout(() => {
      setupConnection(token, playerId);
    }, 100); // Small delay to ensure fetchPlayerData completes

    return () => {
      clearTimeout(initTimer);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (connectionRef.current) {
        connectionRef.current.disconnect();
      }
    };
  }, [isClient, token, playerId, setupConnection, fetchPlayerData]); // ✅ Dependencies

  // ✅ FIX: Add periodic refresh sebagai fallback
  useEffect(() => {
    if (!isClient || !token) return;

    // Fetch data setiap 30 detik sebagai fallback
    const refreshInterval = setInterval(() => {
      if (token) {
        console.log("[Periodic Refresh] Fetching data...");
        fetchPlayerData(token);
      }
    }, 30000); // 30 detik

    return () => clearInterval(refreshInterval);
  }, [isClient, fetchPlayerData, token]);

  // ============================================
  // SEND SCREEN RESOLUTION
  // ============================================
  useEffect(() => {
    if (
      playerId &&
      screenResolution &&
      isElectronEnv() &&
      !resolutionSentRef.current
    ) {
      sendScreenResolution(screenResolution);
    }
  }, [screenResolution, sendScreenResolution, playerId]);

  // ============================================
  // FULLSCREEN EVENT LISTENER
  // ============================================
  useEffect(() => {
    if (!isClient) return;

    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [isClient]);

  // ============================================
  // ACTIVE SLOT UPDATE (SCHEDULE MODE)
  // ============================================
  useEffect(() => {
    if (!playerData?.schedule) return;

    const newSlot = getActiveSlot(playerData.schedule.slots || []);
    if (newSlot?.slot_id !== activeSlot?.slot_id) {
      const slotTimer = setTimeout(async () => {
        setActiveSlot(newSlot);
        setCurrentItemIndex(0);
        if (newSlot && isElectronEnv()) {
          await cacheSlotData(newSlot.slot_id, newSlot);
        }
      }, 0);
      return () => clearTimeout(slotTimer);
    }
  }, [playerData, activeSlot?.slot_id]);

  useEffect(() => {
    if (!playerData?.schedule) return;

    const interval = setInterval(async () => {
      const slot = getActiveSlot(playerData.schedule?.slots || []);
      if (slot?.slot_id !== activeSlot?.slot_id) {
        setActiveSlot(slot);
        setCurrentItemIndex(0);
        if (slot && isElectronEnv()) {
          await cacheSlotData(slot.slot_id, slot);
        }
      }
    }, SLOT_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [playerData, activeSlot?.slot_id]);

  // ============================================
  // HEARTBEAT
  // ============================================
  useEffect(() => {
    if (!isClient || !playerId) return;

    sendHeartbeat();

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, 10000);

    return () => clearInterval(heartbeatInterval);
  }, [isClient, sendHeartbeat, playerId]);

  // ============================================
  // MONITOR CONNECTION STATUS (WebSocket mode)
  // ============================================
  useEffect(() => {
    if (!isClient || USE_PUSHER) return;

    if (connectionStatus === "disconnected") {
      if (!disconnectTimeRef.current) {
        disconnectTimeRef.current = Date.now();
        realtimeLogger.warn("Connection lost, monitoring started");
      }

      const checkAndSendReports = () => {
        if (!disconnectTimeRef.current) return;

        const elapsed = Date.now() - disconnectTimeRef.current;
        const currentState = connectionRef.current?.getState();

        if (
          elapsed >= 4000 &&
          !hasReportedWarningRef.current &&
          currentState !== "connected"
        ) {
          realtimeLogger.warn(
            `Disconnected for ${Math.floor(elapsed / 1000)}s - sending WARNING`,
          );
          sendReport("warning", "Connection unstable. Check network quality.", {
            connectionStatus,
            elapsedSeconds: Math.floor(elapsed / 1000),
          });
          hasReportedWarningRef.current = true;
        }

        if (
          elapsed >= 32000 &&
          !hasReportedErrorRef.current &&
          currentState !== "connected"
        ) {
          realtimeLogger.error(
            `Disconnected for ${Math.floor(elapsed / 1000)}s - sending ERROR`,
          );
          sendReport(
            "error",
            "Connection lost. Check the connection and make sure the device is on.",
            {
              connectionStatus,
              elapsedSeconds: Math.floor(elapsed / 1000),
            },
          );
          hasReportedErrorRef.current = true;
        }
      };

      checkAndSendReports();
      const checkInterval = setInterval(checkAndSendReports, 1000);
      return () => clearInterval(checkInterval);
    }

    if (connectionStatus === "connected") {
      realtimeLogger.log("Connection restored");
      disconnectTimeRef.current = null;
      hasReportedWarningRef.current = false;
      hasReportedErrorRef.current = false;
    }
  }, [isClient, connectionStatus, sendReport]);

  // ============================================
  // BACKGROUND SYNC FAILED REPORTS
  // ============================================
  useEffect(() => {
    if (!isClient || !playerId) return;

    const syncFailedReports = async () => {
      try {
        const stored =
          (await window.electron?.store.get("failed_reports")) || [];
        const failedReports: Array<{
          playerId: number;
          report: {
            type: string;
            message: string;
            metadata: Record<string, unknown>;
          };
          timestamp: string;
        }> = Array.isArray(stored) ? stored : [];

        if (failedReports.length === 0) return;

        realtimeLogger.log(`Syncing ${failedReports.length} failed reports...`);

        if (USE_PUSHER) {
          const endpoint = `${API_URL}/pusher/webhook/player-report`;
          const stillFailed = [];

          for (const item of failedReports) {
            try {
              const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item),
              });
              if (!response.ok) stillFailed.push(item);
            } catch {
              stillFailed.push(item);
            }
          }

          await window.electron?.store.set("failed_reports", stillFailed);
          realtimeLogger.log(
            `Sync complete: ${failedReports.length - stillFailed.length} synced, ${stillFailed.length} still pending`,
          );
        } else {
          const connection = connectionRef.current;
          if (!connection || connection.getState() !== "connected") return;

          const stillFailed = [];
          for (const item of failedReports) {
            try {
              connection.send("player:report", item.report);
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
              realtimeLogger.error("Failed to sync report:", error);
              stillFailed.push(item);
            }
          }

          await window.electron?.store.set("failed_reports", stillFailed);
          realtimeLogger.log(
            `Sync complete: ${failedReports.length - stillFailed.length} synced, ${stillFailed.length} still pending`,
          );
        }
      } catch (error) {
        realtimeLogger.error("Failed to sync reports:", error);
      }
    };

    if (connectionStatus === "connected") syncFailedReports();

    const syncInterval = setInterval(syncFailedReports, 30000);
    return () => clearInterval(syncInterval);
  }, [isClient, connectionStatus, playerId]);

  // ============================================
  // AUTO-ADVANCE CONTENT
  // ============================================
  useEffect(() => {
    if (playbackState === "stopped" || playlistItems.length === 0) return;

    const currentItem = playlistItems[currentItemIndex];
    if (!currentItem) return;

    const timer = setTimeout(() => {
      setCurrentItemIndex((prev) => (prev + 1) % playlistItems.length);
    }, currentItem.duration * 1000);

    return () => clearTimeout(timer);
  }, [playlistItems, currentItemIndex, playbackState]);

  // ============================================
  // RENDER - CLIENT ONLY
  // ============================================
  if (!isClient) {
    return (
      <div className="h-screen bg-black flex items-center justify-center relative overflow-hidden">
        <div className="text-center">
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!playerData) {
    return (
      <div className="h-screen bg-black flex items-center justify-center relative overflow-hidden">
        <div className="text-center">
          <p className="text-white text-lg">Loading...</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-green-500"
                  : connectionStatus === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
              }`}
            />
            <span className="text-gray-400 text-sm capitalize">
              {connectionStatus}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const currentItem = playlistItems[currentItemIndex] || null;

  return (
    <div
      ref={containerRef}
      className="h-screen bg-black flex items-center justify-center relative overflow-hidden"
    >
      <PlayerMedia
        screenState={screenState}
        playbackState={playbackState}
        currentItem={currentItem}
      />

      {isElectronEnv() && <UpdateNotification />}

      {screenState === "on" && (
        <PlayerHeader
          isVisible={!isSideNavOpen}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onOpenMenu={() => setIsSideNavOpen(true)}
        />
      )}

      <PlayerSidenav
        isOpen={isSideNavOpen}
        onClose={() => setIsSideNavOpen(false)}
        playerData={playerData}
        connectionStatus={connectionStatus}
        activeSlot={activeSlot}
        onClearCache={handleClearCache}
        isElectron={isElectronEnv()}
        isOnline={isOnline}
      />
    </div>
  );
}
