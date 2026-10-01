import { describe, expect, it } from 'vitest';
import { createStarterStory, DEFAULT_SCENE_SUMMARY, type StoryDocument } from '../models/story';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { MemoryStorageService } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

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
    expect(scene?.summaryState).toBe('filled');
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

  it('keeps blank new scenes unfilled without writing the default copy into content', () => {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    viewModel.addScene('无名港口', '');
    const scene = viewModel.selectedScene;
    expect(scene?.summary).toBe('');
    expect(scene?.summaryState).toBe('placeholder');
    // 默认提示文案原样输入也按未填写处理
    viewModel.addScene('又一座港口', DEFAULT_SCENE_SUMMARY);
    const second = viewModel.selectedScene;
    expect(second?.summary).toBe('');
    expect(second?.summaryState).toBe('placeholder');
  });

  it('updates completion immediately when a default summary is replaced with real writing', () => {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    viewModel.addScene('无名港口', '');
    const sceneId = viewModel.selectedScene?.id ?? '';
    const before = viewModel.snapshot.stats.completion;
    viewModel.updateScene(sceneId, { summary: '她在雾中看见亮了一整夜的灯塔。' });
    expect(viewModel.snapshot.stats.completion).toBeGreaterThan(before);
    expect(viewModel.selectedScene?.summaryState).toBe('filled');
    // 删空后立即退回未填写，无需重新打开
    viewModel.updateScene(sceneId, { summary: '' });
    expect(viewModel.snapshot.stats.completion).toBe(before);
    expect(viewModel.selectedScene?.summaryState).toBe('placeholder');
  });

  it('detects legacy default copy on open and lets the author confirm or correct it', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory() as StoryDocument;
    legacy.scenes[0] = { ...legacy.scenes[0], summary: DEFAULT_SCENE_SUMMARY, summaryState: undefined as never };
    storage.write(JSON.stringify(legacy));

    const repository = new LocalStoryRepository(storage);
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    expect(viewModel.snapshot.stats.suspectFields).toBe(1);
    expect(viewModel.pendingReviews).toHaveLength(1);
    expect(viewModel.snapshot.notice).toContain('1 处');
    const sceneId = legacy.scenes[0].id;

    // 确认真实填写：原文保留，立刻计入完成度，待确认列表清空
    viewModel.reviewSceneSummary(sceneId, true);
    expect(viewModel.snapshot.story?.scenes[0].summary).toBe(DEFAULT_SCENE_SUMMARY);
    expect(viewModel.snapshot.story?.scenes[0].summaryState).toBe('filled');
    expect(viewModel.snapshot.stats.suspectFields).toBe(0);
    expect(viewModel.pendingReviews).toHaveLength(0);

    // 识别结果已落盘，重新打开不再提示
    const reopened = new StoryViewModel(repository);
    reopened.initialize();
    expect(reopened.snapshot.stats.suspectFields).toBe(0);
    expect(reopened.pendingReviews).toHaveLength(0);
  });

  it('can mark legacy default copy as still unfilled, or clear suspicion by editing directly', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory() as StoryDocument;
    legacy.scenes[0] = { ...legacy.scenes[0], summary: DEFAULT_SCENE_SUMMARY, summaryState: undefined as never };
    legacy.characters[0] = { ...legacy.characters[0], role: '待定义角色', roleState: undefined as never };
    storage.write(JSON.stringify(legacy));

    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    expect(viewModel.snapshot.stats.suspectFields).toBe(2);

    // 场景：确认仍是默认文案 → 内容清空、状态为未填写
    viewModel.reviewSceneSummary(legacy.scenes[0].id, false);
    expect(viewModel.snapshot.story?.scenes[0].summary).toBe('');
    expect(viewModel.snapshot.story?.scenes[0].summaryState).toBe('placeholder');

    // 人物：直接改写文字即自动确认为真实填写
    viewModel.updateCharacterRole(legacy.characters[0].id, '守塔人');
    expect(viewModel.snapshot.story?.characters[0].roleState).toBe('filled');
    expect(viewModel.snapshot.stats.suspectFields).toBe(0);
  });

  it('resolves every suspect field in one action', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory() as StoryDocument;
    legacy.scenes = legacy.scenes.map((scene) => ({ ...scene, summary: DEFAULT_SCENE_SUMMARY, summaryState: undefined as never }));
    storage.write(JSON.stringify(legacy));

    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    expect(viewModel.snapshot.stats.suspectFields).toBe(2);

    viewModel.resolveAllSuspects(true);
    expect(viewModel.snapshot.stats.suspectFields).toBe(0);
    expect(viewModel.snapshot.story?.scenes.every((scene) => scene.summaryState === 'filled')).toBe(true);
    expect(viewModel.snapshot.story?.scenes.every((scene) => scene.summary === DEFAULT_SCENE_SUMMARY)).toBe(true);
  });
});
