export type StoryStatus = 'draft' | 'complete';

/**
 * 填写状态：
 * - filled：作者真正写下的内容
 * - placeholder：尚未填写，字段里展示的是默认提示文案
 * - suspect：打开旧项目时按内容比对识别出的“与默认文案完全相同”的内容，等待作者确认
 */
export type FillState = 'filled' | 'placeholder' | 'suspect';

/** 新建场景时摘要里的默认提示文案，只作为未填写时的提示，不写入内容本身 */
export const DEFAULT_SCENE_SUMMARY = '还没有写下这一幕发生了什么。';
/** 新建人物时身份里的默认提示文案，只作为未填写时的提示，不写入内容本身 */
export const DEFAULT_CHARACTER_ROLE = '待定义角色';

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  roleState: FillState;
  color: string;
}

export interface StoryScene {
  id: string;
  title: string;
  order: number;
  summary: string;
  summaryState: FillState;
  conflict: string;
  characterIds: string[];
  clueIds: string[];
}

export interface StoryClue {
  id: string;
  title: string;
  setupSceneId: string;
  payoffSceneId: string;
}

export interface StoryDocument {
  version: 1;
  id: string;
  title: string;
  status: StoryStatus;
  characters: StoryCharacter[];
  scenes: StoryScene[];
  clues: StoryClue[];
  selectedSceneId: string;
  updatedAt: string;
}

export interface StoryStats {
  characters: number;
  scenes: number;
  clues: number;
  unresolvedClues: number;
  /** 待作者确认的疑似默认文案数量（场景摘要 + 人物身份） */
  suspectFields: number;
  completion: number;
}

export const characterColors = ['coral', 'blue', 'gold', 'sage', 'violet'] as const;

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createStarterStory(): StoryDocument {
  const miraId = 'character-mira';
  const oldHarborId = 'scene-old-harbor';
  const firstLetterId = 'clue-first-letter';
  return {
    version: 1,
    id: 'story-last-lighthouse',
    title: '最后的灯塔',
    status: 'draft',
    characters: [
      { id: miraId, name: '米拉', role: '灯塔守望人', roleState: 'filled', color: 'coral' },
      { id: 'character-june', name: '裘恩', role: '失踪船长的女儿', roleState: 'filled', color: 'blue' },
    ],
    scenes: [
      {
        id: oldHarborId,
        title: '旧港口的来信',
        order: 1,
        summary: '米拉收到一封来自已故船长的信，潮汐表背面写着一个日期。',
        summaryState: 'filled',
        conflict: '她必须决定是否相信一封不可能寄出的信。',
        characterIds: [miraId],
        clueIds: [firstLetterId],
      },
      {
        id: 'scene-storm',
        title: '风暴前夜',
        order: 2,
        summary: '裘恩抵达灯塔，带来一枚从沉船上找到的铜制罗盘。',
        summaryState: 'filled',
        conflict: '两人对罗盘的来历各执一词。',
        characterIds: [miraId, 'character-june'],
        clueIds: [],
      },
    ],
    clues: [
      {
        id: firstLetterId,
        title: '潮汐表背后的日期',
        setupSceneId: oldHarborId,
        payoffSceneId: '',
      },
    ],
    selectedSceneId: oldHarborId,
    updatedAt: new Date().toISOString(),
  };
}
