import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light';
export type TabSize = 2 | 4;

export interface Settings {
  theme: Theme;
  tabSize: TabSize;
  wordWrap: boolean;
  fontFamily: string;
}

const defaultSettings: Settings = {
  theme: 'dark',
  tabSize: 2,
  wordWrap: false,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', monospace"
};

function createSettingsStore() {
  const getInitialState = (): Settings => {
    if (typeof window === 'undefined') return defaultSettings;
    const stored = localStorage.getItem('app-settings');
    if (stored) {
      try {
        return { ...defaultSettings, ...JSON.parse(stored) };
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  };

  const store = writable<Settings>(getInitialState());

  return {
    subscribe: store.subscribe,
    set: (value: Settings) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('app-settings', JSON.stringify(value));
      }
      store.set(value);
    },
    update: (updater: (value: Settings) => Settings) => {
      store.update((current) => {
        const newValue = updater(current);
        if (typeof window !== 'undefined') {
          localStorage.setItem('app-settings', JSON.stringify(newValue));
        }
        return newValue;
      });
    }
  };
}

export const settings = createSettingsStore();
