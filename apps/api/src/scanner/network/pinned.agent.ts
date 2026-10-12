import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { URL } from 'node:url';
import { validateAndResolveTarget, verifyPublicIp } from './ssrf.guard.js';

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
  signal?: AbortSignal;
}


export interface SafeFetchResponse {
  finalUrl: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  redirectHistory: Array<{ url: string; statusCode: number; location?: string }>;
  resolvedIp: string;
  tlsDetails?: {
    protocol?: string;
    cipher?: string;
    authorized?: boolean;
    authorizationError?: string;
    cert?: tls.PeerCertificate;
  };
}

export const USER_AGENT = 'WebSecurityCheckup-Bot/1.0 (+https://websecuritycheckup.example/bot; safe-checker)';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BODY_BYTES = 512 * 1024; // 512 KB
const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Executes a network fetch pinned to the verified public IP.
 * Prevents DNS Rebinding and enforces SSRF validation on every redirect hop.
 */
export async function safeFetch(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const method = options.method || 'GET';
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  if (options.signal?.aborted) {
    throw new Error('The operation was aborted');
  }

  let currentUrl = targetUrl;
  const redirectHistory: Array<{ url: string; statusCode: number; location?: string }> = [];

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (options.signal?.aborted) {
      throw new Error('The operation was aborted');
    }

    const parsed = new URL(currentUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${parsed.protocol}. Only http: and https: are allowed.`);
    }

    // Step 1: Pre-flight SSRF check & IP resolution
    const validated = await validateAndResolveTarget(parsed.hostname);
    const pinnedIp = validated.resolvedIp;
    const isHttps = parsed.protocol === 'https:';
    const port = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;

    // Step 2: Perform the single-hop request with socket pinned to validated IP
    const singleResult = await executePinnedRequest({
      url: parsed,
      pinnedIp,
      port,
      isHttps,
      method,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        Connection: 'close',
        ...(options.headers || {}),
      },
      timeoutMs,
      maxBodyBytes,
      signal: options.signal,
    });

    const isRedirect = [301, 302, 303, 307, 308].includes(singleResult.statusCode);
    const locationHeader = singleResult.headers['location'];
    const locationStr = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;

    if (isRedirect && locationStr) {
      redirectHistory.push({
        url: currentUrl,
        statusCode: singleResult.statusCode,
        location: locationStr,
      });

      if (hop === maxRedirects) {
        throw new Error(`Exceeded maximum redirect limit of ${maxRedirects} hops.`);
      }

      // Resolve relative redirect URL against current URL
      currentUrl = new URL(locationStr, currentUrl).toString();
      continue;
    }

    return {
      finalUrl: currentUrl,
      statusCode: singleResult.statusCode,
      statusMessage: singleResult.statusMessage,
      headers: singleResult.headers,
      body: singleResult.body,
      redirectHistory,
      resolvedIp: pinnedIp,
      tlsDetails: singleResult.tlsDetails,
    };
  }

  throw new Error('Redirect loop or execution failure.');
}

interface InternalRequestOptions {
  url: URL;
  pinnedIp: string;
  port: number;
  isHttps: boolean;
  method: 'GET' | 'HEAD';
  headers: Record<string, string>;
  timeoutMs: number;
  maxBodyBytes: number;
  signal?: AbortSignal;
}

function executePinnedRequest(opts: InternalRequestOptions): Promise<{
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  tlsDetails?: {
    protocol?: string;
    cipher?: string;
    authorized?: boolean;
    authorizationError?: string;
    cert?: tls.PeerCertificate;
  };
}> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let tlsDetails: any = undefined;
    let onAbort: (() => void) | null = null;
    let req: http.ClientRequest | null = null;

    const cleanup = () => {
      if (opts.signal && onAbort) {
        opts.signal.removeEventListener('abort', onAbort);
        onAbort = null;
      }
    };

    const cleanupAndReject = (err: Error) => {
      if (!settled) {
        settled = true;
        cleanup();
        if (req && !req.destroyed) {
          req.destroy();
        }
        reject(err);
      }
    };

    if (opts.signal?.aborted) {
      cleanupAndReject(new Error('The operation was aborted'));
      return;
    }

    const reqOptions: http.RequestOptions = {
      host: opts.pinnedIp, // Connect socket directly to verified IP
      port: opts.port,
      path: opts.url.pathname + opts.url.search,
      method: opts.method,
      headers: {
        ...opts.headers,
        Host: opts.url.host, // Send original hostname in Host header
      },
      timeout: opts.timeoutMs,
    };

    if (opts.isHttps) {
      const httpsOptions: https.RequestOptions = {
        ...reqOptions,
        servername: opts.url.hostname, // Server Name Indication (SNI) matches domain
        rejectUnauthorized: false, // We inspect cert details even if self-signed or invalid
      };

      req = https.request(httpsOptions);

      req.on('socket', (socket) => {
        socket.on('secureConnect', () => {
          const tlsSocket = socket as tls.TLSSocket;
          try {
            const peerCert = tlsSocket.getPeerCertificate(true);
            const cipher = tlsSocket.getCipher();
            const protocol = tlsSocket.getProtocol();

            tlsDetails = {
              protocol: protocol || undefined,
              cipher: cipher ? cipher.name : undefined,
              authorized: tlsSocket.authorized,
              authorizationError: tlsSocket.authorizationError ? String(tlsSocket.authorizationError) : undefined,
              cert: peerCert && Object.keys(peerCert).length > 0 ? peerCert : undefined,
            };
          } catch {
            // Error inspecting peer cert
          }
        });
      });
    } else {
      req = http.request(reqOptions);
    }

    if (opts.signal) {
      onAbort = () => {
        cleanupAndReject(new Error('The operation was aborted'));
      };
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    req.on('timeout', () => {
      req?.destroy();
      cleanupAndReject(new Error(`Connection to ${opts.url.hostname} timed out after ${opts.timeoutMs}ms.`));
    });

    req.on('error', (err) => {
      cleanupAndReject(err);
    });

    req.on('response', (res) => {
      let bodyData = '';
      let receivedBytes = 0;

      res.on('data', (chunk: Buffer) => {
        if (opts.method === 'HEAD') return;
        receivedBytes += chunk.length;
        if (receivedBytes <= opts.maxBodyBytes) {
          bodyData += chunk.toString('utf8');
        } else {
          // Truncate response body and close stream
          res.destroy();
        }
      });

      res.on('end', () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({
            statusCode: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: res.headers,
            body: bodyData,
            tlsDetails,
          });
        }
      });

      res.on('close', () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({
            statusCode: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: res.headers,
            body: bodyData,
            tlsDetails,
          });
        }
      });
    });

    req.end();
  });
}
