export const GAME_LANGUAGES = ["English", "French", "Spanish", "Portuguese", "German", "Turkish"] as const;
export type GameLanguage = (typeof GAME_LANGUAGES)[number];
export const DEFAULT_GAME_LANGUAGE: GameLanguage = "Portuguese";
