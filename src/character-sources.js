// Keep each character's manual choices while seeding newly linked lorebooks once.
export function syncCharacterBooks(settings, detail) {
  const previous = settings.bookCharacter || '', key = detail.key || '';
  const records = { ...settings.characterBooks };
  if (previous) records[previous] = { ...(records[previous] || { linked:[] }), selected:[...settings.books] };
  const old = Object.hasOwn(records, key) ? records[key] : null;
  const linked = [...new Set(detail.books || [])];
  const previousLinked = records[previous]?.linked || [];
  const base = old?.selected || settings.books.filter(name => !previousLinked.includes(name));
  const removed = (old?.linked || []).filter(name => !linked.includes(name));
  settings.books = [...new Set([...base.filter(name => !removed.includes(name)), ...linked.filter(name => !old?.linked?.includes(name))])];
  settings.bookCharacter = key;
  if (key) records[key] = { selected:[...settings.books], linked };
  settings.characterBooks = records;
}
