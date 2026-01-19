/**
 * Get filename without extension
 */
export const getNameWithoutExt = (name: string | null | undefined): string => {
  if (!name) return "Unnamed Content";
  const parts = name.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : name;
};

/**
 * Get full file URL with API base
 */
export const getFileUrl = (filePath: string | null): string => {
  if (!filePath) return "";

  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  const API_BASE = process.env.NEXT_PUBLIC_URL;
  return `${API_BASE}/uploads/${filePath}`;
};

/**
 * Check if a URL is valid
 */
export const isValidUrl = (url: string): boolean => {
  if (!url) return false;

  const cleanUrl = url.trim();

  if (cleanUrl.startsWith("www.")) {
    try {
      new URL("https://" + cleanUrl);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const parsed = new URL(cleanUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};
