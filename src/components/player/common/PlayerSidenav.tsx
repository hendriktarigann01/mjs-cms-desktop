import { X, Power, RotateCcw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import {
  PlayerData,
  ConnectionStatus,
  Slot,
} from "@/components/player/types/player.types";

interface PlayerSidenavProps {
  isOpen: boolean;
  onClose: () => void;
  playerData: PlayerData;
  connectionStatus: ConnectionStatus;
  activeSlot: Slot | null;
  onClearCache: () => void;
  isElectron?: boolean;
  isOnline?: boolean;
}

const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <label className="text-sm uppercase tracking-wide text-white">
      {label}
    </label>
    <p className="mt-1 text-xs text-white font-medium">{value}</p>
  </div>
);

const ConnectionStatusIndicator = ({
  status,
}: {
  status: ConnectionStatus;
}) => (
  <div>
    <label className="text-sm uppercase tracking-wide text-white">Status</label>
    <div className="mt-2 space-y-2">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            status === "connected"
              ? "bg-green-500"
              : status === "connecting"
              ? "bg-yellow-500 animate-pulse"
              : "bg-error-primary"
          }`}
        />
        <span className="text-xs font-medium text-white capitalize">
          {status}
        </span>
      </div>
    </div>
  </div>
);

export const PlayerSidenav = ({
  isOpen,
  onClose,
  playerData,
  connectionStatus,
  activeSlot,
  onClearCache,
  isElectron = false,
}: PlayerSidenavProps) => {
  const [systemActionLoading, setSystemActionLoading] = useState<string | null>(
    null
  );

  const handleSystemAction = async (action: "reboot" | "shutdown") => {
    if (!isElectron || !window.electron) {
      alert("System controls are only available in desktop app");
      return;
    }

    const actionName = action === "reboot" ? "Reboot" : "Shutdown";
    const confirmMessage = `Are you sure you want to ${actionName.toLowerCase()} the system? This will close all applications.`;

    if (!confirm(confirmMessage)) return;

    setSystemActionLoading(action);

    try {
      const result = await window.electron.system[action]();

      if (!result.success) {
        alert(
          `Failed to ${actionName.toLowerCase()}: ${
            result.error || "Unknown error"
          }`
        );
        setSystemActionLoading(null);
      }
      // If successful, system will restart/shutdown, so no need to clear loading
    } catch (error) {
      console.error(`${actionName} error:`, error);
      alert(`Error: ${error}`);
      setSystemActionLoading(null);
    }
  };

  const handleAppRestart = async () => {
    if (!isElectron || !window.electron) {
      window.location.reload();
      return;
    }

    if (confirm("Restart the application?")) {
      await window.electron.app.restart();
    }
  };

  return (
    <div
      className={`fixed top-0 right-0 h-full w-80 bg-black backdrop-blur-sm shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Player Info</h2>
          <button
            onClick={onClose}
            className="p-2 cursor-pointer hover:bg-white/10 rounded transition-colors"
            aria-label="Close menu"
          >
            <X size={24} className="text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <InfoItem label="Player Name" value={playerData.player_name} />

          <ConnectionStatusIndicator status={connectionStatus} />

          <InfoItem
            label="Location"
            value={playerData.location || "Not specified"}
          />

          <InfoItem
            label="Schedule Name"
            value={playerData.schedule?.schedule_name || "No active schedule"}
          />

          {activeSlot && (
            <InfoItem
              label="Current Slot"
              value={`${new Date(activeSlot.start_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} - ${new Date(activeSlot.end_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
            />
          )}

          {/* Divider */}
          <div className="border-t border-gray-700" />

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Clear Cache */}
            <button
              onClick={onClearCache}
              className="w-full flex items-center justify-center gap-2 bg-brand-tertiary hover:bg-gray-800 text-white py-3 rounded-lg transition-colors duration-200 font-medium"
            >
              <Trash2 size={18} />
              Clear Cache
            </button>

            {/* Restart App (Electron only) */}
            {isElectron && (
              <button
                onClick={handleAppRestart}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg transition-colors duration-200 font-medium"
              >
                <RotateCcw size={18} />
                Restart App
              </button>
            )}

            {/* System Controls (Electron only) */}
            {isElectron && (
              <>
                <div className="border-t border-gray-700 my-2" />
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  System Controls
                </p>

                {/* Reboot */}
                <button
                  onClick={() => handleSystemAction("reboot")}
                  disabled={systemActionLoading !== null}
                  className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-colors duration-200 font-medium"
                >
                  {systemActionLoading === "reboot" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Rebooting...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={18} />
                      Reboot System
                    </>
                  )}
                </button>

                {/* Shutdown */}
                <button
                  onClick={() => handleSystemAction("shutdown")}
                  disabled={systemActionLoading !== null}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-colors duration-200 font-medium"
                >
                  {systemActionLoading === "shutdown" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Shutting down...
                    </>
                  ) : (
                    <>
                      <Power size={18} />
                      Shutdown System
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
