import { logWarn } from "@/lib/errors";

/**
 * Validate that a URI is trusted for server-side fetching to avoid SSRF.
 * - HTTPS only
 * - No localhost or private IP ranges
 * - Hostname must be on an allowlist
 * - Basic path sanitization
 */
export function isTrustedUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Only allow HTTPS (no HTTP, file://, data:, etc.)
    if (url.protocol !== "https:") {
      logWarn(`Rejected URI with non-HTTPS protocol: ${url.protocol}`);
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost and loopback
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      logWarn(`Rejected localhost URI: ${hostname}`);
      return false;
    }

    // Block private IP ranges (basic check for IPv4 and common IPv6 link-local/ULA)
    if (
      /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname) || // RFC1918 ranges
      /^(169\.254\.)/.test(hostname) || // link-local IPv4
      /^(fc00:|fd00:|fe80:)/.test(hostname) // ULA and link-local IPv6
    ) {
      logWarn(`Rejected private IP range URI: ${hostname}`);
      return false;
    }

    // Block common suspicious patterns in hostname
    if (hostname.includes("..") || hostname.includes("%")) {
      logWarn(`Rejected URI with suspicious hostname patterns: ${hostname}`);
      return false;
    }

    // Check against allowlist
    let allowedHosts = (process.env.ALLOWED_MEDIA_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Provide a developer-friendly fallback list in non-production if not configured
    if (allowedHosts.length === 0) {
      const defaultDevHosts = [
        "googleapis.com",
        "googleusercontent.com",
        "storage.googleapis.com",
        "firebasestorage.googleapis.com",
      ];
      if (process.env.NODE_ENV !== "production") {
        allowedHosts = defaultDevHosts;
        logWarn(`[DEV] ALLOWED_MEDIA_HOSTS not set. Using development defaults: ${allowedHosts.join(", ")}`);
      } else {
        logWarn(
          "No ALLOWED_MEDIA_HOSTS configured - rejecting all URIs. " +
            "Set ALLOWED_MEDIA_HOSTS to a comma-separated list of trusted hostnames " +
            "(e.g., googleapis.com,googleusercontent.com,storage.googleapis.com,firebasestorage.googleapis.com)."
        );
        return false;
      }
    }

    // Exact or subdomain match
    const isAllowed = allowedHosts.some((allowedHost) => {
      if (!allowedHost) return false;
      if (hostname === allowedHost) return true;
      if (hostname.endsWith(`.${allowedHost}`)) return true;
      return false;
    });

    if (!isAllowed) {
      logWarn(`URI hostname not in allowlist: ${hostname}. Allowed: ${allowedHosts.join(", ")}`);
      return false;
    }

    // Additional path validation
    const path = url.pathname.toLowerCase();
    const suspiciousPatterns = [
      /\.(php|asp|aspx|jsp|cgi|pl|py|rb)$/, // Server-side scripts
      /\.(exe|bat|cmd|com|scr)$/, // Executables
      /\/\.\./, // Path traversal
      /%2e%2e/i, // URL-encoded path traversal
      /[<>"']/ // Potential XSS chars
    ];
    if (suspiciousPatterns.some((pattern) => pattern.test(path))) {
      logWarn(`URI contains suspicious path patterns: ${path}`);
      return false;
    }

    return true;
  } catch (error) {
    logWarn(`URI validation failed: ${error}`);
    return false;
  }
}

export function isValidMediaType(mimeType: string): boolean {
  const allowedTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  const normalizedType = (mimeType || "").toLowerCase().split(";")[0].trim();
  return allowedTypes.includes(normalizedType);
}