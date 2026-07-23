import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { BUNGIE_API } from './bungie';
import type { BungieTokens } from './bungie';

interface StoredToken {
  accessToken: string;
  membershipId: string;
  expiresAt: number;
}

const TOKEN_KEY = 'little-light:token';
const STATE_KEY = 'little-light:oauth-state';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly token = signal<StoredToken | null>(readStoredToken());

  readonly isSignedIn = computed(() => this.token() !== null);

  /** OAuth needs a client id; player search works with just the API key. */
  readonly isConfigured = environment.bungieClientId !== '';

  get accessToken(): string | null {
    const token = this.token();
    if (!token) return null;
    if (token.expiresAt <= Date.now()) {
      // Public clients get no refresh token; an expired token means re-auth.
      this.signOut();
      return null;
    }
    return token.accessToken;
  }

  get membershipId(): string | null {
    return this.token()?.membershipId ?? null;
  }

  /** Redirects to Bungie.net; it sends the user back to the registered Redirect URL. */
  beginLogin(): void {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);
    const url = new URL('https://www.bungie.net/en/OAuth/Authorize');
    url.searchParams.set('client_id', environment.bungieClientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    location.assign(url.toString());
  }

  consumePendingState(): string | null {
    const state = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return state;
  }

  async exchangeCode(code: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: environment.bungieClientId,
    });
    const tokens = await firstValueFrom(
      this.http.post<BungieTokens>(`${BUNGIE_API}/App/OAuth/Token/`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    const stored: StoredToken = {
      accessToken: tokens.access_token,
      membershipId: tokens.membership_id,
      expiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
    this.token.set(stored);
  }

  signOut(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
  }
}

function readStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    return parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}
