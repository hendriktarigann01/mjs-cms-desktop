"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { getActiveSlot } from "@/lib/helper/playerHelpers";
import UpdateNotification from "@/components/electron/UpdateNotification";
import {
  createRealtimeConnection,
  type RealtimeConnection,
} from "@/lib/config/realtime";
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

const getScreenResolution = () => ({
  width: window.screen.width,
  height: window.screen.height,
});

export default function UserPlayer() {
  console.log("[UserPlayer] Component mounting...");

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
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [screenResolution, setScreenResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef("");
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleReconnectRef = useRef<(() => void) | null>(null);
  const resolutionSentRef = useRef(false);

  const commandOverrideRef = useRef<{
    playback_state?: PlaybackState;
    screen_state?: ScreenState;
    timestamp: number;
  } | null>(null);

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
    [playerId]
  );

  const sendReport = useCallback(
    async (
      type: "warning" | "error",
      message: string,
      metadata?: Record<string, unknown>
    ) => {
      if (!playerId) return;
      try {
        await fetch(`${API_URL}/pusher/webhook/player-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId,
            report: { type, message, metadata: metadata || {} },
          }),
        });
      } catch {
        // Silent fail
      }
    },
    [playerId]
  );

  const sendHeartbeat = useCallback(async () => {
    if (!playerId) return;
    try {
      await fetch(`${API_URL}/pusher/webhook/heartbeat`, {
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
    } catch {
      // Silent fail
    }
  }, [playerId, playbackState, screenState]);

  const fetchPlayerData = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/player/token/${token}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.data?.player || result.data || result.player;

        if (data && data.player_id) {
          setPlayerData(data);
          setPlayerId(data.player_id);

          const currentData = await window.electron?.store.get("player_data");
          const hasChanged =
            JSON.stringify(currentData) !== JSON.stringify(data);

          if (hasChanged) {
            console.log("[Fetch] Data changed, saving...");
            await savePlayerData(data);
          } else {
            console.log("[Fetch] Data unchanged, skipping save");
          }

          const hasRecentCommand =
            commandOverrideRef.current &&
            Date.now() - commandOverrideRef.current.timestamp < 5000;

          if (!hasRecentCommand) {
            setPlaybackState(data.playback_state || "playing");
            setScreenState(data.screen_state || "on");
          }

          setIsOnline(true);
          setLoading(false);
        }
      } else {
        if (response.status === 401 || response.status === 404) {
          await setPlayerToken("");
          await savePlayerData(null as any);
          navigateTo("/");
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      setIsOnline(false);

      // Try electron store directly
      if (window.electron?.isElectron) {
        const cached = await window.electron.store.get("player_data");
        if (cached && cached.player_id) {
          setPlayerData(cached);
          setPlayerId(cached.player_id);
          setPlaybackState(cached.playback_state || "playing");
          setScreenState(cached.screen_state || "on");
          setLoading(false);
        }
      }
    }
  }, []);

  const getReconnectDelay = useCallback((attempt: number) => {
    return Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY
    );
  }, []);

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
      if (playback_state === "stopped") setCurrentItemIndex(0);
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
        : prev
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

  const handleScheduleUpdate = useCallback(() => {
    commandOverrideRef.current = null;
    fetchPlayerData(tokenRef.current);
  }, [fetchPlayerData]);

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

  const handleSystemCommand = useCallback(async (data: unknown) => {
    if (!isElectronEnv()) return;
    if (!data || typeof data !== "object") return;

    const commandData = data as { command?: "shutdown" | "restart" };
    const { command } = commandData;

    if (!command || !["shutdown", "restart"].includes(command)) return;

    try {
      if (command === "shutdown") {
        await window.electron!.system.shutdown();
      } else if (command === "restart") {
        await window.electron!.system.reboot();
      }
    } catch {
      // Silent fail
    }
  }, []);

  const setupConnection = useCallback(
    (token: string, playerId: number) => {
      if (connectionRef.current) connectionRef.current.disconnect();

      const connection = createRealtimeConnection(token, "player");
      connectionRef.current = connection;

      setConnectionStatus("connecting");
      connection.connect();

      connection.subscribe(`player-${playerId}`, {
        "player:control": handleControlCommand,
        "player:command": handleControlCommand,
        "player:schedule-update": handleScheduleUpdate,
        "player:clear_cache": handleClearCacheFromCommand,
        "player:system-command": handleSystemCommand,
        "config:updated": handleScheduleUpdate,
      });

      setTimeout(() => {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      }, 1000);
    },
    [
      handleControlCommand,
      handleScheduleUpdate,
      handleClearCacheFromCommand,
      handleSystemCommand,
    ]
  );

  const handleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus("disconnected");
      sendReport(
        "error",
        "Connection lost. Check the connection and make sure the device is turned on.",
        { reconnectAttempts: reconnectAttemptsRef.current }
      );
      return;
    }

    const delay = getReconnectDelay(reconnectAttemptsRef.current);
    reconnectAttemptsRef.current++;

    if (reconnectAttemptsRef.current === 3) {
      sendReport(
        "warning",
        "Connection unstable. Check the network quality or move the device closer to the internet source.",
        { reconnectAttempts: reconnectAttemptsRef.current }
      );
    }

    setConnectionStatus("connecting");

    reconnectTimeoutRef.current = setTimeout(() => {
      const token = tokenRef.current;
      if (token && playerId) {
        try {
          setupConnection(token, playerId);
        } catch (err) {
          handleReconnectRef.current?.();
        }
      }
    }, delay);
  }, [getReconnectDelay, setupConnection, sendReport, playerId]);

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

  useEffect(() => {
    const init = async () => {
      console.log("[Init] Start");

      try {
        // Direct electron store access
        if (!window.electron?.isElectron) {
          console.error("[Init] Not electron");
          navigateTo("/");
          return;
        }

        const token = await window.electron.store.get("player_token");
        const cachedDataRaw = await window.electron.store.get("player_data");
        const cachedData =
          typeof cachedDataRaw === "string"
            ? JSON.parse(cachedDataRaw)
            : cachedDataRaw;

        console.log("[Init] Token:", token);
        console.log("[Init] Cached:", cachedData);

        if (!token || token === "null" || token.trim() === "") {
          console.error("[Init] No token - navigating to connect page");
          navigateTo("/");
          return;
        }

        tokenRef.current = token;

        // Set cached data IMMEDIATELY
        if (cachedData && cachedData.player_id) {
          console.log("[Init] Setting cached data NOW");
          setPlayerData(cachedData);
          setPlayerId(cachedData.player_id);
          setPlaybackState(cachedData.playback_state || "playing");
          setScreenState(cachedData.screen_state || "on");
          setLoading(false); // CRITICAL: Stop loading immediately
        }

        // Get resolution
        const resolution = getScreenResolution();
        setScreenResolution(resolution);

        // Fetch fresh data in background
        fetchPlayerData(token);
      } catch (error) {
        console.error("[Init] Error:", error);
        setLoading(false);
      }
    };

    init();
  }, []); // Run once only

  // Setup connection
  useEffect(() => {
    if (!tokenRef.current || !playerId) return;

    const timer = setTimeout(() => {
      setupConnection(tokenRef.current, playerId);
    }, 500);

    return () => {
      clearTimeout(timer);
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (connectionRef.current) connectionRef.current.disconnect();
    };
  }, [playerId, setupConnection]);

  useEffect(() => {
    if (
      playerId &&
      screenResolution &&
      isElectronEnv() &&
      !resolutionSentRef.current
    ) {
      sendScreenResolution(screenResolution);
    }
  }, [playerId, screenResolution, sendScreenResolution]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  useEffect(() => {
    if (!playerData) return;

    const checkSlot = async () => {
      const newSlot = getActiveSlot(playerData.schedule?.slots || []);
      if (newSlot?.slot_id !== activeSlot?.slot_id) {
        setActiveSlot(newSlot);
        setCurrentItemIndex(0);
        if (newSlot && isElectronEnv())
          await cacheSlotData(newSlot.slot_id, newSlot);
      }
    };

    checkSlot();
  }, [playerData, activeSlot?.slot_id]);

  useEffect(() => {
    if (!playerData) return;

    const interval = setInterval(async () => {
      const slot = getActiveSlot(playerData.schedule?.slots || []);
      if (slot?.slot_id !== activeSlot?.slot_id) {
        setActiveSlot(slot);
        setCurrentItemIndex(0);
        if (slot && isElectronEnv()) await cacheSlotData(slot.slot_id, slot);
      }
    }, SLOT_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [playerData, activeSlot?.slot_id]);

  useEffect(() => {
    if (!playerId) return;
    sendHeartbeat();
    const interval = setInterval(() => sendHeartbeat(), 10000);
    return () => clearInterval(interval);
  }, [sendHeartbeat, playerId]);

  useEffect(() => {
    if (playbackState === "stopped" || !activeSlot) return;

    const items = activeSlot.playlist?.items || [];
    if (items.length === 0) return;

    const currentItem = items[currentItemIndex];
    if (!currentItem) return;

    const timer = setTimeout(() => {
      setCurrentItemIndex((prev) => (prev + 1) % items.length);
    }, currentItem.duration * 1000);

    return () => clearTimeout(timer);
  }, [activeSlot, currentItemIndex, playbackState]);

  if (loading || !playerData) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="text-white text-lg">Loading Player...</p>
          <div className="text-xs text-gray-500">
            <p>Token: {tokenRef.current ? "✓" : "✗"}</p>
            <p>Player ID: {playerId || "Waiting..."}</p>
          </div>
        </div>
      </div>
    );
  }

  const items = activeSlot?.playlist?.items || [];
  const currentItem = items[currentItemIndex] || null;

  return (
    <div
      ref={containerRef}
      className="h-screen bg-black flex items-center justify-center relative"
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
