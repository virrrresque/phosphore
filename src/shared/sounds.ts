// Sons de l'interface : la liste fermée des événements, définie ici seulement (principal, interface, mods et tests).
export const SOUND_EVENTS = ['key', 'key-enter', 'key-back', 'key-space', 'tab-new', 'tab-close', 'tab-switch', 'space-switch',
  'page-load', 'cmd-ok', 'cmd-error', 'download-done', 'boot'] as const;
export type SoundEvent = typeof SOUND_EVENTS[number];
export const isSoundEvent = (v: unknown): v is SoundEvent => typeof v === 'string' && (SOUND_EVENTS as readonly string[]).includes(v);

/** Sons envoyés à l'interface : octets audio déjà validés par le principal (aucun chemin, aucune URL). */
export interface SoundPack { name: string; volume: number; sounds: Partial<Record<SoundEvent, { data: Uint8Array[]; volume: number }>> }
