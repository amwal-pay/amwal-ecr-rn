import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_SETTINGS,
  type AppSettings,
  type SavedTerminal,
} from './model';

const KEY = '@amwal-ecr-example/till';

export interface TillState {
  terminals: SavedTerminal[];
  settings: AppSettings;
}

const EMPTY: TillState = { terminals: [], settings: EMPTY_SETTINGS };

export async function loadTill(): Promise<TillState> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as TillState;
    return {
      terminals: Array.isArray(parsed.terminals) ? parsed.terminals : [],
      settings: { ...EMPTY_SETTINGS, ...parsed.settings },
    };
  } catch {
    return EMPTY;
  }
}

export async function saveTill(state: TillState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}
