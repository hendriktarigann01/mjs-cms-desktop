"use client";
import { useState, useEffect, useRef } from "react";
import { generateToken } from "@/lib/helper/tokenHelpers";
import { navigateTo } from "@/lib/helper/routeHelpers";
import {
  createRealtimeConnection,
  type RealtimeConnection,
} from "@/lib/config/realtime";
import { storage } from "@/lib/config/electronStorage";

export default function ConnectCodePage() {
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [isChecking, setIsChecking] = useState(true);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const tokenRef = useRef("");
  const hasNavigatedRef = useRef(false);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) {
      console.log("[UserConnect] Init already in progress, skipping");
      return;
    }
    initStartedRef.current = true;

    const initConnect = async () => {
      console.log("[UserConnect] ===================");
      console.log("[UserConnect] Starting initialization");
      console.log("[UserConnect] ===================");

      try {
        const storedToken = await storage.getItem("player_token");
        console.log(
          "[UserConnect] Token check:",
          storedToken ? "✓ FOUND" : "✗ NOT FOUND"
        );

        // CRITICAL: Check if token is valid
        if (
          storedToken &&
          storedToken !== "null" &&
          storedToken.trim() !== ""
        ) {
          console.log("[UserConnect] ✓ Valid token exists");

          // Prevent loop
          if (hasNavigatedRef.current) {
            console.log("[UserConnect] ⚠️ Already navigated, stopping");
            setIsChecking(false);
            return;
          }

          // Check current location
          const currentHref = window.location.href;
          const currentPath = window.location.pathname;
          console.log("[UserConnect] Current href:", currentHref);
          console.log("[UserConnect] Current path:", currentPath);

          // IMPROVED: Better detection
          const isOnPlayerPage =
            currentPath.includes("/player") ||
            currentHref.includes("/player/") ||
            currentHref.includes("player/index.html");

          if (isOnPlayerPage) {
            console.log("[UserConnect] ✓ Already on player page");
            setIsChecking(false);
            return;
          }

          // Navigate to player
          console.log("[UserConnect] → Navigating to /player...");
          hasNavigatedRef.current = true;
          setIsChecking(false);

          // Add small delay to ensure state updates
          await new Promise((resolve) => setTimeout(resolve, 100));

          await navigateTo("/player");
          return;
        }

        // No token found - show connect screen
        console.log("[UserConnect] No token found, generating new one");
        setIsChecking(false);

        const newToken = generateToken();
        console.log("[UserConnect] Generated token:", newToken);
        setToken(newToken);
        tokenRef.current = newToken;

        // Setup connection
        console.log("[UserConnect] Creating connection...");
        const connection = createRealtimeConnection(newToken, "player");
        connectionRef.current = connection;

        setConnectionStatus("connecting");
        connection.connect();

        setTimeout(() => {
          console.log("[UserConnect] Subscribing to pairing-" + newToken);

          connection.subscribe(`pairing-${newToken}`, {
            "player:paired": async (data: any) => {
              console.log("===================");
              console.log("PAIRING EVENT RECEIVED!");
              console.log("===================");
              console.log("Data:", JSON.stringify(data, null, 2));

              let receivedToken: string | undefined;
              let playerData: any;

              if (data) {
                receivedToken =
                  data.token || data.data?.token || data.player_token;
                playerData =
                  data.player || data.data?.player || data.playerData;
              }

              console.log("→ Received token:", receivedToken);
              console.log("→ Expected token:", newToken);
              console.log("→ Token match:", receivedToken === newToken);
              console.log("→ Player data:", playerData ? "✓" : "✗");

              if (receivedToken === newToken && !hasNavigatedRef.current) {
                console.log("✓ TOKEN MATCHED! Processing...");
                hasNavigatedRef.current = true;

                try {
                  // Save token
                  console.log("→ Saving player_token...");
                  await storage.setItem("player_token", newToken);
                  console.log("✓ Token saved");

                  // Save player data if exists
                  if (playerData) {
                    console.log("→ Saving player_data...");
                    await storage.setItem(
                      "player_data",
                      JSON.stringify(playerData)
                    );
                    console.log("✓ Player data saved");
                  }

                  // Wait for storage to commit
                  console.log("→ Waiting for storage commit...");
                  await new Promise((resolve) => setTimeout(resolve, 500));

                  // Navigate
                  console.log("===================");
                  console.log("REDIRECTING TO PLAYER");
                  console.log("===================");

                  await navigateTo("/player");
                } catch (err) {
                  console.error("✗ PAIRING ERROR:", err);
                  hasNavigatedRef.current = false;
                }
              } else {
                console.error("✗ TOKEN MISMATCH OR ALREADY NAVIGATED");
                if (!receivedToken)
                  console.error("  → Received token is undefined");
                if (receivedToken !== newToken)
                  console.error("  → Tokens don't match");
                if (hasNavigatedRef.current)
                  console.error("  → Already navigated");
              }
            },
            waiting_pairing: () => {
              console.log("[UserConnect] Waiting for pairing...");
              setConnectionStatus("connected");
            },
          });

          setConnectionStatus("connected");
          console.log("[UserConnect] ✓ Subscription active");
        }, 500);
      } catch (error) {
        console.error("[UserConnect] ✗ INIT ERROR:", error);
        setIsChecking(false);
        initStartedRef.current = false;
      }
    };

    initConnect();

    return () => {
      console.log("[UserConnect] Cleanup");
      if (connectionRef.current) {
        connectionRef.current.disconnect();
      }
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto"></div>
          <p className="text-gray-600">Checking device status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-8 py-6 flex flex-col">
      <div className="flex items-center justify-between h-16">
        <img
          src="/logo/converra-text-beside.png"
          alt="logo converra"
          className="w-[140px] h-[60px] object-contain"
        />
      </div>

      <div className="flex flex-col flex-1 items-center justify-center text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-800">Connect Your Code</h1>

        <p className="text-gray-600 text-lg">
          Copy this code and paste it in the CMS to link your screen.
        </p>

        <p className="text-7xl tracking-[0.5em] text-gray-800 my-10">{token}</p>

        <p className="text-gray-600 text-sm">
          This code is unique for your device. Keep it private.
        </p>

        <button
          onClick={handleCopy}
          className="flex h-10 items-center gap-2 px-6 bg-brand-primary hover:bg-brand-tertiary text-[#FAFAFA] rounded-lg text-sm font-medium transition-colors"
        >
          {copied ? "Copied!" : "Copy Code"}
        </button>
      </div>
    </div>
  );
}
