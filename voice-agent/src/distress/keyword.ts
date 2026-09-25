import logger from '../utils/logger';

export class KeywordDistressDetector {
  private distressKeywords: Map<string, { kannada: string[]; english: string[]; confidence: number }> =
    new Map();

  constructor() {
    // Define distress keywords in multiple languages
    this.distressKeywords.set('help', {
      kannada: ['ಸಹಾಯ', 'ಮದತು', 'ನೀ ಸಹಾಯ', 'ಬೇಕಾದೆ ಸಹಾಯ'],
      english: ['help', 'assist', 'emergency', 'urgent'],
      confidence: 0.8,
    });

    this.distressKeywords.set('pain', {
      kannada: ['ನೋವು', 'ಬೇಧೆ', 'ಗಾಯ', 'ನೋವಾಗುತ್ತೆ'],
      english: ['pain', 'hurt', 'ache', 'chest pain'],
      confidence: 0.85,
    });

    this.distressKeywords.set('fall', {
      kannada: ['ಬಿದ್ದೆ', 'ಕೆಳಗೆ ಬಿದ್ದೆ', 'ಸ್ತಂಭಿಸಿ', 'ಬೀಳು'],
      english: ['fall', 'fell', 'fallen', 'tripped'],
      confidence: 0.9,
    });

    this.distressKeywords.set('breathe', {
      kannada: ['ಉಸಿರು', 'ಉಸಿರು ಸಿಕ್ಕಿಲ್ಲ', 'ಆಸ್ಪತ್ರೆ'],
      english: ['breathe', 'breath', 'breathing', 'asthma', 'suffocate'],
      confidence: 0.9,
    });

    this.distressKeywords.set('chest', {
      kannada: ['ಎದೆ', 'ಹೃದಯ', 'ಸಿನೆ'],
      english: ['chest', 'heart', 'cardiac'],
      confidence: 0.85,
    });

    this.distressKeywords.set('alone', {
      kannada: ['ಒಂದೇ', 'ಏಕೆ', 'ಯಾರೂ ಇಲ್ಲ'],
      english: ['alone', 'no one', 'nobody', 'help me'],
      confidence: 0.7,
    });

    logger.info('Keyword distress detector initialized');
  }

  /**
   * Detect distress from transcript
   * Returns true if distress keyword found, false otherwise
   */
  detect(transcript: string): { detected: boolean; keyword?: string; confidence: number } {
    const lowerTranscript = transcript.toLowerCase();

    for (const [category, data] of this.distressKeywords) {
      const allKeywords = [...data.kannada, ...data.english];

      for (const keyword of allKeywords) {
        const keywordLower = keyword.toLowerCase();

        if (lowerTranscript.includes(keywordLower)) {
          logger.warn(
            { keyword, category, transcript: transcript.substring(0, 100) },
            'Distress keyword detected'
          );

          return {
            detected: true,
            keyword: category,
            confidence: data.confidence,
          };
        }
      }
    }

    return {
      detected: false,
      confidence: 0,
    };
  }

  /**
   * Count repeated distress phrases (more reliable than single detection)
   * E.g., "amma amma amma" = 3 repetitions
   */
  detectRepeatedPhrase(transcript: string): { detected: boolean; phrase?: string; repetitions: number } {
    const words = transcript.toLowerCase().split(/\s+/);

    // Look for 2+ consecutive identical words
    for (let i = 0; i < words.length - 1; i++) {
      const word = words[i];

      if (this.isDistressWord(word) && words[i + 1] === word) {
        let repetitions = 2;

        // Count consecutive repetitions
        for (let j = i + 2; j < words.length && words[j] === word; j++) {
          repetitions++;
        }

        if (repetitions >= 2) {
          logger.warn(
            { phrase: word, repetitions },
            'Repeated distress phrase detected'
          );

          return {
            detected: true,
            phrase: word,
            repetitions,
          };
        }
      }
    }

    return {
      detected: false,
      repetitions: 0,
    };
  }

  private isDistressWord(word: string): boolean {
    const distressWords = [
      // Kannada
      'ಮಾತೃ',
      'ಅಮ್ಮ',
      'ಮಾ',
      'ನೋವು',
      'ಸಹಾಯ',
      'ಬೇಕು',
      'ಅಪರ್ य',
      // English
      'mama',
      'amma',
      'help',
      'ah',
      'ow',
      'ouch',
      'no',
      'stop',
    ];

    return distressWords.includes(word);
  }

  /**
   * Get detector info
   */
  getInfo(): { type: string; keywords: number } {
    return {
      type: 'Keyword pattern matcher',
      keywords: this.distressKeywords.size,
    };
  }
}

export default KeywordDistressDetector;