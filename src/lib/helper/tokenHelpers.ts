/**
 * Generate a random 6-digit alphanumeric token
 * Format: A1B2C3 (uppercase letters and numbers only)
 *
 * @returns {string} 6-character token (e.g., "A1B2C3", "X9Y4Z1")
 */
export function generateToken(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";

  let token = "";

  for (let i = 0; i < 3; i++) {
    const randomLetter = letters[Math.floor(Math.random() * letters.length)];
    const randomNumber = numbers[Math.floor(Math.random() * numbers.length)];

    token += randomLetter + randomNumber;
  }

  return token;
}

/**
 * Validate token format
 * Must be exactly 6 characters: uppercase letters and numbers only
 *
 * @param {string} token - Token to validate
 * @returns {boolean} true if valid, false otherwise
 */
export function validateToken(token: string): boolean {
  const tokenRegex = /^[A-Z0-9]{6}$/;
  return tokenRegex.test(token);
}

/**
 * Format token with separators for display
 * Example: "A1B2C3" → "A1-B2-C3"
 *
 * @param {string} token - 6-character token
 * @returns {string} Formatted token with separators
 */
export function formatTokenDisplay(token: string): string {
  if (token.length !== 6) return token;
  return `${token.slice(0, 2)}-${token.slice(2, 4)}-${token.slice(4, 6)}`;
}

/**
 * Remove separators from formatted token
 * Example: "A1-B2-C3" → "A1B2C3"
 *
 * @param {string} formattedToken - Token with separators
 * @returns {string} Plain 6-character token
 */
export function unformatToken(formattedToken: string): string {
  return formattedToken.replace(/[^A-Z0-9]/g, "");
}
