import { describe, expect, it } from 'vitest';
import { createStarterStory, DEFAULT_CHARACTER_ROLE, DEFAULT_SCENE_SUMMARY, type StoryDocument } from '../models/story';
import { getStats, getTimelineWarning, isDefaultRole, isDefaultSummary, orderedScenes, sanitizeStory, validateName } from '../models/storyRules';

/** 模拟旧版本持久化文档：没有 summaryState / roleState 字段。 */
function toLegacyDocument(story: StoryDocument): unknown {
  const raw = JSON.parse(JSON.stringify(story)) as {
    scenes: Array<Record<string, unknown>>;
    characters: Array<Record<string, unknown>>;
  };
  raw.scenes.forEach((scene) => delete scene.summaryState);
  raw.characters.forEach((character) => delete character.roleState);
  return raw;
}

describe('story domain rules', () => {
  it('sorts scenes and calculates unresolved clues', () => {
    const story = createStarterStory();
    story.scenes = [...story.scenes].reverse();
    expect(orderedScenes(story).map((scene) => scene.title)).toEqual(['旧港口的来信', '风暴前夜']);
    expect(getStats(story)).toMatchObject({ characters: 2, scenes: 2, clues: 1, unresolvedClues: 1, completion: 80 });
  });

  it('guards invalid names and duplicate timeline orders', () => {
    const story = createStarterStory();
    story.scenes[1].order = story.scenes[0].order;
    expect(validateName(' ')).toBe('至少输入 2 个字');
    expect(getTimelineWarning(story)).toContain('重复');
  });

  it('rejects corrupt persisted documents', () => {
    expect(sanitizeStory('{bad json}')).toBeNull();
    expect(sanitizeStory({ version: 99 })).toBeNull();
    expect(sanitizeStory(createStarterStory())).not.toBeNull();
  });

  it('recognizes default copy and empty content as unwritten', () => {
    expect(isDefaultSummary('')).toBe(true);
    expect(isDefaultSummary(`  ${DEFAULT_SCENE_SUMMARY} `)).toBe(true);
    expect(isDefaultSummary('米拉点燃油灯。')).toBe(false);
    expect(isDefaultRole('')).toBe(true);
    expect(isDefaultRole(DEFAULT_CHARACTER_ROLE)).toBe(true);
    expect(isDefaultRole('灯塔守望人')).toBe(false);
  });

  it('counts confirmed placeholders as incomplete but keeps pending review neutral', () => {
    const story = createStarterStory();
    story.scenes[0].summaryState = 'placeholder';
    story.characters[0].roleState = 'placeholder';
    const stats = getStats(story);
    expect(stats).toMatchObject({ placeholderScenes: 1, placeholderCharacters: 1, pendingReview: 0, completion: 40 });

    story.scenes[0].summaryState = 'pending';
    story.characters[0].roleState = 'pending';
    const pendingStats = getStats(story);
    expect(pendingStats).toMatchObject({ placeholderScenes: 0, placeholderCharacters: 0, pendingReview: 2, completion: 80 });
  });

  it('migrates legacy documents by comparing content with the default copy', () => {
    const story = createStarterStory();
    story.scenes[0].summary = DEFAULT_SCENE_SUMMARY;
    story.characters[0].role = DEFAULT_CHARACTER_ROLE;
    const migrated = sanitizeStory(toLegacyDocument(story));
    expect(migrated?.scenes[0].summaryState).toBe('pending');
    expect(migrated?.characters[0].roleState).toBe('pending');
    expect(migrated?.scenes[1].summaryState).toBe('filled');
    expect(migrated?.characters[1].roleState).toBe('filled');
  });

  it('keeps author-reviewed states instead of re-detecting them on load', () => {
    const story = createStarterStory();
    // 作者已确认"这段与默认文案相同的内容是真实内容"，重新打开不能再被识别为待确认。
    story.scenes[0].summary = DEFAULT_SCENE_SUMMARY;
    story.scenes[0].summaryState = 'filled';
    story.characters[0].role = DEFAULT_CHARACTER_ROLE;
    story.characters[0].roleState = 'placeholder';
    const migrated = sanitizeStory(JSON.parse(JSON.stringify(story)));
    expect(migrated?.scenes[0].summaryState).toBe('filled');
    expect(migrated?.characters[0].roleState).toBe('placeholder');
  });
});
