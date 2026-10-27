// Ikony grup trenera (user 2026-10-16): zamiast jednego folderu trener wybiera
// ikonę pasującą do grupy — początkujący, zaawansowani, mocniejsi, słabsi itp.
// Nazwy z Material Symbols; zapisane w groups/{id}.icon. Literały stringowe
// trafiają do subsetu czcionki przy `npm run icons:update`.
export const DEFAULT_GROUP_ICON = 'folder_shared';

export const GROUP_ICONS = [
  'folder_shared',
  'groups',
  'school',
  'eco',
  'star',
  'stars',
  'target',
  'emoji_events',
  'military_tech',
  'workspace_premium',
  'rocket_launch',
  'bolt',
  'fitness_center',
  'local_fire_department',
  'trending_up',
] as const;

/** Ikona grupy; stare grupy bez pola `icon` zostają przy folderze. */
export const groupIcon = (g?: { icon?: string } | null): string =>
  (GROUP_ICONS as readonly string[]).includes(g?.icon ?? '') ? g!.icon! : DEFAULT_GROUP_ICON;
