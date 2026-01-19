"use client";
import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

interface ProgressInfo {
  percent: number;
  transferred: number;
  total: number;
}

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only run in Electron
    if (!window.electron) return;

    // Checking for updates
    window.electron.updater.onChecking(() => {
      console.log("[Updater] Checking for updates...");
    });

    // Update available
    window.electron.updater.onAvailable((info: UpdateInfo) => {
      console.log("[Updater] Update available:", info);
      setUpdateAvailable(true);
      setUpdateInfo(info);
      setDownloading(true);
    });

    // No update available
    window.electron.updater.onNotAvailable(() => {
      console.log("[Updater] No updates available");
    });

    // Download progress
    window.electron.updater.onProgress((progressInfo: ProgressInfo) => {
      console.log("[Updater] Progress:", progressInfo.percent + "%");
      setProgress(progressInfo);
    });

    // Update downloaded
    window.electron.updater.onDownloaded((info: UpdateInfo) => {
      console.log("[Updater] Update downloaded:", info);
      setDownloading(false);
      setDownloaded(true);
    });

    // Update error
    window.electron.updater.onError((message: string) => {
      console.error("[Updater] Error:", message);
      setDownloading(false);
    });
  }, []);

  if (!window.electron || dismissed || !updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-brand-primary text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download size={20} />
          <span className="font-semibold">
            {downloaded ? "Update Ready" : "Updating App"}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="hover:bg-white/20 p-1 rounded transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {updateInfo && (
          <div className="text-sm text-gray-600">
            New version{" "}
            <span className="font-semibold text-gray-900">
              v{updateInfo.version}
            </span>{" "}
            is available
          </div>
        )}

        {/* Progress Bar */}
        {downloading && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Downloading...</span>
              <span>{Math.round(progress.percent)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 text-center">
              {formatBytes(progress.transferred)} /{" "}
              {formatBytes(progress.total)}
            </div>
          </div>
        )}

        {/* Downloaded */}
        {downloaded && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Update has been downloaded successfully. The app will restart
              automatically in 10 seconds.
            </p>
            <button
              onClick={() => window.electron!.app.restart()}
              className="w-full bg-brand-primary hover:bg-brand-tertiary text-white py-2 rounded-lg transition-colors font-medium"
            >
              Restart Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
