import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

type SpeechRecognitionEvent = Event & { results: SpeechRecognitionResultList };
type SpeechRecognitionErrorEvent = Event & { error: string };
interface SpeechRecognitionStatic {
  new (): SpeechRecognition;
}
interface SpeechRecognition {
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
}

const SpeechRecognition = (typeof window !== 'undefined' && (window as any).SpeechRecognition) ||
  (typeof window !== 'undefined' && (window as any).webkitSpeechRecognition) || null;

const LANGUAGE_MAP: Record<string, string> = {
  de: 'de-DE',
  pl: 'pl-PL',
  en: 'en-US',
};

interface UseVoiceInputOptions {
  onResult?: (text: string) => void;
  append?: boolean; // if true, append to existing text instead of replacing
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startListening = useCallback((callback?: (text: string) => void) => {
    if (!SpeechRecognition) {
      setError('Voice input not supported in your browser');
      return;
    }

    const recognition = new SpeechRecognition();
    const speechLang = LANGUAGE_MAP[i18n.language] || 'de-DE';

    recognition.lang = speechLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        const text = finalTranscript.trim();
        if (options.onResult) {
          options.onResult(text);
        }
        if (callback) {
          callback(text);
        }
      }
    };

    recognition.onerror = (event: any) => {
      setError(event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [i18n.language, options]);

  const stopListening = useCallback(() => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.stop();
    }
  }, []);

  return {
    isListening,
    error,
    startListening,
    stopListening,
    isSupported: !!SpeechRecognition,
  };
}
