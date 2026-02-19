/* eslint-disable @typescript-eslint/no-explicit-any */
import { default as Pusher, Channel } from "pusher-js";

const USE_PUSHER = process.env.NEXT_PUBLIC_USE_PUSHER === "true";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type EventHandler = (data: unknown) => void;
export type EventHandlers = Record<string, EventHandler>;

// ✅ TAMBAHKAN: ConnectionState type
export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

// ✅ UPDATE: Interface dengan state management
export interface RealtimeConnection {
  connect(): void;
  disconnect(): void;
  subscribe(channel: string, events: EventHandlers): void;
  unsubscribe(channel: string): void;
  send(event: string, data: unknown): void;
  getState(): ConnectionState;
  onStateChange(callback: (state: ConnectionState) => void): void;
}

interface WebSocketMessage {
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

// =============================================
// WebSocket Implementation
// =============================================

class WebSocketConnection implements RealtimeConnection {
  private ws: WebSocket | null = null;
  private token: string;
  private type: "admin" | "player";
  private messageHandlers: Map<string, EventHandler> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50; // Fix #5: sama dengan web
  private reconnectDelay = 2000; // Fix #6: sama dengan web
  private connectionState: ConnectionState = "disconnected";
  private stateChangeCallbacks: Array<(state: ConnectionState) => void> = [];
  private autoReconnect: boolean;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null; // Fix #4
  private isReconnecting = false; // Fix #4

  constructor(token: string, type: "admin" | "player", autoReconnect = true) {
    this.token = token;
    this.type = type;
    this.autoReconnect = autoReconnect;
  }

  private setState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      console.log(`[WebSocket] State: ${this.connectionState} → ${state}`);
      this.connectionState = state;
      this.stateChangeCallbacks.forEach((callback) => callback(state));
    }
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  connect(): void {
    // Fix #1: guard CONNECTING state juga
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      console.log("[WebSocket] Already connecting/connected, skipping");
      return;
    }

    // Fix #2: bersihkan WebSocket lama sebelum buat baru
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws = null;
    }

    console.log(`[WebSocket] Connecting to ${WS_URL}...`);
    this.setState("connecting");
    this.ws = new WebSocket(`${WS_URL}?token=${this.token}&type=${this.type}`);

    this.ws.onopen = () => {
      console.log(`[WebSocket] ✓ Connected as ${this.type}`);
      this.setState("connected");
      this.reconnectAttempts = 0;
      this.reconnectDelay = 2000;
      this.isReconnecting = false; // Fix #4
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        console.log(`[WebSocket] Message received:`, message);

        if (message.type === "ping") {
          this.send("pong", {});
          return;
        }

        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          console.log(`[WebSocket] Calling handler for: ${message.type}`);
          handler(message.data);
        }
      } catch (error) {
        console.error("[WebSocket] Message error:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      this.setState("failed");
    };

    this.ws.onclose = () => {
      console.log(
        `[WebSocket] Closed (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      this.setState("disconnected");

      // Fix #4: guard dengan isReconnecting
      if (this.autoReconnect && !this.isReconnecting) {
        this.attemptReconnect();
      }
    };
  }

  private attemptReconnect(): void {
    if (this.isReconnecting) return; // Fix #4: cegah double reconnect

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(
        `[WebSocket] Max reconnect attempts (${this.maxReconnectAttempts}) reached`,
      );
      this.setState("failed");
      return;
    }

    this.isReconnecting = true; // Fix #4
    this.reconnectAttempts++;

    const delay = this.reconnectDelay;
    console.log(
      `[WebSocket] Reconnecting #${this.reconnectAttempts} in ${delay}ms`,
    );

    // Fix #4: simpan timer ref agar bisa di-cancel
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.isReconnecting = false;
      this.connect();
    }, delay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  disconnect(): void {
    console.log("[WebSocket] Disconnecting");
    this.autoReconnect = false;
    this.isReconnecting = false;

    // Fix #4: cancel pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Fix #3: bersihkan semua event handler dan null-kan ws
    if (this.ws) {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws = null;
    }

    this.setState("disconnected");
    this.messageHandlers.clear();
    this.stateChangeCallbacks = [];
  }

  subscribe(channel: string, events: EventHandlers): void {
    console.log(`[WebSocket] Subscribing to channel: ${channel}`);

    Object.entries(events).forEach(([eventType, handler]) => {
      console.log(`[WebSocket] Registering handler for event: ${eventType}`);
      this.messageHandlers.set(eventType, handler);
    });

    if (channel.includes("player-")) {
      const playerId = parseInt(channel.split("-")[1]);
      this.send("subscribe:player", { playerId });
    } else if (channel === "all") {
      this.send("subscribe:all", {});
    } else if (channel.startsWith("pairing-")) {
      const token = channel.split("-")[1];
      this.send("subscribe:pairing", { token });
    }
  }

  unsubscribe(channel: string): void {
    if (channel.includes("player-")) {
      const playerId = parseInt(channel.split("-")[1]);
      this.send("unsubscribe:player", { playerId });
    }
  }

  send(event: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`[WebSocket] Sending: ${event}`, data);
      this.ws.send(JSON.stringify({ type: event, data }));
    }
  }
}

// =============================================
// Pusher Implementation
// =============================================

class PusherConnection implements RealtimeConnection {
  private pusher: InstanceType<typeof Pusher> | null = null;
  private token: string;
  private type: "admin" | "player";
  private subscribedChannels: Map<string, Channel> = new Map();
  private uid: number | null = null;
  private connectionState: ConnectionState = "disconnected";
  private stateChangeCallbacks: Array<(state: ConnectionState) => void> = [];
  // Queue subscription yang dipanggil sebelum Pusher connected
  private pendingSubscriptions: Array<{
    channel: string;
    events: EventHandlers;
  }> = [];

  constructor(token: string, type: "admin" | "player", uid?: number) {
    this.token = token;
    this.type = type;
    this.uid = uid || null;
    console.log(`[Pusher] Creating connection for ${type}`);
  }

  private setState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      console.log(`[Pusher] State: ${this.connectionState} → ${state}`);
      this.connectionState = state;
      this.stateChangeCallbacks.forEach((callback) => callback(state));
    }
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  connect(): void {
    if (this.pusher) return;

    if (!PUSHER_KEY) {
      console.error("[Pusher] ✗ PUSHER_KEY is not set!");

      this.setState("failed");
      return;
    }

    console.log(`[Pusher] Connecting...`);
    console.log(`[Pusher] Key: ${PUSHER_KEY.substring(0, 8)}...`);
    console.log(`[Pusher] Cluster: ${PUSHER_CLUSTER}`);

    this.setState("connecting");

    this.pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER || "ap1",
      authEndpoint: `${API_URL}/pusher/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    });

    this.pusher.connection.bind("connecting", () => {
      console.log("[Pusher] Connecting...");
      this.setState("connecting");
    });

    this.pusher.connection.bind("connected", () => {
      console.log(`[Pusher] ✓ Connected as ${this.type}`);
      this.setState("connected");

      // Flush pending subscriptions yang dipanggil sebelum connected
      if (this.pendingSubscriptions.length > 0) {
        console.log(
          `[Pusher] Flushing ${this.pendingSubscriptions.length} pending subscription(s)...`,
        );
        const pending = [...this.pendingSubscriptions];
        this.pendingSubscriptions = [];
        pending.forEach(({ channel, events }) =>
          this.subscribe(channel, events),
        );
      }
    });

    this.pusher.connection.bind("unavailable", () => {
      console.error("[Pusher] Connection unavailable");
      this.setState("failed");
    });

    this.pusher.connection.bind("failed", () => {
      console.error("[Pusher] Connection failed");
      this.setState("failed");
    });

    this.pusher.connection.bind("disconnected", () => {
      console.log("[Pusher] Disconnected");
      this.setState("disconnected");
    });

    this.pusher.connection.bind("error", (err: any) => {
      console.error("[Pusher] Connection error:", err);

      this.setState("failed");
    });
  }

  disconnect(): void {
    if (this.pusher) {
      this.subscribedChannels.forEach((_, channelName) => {
        this.pusher?.unsubscribe(channelName);
      });
      this.subscribedChannels.clear();
      this.pusher.disconnect();
      this.pusher = null;
    }
    this.pendingSubscriptions = [];
    this.setState("disconnected");
    this.stateChangeCallbacks = [];
  }

  subscribe(channel: string, events: EventHandlers): void {
    if (!this.pusher) {
      // Queue untuk dieksekusi saat connected
      console.warn(
        `[Pusher] Not connected yet, queuing subscription: "${channel}"`,
      );
      this.pendingSubscriptions.push({ channel, events });
      return;
    }

    let channelName = channel;

    // Map channel names
    if (channel === "all" && this.type === "admin") {
      channelName = `private-admin-${this.uid}`;
    } else if (channel.includes("player-")) {
      const playerId = channel.split("-")[1];
      channelName = `player-${playerId}`;
    } else if (channel.startsWith("pairing-")) {
      const token = channel.split("-")[1];
      channelName = `pairing-${token}`;
    }

    console.log(`[Pusher] Subscribing: "${channel}" → "${channelName}"`);

    const pusherChannel = this.pusher.subscribe(channelName);
    this.subscribedChannels.set(channelName, pusherChannel);

    pusherChannel.bind("pusher:subscription_succeeded", () => {
      console.log(`[Pusher] Subscription succeeded: ${channelName}`);
    });

    pusherChannel.bind("pusher:subscription_error", (status: any) => {
      console.error(`[Pusher] Subscription failed: ${channelName}`, status);
    });

    // Bind custom events
    Object.entries(events).forEach(([eventType, handler]) => {
      console.log(`[Pusher] Binding event: "${eventType}" on ${channelName}`);
      pusherChannel.bind(eventType, (data: unknown) => {
        console.log(`[Pusher] Event received: "${eventType}"`, data);
        handler(data);
      });
    });

    // Debug: bind all events
    pusherChannel.bind_global((eventName: string, data: any) => {
      if (!eventName.startsWith("pusher:")) {
        console.log(`[Pusher] Global event: "${eventName}"`, data);
      }
    });
  }

  unsubscribe(channel: string): void {
    if (!this.pusher) return;

    const pusherChannel = this.subscribedChannels.get(channel);
    if (pusherChannel) {
      this.pusher.unsubscribe(channel);
      this.subscribedChannels.delete(channel);
      console.log(`[Pusher] Unsubscribed from ${channel}`);
    }
  }

  send(_event: string, _data: unknown): void {
    console.warn("[Pusher] Client-to-server messaging not supported");
  }
}

// =============================================
// Factory Function
// =============================================

export function createRealtimeConnection(
  token: string,
  type: "admin" | "player",
  options?: { uid?: number; autoReconnect?: boolean } | number, // Fix #7: support both signatures
): RealtimeConnection {
  // Support legacy call signature: createRealtimeConnection(token, type, uid)
  const uid = typeof options === "number" ? options : options?.uid;
  const autoReconnect =
    typeof options === "number" ? true : (options?.autoReconnect ?? true);

  if (USE_PUSHER && !PUSHER_KEY) {
    console.warn("[REALTIME] Pusher enabled but no key. Using WebSocket.");
    return new WebSocketConnection(token, type, autoReconnect);
  }

  if (USE_PUSHER) {
    console.log("[REALTIME] Using Pusher connection");
    return new PusherConnection(token, type, uid);
  }

  console.log("[REALTIME] Using WebSocket connection");
  return new WebSocketConnection(token, type, autoReconnect);
}

export async function getRealtimeConfig(type: "admin" | "player") {
  const { storage } = await import("./electronStorage");
  const isUsingPusher = USE_PUSHER && !!PUSHER_KEY;
  const token =
    typeof window !== "undefined" ? (await storage.getItem("token")) || "" : "";

  return {
    isUsingPusher,
    createConnection: (uid?: number) =>
      createRealtimeConnection(token, type, uid),
  };
}
