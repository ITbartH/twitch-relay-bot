export class WordFilter {
    private strictMode: boolean = false; // true = tylko całe słowa, false = wszędzie
    
    private bannedWords: string[] = [
        // Rasistowskie/dyskryminacyjne
        'murzyn', 'czarnuch', 'żółtek', 'żydek', 'żydek', 'żydas',
        'pedał', 'ciapak', 'simp', 'incel', 'cuckold', 'kys',
        
        // Terminy nazistowskie/skrajne
        'hitler', 'nazi', 'heil',
        
        
        'pedofil', 'zboczeniec', 'degenerat', 'cwel', 'niger', 'pedzio', 'pedziu',
        
       
        'holocaust', 'holokaust', 'żydokomuna', 'żydzi', 'żyd',
        
     
        'nigger', 'nigga', 'faggot', 'retard', 'spic', 'chink', 'nygus', 'nugysek',
    ];

    private replacementChar = '*';

    constructor(strictMode: boolean = false) {
        this.strictMode = strictMode;
    }

    /**
     * Sprawdza czy tekst zawiera zakazane słowa
     */
    public containsBannedWords(text: string): boolean {
        return this.checkBannedWords(text, this.strictMode);
    }

    /**
     * Sprawdza zakazane słowa z opcją strict mode
     */
    private checkBannedWords(text: string, strictMode: boolean): boolean {
        const normalizedText = this.normalizeText(text);
        
        return this.bannedWords.some(word => {
            const normalizedWord = this.normalizeText(word);
            
            if (strictMode) {
                // Tylko całe słowa (z granicami słów)
                const wordBoundaryRegex = new RegExp(`\\b${this.escapeRegex(normalizedWord)}\\b`);
                return wordBoundaryRegex.test(normalizedText);
            } else {
                // Wszędzie (także wewnątrz słów) - ale z wyjątkami
                if (this.isFalsePositive(text, word)) {
                    return false;
                }
                return normalizedText.includes(normalizedWord);
            }
        });
    }

    /**
     * Sprawdza czy to fałszywy pozytyw
     */
    private isFalsePositive(text: string, bannedWord: string): boolean {
        const normalizedText = this.normalizeText(text);
        const normalizedBanned = this.normalizeText(bannedWord);
        
        // Lista wyjątków - słowa które zawierają zakazane słowa ale są OK
        const exceptions: { [key: string]: string[] } = {
            'nazi': ['gymnasium', 'organizacja', 'organization', 'magazine', 'amazon'],
            'rape': ['grape', 'drape', 'paper', 'therapy', 'prepare'],
            'jew': ['jewelry', 'jewel', 'jewish'], // kontekst ma znaczenie
        };
        
        if (exceptions[normalizedBanned]) {
            return exceptions[normalizedBanned].some(exception => 
                normalizedText.includes(this.normalizeText(exception))
            );
        }
        
        return false;
    }

    /**
     * Cenzuruje zakazane słowa w tekście
     */
    public censorText(text: string): string {
        let censoredText = text;
        const normalizedOriginal = this.normalizeText(text);
        
        for (const bannedWord of this.bannedWords) {
            const normalizedBanned = this.normalizeText(bannedWord);
            
            // Znajdź wszystkie wystąpienia (case-insensitive)
            const regex = new RegExp(this.escapeRegex(bannedWord), 'gi');
            censoredText = censoredText.replace(regex, (match) => {
                // Zastąp pierwszą i ostatnią literę, środek gwiazdkami
                if (match.length <= 2) {
                    return this.replacementChar.repeat(match.length);
                }
                return match[0] + this.replacementChar.repeat(match.length - 2) + match[match.length - 1];
            });
        }
        
        return censoredText;
    }

    /**
     * Bardziej agresywne cenzurowanie - zastępuje całe słowo gwiazdkami
     */
    public heavyCensorText(text: string): string {
        let censoredText = text;
        
        for (const bannedWord of this.bannedWords) {
            const regex = new RegExp(`\\b${this.escapeRegex(bannedWord)}\\b`, 'gi');
            censoredText = censoredText.replace(regex, this.replacementChar.repeat(bannedWord.length));
        }
        
        return censoredText;
    }

    /**
     * Sprawdza czy wiadomość powinna być całkowicie zablokowana
     */
    public shouldBlockMessage(text: string): boolean {
        const normalizedText = this.normalizeText(text);
        
        // Lista szczególnie drastycznych słów które blokują całą wiadomość
        const blockingWords = [
            'dgasudg7632gd67agsdasdhsad'
        ];
        
        return blockingWords.some(word => {
            const normalizedWord = this.normalizeText(word);
            return normalizedText.includes(normalizedWord);
        });
    }

    /**
     * Normalizuje tekst do porównań (usuwa znaki specjalne, diakrytyki)
     */
    private normalizeText(text: string): string {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // usuń diakrytyki
            .replace(/[^a-z0-9]/g, ''); // zostaw tylko litery i cyfry
    }

    /**
     * Escapuje znaki specjalne dla regex
     */
    private escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Dodaje nowe zakazane słowo
     */
    public addBannedWord(word: string): void {
        if (!this.bannedWords.includes(word.toLowerCase())) {
            this.bannedWords.push(word.toLowerCase());
        }
    }

    /**
     * Usuwa słowo z listy zakazanych
     */
    public removeBannedWord(word: string): void {
        const index = this.bannedWords.indexOf(word.toLowerCase());
        if (index > -1) {
            this.bannedWords.splice(index, 1);
        }
    }

    /**
     * Zwraca statystyki tekstu
     */
    public analyzeText(text: string): {
        originalText: string;
        containsBanned: boolean;
        shouldBlock: boolean;
        censoredText: string;
        foundWords: string[];
    } {
        const foundWords = this.bannedWords.filter(word => 
            this.normalizeText(text).includes(this.normalizeText(word))
        );

        return {
            originalText: text,
            containsBanned: this.containsBannedWords(text),
            shouldBlock: this.shouldBlockMessage(text),
            censoredText: this.censorText(text),
            foundWords
        };
    }
}