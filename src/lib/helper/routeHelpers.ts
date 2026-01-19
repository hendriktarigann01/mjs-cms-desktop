/**
 * Navigation helper that works in both Electron and web environments
 */
export async function navigateTo(path: string): Promise<void> {
  console.log("[Navigate] Attempting to navigate to:", path);

  // Check if in Electron environment
  if (typeof window !== "undefined" && window.electron?.isElectron) {
    console.log("[Navigate] Electron environment detected");

    try {
      // Use IPC for navigation - main.ts will handle URL mapping
      console.log("[Navigate] Using IPC navigation...");
      await window.electron.window.navigate(path);
      console.log("[Navigate] ✓ Navigation successful");
    } catch (error) {
      console.error("[Navigate] ✗ Navigation failed:", error);

      // Fallback: Direct window.location with proper URL
      console.warn("[Navigate] Attempting fallback navigation...");
      if (path === "/" || path === "") {
        window.location.href = "app://-/";
      } else if (path === "/player") {
        window.location.href = "app://-/player/";
      } else {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        window.location.href = `app://-/${cleanPath}/`;
      }
    }
  } else {
    console.log("[Navigate] Using standard web navigation");
    // Standard web navigation (for development server)
    if (typeof window !== "undefined") {
      window.location.href = path;
    }
  }
}

/**
 * Reload current page
 */
export function reloadPage(): void {
  if (typeof window !== "undefined") {
    console.log("[Navigate] Reloading page...");
    window.location.reload();
  }
}

/**
 * Go back in history
 */
export function goBack(): void {
  if (typeof window !== "undefined") {
    console.log("[Navigate] Going back...");
    window.history.back();
  }
}
