/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Realtime Logger Helper
 * Utility untuk mengontrol console logging di realtime connections
 */

// Konfigurasi logging
const ENABLE_LOGGING = process.env.NEXT_PUBLIC_ENABLE_REALTIME_LOGS === "true";
const ENABLE_DEBUG = process.env.NEXT_PUBLIC_DEBUG_REALTIME === "true";

export class RealtimeLogger {
  private enabled: boolean;
  private debugEnabled: boolean;
  private prefix: string;

  constructor(prefix: string = "[REALTIME]") {
    this.enabled = ENABLE_LOGGING;
    this.debugEnabled = ENABLE_DEBUG;
    this.prefix = prefix;
  }

  /**
   * Aktifkan logging
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Nonaktifkan logging
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Aktifkan debug mode
   */
  enableDebug(): void {
    this.debugEnabled = true;
  }

  /**
   * Nonaktifkan debug mode
   */
  disableDebug(): void {
    this.debugEnabled = false;
  }

  /**
   * Check apakah logging aktif
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check apakah debug aktif
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Log pesan biasa
   */
  log(...args: any[]): void {
    if (this.enabled) {
      console.log(this.prefix, ...args);
    }
  }

  /**
   * Log pesan info
   */
  info(...args: any[]): void {
    if (this.enabled) {
      console.info(this.prefix, ...args);
    }
  }

  /**
   * Log pesan warning (selalu muncul)
   */
  warn(...args: any[]): void {
    console.warn(this.prefix, ...args);
  }

  /**
   * Log pesan error (selalu muncul)
   */
  error(...args: any[]): void {
    console.error(this.prefix, ...args);
  }

  /**
   * Log pesan debug (hanya jika debug enabled)
   */
  debug(...args: any[]): void {
    if (this.enabled && this.debugEnabled) {
      console.log(`${this.prefix}[DEBUG]`, ...args);
    }
  }

  /**
   * Log dengan kondisi
   */
  logIf(condition: boolean, ...args: any[]): void {
    if (condition && this.enabled) {
      console.log(this.prefix, ...args);
    }
  }

  /**
   * Group logging
   */
  group(label: string): void {
    if (this.enabled) {
      console.group(`${this.prefix} ${label}`);
    }
  }

  /**
   * Group collapsed
   */
  groupCollapsed(label: string): void {
    if (this.enabled) {
      console.groupCollapsed(`${this.prefix} ${label}`);
    }
  }

  /**
   * End group
   */
  groupEnd(): void {
    if (this.enabled) {
      console.groupEnd();
    }
  }

  /**
   * Table logging
   */
  table(data: any): void {
    if (this.enabled && this.debugEnabled) {
      console.table(data);
    }
  }
}

// Singleton instances untuk berbagai komponen
export const wsLogger = new RealtimeLogger("[WebSocket]");
export const pusherLogger = new RealtimeLogger("[Pusher]");
export const realtimeLogger = new RealtimeLogger("[REALTIME]");

// Fungsi global untuk mengontrol semua logger
export const RealtimeLogControl = {
  /**
   * Aktifkan semua logging
   */
  enableAll(): void {
    wsLogger.enable();
    pusherLogger.enable();
    realtimeLogger.enable();
  },

  /**
   * Nonaktifkan semua logging
   */
  disableAll(): void {
    wsLogger.disable();
    pusherLogger.disable();
    realtimeLogger.disable();
  },

  /**
   * Aktifkan debug mode untuk semua
   */
  enableDebugAll(): void {
    wsLogger.enableDebug();
    pusherLogger.enableDebug();
    realtimeLogger.enableDebug();
  },

  /**
   * Nonaktifkan debug mode untuk semua
   */
  disableDebugAll(): void {
    wsLogger.disableDebug();
    pusherLogger.disableDebug();
    realtimeLogger.disableDebug();
  },

  /**
   * Status logging
   */
  getStatus(): {
    websocket: { enabled: boolean; debug: boolean };
    pusher: { enabled: boolean; debug: boolean };
    general: { enabled: boolean; debug: boolean };
  } {
    return {
      websocket: {
        enabled: wsLogger.isEnabled(),
        debug: wsLogger.isDebugEnabled(),
      },
      pusher: {
        enabled: pusherLogger.isEnabled(),
        debug: pusherLogger.isDebugEnabled(),
      },
      general: {
        enabled: realtimeLogger.isEnabled(),
        debug: realtimeLogger.isDebugEnabled(),
      },
    };
  },
};

// Expose ke window untuk kontrol dari browser console
if (typeof window !== "undefined") {
  (window as any).RealtimeLogControl = RealtimeLogControl;
}
