import { createStarterStory, type StoryDocument } from '../models/story';
import { migrateStoryDocument, sanitizeStory, type StoryMigrationResult } from '../models/storyRules';
import type { StorageService } from '../services/storageService';

export interface StoryRepository {
  load(): StoryMigrationResult;
  save(story: StoryDocument): void;
}

export class LocalStoryRepository implements StoryRepository {
  constructor(private readonly storage: StorageService) {}

  load(): StoryMigrationResult {
    const raw = this.storage.read();
    if (!raw) return { story: createStarterStory(), changed: false, detected: 0 };
    let parsed: StoryDocument;
    try {
      const candidate = sanitizeStory(JSON.parse(raw));
      if (!candidate) return { story: createStarterStory(), changed: false, detected: 0 };
      parsed = candidate;
    } catch {
      return { story: createStarterStory(), changed: false, detected: 0 };
    }
    const result = migrateStoryDocument(parsed);
    // 旧文档补齐状态字段后立即落盘，之后每次打开都是幂等的
    if (result.changed) {
      try {
        this.storage.write(JSON.stringify(result.story));
      } catch {
        // 落盘失败不影响本次打开，识别结果仍保留在内存中
      }
    }
    return result;
  }

  save(story: StoryDocument): void {
    this.storage.write(JSON.stringify(story));
  }
}
