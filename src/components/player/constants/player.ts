// API Configuration
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL;
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL;
export const USE_PUSHER = process.env.NEXT_PUBLIC_USE_PUSHER === "true";

// Pusher Configuration
export const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY || "";
export const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1";

// WebSocket Configuration
export const MAX_RECONNECT_ATTEMPTS = 10;
export const INITIAL_RECONNECT_DELAY = 1000; // 1 second
export const MAX_RECONNECT_DELAY = 30000; // 30 seconds

// Player Configuration
export const SLOT_CHECK_INTERVAL = 60000; // 1 minute
