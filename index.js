// Entry point for React Native bundler
// Add web polyfills first
import '@ungap/structured-clone';

// Re-export expo-router entry
import 'expo-router/entry';

// Global error handlers for debugging startup issues
if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('[GLOBAL ERROR]', { message, source, lineno, colno, error: error?.stack });
    return false;
  };
  
  window.onunhandledrejection = (event) => {
    console.error('[UNHANDLED REJECTION]', event.reason);
  };
}

console.log('[INDEX] App entry point loaded');
