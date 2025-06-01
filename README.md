##  Konfiguracja OAuth (dev.twitch.tv)

### Krok 1: Przygotuj dane aplikacji
Masz już:
- **Client ID** z dev.twitch.tv
- **Client Secret** z dev.twitch.tv
- **OAuth Redirect URL**: `http://localhost:3000/callback`

### Krok 2: Wypełnij .env
```env
TWITCH_BO# Twitch Relay Bot 🤖

Bot przekazujący wiadomości o banach z kanału `mamm0n` na kanał `MORK` w czasie rzeczywistym.

##  Funkcjonalności

- ✅ Monitorowanie kanału `mamm0n` w poszukiwaniu wiadomości o banach
- ✅ Automatyczne przekazywanie wiadomości na kanał `MORK`
- ✅ Obsługa wzorców 7tv dla wykrywania banów
- ✅ Automatyczny reconnect przy rozłączeniach
- ✅ Rate limiting zgodny z ograniczeniami Twitcha
- ✅ Szczegółowe logowanie działań
- ✅ Obsługa błędów i recovery

## 🛠️ Instalacja

### Wymagania
- Node.js 18+
- pnpm (lub npm/yarn)
- Konto bota na Twitchu
- Token OAuth dla bota

### Krok po kroku

1. **Sklonuj repozytorium**
   ```bash
   git clone <repo-url>
   cd twitch-relay-bot
   ```

2. **Zainstaluj zależności**
   ```bash
   pnpm install
   ```

3. **Skonfiguruj zmienne środowiskowe**
   ```bash
   cp .env.example .env
   ```

4. **Wypełnij plik `.env`**
   ```env
   TWITCH_BOT_USERNAME=twoj_bot_username
   TWITCH_OAUTH_TOKEN=oauth:your_token_here
   SOURCE_CHANNEL=mamm0n
   TARGET_CHANNEL=mork
   NODE_ENV=development
   ```

5. **Uruchom bota**
   ```bash
   # Tryb rozwojowy (auto-restart)
   pnpm run dev
   
   # Produkcja
   pnpm run build
   pnpm start
   ```

##  Jak uzyskać Token OAuth?

1. Idź na stronę: https://twitchapps.com/tmi/
2. Zaloguj się kontem bota
3. Skopiuj token (zaczyna się od `oauth:`)
4. Wklej do pliku `.env`

##  Struktura projektu

```
twitch-relay-bot/
├── src/
│   └── relay-bot.ts        # Główna aplikacja
├── dist/                   # Skompilowane pliki
├── .env.example           # Przykładowa konfiguracja
├── package.json           # Zależności projektu
├── tsconfig.json          # Konfiguracja TypeScript
└── README.md              # Ta instrukcja
```

##  Jak działa bot?

1. **Połączenie**: Bot łączy się z kanałem `#mamm0n` przez IRC
2. **Monitorowanie**: Nasłuchuje wszystkich wiadomości na czacie
3. **Wykrywanie**: Używa wzorców regex do identyfikacji wiadomości o banach:
   - `has been (permanently )?banned`
   - `został (na stałe )?zbanowany`
   - `permanently banned`
   - `banned by`
   - `.ban \w+`
   - `7tv.*ban`
4. **Przekazywanie**: Gdy znajdzie wiadomość o banie, wysyła ją na kanał `#mork`
5. **Format**: `[RELAY z #mamm0n] username: oryginalna wiadomość`

## 🔧 Konfiguracja

### Zmienne środowiskowe

| Zmienna | Opis | Przykład |
|---------|------|----------|
| `TWITCH_BOT_USERNAME` | Nazwa użytkownika bota | `my_relay_bot` |
| `TWITCH_OAUTH_TOKEN` | Token OAuth (z prefiksem oauth:) | `oauth:abc123...` |
| `SOURCE_CHANNEL` | Kanał do monitorowania | `mamm0n` |
| `TARGET_CHANNEL` | Kanał docelowy | `mork` |
| `NODE_ENV` | Środowisko (development/production) | `production` |

### Wzorce wykrywania banów

Bot rozpoznaje następujące wzorce wiadomości:
- Wiadomości z 7tv o banach (angielskie i polskie)
- Komendy moderacyjne `.ban username`
- Informacje o banach czasowych i permanentnych

##  Logowanie

Bot wyświetla szczegółowe logi w konsoli:

```
 Bot połączony z irc-ws.chat.twitch.tv:443
 Monitoruję kanał: #mamm0n
 Przekazuję do kanału: #mork
 Przekazano wiadomość:
    Z: #mamm0n (moderator_nick)
    Do: #mork
    Treść: user123 has been permanently banned
```

## ⚙️ Opcje uruchomieniowe

### Tryb rozwojowy
```bash
pnpm run dev
```
- Auto-restart przy zmianach
- Szczegółowe logi debug
- Natychmiastowe kompilowanie TypeScript

### Tryb produkcyjny
```bash
pnpm run build
pnpm start
```
- Zoptymalizowany kod JavaScript
- Mniejsze zużycie zasobów
- Stabilne działanie 24/7

##  Bezpieczeństwo i ograniczenia

### Rate Limiting
- Maksymalnie 1 wiadomość na sekundę
- Automatyczne opóźnienia przy intensywnym ruchu

### Reconnect Strategy
- Automatyczne ponowne połączenie przy rozłączeniu
- Exponential backoff (zwiększające się opóźnienia)
- Maksymalnie 10 prób połączenia

### Obsługa błędów
- Wszystkie błędy są logowane
- Graceful shutdown przy SIGINT/SIGTERM
- Recovery po błędach sieci

##  Roadmap

- [x]  Podstawowy relay z `mamm0n` do `MORK`
- [ ]  Logowanie banów do pliku/bazy danych
- [ ]  Webhook do Discorda
- [ ]  Obsługa wielu kanałów (relay matrix)
- [ ]  Panel konfiguracyjny w przeglądarce
- [ ]  Statystyki i metryki
- [ ]  Hot reload konfiguracji

##  FAQ

**Czy bot musi być moderatorem kanału?**
Nie – bot odczytuje tylko publiczne wiadomości czatu.

**Czy to zgodne z zasadami Twitcha?**
Tak, używamy oficjalnych endpointów IRC i przestrzegamy rate limitów.

**Czy można dodać więcej kanałów?**
Obecnie nie, ale architektura pozwala na łatwe rozszerzenie.

**Czy bot działa gdy nikt nie ogląda kanału?**
Tak, bot działa niezależnie od liczby widzów.

**Co jeśli bot się rozłączy?**
Automatycznie spróbuje się ponownie połączyć (do 10 razy).

##  Rozwiązywanie problemów

### Bot się nie łączy
1. Sprawdź `TWITCH_OAUTH_TOKEN` (musi zaczynać się od `oauth:`)
2. Sprawdź `TWITCH_BOT_USERNAME` (bez znaku @)
3. Upewnij się że konto bota istnieje

### Brak przekazywanych wiadomości
1. Sprawdź czy kanał `SOURCE_CHANNEL` jest poprawny
2. Sprawdź czy na kanale są wiadomości o banach
3. Sprawdź logi - być może wzorce regex nie pasują

### Błędy rate limit
Bot automatycznie zarządza rate limitami, ale jeśli występują błędy:
1. Zwiększ `messageRateLimit` w kodzie
2. Sprawdź połączenie internetowe

##  Wsparcie

Jeśli napotkasz problemy:
1. Sprawdź logi w konsoli
2. Upewnij się że wszystkie zmienne środowiskowe są ustawione
3. Sprawdź czy token OAuth jest aktualny

---

**Uwaga**: Bot jest w wersji MVP i może wymagać dostosowań do specyficznych potrzeb kanału.