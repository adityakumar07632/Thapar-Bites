import { Component, type ReactNode } from 'react';
import { ErrorState } from './States';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in dev/console logs to identify which boundary caught the error. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Debug audit fix: neither app had an error boundary anywhere. Without one,
 * an uncaught exception during render (a bad `.map()`, `.toFixed()` on
 * `null`, etc.) unmounts the ENTIRE React tree — in production that's a
 * blank white page with nothing but a console error, no recovery UI, and no
 * way back in without a manual reload.
 *
 * This catches render-time errors in the subtree below it and shows the
 * existing `ErrorState` component instead of going blank. Wrap it around
 * routed page content (inside the app shell/sidebar) so navigation stays
 * usable even if one page crashes.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ''}] Caught a render error:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center px-5 py-10">
          <ErrorState
            title="Something went wrong"
            description="This page hit an unexpected error. Reloading usually fixes it."
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
