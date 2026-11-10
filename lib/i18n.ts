export const languages = [
  { code: "en", label: "English" },
  { code: "tl", label: "Tagalog" },
  { code: "id", label: "Bahasa Indonesia" },
] as const;

export type Language = (typeof languages)[number]["code"];

const dictionaries = {
  en: {
    explore: "Explore",
    search: "Search",
    clips: "Clips",
    players: "Players",
    heroes: "Heroes",
    trending: "Trending",
    noResults: "No matches.",
    highlights: "Highlights",
    liked: "Liked",
    comments: "Comments",
    following: "Following",
    followers: "Followers",
    privateTab: "This list is private.",
    settings: "Settings",
    appearance: "Appearance",
    privacy: "Privacy",
    playback: "Playback",
    notifications: "Notifications",
    language: "Language",
    save: "Save settings",
    saved: "Settings saved.",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "System",
  },
  tl: {
    explore: "Tuklasin",
    search: "Hanapin",
    clips: "Mga clip",
    players: "Mga manlalaro",
    heroes: "Mga hero",
    trending: "Uso",
    noResults: "Walang nahanap.",
    highlights: "Mga highlight",
    liked: "Na-like",
    comments: "Mga komento",
    following: "Sinusundan",
    followers: "Mga tagasunod",
    privateTab: "Pribado ang listahang ito.",
    settings: "Mga setting",
    appearance: "Hitsura",
    privacy: "Privacy",
    playback: "Pag-playback",
    notifications: "Mga abiso",
    language: "Wika",
    save: "I-save",
    saved: "Na-save ang settings.",
    themeDark: "Madilim",
    themeLight: "Maliwanag",
    themeSystem: "System",
  },
  id: {
    explore: "Jelajahi",
    search: "Cari",
    clips: "Klip",
    players: "Pemain",
    heroes: "Hero",
    trending: "Sedang tren",
    noResults: "Tidak ada hasil.",
    highlights: "Sorotan",
    liked: "Disukai",
    comments: "Komentar",
    following: "Mengikuti",
    followers: "Pengikut",
    privateTab: "Daftar ini privat.",
    settings: "Pengaturan",
    appearance: "Tampilan",
    privacy: "Privasi",
    playback: "Pemutaran",
    notifications: "Notifikasi",
    language: "Bahasa",
    save: "Simpan",
    saved: "Pengaturan disimpan.",
    themeDark: "Gelap",
    themeLight: "Terang",
    themeSystem: "Sistem",
  },
} as const;

export type MessageKey = keyof (typeof dictionaries)["en"];

export function normalizeLanguage(value: string | undefined | null): Language {
  if (value === "tl" || value === "id" || value === "en") return value;
  return "en";
}

export function translate(language: Language, key: MessageKey) {
  return dictionaries[language][key];
}
