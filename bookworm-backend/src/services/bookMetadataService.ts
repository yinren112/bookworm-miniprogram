// bookworm-backend/src/services/bookMetadataService.ts
import axios from "axios";

import config from "../config";
import { ApiError } from "../errors";
import { API_CONSTANTS, DEFAULT_VALUES } from "../constants";

interface TanshuBookData {
  title: string;
  img: string;
  author: string;
  isbn: string;
  publisher: string;
  pubdate: string;
  price: string;
  summary: string;
  // ... other fields from Tanshu API
}

interface TanshuApiResponse {
  code: number;
  msg: string;
  data: TanshuBookData;
}

interface BookMetadata {
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  summary: string;
  original_price: number;
  cover_image_url: string;
}

/**
 * Fetches book metadata from Tanshu API using ISBN.
 * @param isbn The ISBN-13 of the book.
 * @returns Parsed metadata or null if not found or service unavailable.
 * @throws ApiError with code METADATA_SERVICE_UNAVAILABLE on network errors.
 */
export async function getBookMetadata(
  isbn: string,
): Promise<BookMetadata | null> {
  if (!config.TANSHU_API_KEY) {
    console.warn(
      "!!! WARNING: TANSHU_API_KEY is not configured in .env. Book metadata feature is disabled.",
    );
    return null;
  }

  const url = `${API_CONSTANTS.TANSHU_BASE_URL}?key=${config.TANSHU_API_KEY}&isbn=${isbn}`;

  try {
    const response = await axios.get<TanshuApiResponse>(url, {
      validateStatus: () => true, // 接受所有状态码，自己处理
    });

    if (response.status !== 200 || response.data.code !== 1) {
      console.error(
        `Tanshu API Error for ISBN ${isbn}: Status ${response.status}, code: ${response.data.code}, msg: ${response.data.msg}`,
      );
      return null;
    }

    const data = response.data.data;

    let priceValue = 0;
    if (data.price) {
      try {
        const priceMatch = data.price.match(/(\d+\.?\d*)/);
        if (priceMatch) {
          priceValue = parseFloat(priceMatch[1]);
        }
      } catch (error) {
        console.warn(`Could not parse price for ${data.title}: ${data.price}`, error);
      }
    }

    return {
      isbn13: data.isbn,
      title: data.title || DEFAULT_VALUES.UNKNOWN_TITLE,
      author: data.author || DEFAULT_VALUES.UNKNOWN_AUTHOR,
      publisher: data.publisher || DEFAULT_VALUES.UNKNOWN_PUBLISHER,
      summary: data.summary || DEFAULT_VALUES.NO_SUMMARY,
      original_price: priceValue,
      cover_image_url: data.img || "",
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error(
      `Network error calling Tanshu API for ISBN ${isbn}:`,
      errorMessage,
    );
    throw new ApiError(
      503,
      `Metadata service unavailable: ${errorMessage}`,
      "METADATA_SERVICE_UNAVAILABLE"
    );
  }
}
