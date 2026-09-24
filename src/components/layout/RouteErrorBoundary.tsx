import { RefreshCw } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { isChunkLoadError } from '@/lib/lazyPage';

/** Keeps one failed page from blanking the app; resets when the route changes. */
export class RouteErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: unknown; key: string }> {
  state = { error: null as unknown, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: unknown; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.error('[page error]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const newVersion = isChunkLoadError(this.state.error);
    return (
      <div className="card card-pad mx-auto mt-10 max-w-lg text-center" role="alert">
        <h2 className="text-h3">{newVersion ? 'A new version of Kisan Drishti is available' : 'This page could not be shown'}</h2>
        <p className="mt-2 text-sm text-ink-2">{newVersion ? 'Reload to get the latest version.' : 'Please reload and try again.'}</p>
        <button type="button" className="btn-primary mt-5" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reload
        </button>
      </div>
    );
  }
}
