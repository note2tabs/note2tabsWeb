import type { ReactNode } from "react";
import React from "react";
import { sendEvent } from "../lib/analytics";

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

type ErrorBoundaryProps = {
  children: ReactNode;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    sendEvent("frontend_error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-100">
          <h2 className="text-lg font-semibold">Something went wrong.</h2>
          <p className="mt-2 text-sm">{this.state.message || "Please refresh the page."}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
