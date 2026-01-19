/* eslint-disable @typescript-eslint/no-explicit-any */
import { default as Pusher, Channel } from "pusher-js";

const USE_PUSHER = process.env.NEXT_PUBLIC_USE_PUSHER === "true";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type EventHandler = (data: unknown) => void;
export type EventHandlers = Record<string, EventHandler>;

export interface RealtimeConnection {
  connect(): void;
  disconnect(): void;
  subscribe(channel: string, events: EventHandlers): void;
  unsubscribe(channel: string): void;
  send(event: string, data: unknown): void;
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
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(token: string, type: "admin" | "player") {
    this.token = token;
    this.type = type;
    console.log(`[WebSocket] Creating connection for ${type}`);
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.log(`[WebSocket] Connecting to ${WS_URL}...`);
    this.ws = new WebSocket(`${WS_URL}?token=${this.token}&type=${this.type}`);

    this.ws.onopen = () => {
      console.log(`[WebSocket] ✓ Connected as ${this.type}`);
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
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
    };

    this.ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      this.attemptReconnect();
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `[WebSocket] Reconnecting... (attempt ${this.reconnectAttempts})`
      );
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.messageHandlers.clear();
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
    } else {
      console.warn(`[WebSocket] Cannot send, not connected: ${event}`);
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

  constructor(token: string, type: "admin" | "player", uid?: number) {
    this.token = token;
    this.type = type;
    this.uid = uid || null;
    console.log(`[Pusher] Creating connection for ${type}`);
  }

  connect(): void {
    if (this.pusher) return;

    if (!PUSHER_KEY) {
      console.error("[Pusher] ✗ PUSHER_KEY is not set!");
      return;
    }

    console.log(`[Pusher] Connecting...`);
    console.log(`[Pusher] Key: ${PUSHER_KEY.substring(0, 8)}...`);
    console.log(`[Pusher] Cluster: ${PUSHER_CLUSTER}`);

    this.pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER || "ap1",
      authEndpoint: `${API_URL}/pusher/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    });

    this.pusher.connection.bind("connected", () => {
      console.log(`[Pusher] ✓ Connected as ${this.type}`);
    });

    this.pusher.connection.bind("error", (err: any) => {
      console.error("[Pusher] Connection error:", err);
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
  }

  subscribe(channel: string, events: EventHandlers): void {
    if (!this.pusher) {
      console.error("[Pusher] Cannot subscribe, not connected");
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
        console.log(`[Pusher] 📨 Event received: "${eventType}"`, data);
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
  uid?: number
): RealtimeConnection {
  if (USE_PUSHER && !PUSHER_KEY) {
    console.warn("[REALTIME] Pusher enabled but no key. Using WebSocket.");
    return new WebSocketConnection(token, type);
  }

  if (USE_PUSHER) {
    console.log("[REALTIME] Using Pusher connection");
    return new PusherConnection(token, type, uid);
  }

  console.log("[REALTIME] Using WebSocket connection");
  return new WebSocketConnection(token, type);
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
