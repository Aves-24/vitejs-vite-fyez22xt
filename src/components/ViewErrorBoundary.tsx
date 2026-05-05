import React from 'react';

interface Props { children: React.ReactNode }
interface State { hasError: boolean }

/**
 * ErrorBoundary specjalnie dla widoków lazy-loaded.
 *
 * Łapie błędy renderowania (w tym chunk loading errors, które przeszły przez
 * lazyWithRetry mimo reloadu) i pokazuje komunikat z przyciskiem „Spróbuj
 * ponownie" zamiast białego ekranu.
 */
export default class ViewErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ViewErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    try { window.sessionStorage.removeItem('grotX_chunkRetry'); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-red-500 text-3xl">error_outline</span>
          </div>
          <h2 className="text-base font-black text-[#0a3a2a] mb-2">Coś poszło nie tak</h2>
          <p className="text-[11px] font-bold text-gray-500 mb-5 max-w-xs leading-relaxed">
            Nie udało się załadować widoku. Może to być spowodowane chwilową utratą połączenia
            albo aktualizacją aplikacji.
          </p>
          <button
            onClick={this.handleReload}
            className="bg-[#0a3a2a] text-[#fed33e] px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-md flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Spróbuj ponownie
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
