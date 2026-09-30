import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

/**
 * The console does not go blank.
 *
 * There was no error boundary anywhere in the app, so a single throw in any page
 * unmounted the whole shell and left the officer staring at a white screen with
 * no way back and no record of what happened. For a page an officer watches for
 * hours, losing the board to a rendering fault is worse than losing the data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // There is no error reporting sink in the portal yet, so at least make the
    // fault visible in the console rather than swallowing it.
    console.error('Sahayak web: render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: 'var(--color-canvas)',
        }}
      >
        <div
          style={{
            maxWidth: '46ch',
            background: 'var(--color-raised)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-raised)',
            padding: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: 'var(--text-display)', fontWeight: 700, margin: 0 }}>
            This screen stopped working
          </h1>
          <p
            style={{
              margin: '0.5rem 0 0',
              fontSize: 'var(--text-body)',
              lineHeight: 1.5,
              color: 'var(--color-ink-muted)',
            }}
          >
            The data is still on the server. Reload to pick up where you were.
          </p>
          <p
            className="mono"
            style={{ margin: '0.75rem 0 0', color: 'var(--color-ink-muted)', wordBreak: 'break-word' }}
          >
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.25rem',
              padding: '0.4375rem 0.875rem',
              borderRadius: 'var(--radius-control)',
              border: 'none',
              background: 'var(--color-navy)',
              color: 'var(--color-ink-inverse)',
              fontFamily: 'inherit',
              fontSize: 'var(--text-body)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
