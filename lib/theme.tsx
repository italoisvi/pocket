import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

type Theme = {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  error: string;
  card: string;
  cardBorder: string;
  shadow: string;
  fabBackground: string;
  fabIcon: string;
};

export const lightTheme: Theme = {
  background: '#fff',
  surface: '#fff',
  text: '#000',
  textSecondary: '#666',
  border: '#f0f0f0',
  primary: '#000',
  error: '#ff3b30',
  card: '#fff',
  cardBorder: '#f0f0f0',
  shadow: '#000',
  fabBackground: '#fff',
  fabIcon: '#000',
};

export const darkTheme: Theme = {
  background: '#000',
  surface: '#1c1c1e',
  text: '#fff',
  textSecondary: '#a0a0a0',
  border: '#2c2c2e',
  primary: '#fff',
  error: '#ff453a',
  card: '#1c1c1e',
  cardBorder: '#2c2c2e',
  shadow: '#fff',
  fabBackground: '#000',
  fabIcon: '#fff',
};

type ThemeContextType = {
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@pocket_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    loadThemeMode();
  }, []);

  const loadThemeMode = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (
        savedMode &&
        (savedMode === 'light' ||
          savedMode === 'dark' ||
          savedMode === 'system')
      ) {
        setThemeModeState(savedMode as ThemeMode);
      }
    } catch (error) {
      console.error('Error loading theme mode:', error);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeModeState(mode);
    } catch (error) {
      console.error('Error saving theme mode:', error);
    }
  };

  const theme = useMemo(() => {
    if (themeMode === 'system') {
      return systemColorScheme === 'dark' ? darkTheme : lightTheme;
    }
    return themeMode === 'dark' ? darkTheme : lightTheme;
  }, [themeMode, systemColorScheme]);

  const isDark = theme === darkTheme;

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
