import tmi from 'tmi.js';
import dotenv from 'dotenv';
import { TwitchOAuthHelper } from './oauth-helper.js';
import { WordFilter } from './word-filter.js';

// Załaduj zmienne środowiskowe
dotenv.config();

interface BotConfig {
    botUsername: string;
    oauthToken: string;
    sourceChannel: string;
    targetChannel: string;
    clientId?: string;
    clientSecret?: string;
}

class TwitchRelayBot {
    private client: tmi.Client;
    private config: BotConfig;
    private oauthHelper?: TwitchOAuthHelper;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 5000; // 5 sekund
    private lastMessageTime = 0;

    private messageRateLimit = 5000;
    private maxMessagesPerMinute = 2;
    private messageCount = 0;
    private minuteTimer?: NodeJS.Timeout;

    private lastMessages: Map<string, string> = new Map();
    private readonly MAX_STORED_USERS = 200;   // ⬅️ możesz zmienić

    private wordFilter: WordFilter = new WordFilter(false);

    private lastSentMessage = '';
    private lastSentTime = 0;

    private tokenValidationTimer?: NodeJS.Timeout;

    private processMessageForRelay(message: string, context: 'ban' | 'normal' = 'normal'): {
        shouldSend: boolean;
        processedMessage: string;
        wasFiltered: boolean;
    } {
        const analysis = this.wordFilter.analyzeText(message);

        // Jeśli wiadomość zawiera szczególnie drastyczne słowa - zablokuj całkowicie
        if (analysis.shouldBlock) {
            console.log('🚫 Wiadomość zablokowana ze względu na drastyczną treść');
            return {
                shouldSend: false,
                processedMessage: '',
                wasFiltered: true
            };
        }

        // Jeśli zawiera zakazane słowa - ocenzuruj
        if (analysis.containsBanned) {
            console.log(`⚠️ Ocenzurowano wiadomość. Znalezione słowa: ${analysis.foundWords.join(', ')}`);
            return {
                shouldSend: true,
                processedMessage: analysis.censoredText,
                wasFiltered: true
            };
        }

        // Wiadomość czysta
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
            "Test drastyczny hitler"
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

    // Wzorce regex do wykrywania wiadomości o banach z 7tv
    private banPatterns = [
        /has been (permanently )?banned/i,
        /został (na stałe )?zbanowany/i,
        /permanently banned/i,
        /banned by/i,
        /\.ban\s+\w+/i,
        /7tv.*ban/i,
        /banned \w+\.?/i
    ];

    constructor() {
        this.config = this.loadConfig();

        // Jeśli mamy Client ID/Secret, użyj OAuth helper
        if (this.config.clientId && this.config.clientSecret) {
            this.oauthHelper = new TwitchOAuthHelper(
                this.config.clientId,
                this.config.clientSecret
            );
        }

        this.client = this.createClient();
        this.setupEventHandlers();

    }

    private loadConfig(): BotConfig {
        const requiredEnvVars = ['TWITCH_BOT_USERNAME', 'SOURCE_CHANNEL', 'TARGET_CHANNEL'];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Brak wymaganej zmiennej środowiskowej: ${envVar}`);
            }
        }

        // Sprawdź czy mamy token OAuth lub dane do jego wygenerowania
        const hasOAuthToken = !!process.env.TWITCH_OAUTH_TOKEN;
        const hasClientCredentials = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

        if (!hasOAuthToken && !hasClientCredentials) {
            throw new Error(
                'Wymagany jest TWITCH_OAUTH_TOKEN lub para TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET'
            );
        }

        return {
            botUsername: process.env.TWITCH_BOT_USERNAME!,
            oauthToken: process.env.TWITCH_OAUTH_TOKEN || '', // Może być pusty jeśli używamy OAuth
            sourceChannel: process.env.SOURCE_CHANNEL!,
            targetChannel: process.env.TARGET_CHANNEL!,
            clientId: process.env.TWITCH_CLIENT_ID,
            clientSecret: process.env.TWITCH_CLIENT_SECRET
        };
    }

    private createClient(): tmi.Client {
        return new tmi.Client({
            options: {
                debug: process.env.NODE_ENV === 'development',
                messagesLogLevel: 'info'  // może niech będzie info, aby lepiej widzieć logi
            },
            connection: {
                reconnect: true,
                secure: true,
                timeout: 180000,
                reconnectDecay: 1.5,
                reconnectInterval: 1000,
                maxReconnectAttempts: this.maxReconnectAttempts,
                maxReconnectInterval: 30000
            },
            identity: {
                username: this.config.botUsername,
                password: this.config.oauthToken
            },
            channels: [this.config.sourceChannel, this.config.targetChannel]  // <-- tu oba kanały
        });
    }

    private rememberMessage(user: string, msg: string) {
        const nick = user.toLowerCase();

        // Jeśli przekroczono limit — usuń najstarszy wpis (FIFO)
        if (this.lastMessages.size >= this.MAX_STORED_USERS) {
            const oldestKey = this.lastMessages.keys().next().value;
            this.lastMessages.delete(oldestKey);
        }

        this.lastMessages.set(nick, msg);
    }

    private setupTokenValidation(): void {
        // Waliduj token co 50 minut (przed wygaśnięciem)
        this.tokenValidationTimer = setInterval(async () => {
            if (this.oauthHelper && this.config.oauthToken) {
                const isValid = await this.oauthHelper.validateToken(this.config.oauthToken);
                if (!isValid) {
                    console.log('🔄 Token wygasł - odświeżanie...');
                    try {
                        this.config.oauthToken = await this.oauthHelper.getValidToken();
                        // Restart klienta z nowym tokenem
                        await this.client.disconnect();
                        this.client = this.createClient();
                        this.setupEventHandlers();
                        await this.client.connect();
                    } catch (error) {
                        console.error('❌ Błąd odświeżania tokenu:', error);
                    }
                }
            }
        }, 50 * 60 * 1000); // 50 minut
    }
    private setupEventHandlers(): void {
        // Połączenie nawiązane
        this.client.on('connected', (addr, port) => {
            console.log(`✅ Bot połączony z ${addr}:${port}`);
            console.log(`📺 Monitoruję kanał: #${this.config.sourceChannel}`);
            console.log(`🎯 Przekazuję do kanału: #${this.config.targetChannel}`);
            this.reconnectAttempts = 0;
        });

        // Rozłączenie
        this.client.on('disconnected', (reason) => {
            console.log(`❌ Bot rozłączony: ${reason}`);
            this.handleReconnect();
        });

        // Błędy połączenia
        this.client.on('error' as any, async (err: Error) => {
            console.error('🚨 Błąd połączenia:', err.message);
            if (err.message.includes('Login authentication failed')) {
                console.log('🔄 Błąd auth - próba odświeżenia tokenu...');
                if (this.oauthHelper) {
                    try {
                        this.config.oauthToken = await this.oauthHelper.getValidToken();
                        await this.client.connect();
                        return;
                    } catch (refreshError) {
                        console.error('❌ Nie udało się odświeżyć tokenu:', refreshError);
                    }
                }
                process.exit(1);
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
            await this.relayMessage(relay, '');

            // porządek w pamięci
            this.lastMessages.delete(username.toLowerCase());
        });





        // Otrzymana wiadomość
        this.client.on('message', async (channel, userstate, message, self) => {
            if (self) return;

            const channelName = channel.replace('#', '').toLowerCase();
            if (channelName !== this.config.sourceChannel.toLowerCase()) return;

            const sender = userstate['display-name'] || userstate.username || '';
            // 3a ► zapisz wiadomość
            if (sender) this.rememberMessage(sender, message);

            // 3b ► log (pomaga w debugowaniu)
            //console.log(`[${channelName}] ${sender}: ${message}`);

            // (Jeśli zostawiasz regex-based wykrywanie banów w zwykłych msg)
            if (this.isBanMessage(message)) {
                console.log('🚨 Wykryto ban (regex w message)');
                await this.relayMessage(
                    `Użytkownik ${sender} został zbanowany. Ostatnia wiadomość: "${message}".`,
                    'system'
                );
            }
        });


        // Informacje o dołączeniu do kanału
        this.client.on('join', (channel, username, self) => {
            if (self) {
                console.log(`🎉 Dołączono do kanału: ${channel}`);
            }
        });

        // Rate limiting
        this.client.on('messagedeleted', (channel, username, deletedMessage, userstate) => {
            console.log(`⚠️ Wiadomość usunięta: ${deletedMessage}`);
        });


    }

    private isBanMessage(message: string): boolean {
        return this.banPatterns.some(pattern => pattern.test(message));
    }

    private async relayMessage(originalMessage: string, originalUser: string): Promise<void> {

        try {
            // Sprawdź rate limit

            if (this.messageCount >= this.maxMessagesPerMinute) {
                console.log('⏳ Osiągnięto limit wiadomości na minutę, czekam...');
                return;
            }

            if (!this.minuteTimer) {
                this.minuteTimer = setInterval(() => {
                    this.messageCount = 0;
                }, 60000);
            }

            const currentTime = Date.now();
            if (currentTime - this.lastMessageTime < this.messageRateLimit) {
                console.log('⏳ Rate limit - czekam przed wysłaniem wiadomości');
                await this.sleep(this.messageRateLimit - (currentTime - this.lastMessageTime));
            }

            // Lepsze formatowanie wiadomości - usuń pusty originalUser
            const relayMessage = originalUser ?
                `${originalUser}: ${originalMessage}` :
                originalMessage;

            console.log(`🔍 Debug - próba wysłania na kanał: #${this.config.targetChannel}`);
            console.log(`🔍 Debug - treść wiadomości: "${relayMessage}"`);
            console.log(`🔍 Debug - status połączenia: ${this.client.readyState()}`);

            // Sprawdź czy klient jest połączony
            if (this.client.readyState() !== 'OPEN') {
                console.error('❌ Klient nie jest połączony! Status:', this.client.readyState());
                // Spróbuj ponownie połączyć
                await this.client.connect();
                return;
            }

            // Wyślij wiadomość na kanał docelowy z dodatkowym debugowaniem
            if (relayMessage === this.lastSentMessage &&
                currentTime - this.lastSentTime < 10000) { // 10s
                return;
            }
            this.lastSentMessage = relayMessage;
            this.lastSentTime = currentTime;
            const result = await this.client.say(`#${this.config.targetChannel}`, relayMessage);
            console.log('🔍 Debug - rezultat say():', result);

            this.lastMessageTime = Date.now();

            console.log(`📤 Przekazano wiadomość:`);
            console.log(`   📍 Z: #${this.config.sourceChannel} (${originalUser || 'system'})`);
            console.log(`   📍 Do: #${this.config.targetChannel}`);
            console.log(`   💬 Treść: ${originalMessage}`);

        } catch (error) {
            console.error('❌ Błąd podczas przekazywania wiadomości:', error);

            // Bardziej szczegółowe logowanie błędów
            if (error instanceof Error) {
                console.error('❌ Szczegóły błędu:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
            }

            // Jeśli błąd związany z połączeniem, spróbuj ponownie po chwili
            if (error instanceof Error && (
                error.message.includes('Not connected') ||
                error.message.includes('Connection closed') ||
                error.message.includes('ECONNRESET')
            )) {
                console.log('🔄 Próba ponownego połączenia i wysłania...');
                setTimeout(async () => {
                    try {
                        await this.client.connect();
                        await this.relayMessage(originalMessage, originalUser);
                    } catch (retryError) {
                        console.error('❌ Błąd przy ponownej próbie:', retryError);
                    }
                }, 3000);
            }
        }
        this.messageCount++;
    }

    private handleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`❌ Przekroczono maksymalną liczbę prób połączenia (${this.maxReconnectAttempts})`);
            process.exit(1);
        }

        this.reconnectAttempts++;
        console.log(`🔄 Próba ponownego połączenia ${this.reconnectAttempts}/${this.maxReconnectAttempts} za ${this.reconnectDelay / 1000}s...`);

        setTimeout(async () => {
            try {
                await this.client.connect();
            } catch (error) {
                console.error('❌ Błąd podczas ponownego połączenia:', error);
                this.handleReconnect();
            }
        }, this.reconnectDelay);

        // Zwiększ opóźnienie dla kolejnych prób (exponential backoff)
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 60000);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async start(): Promise<void> {
        try {
            console.log('🚀 Uruchamianie Twitch Relay Bot...');

            // Jeśli nie mamy tokenu, ale mamy OAuth helper, wygeneruj token
            if (!this.config.oauthToken && this.oauthHelper) {
                console.log('🔐 Brak tokenu OAuth - rozpoczynam proces autoryzacji...');

                // Sprawdź czy mamy zapisany token
                const existingToken = await this.oauthHelper.getValidToken();
                if (existingToken) {
                    console.log('✅ Znaleziono zapisany token OAuth');
                    this.config.oauthToken = existingToken;
                } else {
                    console.log('🔑 Wymagana nowa autoryzacja OAuth');
                    this.config.oauthToken = await this.oauthHelper.performOAuthFlow();
                }

                // Zweryfikuj token
                const isValid = await this.oauthHelper.validateToken(this.config.oauthToken);
                if (!isValid) {
                    throw new Error('Wygenerowany token OAuth jest nieprawidłowy');
                }

                // Odtwórz klienta z nowym tokenem
                this.client = this.createClient();
                this.setupEventHandlers();
            }

            console.log(`📋 Konfiguracja:`);
            console.log(`   🤖 Bot: ${this.config.botUsername}`);
            console.log(`   📺 Źródło: #${this.config.sourceChannel}`);
            console.log(`   🎯 Cel: #${this.config.targetChannel}`);

            await this.client.connect();
            this.setupTokenValidation();
        } catch (error) {
            console.error('❌ Błąd podczas uruchamiania bota:', error);
            process.exit(1);
        }
    }

    public async stop(): Promise<void> {
        console.log('🛑 Zatrzymywanie bota...');
        try {
            await this.client.disconnect();
            console.log('✅ Bot zatrzymany');
        } catch (error) {
            console.error('❌ Błąd podczas zatrzymywania:', error);
        }
    }
}

// Obsługa sygnałów systemu
process.on('SIGINT', async () => {
    console.log('\n🛑 Otrzymano sygnał SIGINT - zatrzymywanie bota...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Otrzymano sygnał SIGTERM - zatrzymywanie bota...');
    process.exit(0);
});

// Obsługa nieobsłużonych błędów
process.on('uncaughtException', (error) => {
    console.error('🚨 Nieobsłużony błąd:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Nieobsłużone odrzucenie Promise:', reason);
    process.exit(1);
});

// Uruchomienie aplikacji
async function main() {
    const bot = new TwitchRelayBot();
    await bot.start();
}

// Uruchom tylko jeśli plik jest wykonywany bezpośrednio
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Krytyczny błąd aplikacji:', error);
        process.exit(1);
    });
}

export default TwitchRelayBot;