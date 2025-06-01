import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string[];
}

interface TokenStorage {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  client_id: string;
}

export class TwitchOAuthHelper {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scopes: string[];
  private tokenFilePath: string;

  constructor(clientId: string, clientSecret: string, redirectUri = 'twitch-relay-bot-production.up.railway.app/callback') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scopes = ['chat:read', 'chat:edit']; // Wymagane dla IRC
    this.tokenFilePath = path.join(process.cwd(), '.token-cache.json');
  }

  /**
   * Generuje URL do autoryzacji OAuth
   */
  public generateAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state: this.generateState() // CSRF protection
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Wymienia kod autoryzacyjny na token dostępu
   */
  public async exchangeCodeForToken(code: string): Promise<string> {
    const tokenData = await this.requestAccessToken(code);
    await this.saveToken(tokenData);
    return `oauth:${tokenData.access_token}`;
  }

  /**
   * Pobiera aktualny token (z cache lub odświeża)
   */
  public async getValidToken(): Promise<string | null> {
    try {
      const storedToken = await this.loadStoredToken();
      
      if (!storedToken) {
        return null;
      }

      // Sprawdź czy token nie wygasł
      if (Date.now() >= storedToken.expires_at) {
        console.log('🔄 Token wygasł, próba odświeżenia...');
        
        if (storedToken.refresh_token) {
          const newToken = await this.refreshAccessToken(storedToken.refresh_token);
          await this.saveToken(newToken);
          return `oauth:${newToken.access_token}`;
        } else {
          console.log('❌ Brak refresh token - wymagana ponowna autoryzacja');
          return null;
        }
      }

      return `oauth:${storedToken.access_token}`;
    } catch (error) {
      console.error('❌ Błąd podczas pobierania tokenu:', error);
      return null;
    }
  }

  /**
   * Waliduje token u Twitch API
   */
  public async validateToken(token: string): Promise<boolean> {
    try {
      const cleanToken = token.replace('oauth:', '');
      const response = await this.makeHttpsRequest('GET', 'https://id.twitch.tv/oauth2/validate', {
        'Authorization': `OAuth ${cleanToken}`
      });

      const data = JSON.parse(response);
      return data.client_id === this.clientId;
    } catch (error) {
      return false;
    }
  }

  /**
   * Uruchamia lokalny serwer do odbioru callback
   */
  public async startCallbackServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>❌ Błąd autoryzacji</h1>
                  <p>Błąd: ${error}</p>
                  <p>Możesz zamknąć to okno.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(`Błąd OAuth: ${error}`));
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>✅ Autoryzacja udana!</h1>
                  <p>Możesz zamknąć to okno i wrócić do terminala.</p>
                  <script>window.close();</script>
                </body>
              </html>
            `);
            server.close();
            resolve(code);
            return;
          }
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      server.listen(3000, () => {
        console.log('🌐 Serwer callback uruchomiony na http://localhost:3000');
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Kompletny flow OAuth - generuje URL, czeka na callback i zwraca token
   */
  public async performOAuthFlow(): Promise<string> {
    console.log('🔐 Rozpoczynam proces autoryzacji OAuth...');
    
    const authUrl = this.generateAuthUrl();
    console.log('\n📋 Kroki do wykonania:');
    console.log('1. Otwórz poniższy link w przeglądarce:');
    console.log(`\n🔗 ${authUrl}\n`);
    console.log('2. Zaloguj się na konto bota');
    console.log('3. Zatwierdź uprawnienia');
    console.log('4. Poczekaj na przekierowanie...\n');

    try {
      const code = await this.startCallbackServer();
      console.log('✅ Otrzymano kod autoryzacyjny');
      
      const token = await this.exchangeCodeForToken(code);
      console.log('✅ Token OAuth został wygenerowany i zapisany');
      
      return token;
    } catch (error) {
      throw new Error(`Błąd podczas OAuth flow: ${error}`);
    }
  }

  // Metody prywatne

  private async requestAccessToken(code: string): Promise<TokenResponse> {
    const postData = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri
    }).toString();

    const response = await this.makeHttpsRequest('POST', 'https://id.twitch.tv/oauth2/token', {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length.toString()
    }, postData);

    return JSON.parse(response);
  }

  private async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const postData = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString();

    const response = await this.makeHttpsRequest('POST', 'https://id.twitch.tv/oauth2/token', {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length.toString()
    }, postData);

    return JSON.parse(response);
  }

  private async saveToken(tokenData: TokenResponse): Promise<void> {
    const storage: TokenStorage = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000, // -1 minuta dla bezpieczeństwa
      client_id: this.clientId
    };

    await fs.writeFile(this.tokenFilePath, JSON.stringify(storage, null, 2));
  }

  private async loadStoredToken(): Promise<TokenStorage | null> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const storage: TokenStorage = JSON.parse(data);
      
      // Sprawdź czy token należy do tego samego client_id
      if (storage.client_id !== this.clientId) {
        console.log('⚠️ Token należy do innej aplikacji - wymagana ponowna autoryzacja');
        return null;
      }
      
      return storage;
    } catch (error) {
      return null;
    }
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private makeHttpsRequest(method: string, url: string, headers: Record<string, string>, data?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: headers
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(data);
      }
      
      req.end();
    });
  }
}