import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface KickTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface KickTokenStorage {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  client_id: string;
  code_verifier: string;
}

export class KickOAuthHelper {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private scopes: string[];
  private tokenFilePath: string;
  private codeVerifier: string;
  private codeChallenge: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scopes = ['chat:write', 'events:subscribe'];
    this.tokenFilePath = path.join(process.cwd(), '.kick-token-cache.json');
    this.codeVerifier = this.generateCodeVerifier();
    this.codeChallenge = this.generateCodeChallenge(this.codeVerifier);
  }

  public generateAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      code_challenge: this.codeChallenge,
      code_challenge_method: 'S256',
      state: this.generateState()
    });

    return `https://id.kick.com/oauth/authorize?${params.toString()}`;
  }

  public async exchangeCodeForToken(code: string): Promise<string> {
    const tokenData = await this.requestAccessToken(code);
    await this.saveToken(tokenData);
    return tokenData.access_token;
  }

  public async getValidToken(): Promise<string | null> {
    try {
      const storedToken = await this.loadStoredToken();
      
      if (!storedToken) {
        return null;
      }

      if (Date.now() >= storedToken.expires_at) {
        console.log('🔄 Kick token wygasł, próba odświeżenia...');
        
        if (storedToken.refresh_token) {
          const newToken = await this.refreshAccessToken(storedToken.refresh_token);
          await this.saveToken(newToken);
          return newToken.access_token;
        } else {
          console.log('❌ Brak Kick refresh token - wymagana ponowna autoryzacja');
          return null;
        }
      }

      return storedToken.access_token;
    } catch (error) {
      console.error('❌ Błąd podczas pobierania Kick tokenu:', error);
      return null;
    }
  }

  public async validateToken(token: string): Promise<boolean> {
    try {
      const response = await this.makeHttpsRequest('GET', 'https://api.kick.com/public/v1/public-key', {
        'Authorization': `Bearer ${token}`
      });
      
      return response.length > 0;
    } catch (error) {
      return false;
    }
  }

  public async startCallbackServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        
        if (url.pathname === '/kick-callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>❌ Błąd autoryzacji Kick</h1>
                  <p>Błąd: ${error}</p>
                  <p>Możesz zamknąć to okno.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(`Błąd Kick OAuth: ${error}`));
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>✅ Autoryzacja Kick udana!</h1>
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
        console.log('🌐 Kick callback serwer uruchomiony na porcie 3000');
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async performOAuthFlow(): Promise<string> {
    console.log('🔐 Rozpoczynam proces autoryzacji Kick OAuth...');
    
    const authUrl = this.generateAuthUrl();
    console.log('\n📋 Kroki do wykonania dla Kick:');
    console.log('1. Otwórz poniższy link w przeglądarce:');
    console.log(`\n🔗 ${authUrl}\n`);
    console.log('2. Zaloguj się na konto bota');
    console.log('3. Zatwierdź uprawnienia');
    console.log('4. Poczekaj na przekierowanie...\n');

    try {
      const code = await this.startCallbackServer();
      console.log('✅ Otrzymano kod autoryzacyjny Kick');
      
      const token = await this.exchangeCodeForToken(code);
      console.log('✅ Token Kick OAuth został wygenerowany i zapisany');
      return token;
    } catch (error) {
      throw new Error(`Błąd podczas Kick OAuth flow: ${error}`);
    }
  }

  private async requestAccessToken(code: string): Promise<KickTokenResponse> {
    const postData = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code_verifier: this.codeVerifier
    }).toString();

    const response = await this.makeHttpsRequest('POST', 'https://id.kick.com/oauth/token', {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length.toString()
    }, postData);

    return JSON.parse(response);
  }

  private async refreshAccessToken(refreshToken: string): Promise<KickTokenResponse> {
    const postData = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString();

    const response = await this.makeHttpsRequest('POST', 'https://id.kick.com/oauth/token', {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length.toString()
    }, postData);

    return JSON.parse(response);
  }

  private async saveToken(tokenData: KickTokenResponse): Promise<void> {
    const storage: KickTokenStorage = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000,
      client_id: this.clientId,
      code_verifier: this.codeVerifier
    };

    await fs.writeFile(this.tokenFilePath, JSON.stringify(storage, null, 2));
  }

  private async loadStoredToken(): Promise<KickTokenStorage | null> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      const storage: KickTokenStorage = JSON.parse(data);
      
      if (storage.client_id !== this.clientId) {
        console.log('⚠️ Kick token należy do innej aplikacji - wymagana ponowna autoryzacja');
        return null;
      }
      
      return storage;
    } catch (error) {
      return null;
    }
  }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
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