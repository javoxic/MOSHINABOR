import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Language } from '@moshina/shared';

const KEY = 'mb.app';

interface AppState {
  hydrated: boolean;
  language: Language;
  languageChosen: boolean;
  selectedVehicleId: string | null;
  hydrate: () => Promise<void>;
  setLanguage: (l: Language) => void;
  selectVehicle: (id: string | null) => void;
}

function persist(s: Pick<AppState, 'language' | 'languageChosen' | 'selectedVehicleId'>) {
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch((e: unknown) => console.warn('Failed to persist app state', e));
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  language: 'uz',
  languageChosen: false,
  selectedVehicleId: null,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<AppState>;
        set({
          language: s.language && ['uz', 'ru', 'en'].includes(s.language) ? s.language : 'uz',
          languageChosen: Boolean(s.languageChosen),
          selectedVehicleId: s.selectedVehicleId ?? null,
        });
      }
    } catch (e) {
      console.warn('Failed to read app state', e);
    } finally {
      set({ hydrated: true });
    }
  },
  setLanguage: (language) => {
    set({ language, languageChosen: true });
    const { languageChosen, selectedVehicleId } = { ...get(), languageChosen: true };
    persist({ language, languageChosen, selectedVehicleId });
  },
  selectVehicle: (selectedVehicleId) => {
    set({ selectedVehicleId });
    const { language, languageChosen } = get();
    persist({ language, languageChosen, selectedVehicleId });
  },
}));
