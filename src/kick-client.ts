import https from 'https';

export interface KickChatMessage {
  broadcaster_user_id?: number;
  content: string;
  reply_to_message_id?: string;
  type: 'user' | 'bot';
}

export class KickClient {
  private accessToken: string;
  private channelId?: number;

  constructor(accessToken: string, channelId?: number) {
    this.accessToken = accessToken;
    this.channelId = channelId;
  }

  public async sendMessage(content: string): Promise<boolean> {
    try {
      const messageData: KickChatMessage = {
        content: content,
        type: 'bot'
      };

      if (this.channelId) {
        messageData.broadcaster_user_id = this.channelId;
      }

      const response = await this.makeRequest('POST', '/public/v1/chat', messageData);
      const data = JSON.parse(response);
      
      return data.data?.is_sent === true;
    } catch (error) {
      console.error('❌ Błąd wysyłania wiadomości Kick:', error);
      return false;
    }
  }

  private makeRequest(method: string, endpoint: string, data?: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const postData = data ? JSON.stringify(data) : undefined;
      
      const options = {
        hostname: 'api.kick.com',
        port: 443,
        path: endpoint,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        }
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

      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }
}