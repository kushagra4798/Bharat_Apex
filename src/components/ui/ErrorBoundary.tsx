import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 bg-surface-container-lowest dark:bg-[#0b111e] border border-error/50 dark:border-red-500/50 rounded-xl shadow-lg flex flex-col gap-4 text-on-surface dark:text-[#f8fafc]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-error-container text-on-error-container dark:bg-red-950/80 dark:text-red-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">crisis_alert</span>
            </div>
            <div className="flex-1">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-error dark:text-red-400 block">
                Telemetry View Exception
              </span>
              <h3 className="text-base font-bold text-on-surface dark:text-white mt-0.5">
                {this.props.fallbackTitle ?? 'Component Interruption Detected'}
              </h3>
              <p className="text-xs text-secondary dark:text-[#94a3b8] mt-1">
                {this.state.error?.message ?? 'An unexpected failure occurred while rendering this module.'}
              </p>
            </div>
          </div>

          {this.state.error?.stack && (
            <details className="text-[11px] font-mono bg-surface-container-low dark:bg-[#070b14] p-3 rounded-lg border border-outline-variant/30 dark:border-[#222e4a] text-secondary dark:text-[#94a3b8] overflow-x-auto">
              <summary className="cursor-pointer font-semibold text-on-surface dark:text-white mb-1">
                View Stack Trace
              </summary>
              <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
            </details>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-1.5 rounded-lg border border-outline-variant/40 dark:border-[#243352] text-xs font-semibold hover:bg-surface-container transition-colors"
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm"
            >
              Reset Module State
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
