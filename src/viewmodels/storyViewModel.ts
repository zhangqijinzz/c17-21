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
import { getStats, getTimelineWarning, isDefaultRole, isDefaultSummary, orderedScenes, validateName } from '../models/storyRules';
import type { StoryRepository } from '../repositories/storyRepository';

export type ViewModelStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface PendingReviewItem {
  kind: 'scene' | 'character';
  id: string;
  title: string;
  field: string;
  content: string;
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

const EMPTY_STATS: ReturnType<typeof getStats> = {
  characters: 0,
  scenes: 0,
  clues: 0,
  unresolvedClues: 0,
  placeholderScenes: 0,
  placeholderCharacters: 0,
  pendingReview: 0,
  completion: 0,
};

export class StoryViewModel {
  private state: StoryViewState = {
    status: 'loading',
    story: null,
    stats: EMPTY_STATS,
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
      const story = this.repository.load();
      this.setState({ status: story.status === 'complete' ? 'completed' : 'ready', story, stats: getStats(story), error: '' });
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
    const cleanRole = role.trim();
    const character: StoryCharacter = {
      id: createId('character'),
      name: cleanName,
      role: cleanRole || DEFAULT_CHARACTER_ROLE,
      roleState: isDefaultRole(cleanRole) ? 'placeholder' : 'filled',
      color: characterColors[story.characters.length % characterColors.length],
    };
    this.updateStory((current) => ({ ...current, characters: [...current.characters, character] }));
    this.setState({ notice: `已加入人物「${character.name}」` });
  }

  addScene(title: string, summary: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    const story = this.requireStory();
    const cleanSummary = summary.trim();
    const scene: StoryScene = {
      id: createId('scene'),
      title: cleanTitle,
      order: story.scenes.length + 1,
      summary: cleanSummary || DEFAULT_SCENE_SUMMARY,
      summaryState: isDefaultSummary(cleanSummary) ? 'placeholder' : 'filled',
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
        const next = { ...scene, ...patch };
        // 摘要一旦被编辑就按内容重新判定：写成真实内容立即脱离"未填写"，清空则回到未填写。
        if (patch.summary !== undefined) {
          next.summaryState = isDefaultSummary(patch.summary) ? 'placeholder' : 'filled';
        }
        return next;
      }),
    }), false);
  }

  /** 确认待核对项"仍未填写"，计入未填写。 */
  confirmPendingUnwritten(kind: PendingReviewItem['kind'], id: string): void {
    this.resolvePending(kind, id, 'placeholder');
    this.setState({ notice: '已确认仍未填写，完成度已更新' });
  }

  /** 纠正待核对项：内容虽与默认文案相同，但确实是作者写下的。 */
  markPendingAsWritten(kind: PendingReviewItem['kind'], id: string): void {
    this.resolvePending(kind, id, 'filled');
    this.setState({ notice: '已标记为真实内容' });
  }

  confirmAllPendingUnwritten(): void {
    const count = this.state.stats.pendingReview;
    if (count === 0) return;
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => (scene.summaryState === 'pending' ? { ...scene, summaryState: 'placeholder' } : scene)),
      characters: story.characters.map((character) => (character.roleState === 'pending' ? { ...character, roleState: 'placeholder' } : character)),
    }));
    this.setState({ notice: `已确认 ${count} 处内容仍未填写` });
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

  /** 打开旧项目时按内容比对出的疑似默认文案，等待作者逐条确认或纠正。 */
  get pendingReviewItems(): PendingReviewItem[] {
    const story = this.state.story;
    if (!story) return [];
    return [
      ...orderedScenes(story)
        .filter((scene) => scene.summaryState === 'pending')
        .map((scene) => ({ kind: 'scene' as const, id: scene.id, title: scene.title, field: '场景摘要', content: scene.summary })),
      ...story.characters
        .filter((character) => character.roleState === 'pending')
        .map((character) => ({ kind: 'character' as const, id: character.id, title: character.name, field: '人物身份', content: character.role })),
    ];
  }

  get timelineWarning(): string | null {
    const story = this.state.story;
    return story ? getTimelineWarning(story) : null;
  }

  private requireStory(): StoryDocument {
    if (!this.state.story) throw new Error('故事尚未初始化');
    return this.state.story;
  }

  private resolvePending(kind: PendingReviewItem['kind'], id: string, resolution: 'filled' | 'placeholder'): void {
    this.updateStory((story) =>
      kind === 'scene'
        ? {
            ...story,
            scenes: story.scenes.map((scene) =>
              scene.id === id && scene.summaryState === 'pending' ? { ...scene, summaryState: resolution } : scene,
            ),
          }
        : {
            ...story,
            characters: story.characters.map((character) =>
              character.id === id && character.roleState === 'pending' ? { ...character, roleState: resolution } : character,
            ),
          },
    );
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
