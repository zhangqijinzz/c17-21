import { describe, expect, it } from 'vitest';
import { createStarterStory, DEFAULT_CHARACTER_ROLE, DEFAULT_SCENE_SUMMARY, type StoryDocument } from '../models/story';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { MemoryStorageService } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

/** 把文档写成旧版本格式：没有 summaryState / roleState 字段。 */
function writeLegacyDocument(storage: MemoryStorageService, story: StoryDocument): void {
  const raw = JSON.parse(JSON.stringify(story)) as {
    scenes: Array<Record<string, unknown>>;
    characters: Array<Record<string, unknown>>;
  };
  raw.scenes.forEach((scene) => delete scene.summaryState);
  raw.characters.forEach((character) => delete character.roleState);
  storage.write(JSON.stringify(raw));
}

describe('story view model', () => {
  it('initializes, edits, persists, and restores the main flow', () => {
    const repository = new LocalStoryRepository(new MemoryStorageService());
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    expect(viewModel.snapshot.status).toBe('ready');
    viewModel.addCharacter('阿洛', '修复师');
    viewModel.addScene('地下档案室', '他们找到被隐藏的航海日志。');
    const scene = viewModel.selectedScene;
    expect(scene?.title).toBe('地下档案室');
    viewModel.toggleCharacter(scene?.id ?? '', viewModel.snapshot.story?.characters[2]?.id ?? '');
    expect(viewModel.snapshot.stats.characters).toBe(3);

    const restored = new StoryViewModel(repository);
    restored.initialize();
    expect(restored.snapshot.story?.scenes.some((item) => item.title === '地下档案室')).toBe(true);
    expect(restored.snapshot.story?.characters.some((item) => item.name === '阿洛')).toBe(true);
  });

  it('shows recoverable validation feedback and resets corrupt storage', () => {
    const storage = new MemoryStorageService();
    storage.write('{broken');
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    viewModel.addCharacter(' ', '');
    expect(viewModel.snapshot.notice).toContain('至少');
    viewModel.resetProject();
    expect(viewModel.snapshot.story?.id).toBe(createStarterStory().id);
  });

  it('marks default summary as unwritten and updates completion immediately when filled', () => {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    expect(viewModel.snapshot.stats.completion).toBe(80);

    viewModel.addScene('灯塔停电', '');
    const scene = viewModel.selectedScene;
    expect(scene?.summary).toBe(DEFAULT_SCENE_SUMMARY);
    expect(scene?.summaryState).toBe('placeholder');
    expect(viewModel.snapshot.stats).toMatchObject({ placeholderScenes: 1, completion: 67 });

    // 补写摘要后完成度立刻变化，不需要重新打开。
    viewModel.updateScene(scene?.id ?? '', { summary: '全镇陷入黑暗，米拉点亮了油灯。' });
    expect(viewModel.selectedScene?.summaryState).toBe('filled');
    expect(viewModel.snapshot.stats).toMatchObject({ placeholderScenes: 0, completion: 83 });
  });

  it('marks default character role as unwritten', () => {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    viewModel.addCharacter('阿洛', '');
    const character = viewModel.snapshot.story?.characters[2];
    expect(character?.role).toBe(DEFAULT_CHARACTER_ROLE);
    expect(character?.roleState).toBe('placeholder');
    expect(viewModel.snapshot.stats.placeholderCharacters).toBe(1);
  });

  it('detects legacy default copy on open and lets the author confirm or correct it', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory();
    legacy.scenes[0].summary = DEFAULT_SCENE_SUMMARY;
    legacy.characters[0].role = DEFAULT_CHARACTER_ROLE;
    writeLegacyDocument(storage, legacy);

    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    // 旧项目打开：识别为待确认，但完成度不会一夜骤降。
    expect(viewModel.snapshot.stats.pendingReview).toBe(2);
    expect(viewModel.snapshot.stats.completion).toBe(80);
    expect(viewModel.pendingReviewItems.map((item) => item.field)).toEqual(['场景摘要', '人物身份']);

    viewModel.confirmPendingUnwritten('scene', legacy.scenes[0].id);
    expect(viewModel.snapshot.stats).toMatchObject({ pendingReview: 1, placeholderScenes: 1, completion: 60 });

    viewModel.markPendingAsWritten('character', legacy.characters[0].id);
    expect(viewModel.snapshot.stats).toMatchObject({ pendingReview: 0, placeholderCharacters: 0, completion: 60 });

    // 确认和纠正的结果被持久化，重新打开不会被重新识别。
    const restored = new StoryViewModel(new LocalStoryRepository(storage));
    restored.initialize();
    expect(restored.snapshot.stats.pendingReview).toBe(0);
    expect(restored.snapshot.story?.characters[0].roleState).toBe('filled');
    expect(restored.snapshot.story?.scenes[0].summaryState).toBe('placeholder');
    expect(restored.snapshot.stats.completion).toBe(60);
  });

  it('confirms all pending items as unwritten in one step', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory();
    legacy.scenes[0].summary = DEFAULT_SCENE_SUMMARY;
    legacy.characters[0].role = DEFAULT_CHARACTER_ROLE;
    writeLegacyDocument(storage, legacy);

    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    viewModel.confirmAllPendingUnwritten();
    expect(viewModel.snapshot.stats).toMatchObject({
      pendingReview: 0,
      placeholderScenes: 1,
      placeholderCharacters: 1,
      completion: 40,
    });
    expect(viewModel.pendingReviewItems).toHaveLength(0);
  });
});
