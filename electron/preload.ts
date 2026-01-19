import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld("electron", {
  // Store operations
  store: {
    get: (key: string) => ipcRenderer.invoke("store:get", key),
    set: (key: string, value: any) =>
      ipcRenderer.invoke("store:set", key, value),
    delete: (key: string) => ipcRenderer.invoke("store:delete", key),
    clear: () => ipcRenderer.invoke("store:clear"),
  },

  // System operations
  system: {
    reboot: () => ipcRenderer.invoke("system:reboot"),
    shutdown: () => ipcRenderer.invoke("system:shutdown"),
  },

  // App operations
  app: {
    restart: () => ipcRenderer.invoke("app:restart"),
    getVersion: () => ipcRenderer.invoke("app:version"),
    getAutoStart: () => ipcRenderer.invoke("app:get-auto-start"),
    setAutoStart: (enable: boolean) =>
      ipcRenderer.invoke("app:set-auto-start", enable),
  },

  // Window operations
  window: {
    toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
    toggleVisibility: () => ipcRenderer.invoke("window:toggle-visibility"),
    navigate: (path: string) => ipcRenderer.invoke("window:navigate", path),
  },

  // Logs
  logs: {
    getPath: () => ipcRenderer.invoke("logs:get-path"),
  },

  // Auto-updater control
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    onChecking: (callback: () => void) => {
      ipcRenderer.on("updater:checking", callback);
    },
    onAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on("updater:available", (_event, info) => callback(info));
    },
    onNotAvailable: (callback: () => void) => {
      ipcRenderer.on("updater:not-available", callback);
    },
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on("updater:progress", (_event, progress) =>
        callback(progress)
      );
    },
    onDownloaded: (callback: (info: any) => void) => {
      ipcRenderer.on("updater:downloaded", (_event, info) => callback(info));
    },
    onError: (callback: (message: string) => void) => {
      ipcRenderer.on("updater:error", (_event, message) => callback(message));
    },
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
});

// Type definitions for renderer
export interface ElectronAPI {
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
  };
  system: {
    reboot: () => Promise<{ success: boolean; error?: string }>;
    shutdown: () => Promise<{ success: boolean; error?: string }>;
  };
  app: {
    restart: () => Promise<void>;
    getVersion: () => Promise<string>;
  };
  window: {
    toggleFullscreen: () => Promise<boolean>;
    toggleVisibility: () => Promise<void>;
    navigate: (path: string) => Promise<void>;
  };
  logs: {
    getPath: () => Promise<string>;
  };
  updater: {
    check: () => Promise<{
      success: boolean;
      updateInfo?: any;
      error?: string;
    }>;
    download: () => Promise<{ success: boolean; error?: string }>;
    install: () => Promise<void>;
    onChecking: (callback: () => void) => void;
    onAvailable: (callback: (info: any) => void) => void;
    onNotAvailable: (callback: () => void) => void;
    onProgress: (callback: (progress: any) => void) => void;
    onDownloaded: (callback: (info: any) => void) => void;
    onError: (callback: (message: string) => void) => void;
  };
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
