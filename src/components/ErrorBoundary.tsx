import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F6F2] text-[#141517] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#DFDCD2] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" />
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-[#141517]">
                  Something went wrong
                </h2>
              </div>
            </div>
            <p className="text-sm text-[#4B4E54] leading-relaxed break-words">
              {this.state.message}
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#F7F6F2] bg-[#141517] hover:bg-[#0F4C5C] rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
