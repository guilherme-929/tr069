import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900">
          <div className="text-center p-8 max-w-md">
            <div className="text-4xl mb-4 text-danger">!</div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Algo deu errado</h1>
            <p className="text-sm text-slate-500 mb-4 font-mono">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:opacity-90"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
