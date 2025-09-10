// bookworm-backend/src/services/bookMetadataService.ts
import axios from 'axios';
import prisma from '../db';
import config from '../config'; // 导入config

// 探数 API 配置
const TANSHU_BASE_URL = 'https://api.tanshuapi.com/api/isbn/v2/index';

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
 * @returns Parsed metadata or null if not found or on error.
 */
export async function getBookMetadata(isbn: string): Promise<BookMetadata | null> {
  if (!config.tanshuApiKey) {
    console.warn('!!! WARNING: TANSHU_API_KEY is not configured in .env. Book metadata feature is disabled.');
    return null;
  }

  const url = `${TANSHU_BASE_URL}?key=${config.tanshuApiKey}&isbn=${isbn}`;
  
  try {
    const response = await axios.get<TanshuApiResponse>(url, {
      validateStatus: () => true, // 接受所有状态码，自己处理
    });

    if (response.status !== 200 || response.data.code !== 1) {
      console.error(`Tanshu API Error for ISBN ${isbn}: Status ${response.status}, code: ${response.data.code}, msg: ${response.data.msg}`);
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
        } catch (e) {
            console.warn(`Could not parse price for ${data.title}: ${data.price}`);
        }
    }

    return {
      isbn13: data.isbn,
      title: data.title || '未知书名',
      author: data.author || '未知作者',
      publisher: data.publisher || '未知出版社',
      summary: data.summary || '暂无简介',
      original_price: priceValue,
      cover_image_url: data.img || '',
    };

  } catch (error) {
    console.error(`Network error calling Tanshu API for ISBN ${isbn}:`, (error as Error).message);
    return null;
  }
}