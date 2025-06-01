#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { TwitchOAuthHelper } from './oauth-helper.js';

// Załaduj zmienne środowiskowe
dotenv.config();

async function generateToken() {
  console.log('🔐 Generator tokenu OAuth dla Twitch RelayBot\n');

  // Sprawdź czy mamy wymagane dane
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Błąd: Brak TWITCH_CLIENT_ID lub TWITCH_CLIENT_SECRET w pliku .env');
    console.log('\n📋 Upewnij się że masz w .env:');
    console.log('TWITCH_CLIENT_ID=your_client_id');
    console.log('TWITCH_CLIENT_SECRET=your_client_secret');
    process.exit(1);
  }

  try {
    const oauthHelper = new TwitchOAuthHelper(clientId, clientSecret);
    
    console.log('📱 Informacje o aplikacji:');
    console.log(`   🆔 Client ID: ${clientId}`);
    console.log(`   🔒 Client Secret: ${clientSecret.substring(0, 8)}...`);
    console.log();

    // Sprawdź czy już mamy token
    const existingToken = await oauthHelper.getValidToken();
    if (existingToken) {
      console.log('✅ Znaleziono aktualny token w cache!');
      console.log(`🎟️  Token: ${existingToken.substring(0, 15)}...`);
      
      const isValid = await oauthHelper.validateToken(existingToken);
      if (isValid) {
        console.log('✅ Token jest prawidłowy i gotowy do użycia');
        console.log('\n📝 Możesz dodać go do .env jako:');
        console.log(`TWITCH_OAUTH_TOKEN=${existingToken}`);
        return;
      } else {
        console.log('❌ Token w cache jest nieprawidłowy, generuję nowy...');
      }
    }

    // Wygeneruj nowy token
    console.log('🔄 Rozpoczynam proces autoryzacji OAuth...');
    const token = await oauthHelper.performOAuthFlow();
    
    console.log('\n🎉 Sukces! Token został wygenerowany:');
    console.log(`🎟️  Token: ${token.substring(0, 15)}...`);
    console.log('\n📝 Dodaj poniższą linię do swojego pliku .env:');
    console.log(`TWITCH_OAUTH_TOKEN=${token}`);
    console.log('\n💡 Lub pozostaw puste - bot automatycznie użyje tego tokenu przy starcie.');
    
  } catch (error) {
    console.error('\n❌ Błąd podczas generowania tokenu:', error);
    console.log('\n🔧 Rozwiązywanie problemów:');
    console.log('1. Sprawdź czy TWITCH_CLIENT_ID i TWITCH_CLIENT_SECRET są poprawne');
    console.log('2. Upewnij się że aplikacja ma ustawiony redirect URI: http://localhost:3000/callback');
    console.log('3. Sprawdź czy port 3000 nie jest zajęty');
    process.exit(1);
  }
}

// Uruchom generator
if (require.main === module) {
  generateToken().catch(error => {
    console.error('💥 Krytyczny błąd:', error);
    process.exit(1);
  });
}