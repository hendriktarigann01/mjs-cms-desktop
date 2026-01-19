/**
 * Global type definitions for Electron API
 * This file extends the Window interface to include electron APIs
 */

export interface ElectronStoreAPI {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<boolean>;
  delete: (key: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
}

export interface ElectronSystem {
  reboot: () => Promise<{ success: boolean; error?: string }>;
  shutdown: () => Promise<{ success: boolean; error?: string }>;
}

export interface ElectronApp {
  restart: () => Promise<void>;
  getVersion: () => Promise<string>;
}

export interface ElectronWindow {
  toggleFullscreen: () => Promise<boolean>;
  toggleVisibility: () => Promise<void>;
}

export interface ElectronLogs {
  getPath: () => Promise<string>;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

export interface ProgressInfo {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond?: number;
}

export interface ElectronUpdater {
  onChecking: (callback: () => void) => void;
  onAvailable: (callback: (info: UpdateInfo) => void) => void;
  onNotAvailable: (callback: () => void) => void;
  onProgress: (callback: (progress: ProgressInfo) => void) => void;
  onDownloaded: (callback: (info: UpdateInfo) => void) => void;
  onError: (callback: (message: string) => void) => void;
}

export interface ElectronAPI {
  store: ElectronStoreAPI;
  system: ElectronSystem;
  app: ElectronApp;
  window: ElectronWindow;
  logs: ElectronLogs;
  updater: ElectronUpdater;
  platform: string;
  isElectron: boolean;
}

// Extend Window interface
declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

// For module mode
export {};
