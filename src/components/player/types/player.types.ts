export type PlaybackState = "playing" | "stopped";
export type ScreenState = "on" | "off";
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface PlayerData {
  player_id: number;
  player_name: string;
  location?: string;
  playback_state?: PlaybackState;
  screen_state?: ScreenState;
  schedule?: {
    schedule_name: string;
    slots: Slot[];
  };
  screen_width: number;
  screen_height: number;
}

export interface Slot {
  slot_id: string;
  start_time: string;
  end_time: string;
  playlist?: {
    items: PlaylistItem[];
  };
}

export interface PlaylistItem {
  content_id: string;
  duration: number;
  content: {
    filename: string;
    format_name: string;
    upload_file: string;
  };
}

// Define specific data types for WebSocket messages
export interface WebSocketMessageData {
  playback_state?: PlaybackState;
  screen_state?: ScreenState;
  type?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: string;
  data?: WebSocketMessageData;
  token?: string;
}

export interface PlayerStatus {
  currentItemIndex: number;
  currentContentId: string;
  currentSlotId: string;
  playback_state: PlaybackState;
  screen_state: ScreenState;
  timestamp: string;
}
