import { exec } from "child_process";
import { promisify } from "util";
import log from "electron-log";

const execAsync = promisify(exec);

/**
 * Reboot the Windows system
 * Requires administrator privileges
 */
export async function systemReboot(): Promise<void> {
  log.info("Executing system reboot...");

  try {
    // Windows command: shutdown with reboot flag
    // /r = reboot
    // /t 0 = timeout 0 seconds (immediate)
    // /f = force close applications
    await execAsync("shutdown /r /t 0 /f");
    log.info("Reboot command executed successfully");
  } catch (error) {
    log.error("Failed to execute reboot command:", error);
    throw new Error(`Reboot failed: ${error}`);
  }
}

/**
 * Shutdown the Windows system
 * Requires administrator privileges
 */
export async function systemShutdown(): Promise<void> {
  log.info("Executing system shutdown...");

  try {
    // Windows command: shutdown
    // /s = shutdown
    // /t 0 = timeout 0 seconds (immediate)
    // /f = force close applications
    await execAsync("shutdown /s /t 0 /f");
    log.info("Shutdown command executed successfully");
  } catch (error) {
    log.error("Failed to execute shutdown command:", error);
    throw new Error(`Shutdown failed: ${error}`);
  }
}

/**
 * Scheduled reboot with countdown
 * @param seconds - Number of seconds to wait before reboot
 */
export async function scheduledReboot(seconds: number): Promise<void> {
  log.info(`Scheduling reboot in ${seconds} seconds...`);

  try {
    await execAsync(`shutdown /r /t ${seconds} /f`);
    log.info(`Reboot scheduled for ${seconds} seconds from now`);
  } catch (error) {
    log.error("Failed to schedule reboot:", error);
    throw new Error(`Scheduled reboot failed: ${error}`);
  }
}

/**
 * Cancel scheduled shutdown/reboot
 */
export async function cancelScheduledShutdown(): Promise<void> {
  log.info("Canceling scheduled shutdown/reboot...");

  try {
    await execAsync("shutdown /a");
    log.info("Scheduled shutdown/reboot canceled");
  } catch (error) {
    log.error("Failed to cancel scheduled shutdown:", error);
    throw new Error(`Cancel shutdown failed: ${error}`);
  }
}

/**
 * Get system information
 */
export async function getSystemInfo(): Promise<{
  hostname: string;
  username: string;
  osVersion: string;
}> {
  try {
    const { stdout: hostname } = await execAsync("hostname");
    const { stdout: username } = await execAsync("echo %USERNAME%");
    const { stdout: osVersion } = await execAsync("ver");

    return {
      hostname: hostname.trim(),
      username: username.trim(),
      osVersion: osVersion.trim(),
    };
  } catch (error) {
    log.error("Failed to get system info:", error);
    throw error;
  }
}

/**
 * Check if running with administrator privileges
 */
export async function isAdmin(): Promise<boolean> {
  try {
    // Try to write to a protected registry key
    await execAsync('reg query "HKU\\S-1-5-19" >nul 2>&1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Restart Windows Explorer (useful for UI refresh)
 */
export async function restartExplorer(): Promise<void> {
  log.info("Restarting Windows Explorer...");

  try {
    await execAsync("taskkill /f /im explorer.exe");
    await execAsync("start explorer.exe");
    log.info("Windows Explorer restarted");
  } catch (error) {
    log.error("Failed to restart Explorer:", error);
    throw error;
  }
}
