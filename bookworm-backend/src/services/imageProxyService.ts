import axios from "axios";
import { URL } from "node:url";
import { Readable } from "node:stream";

import { ServiceError } from "../errors";

interface ImageProxyResult {
  stream: Readable;
  contentType?: string;
  contentLength?: string;
  cacheControl?: string;
  etag?: string;
  lastModified?: string;
  upstreamStatus: number;
}

const DOUBAN_HOST_PATTERN = /^img\d+\.doubanio\.com$/;

function assertAllowedUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ServiceError(
      "IMAGE_PROXY_INVALID_URL",
      "Invalid image URL supplied to proxy",
    );
  }

  if (parsed.protocol !== "https:") {
    throw new ServiceError(
      "IMAGE_PROXY_UNSUPPORTED_PROTOCOL",
      "Only HTTPS image URLs are supported",
    );
  }

  if (!DOUBAN_HOST_PATTERN.test(parsed.hostname)) {
    throw new ServiceError(
      "IMAGE_PROXY_HOST_NOT_ALLOWED",
      "Image host is not in the allowed list",
    );
  }

  return parsed;
}

export async function fetchProxiedImage(
  rawUrl: string,
): Promise<ImageProxyResult> {
  const parsed = assertAllowedUrl(rawUrl);

  const response = await axios.get<Readable>(parsed.toString(), {
    responseType: "stream",
    timeout: 7000,
    headers: {
      // Emulate a modern browser to avoid upstream anti-hotlinking
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: "https://douban.com/",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new ServiceError(
      "IMAGE_PROXY_UPSTREAM_ERROR",
      `Upstream responded with status ${response.status}`,
    );
  }

  const headers = response.headers;

  return {
    stream: response.data,
    contentType: headers["content-type"],
    contentLength: headers["content-length"],
    cacheControl: headers["cache-control"],
    etag: headers.etag,
    lastModified: headers["last-modified"],
    upstreamStatus: response.status,
  };
}
