import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * A render throw used to leave a white screen with no explanation. The studio
 * holds unsaved work in the store, so the boundary keeps the message readable
 * and offers a way to recover without losing the browser state.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('studio crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>The studio hit an error</h1>
        <p>Your project is still saved in this browser. Reloading usually recovers it.</p>
        <pre>{this.state.error.message}</pre>
        <button className="primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
