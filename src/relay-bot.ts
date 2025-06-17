import tmi from 'tmi.js';
import dotenv from 'dotenv';
import { TwitchOAuthHelper } from './oauth-helper.js';
import { KickOAuthHelper } from './kick-oauth-helper.js';
import { KickClient } from './kick-client.js';
import { WordFilter } from './word-filter.js';

// ładowanie zmiennych .env
dotenv.config();

interface BotConfig {
    botUsername: string;
    oauthToken: string;
    sourceChannel: string;
    targetChannels: string[];
    clientId?: string;
    clientSecret?: string;
    kickClientId?: string;
    kickClientSecret?: string;
    kickChannelId?: number;
}

class TwitchRelayBot {
    private client: tmi.Client;
    private config: BotConfig;
    private oauthHelper?: TwitchOAuthHelper;
    private kickOAuthHelper?: KickOAuthHelper;
    private kickClient?: KickClient;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 5000;
    private lastMessageTime = 0;
    private isReconnecting = false;

    private messageRateLimit = 2000; // 2000ms
    private maxMessagesPerMinute = 20;
    private messageCount = 0;
    private minuteTimer?: NodeJS.Timeout;

    private lastMessages: Map<string, string> = new Map();
    private readonly MAX_STORED_USERS = 200;

    private wordFilter: WordFilter = new WordFilter(false);

    private lastSentMessage = '';
    private lastSentTime = 0;

    private tokenValidationTimer?: NodeJS.Timeout;
    private healthCheckTimer?: NodeJS.Timeout;
    private messageQueue: Array<{ message: string, user: string }> = [];
    private isProcessingQueue = false;

    private processMessageForRelay(message: string, context: 'delete' | 'ban' | 'timeout' | 'normal' = 'normal'): {
        shouldSend: boolean;
        processedMessage: string;
        wasFiltered: boolean;
    } {
        const analysis = this.wordFilter.analyzeText(message);

        if (analysis.shouldBlock) {
            console.log('🚫 Wiadomość zablokowana ze względu na drastyczną treść');
            return {
                shouldSend: false,
                processedMessage: '',
                wasFiltered: true
            };
        }

        if (analysis.containsBanned) {
            console.log(`⚠️ Ocenzurowano wiadomość. Znalezione słowa: ${analysis.foundWords.join(', ')}`);
            return {
                shouldSend: true,
                processedMessage: analysis.censoredText,
                wasFiltered: true
            };
        }

        return {
            shouldSend: true,
            processedMessage: message,
            wasFiltered: false
        };
    }

    private testWordFilter(): void {
        const testMessages = [
            "Pozdraiwam konfi",
            "Test z wulgaryzmem kurwa",
            "Test rasistowski murzyn",
            "Test drastyczny cwelu pedale nigerze kys simpie"
        ];

        console.log('🧪 Test filtra słów:');
        testMessages.forEach(msg => {
            const result = this.processMessageForRelay(msg);
            console.log(`Original: "${msg}"`);
            console.log(`Processed: "${result.processedMessage}"`);
            console.log(`Should send: ${result.shouldSend}`);
            console.log(`Was filtered: ${result.wasFiltered}`);
            console.log('---');
        });
    }

    constructor() {
        this.config = this.loadConfig();

        if (this.config.clientId && this.config.clientSecret) {
            this.oauthHelper = new TwitchOAuthHelper(
                this.config.clientId,
                this.config.clientSecret
            );
        }

        if (this.config.kickClientId && this.config.kickClientSecret) {
            this.kickOAuthHelper = new KickOAuthHelper(
                this.config.kickClientId,
                this.config.kickClientSecret,
                'https://twitch-relay-bot-production.up.railway.app/kick-callback'
            );
        }

        this.client = this.createClient();
        this.setupEventHandlers();
    }

    private loadConfig(): BotConfig {
        const requiredEnvVars = ['TWITCH_BOT_USERNAME', 'SOURCE_CHANNEL', 'TARGET_CHANNELS',]; 

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Brak wymaganej zmiennej środowiskowej: ${envVar}`);
            }
        }

        const hasClientCredentials = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

        if (!hasClientCredentials) {
            throw new Error('Wymagane są TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET');
        }

        const targetChannels = process.env.TARGET_CHANNELS!
            .split(',')
            .map(channel => channel.trim())
            .filter(channel => channel.length > 0);

        return {
            botUsername: process.env.TWITCH_BOT_USERNAME!,
            oauthToken: '',
            sourceChannel: process.env.SOURCE_CHANNEL!,
            targetChannels: targetChannels,
            clientId: process.env.TWITCH_CLIENT_ID,
            clientSecret: process.env.TWITCH_CLIENT_SECRET,
            kickClientId: process.env.KICK_CLIENT_ID,
            kickClientSecret: process.env.KICK_CLIENT_SECRET,
            kickChannelId: process.env.KICK_CHANNEL_ID ? parseInt(process.env.KICK_CHANNEL_ID) : undefined
        };
    }

    private createClient(): tmi.Client {
        const allChannels = [this.config.sourceChannel, ...this.config.targetChannels];

        return new tmi.Client({
            options: {
                debug: false,
                messagesLogLevel: 'error'
            },
            connection: {
                reconnect: false,
                secure: true,
                timeout: 30000,
                maxReconnectAttempts: 0,
                maxReconnectInterval: 5000
            },
            identity: {
                username: this.config.botUsername,
                password: this.config.oauthToken
            },
            channels: allChannels
        });
    }

    private async initializeKickClient(): Promise<void> {
        if (!this.kickOAuthHelper) return;

        try {
            const kickToken = await this.kickOAuthHelper.getValidToken();
            if (kickToken) {
                this.kickClient = new KickClient(kickToken, this.config.kickChannelId);
                console.log('✅ Kick client zainicjalizowany');
            }
        } catch (error) {
            console.error('❌ Błąd inicjalizacji Kick client:', error);
        }
    }



    private rememberMessage(user: string, msg: string) {
        const nick = user.toLowerCase();

        if (this.lastMessages.size >= this.MAX_STORED_USERS) {
            const oldestKey = this.lastMessages.keys().next().value;
            this.lastMessages.delete(oldestKey);
        }

        this.lastMessages.set(nick, msg);
    }

    private setupHealthCheck(): void {
        // health check co 30 sekund
        this.healthCheckTimer = setInterval(async () => {
            if (this.client.readyState() !== 'OPEN' && !this.isReconnecting) {
                console.log('🔍 Health check: Klient nie jest połączony, próba reconnect...');
                await this.reconnectClient();
            }
        }, 30000);
    }

    private async reconnectClient(): Promise<void> {
        if (this.isReconnecting) return;

        this.isReconnecting = true;
        console.log('🔄 Rozpoczynam reconnect...');

        try {
            // czyszczenie starego klienta
            if (this.client) {
                await this.client.disconnect().catch(() => { });
            }

            // odświeżanie tokenu
            if (this.oauthHelper) {
                const newToken = await this.oauthHelper.getValidToken();
                if (newToken) {
                    this.config.oauthToken = newToken;
                }
            }

           
            await this.initializeKickClient();

         
            this.client = this.createClient();
            this.setupEventHandlers();

          
            await this.client.connect();
            console.log('✅ Reconnect zakończony sukcesem');

            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000;

        } catch (error) {
            console.error('❌ Błąd podczas reconnect:', error);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('❌ Przekroczono limit prób reconnect');
                process.exit(1);
            }

            
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 60000);
            console.log(`⏳ Kolejna próba za ${this.reconnectDelay / 1000}s...`);

            setTimeout(() => {
                this.reconnectClient();
            }, this.reconnectDelay);
        } finally {
            this.isReconnecting = false;
        }
    }

    private setupTokenValidation(): void {
        this.tokenValidationTimer = setInterval(async () => {
            
            if (this.oauthHelper && this.config.oauthToken) {
                const isValid = await this.oauthHelper.validateToken(this.config.oauthToken);
                if (!isValid) {
                    console.log('🔄 Twitch token wygasł - odświeżanie...');
                    try {
                        const newToken = await this.oauthHelper.getValidToken();
                        if (newToken) {
                            this.config.oauthToken = newToken;
                            await this.reconnectClient();
                        }
                    } catch (error) {
                        console.error('❌ Błąd odświeżania Twitch tokenu:', error);
                    }
                }
            }

            // Wwalidacja Kick token 
            if (this.kickOAuthHelper) {
                try {
                    const newKickToken = await this.kickOAuthHelper.getValidToken();
                    if (newKickToken) {
                        // sprawdzanie czy token się zmienił
                        if (!this.kickClient || this.kickClient.getAccessToken() !== newKickToken) {
                            console.log('🔄 Kick token odświeżony - aktualizacja client...');
                            this.kickClient = new KickClient(newKickToken, this.config.kickChannelId);
                        }
                    } else {
                        // gdy nie ma tokenu, usuń clienta.
                        this.kickClient = undefined;
                    }
                } catch (error) {
                    console.error('❌ Błąd odświeżania Kick tokenu:', error);
                    this.kickClient = undefined;
                }
            }
        }, 50 * 60 * 1000);
    }

    private sanitizeForKick(message: string): string {
       
        // polskie znaki do zamiany
        const polishCharsMap: { [key: string]: string } = {
            'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
            'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
        };

        let sanitized = message;

        // pętla do zastąpienia polskich znaków
        for (const [polish, latin] of Object.entries(polishCharsMap)) {
            sanitized = sanitized.replace(new RegExp(polish, 'g'), latin);
        }

        return sanitized;
    }
    private setupEventHandlers(): void {
        this.client.on('connected', (addr, port) => {
            console.log(`✅ Bot połączony z ${addr}:${port}`);
            console.log(`📺 Monitoruję kanał: #${this.config.sourceChannel}`);
            console.log(`🎯 Przekazuję do kanałów: ${this.config.targetChannels.map(ch => `#${ch}`).join(', ')}`);
            if (this.kickClient) {
                console.log(`🦵 Kick client aktywny`);
            }
            this.reconnectAttempts = 0;
        });

        this.client.on('disconnected', (reason) => {
            console.log(`❌ Bot rozłączony: ${reason}`);
            if (!this.isReconnecting) {
                setTimeout(() => this.reconnectClient(), 2000);
            }
        });

        this.client.on('error' as any, async (err: Error) => {
            console.error('🚨 Błąd połączenia:', err.message);

            if (!this.isReconnecting) {
                setTimeout(() => this.reconnectClient(), 1000);
            }
        });

        this.client.on('ban', async (channel, username, reason, userstate) => {
            const cleanChannelName = channel.replace(/^#/, '').toLowerCase();
            if (cleanChannelName !== this.config.sourceChannel.toLowerCase()) return;

            const cleanChannel = channel.replace(/^#/, '').replace(/^./, c => c.toUpperCase());
            const lastMsg = this.lastMessages.get(username.toLowerCase()) || 'brak danych';
            const processedMsg = this.processMessageForRelay(lastMsg, 'ban');

            let relay: string;
            if (!processedMsg.shouldSend) {
                relay = ` ${cleanChannel} zbanował @${username}. 60 `
                    + ` Ostatnie słowa: [wiadomość usunięta - nieodpowiednia treść]. JasperSalute`;
            } else {
                const msgSuffix = processedMsg.wasFiltered ? ' [ocenzurowano]' : '';
                relay = ` ${cleanChannel} zbanował @${username}. 60 `
                    + ` Ostatnie słowa: "${processedMsg.processedMessage}"${msgSuffix}. JasperSalute`;
            }

            console.log('[BAN detected] ->', relay);
            this.queueMessage(relay, '');
            this.lastMessages.delete(username.toLowerCase());
        });

        this.client.on('timeout', async (channel, username, reason, duration, userstate) => {
            const cleanChannelName = channel.replace(/^#/, '').toLowerCase();
            if (cleanChannelName !== this.config.sourceChannel.toLowerCase()) return;

            const cleanChannel = channel.replace(/^#/, '').replace(/^./, c => c.toUpperCase());
            const lastMsg = this.lastMessages.get(username.toLowerCase()) || 'brak danych';
            const processedMsg = this.processMessageForRelay(lastMsg, 'timeout');

            let relay: string;
            if (!processedMsg.shouldSend) {
                relay = ` ${cleanChannel} czasowo zablokował @${username} na (${duration}s). 60 `
                    + ` Ostatnie słowa: [wiadomość usunięta - nieodpowiednia treść]. JasperSalute`;
            } else {
                const msgSuffix = processedMsg.wasFiltered ? ' [ocenzurowano]' : '';
                relay = ` ${cleanChannel} czasowo zablokował @${username} na (${duration}s). 60 `
                    + ` Ostatnie słowa: "${processedMsg.processedMessage}"${msgSuffix}. JasperSalute`;
            }

            console.log('[TIMEOUT detected] ->', relay);
            this.queueMessage(relay, '');
            this.lastMessages.delete(username.toLowerCase());
        });

        this.client.on('message', async (channel, userstate, message, self) => {
            if (self) return;

            const channelName = channel.replace('#', '').toLowerCase();
            if (channelName !== this.config.sourceChannel.toLowerCase()) return;

            const sender = userstate['display-name'] || userstate.username || '';
            if (sender) this.rememberMessage(sender, message);
        });

        this.client.on('join', (channel, username, self) => {
            if (self) {
                console.log(`🎉 Dołączono do kanału: ${channel}`);
            }
        });

        this.client.on('messagedeleted', async (channel, username, deletedMessage, userstate) => {
            const cleanChannelName = channel.replace(/^#/, '').toLowerCase();
            if (cleanChannelName !== this.config.sourceChannel.toLowerCase()) return;

            const cleanChannel = channel.replace(/^#/, '').replace(/^./, c => c.toUpperCase());
            const processedMsg = this.processMessageForRelay(deletedMessage, 'delete');

            let relay: string;
            if (!processedMsg.shouldSend) {
                relay = ` ${cleanChannel} usunął wiadomość @${username}. 60 `
                    + ` Treść: [wiadomość usunięta - nieodpowiednia treść]. JasperSalute`;
            } else {
                const msgSuffix = processedMsg.wasFiltered ? ' [ocenzurowano]' : '';
                relay = ` ${cleanChannel} usunął wiadomość @${username}. 60 `
                    + ` Treść: "${processedMsg.processedMessage}"${msgSuffix}. JasperSalute`;
            }

            console.log('[DELETED message] ->', relay);
            this.queueMessage(relay, '');
        });
    }

    private queueMessage(message: string, user: string): void {
        this.messageQueue.push({ message, user });
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;

        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            if (this.messageCount >= this.maxMessagesPerMinute) {
                console.log('⏳ Rate limit - czekam na reset licznika');
                break;
            }

            const item = this.messageQueue.shift();
            if (item) {
                await this.sendMessage(item.message, item.user);
                await this.sleep(this.messageRateLimit);
            }
        }

        this.isProcessingQueue = false;
    }

    private async sendMessage(originalMessage: string, originalUser: string): Promise<void> {
        try {
            if (!this.client || this.client.readyState() !== 'OPEN') {
                console.log('❌ Klient nie jest połączony - dodaję z powrotem do kolejki');
                this.messageQueue.unshift({ message: originalMessage, user: originalUser });
                await this.reconnectClient();
                return;
            }

            if (!this.minuteTimer) {
                this.minuteTimer = setInterval(() => {
                    this.messageCount = 0;
                }, 60000);
            }

            const relayMessage = originalUser ?
                `${originalUser}: ${originalMessage}` :
                originalMessage;

            const currentTime = Date.now();
            if (relayMessage === this.lastSentMessage &&
                currentTime - this.lastSentTime < 10000) {
                return;
            }

            this.lastSentMessage = relayMessage;
            this.lastSentTime = currentTime;

            // wysyłanie na wszystkie kanały docelowe
            const promises = this.config.targetChannels.map(channel =>
                this.client.say(`#${channel}`, relayMessage)
            );

            await Promise.all(promises);

            if (this.kickClient) {
                const sanitizedMessage = this.sanitizeForKick(relayMessage);
                const success = await this.kickClient.sendMessage(sanitizedMessage);
                if (!success) {
                    console.log('❌ Błąd wysyłania na Kick');
                }
            }

            this.messageCount++;
            this.lastMessageTime = Date.now();

            console.log(`📤 Przekazano wiadomość:`);
            console.log(`   📍 Z: #${this.config.sourceChannel} (${originalUser || 'system'})`);
            console.log(`   📍 Do: ${this.config.targetChannels.map(ch => `#${ch}`).join(', ')}${this.kickClient ? ', Kick' : ''}`);
            console.log(`   💬 Treść: ${originalMessage}`);

        } catch (error) {
            console.error('❌ Błąd podczas wysyłania wiadomości:', error);
            this.messageQueue.unshift({ message: originalMessage, user: originalUser });

            if (!this.isReconnecting) {
                setTimeout(() => this.reconnectClient(), 1000);
            }
        }
    }

    private async relayMessage(originalMessage: string, originalUser: string): Promise<void> {
        this.queueMessage(originalMessage, originalUser);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async start(): Promise<void> {
        try {
            console.log('🚀 Uruchamianie Twitch Relay Bot...');

            if (!this.config.oauthToken && this.oauthHelper) {
                console.log('🔐 Brak tokenu OAuth - rozpoczynam proces autoryzacji...');

                const existingToken = await this.oauthHelper.getValidToken();
                if (existingToken) {
                    console.log('✅ Znaleziono zapisany token OAuth');
                    this.config.oauthToken = existingToken;
                } else {
                    console.log('🔑 Wymagana nowa autoryzacja OAuth');
                    this.config.oauthToken = await this.oauthHelper.performOAuthFlow();
                }

                const isValid = await this.oauthHelper.validateToken(this.config.oauthToken);
                if (!isValid) {
                    throw new Error('Wygenerowany token OAuth jest nieprawidłowy');
                }

                this.client = this.createClient();
                this.setupEventHandlers();
            }

            // inicjzalizacja kick
            if (this.kickOAuthHelper) {
                console.log('🦵 Inicjalizacja Kick OAuth...');
                let kickToken = await this.kickOAuthHelper.getValidToken();

                if (!kickToken) {
                    console.log('🔑 Wymagana autoryzacja Kick OAuth');
                    kickToken = await this.kickOAuthHelper.performOAuthFlow();
                }

                this.kickClient = new KickClient(kickToken, this.config.kickChannelId);
                console.log('✅ Kick client gotowy');
            }

            console.log(`📋 Konfiguracja:`);
            console.log(`   🤖 Bot: ${this.config.botUsername}`);
            console.log(`   📺 Źródło: #${this.config.sourceChannel}`);
            console.log(`   🎯 Cele: ${this.config.targetChannels.map(ch => `#${ch}`).join(', ')}`);
            if (this.kickClient) {
                console.log(`   🦵 Kick: aktywny`);
            }

            await this.client.connect();
            this.setupTokenValidation();
            this.setupHealthCheck();
            this.testWordFilter();
        } catch (error) {
            console.error('❌ Błąd podczas uruchamiania bota:', error);
            process.exit(1);
        }
    }

    public async stop(): Promise<void> {
        console.log('🛑 Zatrzymywanie bota...');

        // czyszczenie timerow
        if (this.tokenValidationTimer) {
            clearInterval(this.tokenValidationTimer);
        }
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.minuteTimer) {
            clearInterval(this.minuteTimer);
        }

        try {
            await this.client.disconnect();
            console.log('✅ Bot zatrzymany');
        } catch (error) {
            console.error('❌ Błąd podczas zatrzymywania:', error);
        }
    }
}

// obsługa sygnałów systemowych
process.on('SIGINT', async () => {
    console.log('\n🛑 Otrzymano sygnał SIGINT - zatrzymywanie bota...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Otrzymano sygnał SIGTERM - zatrzymywanie bota...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('🚨 Nieobsłużony błąd:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Nieobsłużone odrzucenie Promise:', reason);
    process.exit(1);
});

async function main() {
    const bot = new TwitchRelayBot();
    await bot.start();
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Krytyczny błąd aplikacji:', error);
        process.exit(1);
    });
}

export default TwitchRelayBot;