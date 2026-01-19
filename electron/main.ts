import { app, BrowserWindow, ipcMain, screen } from "electron";
import Store from "electron-store";
import path from "path";
import { exec } from "child_process";
import log from "electron-log";
import serve from "electron-serve";
import { autoUpdater } from "electron-updater";

const loadURL = serve({ directory: "out" });
const store = new Store();

log.transports.file.level = "info";
log.info("App starting...");

// Configure auto-updater
autoUpdater.logger = log;
(autoUpdater.logger as any).transports.file.level = "info";
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ============================================
// AUTO-START CONFIGURATION
// ============================================
function setAutoStart(enable: boolean) {
  log.info(`[AutoStart] ${enable ? "Enabling" : "Disabling"} auto-start`);

  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: false,
    path: app.getPath("exe"),
    args: ["--autostart"],
  });

  log.info(`[AutoStart] Status set to: ${enable}`);
}

// ============================================
// AUTO-UPDATER EVENT HANDLERS
// ============================================
autoUpdater.on("checking-for-update", () => {
  log.info("[Updater] Checking for updates...");
  mainWindow?.webContents.send("updater:checking");
});

autoUpdater.on("update-available", (info) => {
  log.info("[Updater] Update available:", info.version);
  mainWindow?.webContents.send("updater:available", info);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("[Updater] No update available");
  mainWindow?.webContents.send("updater:not-available");
});

autoUpdater.on("error", (err) => {
  log.error("[Updater] Error:", err);
  mainWindow?.webContents.send("updater:error", err.message);
});

autoUpdater.on("download-progress", (progress) => {
  log.info("[Updater] Download progress:", Math.round(progress.percent));
  mainWindow?.webContents.send("updater:progress", progress);
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("[Updater] Update downloaded:", info.version);
  mainWindow?.webContents.send("updater:downloaded", info);
});

// ============================================
// IPC HANDLERS - Auto-Updater
// ============================================
ipcMain.handle("updater:check", async () => {
  log.info("[Updater] Manual check triggered");
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (error: any) {
    log.error("[Updater] Check failed:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("updater:download", async () => {
  log.info("[Updater] Download triggered");
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error: any) {
    log.error("[Updater] Download failed:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("updater:install", async () => {
  log.info("[Updater] Install triggered - app will restart");
  autoUpdater.quitAndInstall(false, true);
});

// ============================================
// IPC HANDLERS - Store Operations
// ============================================
ipcMain.handle("store:get", async (event, key) => {
  log.info(`[Store] GET: ${key}`);
  try {
    const value = (store as any).get(key);
    log.info(`[Store] GET result for ${key}:`, value);
    return value;
  } catch (error) {
    log.error(`[Store] GET error for ${key}:`, error);
    return null;
  }
});

ipcMain.handle("store:set", async (event, key, value) => {
  log.info(`[Store] SET: ${key} =`, value);
  try {
    (store as any).set(key, value);
    log.info(`[Store] SET success for ${key}`);
    return true;
  } catch (error) {
    log.error(`[Store] SET error for ${key}:`, error);
    return false;
  }
});

ipcMain.handle("store:delete", async (event, key) => {
  log.info(`[Store] DELETE: ${key}`);
  try {
    (store as any).delete(key);
    return true;
  } catch (error) {
    log.error(`[Store] DELETE error:`, error);
    return false;
  }
});

ipcMain.handle("store:clear", async () => {
  log.info("[Store] CLEAR all");
  try {
    (store as any).clear();
    return true;
  } catch (error) {
    log.error("[Store] CLEAR error:", error);
    return false;
  }
});

// ============================================
// IPC HANDLERS - System Operations
// ============================================
ipcMain.handle("system:shutdown", async () => {
  log.info("[System] Shutdown requested");
  return new Promise((resolve) => {
    const platform = process.platform;
    let command = "";

    if (platform === "win32") {
      command = "shutdown /s /t 0";
    } else if (platform === "darwin") {
      command = "sudo shutdown -h now";
    } else if (platform === "linux") {
      command = "shutdown -h now";
    }

    if (!command) {
      resolve({ success: false, error: "Unsupported platform" });
      return;
    }

    exec(command, (error) => {
      if (error) {
        log.error("[System] Shutdown error:", error);
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle("system:reboot", async () => {
  log.info("[System] Reboot requested");
  return new Promise((resolve) => {
    const platform = process.platform;
    let command = "";

    if (platform === "win32") {
      command = "shutdown /r /t 0";
    } else if (platform === "darwin") {
      command = "sudo shutdown -r now";
    } else if (platform === "linux") {
      command = "shutdown -r now";
    }

    if (!command) {
      resolve({ success: false, error: "Unsupported platform" });
      return;
    }

    exec(command, (error) => {
      if (error) {
        log.error("[System] Reboot error:", error);
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// ============================================
// IPC HANDLERS - App Operations
// ============================================
ipcMain.handle("app:restart", async () => {
  log.info("[App] Restart requested");
  app.relaunch();
  app.exit(0);
});

ipcMain.handle("app:version", async () => {
  return app.getVersion();
});

ipcMain.handle("app:get-auto-start", async () => {
  const settings = app.getLoginItemSettings();
  log.info("[AutoStart] Current status:", settings.openAtLogin);
  return settings.openAtLogin;
});

ipcMain.handle("app:set-auto-start", async (event, enable: boolean) => {
  setAutoStart(enable);
  return enable;
});

// ============================================
// IPC HANDLERS - Window Operations
// ============================================
ipcMain.handle("window:toggle-fullscreen", async (event) => {
  log.info("[Window] Toggle fullscreen");
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const isFullscreen = win.isFullScreen();
    win.setFullScreen(!isFullscreen);
    return !isFullscreen;
  }
  return false;
});

ipcMain.handle("window:toggle-visibility", async (event) => {
  log.info("[Window] Toggle visibility");
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  }
});

ipcMain.handle("window:navigate", async (event, path) => {
  log.info("[Window] Navigate requested to:", path);
  const win = BrowserWindow.fromWebContents(event.sender);

  if (!win) {
    log.error("[Window] No window found");
    return;
  }

  let targetUrl = "";

  if (app.isPackaged) {
    if (path === "/" || path === "") {
      targetUrl = "app://-/";
    } else if (path === "/player") {
      targetUrl = "app://-/player/";
    } else {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      targetUrl = `app://-/${cleanPath}/`;
    }
  } else {
    targetUrl = `http://localhost:3001${path}`;
  }

  log.info("[Window] Loading URL:", targetUrl);

  try {
    await win.loadURL(targetUrl);
    log.info("[Window] ✓ Navigation successful");
  } catch (error) {
    log.error("[Window] ✗ Navigation failed:", error);
    throw error;
  }
});

// ============================================
// IPC HANDLERS - Logs
// ============================================
ipcMain.handle("logs:get-path", async () => {
  const logPath = log.transports.file.getFile().path;
  log.info("[Logs] Log path:", logPath);
  return logPath;
});

// ============================================
// WINDOW CREATION
// ============================================
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  log.info("[Window] Creating main window");

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  log.info("[Window] Screen resolution:", { width, height });

  const preloadPath = path.join(__dirname, "preload.js");
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "resources/icon.ico")
    : path.join(__dirname, "../resources/icon.ico");

  log.info("[Window] Preload path:", preloadPath);
  log.info("[Window] Icon path:", iconPath);

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const token = (store as any).get("player_token");
  log.info("[Window] Stored token:", token ? "Found" : "Not found");

  if (app.isPackaged) {
    log.info("[Window] Loading from electron-serve...");
    await loadURL(mainWindow);
    log.info("[Window] Staying on index - app will handle navigation");
  } else {
    const devUrl = "http://localhost:3001";
    log.info("[Window] Loading dev URL:", devUrl);
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on("console-message", (event, level, message) => {
    log.info(`[Renderer] ${message}`);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      log.error("[Window] Load failed:", errorCode, errorDescription);
    }
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log.info("[Window] Page loaded successfully");
  });
}

// ============================================
// APP LIFECYCLE
// ============================================
app.whenReady().then(() => {
  log.info("[App] Ready");

  // Enable auto-start
  if (app.isPackaged) {
    setAutoStart(true);
    log.info("[App] Auto-start enabled");
  }

  createWindow();

  if (app.isPackaged) {
    setTimeout(() => {
      log.info("[Updater] Starting update check...");
      autoUpdater.checkForUpdates().catch((err) => {
        log.error("[Updater] Check failed:", err);
      });
    }, 10000);

    setInterval(() => {
      log.info("[Updater] Periodic update check...");
      autoUpdater.checkForUpdates().catch((err) => {
        log.error("[Updater] Periodic check failed:", err);
      });
    }, 4 * 60 * 60 * 1000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  log.error("[Process] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  log.error("[Process] Unhandled rejection:", reason);
});
