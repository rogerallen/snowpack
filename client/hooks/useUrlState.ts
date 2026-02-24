import { useState, useCallback, useEffect } from 'react';

/**
 * A custom hook to sync a piece of state with a URL query parameter.
 * Uses history.replaceState to avoid polluting the browser history with every state change.
 */
export function useUrlState(
  key: string,
  defaultValue: string,
): [string, (newValue: string | null) => void] {
  const [value, setValue] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key) || defaultValue;
  });

  const setUrlValue = useCallback(
    (newValue: string | null) => {
      setValue(newValue || defaultValue);

      const url = new URL(window.location.href);
      if (newValue && newValue !== defaultValue) {
        url.searchParams.set(key, newValue);
      } else {
        url.searchParams.delete(key);
      }

      // Use replaceState to update the URL without adding a history entry
      window.history.replaceState({}, '', url.toString());
    },
    [key, defaultValue],
  );

  // Sync state if URL changes externally (e.g. back/forward button, though replaceState minimizes this)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlValue = params.get(key);
      if (urlValue !== value) {
        setValue(urlValue || defaultValue);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [key, value, defaultValue]);

  return [value, setUrlValue];
}
