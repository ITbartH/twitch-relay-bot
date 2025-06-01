## ENGLISH ##




## OAuth Configuration (dev.twitch.tv)

### Step 1: Prepare your app credentials
You should already have:
- **Client ID** from dev.twitch.tv
- **Client Secret** from dev.twitch.tv
- **OAuth Redirect URL**: `http://localhost:3000/callback`

### Step 2: Fill in your .env
```env
TWITCH_BOT_USERNAME=your_bot_username
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
SOURCE_CHANNEL=your_source_channel_name
TARGET_CHANNEL=your_target_channel_name
NODE_ENV=development
```

---

# Twitch Relay Bot 🤖

A bot that relays ban messages from the one channel (Twitch.tv) to another in real time.

## ✅ Features

- ✅ Monitors the channel for ban messages
- ✅ Automatically relays ban messages to the other channel
- ✅ Supports 7tv patterns for ban detection
- ✅ Auto-reconnects on disconnects
- ✅ Rate limiting compliant with Twitch's restrictions
- ✅ Detailed logging of bot activity
- ✅ Error handling and recovery

## 🛠️ Installation

### Requirements
- Node.js 18+
- pnpm (or npm/yarn)
- Twitch bot account
- OAuth token for the bot

### Step-by-step

1. **Clone the repository**
   ```bash
   git clone https://github.com/ITbartH/twitch-relay-bot
   cd twitch-relay-bot
   ```

2. **Install dependencies**
   ```bash
   pnpm install (or npm)
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Fill in `.env` file**
   *(see top of this document)*

5. **Run the bot**
   ```bash
   # Development mode (auto-restart)
   pnpm run dev

   # Production mode
   pnpm run build
   pnpm start
   ```

## 🔐 How to get an OAuth Token

1. Go to: https://dev.twitch.tv/console/apps
2. Register app (Category: Chat bot | Client Type: Confidential | OAuth Redirect URLs: http://localhost:3000/callback and http://localhost)
4. Paste clientID and clientSECRET into the `.env` file (don't share it)

## 📁 Project structure

```
twitch-relay-bot/
├── src/
│   └── relay-bot.ts        # Main application logic
│   └── oauth-helper.ts     # Generate link to login with your bot.
│   └── generate-token.ts   # Generate oauth token from your account.
├── dist/                   # Compiled output (not used yet)
├── .env                    # Environment file
├── package.json            # Project dependencies
├── tsconfig.json           # TypeScript configuration
└── README.md               # This guide
```

## ⚙️ How the bot works

1. **Connection**: Connects to the channel via Twitch IRC
2. **Listening**: Listens to all public chat messages
3. **Detection**: Uses regex patterns to detect ban-related messages:
   - `has been (permanently )?banned`
   - `został (na stałe )?zbanowany`
   - `permanently banned`
   - `banned by`
   - `.ban \w+`
   - `7tv.*ban`
4. **Relaying**: When a match is found, relays it to other channel
5. **Format**: `[RELAY from CHANNEL_1] username: original message`

## 🧪 Environment Variables

| Variable               | Description          | Example |
|------------------------|----------------------|-----------------------|
| `TWITCH_BOT_USERNAME`  | Bot's username       | `my_relay_bot`        |
| `TWITCH_CLIENT_ID`     | ClientID             | `hsur37shsdhsd...`    |
| `TWITCH_CLIENT_SECRET` | ClientSecret         | `s374hdsus43sd...`    |
| `SOURCE_CHANNEL`       | Channel to monitor   | `XQC`                 |
| `TARGET_CHANNEL`       | Channel to relay to  | `KaiCenat`            |
| `NODE_ENV`             | Runtime environment  | `production`          |

## 🧠 Ban Detection Patterns

The bot recognizes:
- Ban messages from 7tv (English and Polish)
- Moderator commands like `.ban username`
- Both temporary and permanent bans

## 📋 Logging

The bot logs all relevant events in the console:

```
 Bot connected to irc-ws.chat.twitch.tv:443
 Monitoring channel: #channel1
 Relaying to channel: #channel2
 Relayed message:
    From: #channel1 (moderator_nick)
    To:   #channel2
    Msg:  user123 has been permanently banned
```

## ⚙️ Run Options

### Development mode
```bash
pnpm run dev
```
- Auto-restart on code changes
- Detailed debug logs
- Instant TypeScript compilation

### Production mode
```bash
pnpm run build
pnpm start
```
- Optimized JS output
- Lower resource usage
- Stable 24/7 runtime

## 🔐 Security & Limits

### Rate Limiting
- Max 1 message per second
- Auto-delay when nearing limit

### Reconnect Strategy
- Auto reconnect on disconnect
- Exponential backoff
- Max 10 reconnect attempts

### Error Handling
- All errors are logged
- Graceful shutdown on SIGINT/SIGTERM
- Automatic recovery from network issues

## 🛣️ Roadmap

- [x] Basic relay from `channel_1` to `channel_2`
- [ ] File/database ban logging
- [ ] Discord webhook support
- [ ] Multi-channel relay matrix
- [ ] Web-based config panel
- [ ] Stats and metrics
- [ ] Hot reload for config

## ❓ FAQ

**Does the bot need to be a moderator?**  
No – it only reads public chat messages.

**Is it Twitch-compliant?**  
Yes – uses official IRC endpoints and obeys rate limits.

**Can I add more channels?**  
Not yet, but the architecture allows easy extension.

**Does it work with 0 viewers?**  
Yes – it runs independently of viewership.

**What if the bot disconnects?**  
It will automatically attempt to reconnect (up to 10 times).

## 🧩 Troubleshooting

### Bot won't connect
1. Check `TWITCH_CLIENT_ID`
2. Check `TWITCH_CLIENT_SECRET`
3. Check `TWITCH_BOT_USERNAME` (no `@`)
4. Make sure the bot account exists

### Messages aren’t relaying
1. Confirm `SOURCE_CHANNEL` is correct
2. Make sure ban messages are present
3. Check logs – maybe regex patterns didn’t match

### Rate limit errors
Bot manages rate limits, but if issues occur:
1. Increase `messageRateLimit` in the code
2. Check internet stability

## 💬 Support

If you run into problems:
1. Check logs in the terminal
2. Make sure all `.env` variables are correct
3. Ensure the OAuth token is valid and up-to-date

---

**Note**: This bot is an MVP and may require customization to suit your channel’s needs.




## POLISH ##

## POLSKI ##

## Konfiguracja OAuth (dev.twitch.tv)

### Krok 1: Przygotuj dane aplikacji
Powinieneś już mieć:
- **Client ID** z dev.twitch.tv
- **Client Secret** z dev.twitch.tv
- **OAuth Redirect URL**: `http://localhost:3000/callback`

### Krok 2: Uzupełnij plik .env
```env
TWITCH_BOT_USERNAME=twoja_nazwa_bota
TWITCH_CLIENT_ID=twój_client_id
TWITCH_CLIENT_SECRET=twój_client_secret
SOURCE_CHANNEL=nazwa_kanału_źródłowego
TARGET_CHANNEL=nazwa_kanału_docelowego
NODE_ENV=development
```

---

# Twitch Relay Bot 🤖

Bot, który przekazuje wiadomości o banach z jednego kanału (Twitch.tv) na drugi w czasie rzeczywistym.

## ✅ Funkcje

- ✅ Monitoruje kanał pod kątem wiadomości o banach
- ✅ Automatycznie przekazuje wiadomości o banach do innego kanału
- ✅ Obsługuje wzorce 7tv do wykrywania banów
- ✅ Automatyczne ponowne połączenie po rozłączeniu
- ✅ Zgodność z ograniczeniami Twitcha (rate limiting)
- ✅ Szczegółowe logowanie aktywności bota
- ✅ Obsługa błędów i odzyskiwanie

## 🛠️ Instalacja

### Wymagania
- Node.js 18+
- pnpm (lub npm/yarn)
- Konto bota Twitch
- Token OAuth dla bota

### Krok po kroku

1. **Sklonuj repozytorium**
   ```bash
   git clone https://github.com/ITbartH/twitch-relay-bot
   cd twitch-relay-bot
   ```

2. **Zainstaluj zależności**
   ```bash
   pnpm install (lub npm)
   ```

3. **Skonfiguruj zmienne środowiskowe**
   ```bash
   cp .env.example .env
   ```

4. **Uzupełnij plik `.env`**
   *(patrz początek tego dokumentu)*

5. **Uruchom bota**
   ```bash
   # Tryb developerski (auto-restart)
   pnpm run dev

   # Tryb produkcyjny
   pnpm run build
   pnpm start
   ```

## 🔐 Jak uzyskać token OAuth

1. Przejdź na: https://dev.twitch.tv/console/apps  
2. Zarejestruj aplikację (Kategoria: Chat bot | Client Type: Confidential | OAuth Redirect URLs: http://localhost:3000/callback oraz http://localhost)  
3. Wklej `clientID` i `clientSECRET` do pliku `.env` (nie udostępniaj ich publicznie)

## 📁 Struktura projektu

```
twitch-relay-bot/
├── src/
│   └── relay-bot.ts        # Główna logika aplikacji
│   └── oauth-helper.ts     # Generowanie linku do logowania botem
│   └── generate-token.ts   # Generowanie tokena oauth z konta
├── dist/                   # Kompilacja (na razie nieużywana)
├── .env                    # Plik środowiskowy
├── package.json            # Zależności projektu
├── tsconfig.json           # Konfiguracja TypeScript
└── README.md               # Ten przewodnik
```

## ⚙️ Jak działa bot

1. **Połączenie**: Łączy się z kanałem przez Twitch IRC  
2. **Nasłuchiwanie**: Nasłuchuje publicznych wiadomości na czacie  
3. **Wykrywanie**: Używa wyrażeń regularnych do wykrywania wiadomości o banach:
   - `has been (permanently )?banned`
   - `został (na stałe )?zbanowany`
   - `permanently banned`
   - `banned by`
   - `.ban \w+`
   - `7tv.*ban`
4. **Przekazywanie**: Gdy wykryje pasującą wiadomość, przesyła ją na drugi kanał  
5. **Format**: `[RELAY from CHANNEL_1] username: oryginalna wiadomość`

## 🧪 Zmienne środowiskowe

| Zmienna                  | Opis                 | Przykład              |
|--------------------------|----------------------|------------------------|
| `TWITCH_BOT_USERNAME`    | Nazwa użytkownika bota | `moj_relay_bot`      |
| `TWITCH_CLIENT_ID`       | Client ID             | `hsur37shsdhsd...`    |
| `TWITCH_CLIENT_SECRET`   | Client Secret         | `s374hdsus43sd...`    |
| `SOURCE_CHANNEL`         | Kanał do monitorowania | `XQC`                |
| `TARGET_CHANNEL`         | Kanał docelowy         | `KaiCenat`           |
| `NODE_ENV`               | Tryb środowiska       | `production`          |

## 🧠 Wzorce wykrywania banów

Bot rozpoznaje:
- Wiadomości o banach z 7tv (angielskie i polskie)
- Komendy moderatorów typu `.ban nazwa`
- Zarówno bany tymczasowe, jak i permanentne

## 📋 Logowanie

Bot loguje wszystkie istotne zdarzenia w terminalu:

```
 Bot connected to irc-ws.chat.twitch.tv:443
 Monitoring channel: #channel1
 Relaying to channel: #channel2
 Relayed message:
    From: #channel1 (moderator_nick)
    To:   #channel2
    Msg:  user123 has been permanently banned
```

## ⚙️ Tryby uruchamiania

### Tryb developerski
```bash
pnpm run dev
```
- Auto-restart przy zmianie kodu
- Szczegółowe logi debugujące
- Błyskawiczna kompilacja TypeScript

### Tryb produkcyjny
```bash
pnpm run build
pnpm start
```
- Zoptymalizowany kod JS
- Niższe zużycie zasobów
- Stabilna praca 24/7

## 🔐 Bezpieczeństwo i limity

### Ograniczenia Twitch (Rate Limiting)
- Max 1 wiadomość na sekundę
- Automatyczne opóźnienia przy zbliżeniu do limitu

### Strategia ponownego łączenia
- Automatyczne ponowne połączenie po rozłączeniu
- Algorytm "exponential backoff"
- Maksymalnie 10 prób połączenia

### Obsługa błędów
- Wszystkie błędy są logowane
- Łagodne wyłączanie na SIGINT/SIGTERM
- Automatyczne odzyskiwanie po błędach sieci

## 🛣️ Roadmap

- [x] Podstawowe przekazywanie z `channel_1` do `channel_2`
- [ ] Logowanie banów do pliku/bazy danych
- [ ] Obsługa webhooków Discord
- [ ] Matryca wielu kanałów
- [ ] Konfigurator webowy
- [ ] Statystyki i metryki
- [ ] Hot reload konfiguracji

## ❓ FAQ

**Czy bot musi być moderatorem?**  
Nie – bot czyta tylko publiczne wiadomości na czacie.

**Czy to zgodne z zasadami Twitcha?**  
Tak – używa oficjalnych endpointów IRC i przestrzega limitów.

**Czy można dodać więcej kanałów?**  
Jeszcze nie, ale architektura na to pozwala.

**Czy działa przy 0 widzach?**  
Tak – bot działa niezależnie od liczby widzów.

**Co jeśli bot się rozłączy?**  
Automatycznie podejmie próbę ponownego połączenia (do 10 razy).

## 🧩 Rozwiązywanie problemów

### Bot nie łączy się
1. Sprawdź `TWITCH_CLIENT_ID`
2. Sprawdź `TWITCH_CLIENT_SECRET`
3. Sprawdź `TWITCH_BOT_USERNAME` (bez `@`)
4. Upewnij się, że konto bota istnieje

### Wiadomości nie są przekazywane
1. Upewnij się, że `SOURCE_CHANNEL` jest poprawny
2. Sprawdź, czy na czacie są wiadomości o banach
3. Zajrzyj do logów – może wzorce regex nie pasowały

### Problemy z rate limit
Bot zarządza limitami, ale jeśli wystąpią problemy:
1. Zwiększ `messageRateLimit` w kodzie
2. Sprawdź stabilność internetu

## 💬 Wsparcie

Jeśli napotkasz problemy:
1. Sprawdź logi w terminalu
2. Upewnij się, że wszystkie zmienne `.env` są poprawne
3. Zweryfikuj ważność tokena OAuth

---

**Uwaga**: Bot jest w wersji MVP i może wymagać dostosowania do potrzeb Twojego kanału.
