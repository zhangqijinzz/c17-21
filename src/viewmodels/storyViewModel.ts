import {
  characterColors,
  createId,
  createStarterStory,
  DEFAULT_CHARACTER_ROLE,
  DEFAULT_SCENE_SUMMARY,
  type StoryCharacter,
  type StoryClue,
  type StoryDocument,
  type StoryScene,
} from '../models/story';
import { getStats, getTimelineWarning, orderedScenes, resolveFillState, validateName } from '../models/storyRules';
import type { StoryRepository } from '../repositories/storyRepository';

export type ViewModelStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

/** 等待作者确认的疑似默认文案 */
export interface PendingReview {
  kind: 'sceneSummary' | 'characterRole';
  id: string;
  label: string;
  value: string;
}

export interface StoryViewState {
  status: ViewModelStatus;
  story: StoryDocument | null;
  stats: ReturnType<typeof getStats>;
  notice: string;
  error: string;
  search: string;
  activeSection: 'overview' | 'characters' | 'clues';
}

type Listener = () => void;

export class StoryViewModel {
  private state: StoryViewState = {
    status: 'loading',
    story: null,
    stats: { characters: 0, scenes: 0, clues: 0, unresolvedClues: 0, suspectFields: 0, completion: 0 },
    notice: '',
    error: '',
    search: '',
    activeSection: 'overview',
  };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly repository: StoryRepository) {}

  get snapshot(): StoryViewState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): void {
    try {
      const { story, detected } = this.repository.load();
      this.setState({
        status: story.status === 'complete' ? 'completed' : 'ready',
        story,
        stats: getStats(story),
        error: '',
        notice: detected > 0
          ? `打开时按内容比对识别出 ${detected} 处与默认提示文案完全相同的内容，请确认它们是否为真实填写。`
          : '',
      });
    } catch {
      this.setState({ status: 'error', error: '故事读取失败，请重置为示例项目。' });
    }
  }

  setSearch(search: string): void {
    this.setState({ search });
  }

  setSection(activeSection: StoryViewState['activeSection']): void {
    this.setState({ activeSection });
  }

  selectScene(sceneId: string): void {
    this.updateStory((story) => ({ ...story, selectedSceneId: sceneId }));
  }

  addCharacter(name: string, role: string): void {
    const cleanName = validateName(name);
    if (cleanName === '至少输入 2 个字') {
      this.setState({ notice: cleanName });
      return;
    }
    const story = this.requireStory();
    const trimmedRole = role.trim();
    const character: StoryCharacter = {
      id: createId('character'),
      name: cleanName,
      // 逐字等于默认提示文案的输入按未填写处理，避免新数据再次混入默认文案
      role: trimmedRole === DEFAULT_CHARACTER_ROLE ? '' : trimmedRole,
      roleState: trimmedRole === '' || trimmedRole === DEFAULT_CHARACTER_ROLE ? 'placeholder' : 'filled',
      color: characterColors[story.characters.length % characterColors.length],
    };
    this.updateStory((current) => ({ ...current, characters: [...current.characters, character] }));
    this.setState({ notice: `已加入人物「${character.name}」` });
  }

  /** 编辑人物身份：填写状态随内容实时推导，完成度立即更新 */
  updateCharacterRole(characterId: string, role: string): void {
    this.updateStory((story) => ({
      ...story,
      characters: story.characters.map((character) => (
        character.id === characterId
          ? { ...character, role, roleState: resolveFillState(role, DEFAULT_CHARACTER_ROLE, character.roleState) }
          : character
      )),
    }), false);
  }

  addScene(title: string, summary: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    const story = this.requireStory();
    const trimmedSummary = summary.trim();
    const scene: StoryScene = {
      id: createId('scene'),
      title: cleanTitle,
      order: story.scenes.length + 1,
      // 默认提示文案只作为输入框 placeholder，不写入摘要内容本身
      summary: trimmedSummary === DEFAULT_SCENE_SUMMARY ? '' : trimmedSummary,
      summaryState: trimmedSummary === '' || trimmedSummary === DEFAULT_SCENE_SUMMARY ? 'placeholder' : 'filled',
      conflict: '',
      characterIds: [],
      clueIds: [],
    };
    this.updateStory((current) => ({ ...current, scenes: [...current.scenes, scene], selectedSceneId: scene.id }));
    this.setState({ notice: `已创建场景「${scene.title}」` });
  }

  updateScene(sceneId: string, patch: Partial<Pick<StoryScene, 'title' | 'summary' | 'conflict'>>): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        // 摘要改动时实时推导填写状态：补写真实内容立刻算已完成，删空立刻退回未填写
        const next = { ...scene, ...patch };
        if (patch.summary !== undefined) {
          next.summaryState = resolveFillState(patch.summary, DEFAULT_SCENE_SUMMARY, scene.summaryState);
        }
        return next;
      }),
    }), false);
  }

  /** 作者确认疑似默认文案：确认真实填写，或确认仍然未填写（清空内容） */
  reviewSceneSummary(sceneId: string, isFilled: boolean): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => (
        scene.id === sceneId
          ? {
              ...scene,
              summaryState: isFilled ? 'filled' : 'placeholder',
              summary: isFilled ? scene.summary : '',
            }
          : scene
      )),
    }), false);
    this.setState({ notice: isFilled ? '已确认为真实填写' : '已标记为未填写，等待补写' });
  }

  reviewCharacterRole(characterId: string, isFilled: boolean): void {
    this.updateStory((story) => ({
      ...story,
      characters: story.characters.map((character) => (
        character.id === characterId
          ? {
              ...character,
              roleState: isFilled ? 'filled' : 'placeholder',
              role: isFilled ? character.role : '',
            }
          : character
      )),
    }), false);
    this.setState({ notice: isFilled ? '已确认为真实填写' : '已标记为未填写，等待补写' });
  }

  /** 一键确认全部疑似项；确认真实填写保留原文，确认未填写则清空 */
  resolveAllSuspects(isFilled: boolean): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => (
        scene.summaryState === 'suspect'
          ? { ...scene, summaryState: isFilled ? 'filled' : 'placeholder', summary: isFilled ? scene.summary : '' }
          : scene
      )),
      characters: story.characters.map((character) => (
        character.roleState === 'suspect'
          ? { ...character, roleState: isFilled ? 'filled' : 'placeholder', role: isFilled ? character.role : '' }
          : character
      )),
    }), false);
    this.setState({ notice: isFilled ? '全部疑似内容已确认为真实填写' : '全部疑似内容已标记为未填写' });
  }

  toggleCharacter(sceneId: string, characterId: string): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        const hasCharacter = scene.characterIds.includes(characterId);
        return { ...scene, characterIds: hasCharacter ? scene.characterIds.filter((id) => id !== characterId) : [...scene.characterIds, characterId] };
      }),
    }));
  }

  moveScene(sceneId: string, direction: 'up' | 'down'): void {
    const scenes = orderedScenes(this.requireStory());
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= scenes.length) return;
    [scenes[index], scenes[nextIndex]] = [scenes[nextIndex], scenes[index]];
    this.updateStory((story) => ({ ...story, scenes: scenes.map((scene, sceneIndex) => ({ ...scene, order: sceneIndex + 1 })) }));
    this.setState({ notice: '时间线顺序已更新' });
  }

  addClue(title: string, setupSceneId: string, payoffSceneId: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    if (!setupSceneId) {
      this.setState({ notice: '请先选择伏笔埋下的场景' });
      return;
    }
    const clue: StoryClue = { id: createId('clue'), title: cleanTitle, setupSceneId, payoffSceneId };
    this.updateStory((story) => ({
      ...story,
      clues: [...story.clues, clue],
      scenes: story.scenes.map((scene) => scene.id === setupSceneId ? { ...scene, clueIds: [...scene.clueIds, clue.id] } : scene),
    }));
    this.setState({ notice: payoffSceneId ? '伏笔关系已建立' : '伏笔已记录，等待回收' });
  }

  completeProject(): void {
    this.updateStory((story) => ({ ...story, status: 'complete' }));
    this.setState({ status: 'completed', notice: '项目已标记为完成，仍可继续编辑' });
  }

  resetProject(): void {
    const story = createStarterStory();
    this.persist(story);
    this.setState({ status: 'ready', story, stats: getStats(story), notice: '已恢复示例项目', error: '' });
  }

  get visibleCharacters(): StoryCharacter[] {
    const story = this.requireStory();
    const keyword = this.state.search.trim().toLowerCase();
    return story.characters.filter((character) => `${character.name}${character.role}`.toLowerCase().includes(keyword));
  }

  get visibleScenes(): StoryScene[] {
    const story = this.requireStory();
    const keyword = this.state.search.trim().toLowerCase();
    return orderedScenes(story).filter((scene) => `${scene.title}${scene.summary}${scene.conflict}`.toLowerCase().includes(keyword));
  }

  get selectedScene(): StoryScene | null {
    const story = this.state.story;
    return story?.scenes.find((scene) => scene.id === story.selectedSceneId) ?? null;
  }

  /** 打开时识别出的疑似默认文案，供作者逐条确认或纠正 */
  get pendingReviews(): PendingReview[] {
    const story = this.state.story;
    if (!story) return [];
    const sceneReviews = orderedScenes(story)
      .filter((scene) => scene.summaryState === 'suspect')
      .map((scene): PendingReview => ({ kind: 'sceneSummary', id: scene.id, label: `场景「${scene.title}」摘要`, value: scene.summary }));
    const characterReviews = story.characters
      .filter((character) => character.roleState === 'suspect')
      .map((character): PendingReview => ({ kind: 'characterRole', id: character.id, label: `人物「${character.name}」身份`, value: character.role }));
    return [...sceneReviews, ...characterReviews];
  }

  get timelineWarning(): string | null {
    const story = this.state.story;
    return story ? getTimelineWarning(story) : null;
  }

  private requireStory(): StoryDocument {
    if (!this.state.story) throw new Error('故事尚未初始化');
    return this.state.story;
  }

  private updateStory(updater: (story: StoryDocument) => StoryDocument, showEditing = true): void {
    const story = updater(this.requireStory());
    this.persist(story);
    this.setState({ story, stats: getStats(story), status: showEditing ? 'editing' : this.state.status, error: '' });
  }

  private persist(story: StoryDocument): void {
    try {
      this.repository.save({ ...story, updatedAt: new Date().toISOString() });
    } catch {
      this.setState({ status: 'error', error: '保存失败，但当前编辑仍保留在页面中。' });
    }
  }

  private setState(patch: Partial<StoryViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
