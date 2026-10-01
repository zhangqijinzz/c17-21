import {
  DEFAULT_CHARACTER_ROLE,
  DEFAULT_SCENE_SUMMARY,
  type FillState,
  type StoryCharacter,
  type StoryDocument,
  type StoryScene,
  type StoryStats,
} from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

/**
 * 根据作者正在编辑的内容实时推导填写状态，使完成度在补写的当次操作就更新：
 * - 空白内容一定是未填写
 * - 内容与默认提示文案逐字相同，无法与真实填写区分，沿用上一次的判定
 *   （疑似项保留为疑似，由作者通过确认操作一锤定音）
 * - 其余内容都是真实填写
 */
export function resolveFillState(value: string, defaultCopy: string, previous: FillState): FillState {
  if (value.trim() === '') return 'placeholder';
  if (value === defaultCopy) return previous;
  return 'filled';
}

export function isSceneSummaryFilled(scene: StoryScene): boolean {
  return scene.summaryState === 'filled';
}

export function isCharacterRoleFilled(character: StoryCharacter): boolean {
  return character.roleState === 'filled';
}

export function getStats(story: StoryDocument): StoryStats {
  const unresolvedClues = story.clues.filter((clue) => clue.payoffSceneId === '').length;
  const suspectFields =
    story.scenes.filter((scene) => scene.summaryState === 'suspect').length +
    story.characters.filter((character) => character.roleState === 'suspect').length;
  const filledScenes = story.scenes.filter(isSceneSummaryFilled).length;
  const filledCharacters = story.characters.filter(isCharacterRoleFilled).length;
  const resolvedClues = story.clues.length - unresolvedClues;
  const totalSignals = story.characters.length + story.scenes.length + story.clues.length;
  const completedSignals = filledCharacters + filledScenes + resolvedClues;
  const completion = totalSignals === 0 ? 0 : Math.round((completedSignals / totalSignals) * 100);
  return {
    characters: story.characters.length,
    scenes: story.scenes.length,
    clues: story.clues.length,
    unresolvedClues,
    suspectFields,
    completion,
  };
}

export function validateName(value: string): string {
  const cleanValue = value.trim();
  return cleanValue.length < 2 ? '至少输入 2 个字' : cleanValue;
}

export function getTimelineWarning(story: StoryDocument): string | null {
  const orders = story.scenes.map((scene) => scene.order);
  return new Set(orders).size !== orders.length ? '时间线存在重复顺序，请重新排列。' : null;
}

export function sanitizeStory(input: unknown): StoryDocument | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<StoryDocument>;
  if (
    candidate.version !== 1 ||
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.characters) ||
    !Array.isArray(candidate.scenes) ||
    !Array.isArray(candidate.clues)
  ) {
    return null;
  }
  return candidate as StoryDocument;
}

export interface StoryMigrationResult {
  story: StoryDocument;
  /** 文档是否被补写过状态字段，需要落盘 */
  changed: boolean;
  /** 本次按内容比对新识别出的疑似默认文案数量 */
  detected: number;
}

/**
 * 打开旧项目时的比对识别：旧文档没有填写状态字段，
 * 凡是内容与默认提示文案逐字相同的，标记为“疑似”而不是直接判为未填写，
 * 由作者在界面上确认或纠正；空白内容直接视为未填写。
 * 识别是幂等的：已经带有状态字段的新文档原样返回。
 */
export function migrateStoryDocument(story: StoryDocument): StoryMigrationResult {
  let changed = false;
  let detected = 0;

  const scenes = story.scenes.map((scene) => {
    if (scene.summaryState) return scene;
    changed = true;
    let summaryState: FillState;
    if (scene.summary.trim() === '') {
      summaryState = 'placeholder';
    } else if (scene.summary === DEFAULT_SCENE_SUMMARY) {
      summaryState = 'suspect';
      detected += 1;
    } else {
      summaryState = 'filled';
    }
    return { ...scene, summaryState };
  });

  const characters = story.characters.map((character) => {
    if (character.roleState) return character;
    changed = true;
    let roleState: FillState;
    if (character.role.trim() === '') {
      roleState = 'placeholder';
    } else if (character.role === DEFAULT_CHARACTER_ROLE) {
      roleState = 'suspect';
      detected += 1;
    } else {
      roleState = 'filled';
    }
    return { ...character, roleState };
  });

  return { story: { ...story, scenes, characters }, changed, detected };
}
