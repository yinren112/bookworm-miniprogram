// src/services/bookMetadataService.ts
import axios from 'axios';

const OPEN_LIBRARY_URL = 'https://openlibrary.org';

// Type definitions for the Open Library API responses
interface AuthorDetails {
  name: string;
}
interface BookInfo {
  title: string;
  authors: { key: string }[];
  publishers: string[];
  publish_date: string;
  covers: number[];
}

// Fetches the name of a single author from their key
async function fetchAuthorName(authorKey: string): Promise<string> {
  try {
    const { data } = await axios.get<AuthorDetails>(`${OPEN_LIBRARY_URL}${authorKey}.json`);
    return data.name;
  } catch (error) {
    console.error(`Failed to fetch author ${authorKey}`, error);
    return 'Unknown Author'; // Return a fallback value
  }
}

export async function fetchMetadataByISBN(isbn: string) {
  try {
    // Step 1: Fetch the main book information by ISBN
    const bookResponse = await axios.get<BookInfo>(`${OPEN_LIBRARY_URL}/isbn/${isbn}.json`);
    const bookData = bookResponse.data;

    // Step 2: Concurrently fetch all author names
    let authorNames: string[] = [];
    if (bookData.authors && bookData.authors.length > 0) {
      const authorPromises = bookData.authors.map(author => fetchAuthorName(author.key));
      authorNames = await Promise.all(authorPromises);
    }
    
    // Step 3: Construct the cover image URL (if available)
    // https://covers.openlibrary.org/b/id/COVER_ID-L.jpg
    const coverImageUrl = bookData.covers && bookData.covers.length > 0
      ? `https://covers.openlibrary.org/b/id/${bookData.covers[0]}-L.jpg`
      : null;

    // Step 4: Adapt the data to our internal model and return it
    return {
      title: bookData.title,
      author: authorNames.join(', '),
      publisher: bookData.publishers ? bookData.publishers.join(', ') : '',
      // Note: Open Library does not provide reliable price data. We leave it out.
      original_price: null,
      cover_image_url: coverImageUrl,
    };

  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null; // Book not found, this is an expected outcome
    }
    console.error(`Failed to fetch metadata for ISBN ${isbn} from Open Library`, error);
    throw new Error(`Failed to fetch metadata for ISBN ${isbn}`);
  }
}