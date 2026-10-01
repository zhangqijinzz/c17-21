import {
  DEFAULT_CHARACTER_ROLE,
  DEFAULT_SCENE_SUMMARY,
  type PlaceholderState,
  type StoryDocument,
  type StoryScene,
  type StoryStats,
} from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

/** 内容为空或仍等于默认文案时，视为尚未填写。 */
export function isDefaultSummary(summary: string): boolean {
  const clean = summary.trim();
  return clean === '' || clean === DEFAULT_SCENE_SUMMARY;
}

export function isDefaultRole(role: string): boolean {
  const clean = role.trim();
  return clean === '' || clean === DEFAULT_CHARACTER_ROLE;
}

export function getStats(story: StoryDocument): StoryStats {
  const unresolvedClues = story.clues.filter((clue) => clue.payoffSceneId === '').length;
  const placeholderScenes = story.scenes.filter((scene) => scene.summaryState === 'placeholder').length;
  const placeholderCharacters = story.characters.filter((character) => character.roleState === 'placeholder').length;
  const pendingReview =
    story.scenes.filter((scene) => scene.summaryState === 'pending').length +
    story.characters.filter((character) => character.roleState === 'pending').length;
  const totalSignals = story.characters.length + story.scenes.length + story.clues.length;
  // pending（待确认）不计入未填写，避免旧项目打开时完成度骤降；确认后才影响完成度。
  const completedSignals =
    story.characters.length - placeholderCharacters +
    (story.scenes.length - placeholderScenes) +
    (story.clues.length - unresolvedClues);
  const completion = totalSignals === 0 ? 0 : Math.round((completedSignals / totalSignals) * 100);
  return {
    characters: story.characters.length,
    scenes: story.scenes.length,
    clues: story.clues.length,
    unresolvedClues,
    placeholderScenes,
    placeholderCharacters,
    pendingReview,
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

const PLACEHOLDER_STATES: readonly string[] = ['filled', 'placeholder', 'pending'];

/**
 * 旧文档没有填写状态字段：已持久化的状态直接信任（作者确认/纠正过的结果不会再被重新识别），
 * 缺失时按内容比对——与默认文案一致标为 pending（待确认），否则视为 filled。
 */
function normalizeState(value: unknown, isDefault: boolean): PlaceholderState {
  if (typeof value === 'string' && PLACEHOLDER_STATES.includes(value)) return value as PlaceholderState;
  return isDefault ? 'pending' : 'filled';
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
  const story = candidate as StoryDocument;
  return {
    ...story,
    scenes: story.scenes.map((scene) => ({
      ...scene,
      summaryState: normalizeState(
        scene.summaryState,
        isDefaultSummary(typeof scene.summary === 'string' ? scene.summary : ''),
      ),
    })),
    characters: story.characters.map((character) => ({
      ...character,
      roleState: normalizeState(
        character.roleState,
        isDefaultRole(typeof character.role === 'string' ? character.role : ''),
      ),
    })),
  };
}
