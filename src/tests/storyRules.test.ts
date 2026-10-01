import { describe, expect, it } from 'vitest';
import {
  createStarterStory,
  DEFAULT_CHARACTER_ROLE,
  DEFAULT_SCENE_SUMMARY,
  type StoryDocument,
} from '../models/story';
import {
  getStats,
  getTimelineWarning,
  migrateStoryDocument,
  orderedScenes,
  resolveFillState,
  sanitizeStory,
  validateName,
} from '../models/storyRules';

describe('story domain rules', () => {
  it('sorts scenes and calculates unresolved clues', () => {
    const story = createStarterStory();
    story.scenes = [...story.scenes].reverse();
    expect(orderedScenes(story).map((scene) => scene.title)).toEqual(['旧港口的来信', '风暴前夜']);
    expect(getStats(story)).toMatchObject({ characters: 2, scenes: 2, clues: 1, unresolvedClues: 1, suspectFields: 0, completion: 80 });
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

  it('derives fill state live as content is written and cleared', () => {
    expect(resolveFillState('', DEFAULT_SCENE_SUMMARY, 'filled')).toBe('placeholder');
    expect(resolveFillState('   ', DEFAULT_SCENE_SUMMARY, 'filled')).toBe('placeholder');
    expect(resolveFillState('她在雨夜里拆开信。', DEFAULT_SCENE_SUMMARY, 'placeholder')).toBe('filled');
    // 逐字等于默认文案时无法区分，沿用既有判定，把决定权留给作者的确认操作
    expect(resolveFillState(DEFAULT_SCENE_SUMMARY, DEFAULT_SCENE_SUMMARY, 'suspect')).toBe('suspect');
    expect(resolveFillState(DEFAULT_SCENE_SUMMARY, DEFAULT_SCENE_SUMMARY, 'placeholder')).toBe('placeholder');
  });

  it('marks legacy default copy as suspect on open without turning it blank', () => {
    const legacy = createStarterStory() as StoryDocument;
    legacy.scenes[0] = { ...legacy.scenes[0], summary: DEFAULT_SCENE_SUMMARY, summaryState: undefined as never };
    legacy.scenes[1] = { ...legacy.scenes[1], summary: '', summaryState: undefined as never };
    legacy.characters[0] = { ...legacy.characters[0], role: DEFAULT_CHARACTER_ROLE, roleState: undefined as never };

    const result = migrateStoryDocument(legacy);
    expect(result.changed).toBe(true);
    expect(result.detected).toBe(2);
    expect(result.story.scenes[0].summaryState).toBe('suspect');
    // 原文保留，不会一夜之间被清空
    expect(result.story.scenes[0].summary).toBe(DEFAULT_SCENE_SUMMARY);
    expect(result.story.scenes[1].summaryState).toBe('placeholder');
    expect(result.story.characters[0].roleState).toBe('suspect');
    expect(result.story.characters[1].roleState).toBe('filled');

    const stats = getStats(result.story);
    expect(stats.suspectFields).toBe(2);
    // 5 个信号：1 个已填人物 + 0 个已填场景（一处疑似、一处空白）+ 0 回收伏笔 = 1/5
    expect(stats.completion).toBe(20);

    // 识别是幂等的：已经带状态字段的文档再次打开不再改动
    const again = migrateStoryDocument(result.story);
    expect(again.changed).toBe(false);
    expect(again.detected).toBe(0);
    expect(again.story).toEqual(result.story);
  });

  it('counts only filled scenes and characters toward completion', () => {
    const story = createStarterStory();
    story.scenes[0].summaryState = 'suspect';
    story.characters[0].roleState = 'placeholder';
    const stats = getStats(story);
    expect(stats.suspectFields).toBe(1);
    // 已填：1 人物 + 1 场景 + 0 伏笔 = 2/5
    expect(stats.completion).toBe(40);
  });
});
