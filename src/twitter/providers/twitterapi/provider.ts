import { sleepMs } from 'src/utils/sleep';
import { TwitterApiProvider } from '../provider';
import { GetUserInfoResponse, UserInfo } from '../types/user-info';

type TwitterApiUserInfo = {
  type: string;
  userName: string;
  url?: string;
  id: string;
  name: string;
  isBlueVerified: boolean;
  verifiedType?: string;
  profilePicture?: string;
  coverPicture?: string;
  description?: string;
  location?: string;
  followers: number;
  following: number;
  canDm: boolean;
  createdAt: string;
  favouritesCount: number;
  hasCustomTimelines: boolean;
  isTranslator: boolean;
  mediaCount: number;
  statusesCount: number;
  withheldInCountries?: string[];
  affiliatesHighlightedLabel?: any;
  possiblySensitive: boolean;
  pinnedTweetIds?: string[];
  isAutomated?: boolean;
  automatedBy?: string;
  unavailable?: boolean;
  message?: string;
  unavailableReason?: string;
  profile_bio?: {
    description?: string;
    entities?: {
      description?: {
        urls: {
          display_url: string;
          expanded_url: string;
          indices: number[];
          url: string;
        }[];
      };
      url?: {
        urls: {
          display_url: string;
          expanded_url: string;
          indices: number[];
          url: string;
        }[];
      };
    };
  };
};

export class TwitterApi implements TwitterApiProvider {
  private readonly baseUrl = 'https://api.twitterapi.io/twitter/user/info';
  private readonly apiKey: string;

  private readonly maxRetries = 3;
  private readonly baseRetryDelayMs = 5000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getUserInfo(username: string): Promise<UserInfo> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('userName', username);

    const json = await this.fetchWithRetry<
      GetUserInfoResponse<TwitterApiUserInfo>
    >(url.toString());

    if (json.status !== 'success') {
      throw new Error(`Twitter API responded with error: ${json.msg}`);
    }

    return {
      followers: json.data.followers,
      id: json.data.id,
      type: json.data.type,
      userName: json.data.userName,
      url: json.data.url,
    };
  }

  private async fetchWithRetry<T>(url: string, attempt = 0): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': this.apiKey,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      if (attempt >= this.maxRetries) {
        throw new Error('Twitter API rate limit exceeded (429)');
      }

      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : this.getBackoffDelay(attempt);

      await sleepMs(retryAfterMs);

      return this.fetchWithRetry<T>(url, attempt + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twitter API error: ${response.status} — ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private getBackoffDelay(attempt: number): number {
    return this.baseRetryDelayMs * Math.pow(2, attempt);
  }
}
