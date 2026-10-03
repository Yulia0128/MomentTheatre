export const DRAFT_LIMIT = 10;
// Only generated, uncollected works shown by Return to Drafts. A prompt without
// chapters and independent editing buffers are not entries in that list.
export function limitDraftStories(state) {
  const drafts = state.stories.filter(story => !story.saved && story.chapters.length);
  if (drafts.length <= DRAFT_LIMIT) return state;
  const editingId = state.editorDraft?.storyId;
  const ordered = [...drafts].sort((a, b) => Number(a.id === editingId) - Number(b.id === editingId) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const removed = new Set(ordered.slice(0, drafts.length - DRAFT_LIMIT).map(story => story.id));
  return { ...state, stories: state.stories.filter(story => !removed.has(story.id)) };
}
