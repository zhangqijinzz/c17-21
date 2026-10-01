import { DEFAULT_SCENE_SUMMARY, type StoryCharacter, type StoryScene } from '../models/story';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface SceneInspectorProps { viewModel: StoryViewModel; scene: StoryScene | null; characters: StoryCharacter[]; }

export function SceneInspector({ viewModel, scene, characters }: SceneInspectorProps) {
  if (!scene) return <section className="panel inspector empty-inspector"><span className="eyebrow">INSPECTOR</span><h2>选择一个场景</h2><p>从时间线中选择一幕，开始补充人物、冲突和节奏。</p></section>;
  const story = viewModel.snapshot.story;
  const index = story ? [...story.scenes].sort((a, b) => a.order - b.order).findIndex((item) => item.id === scene.id) : 0;
  return (
    <section className="panel inspector">
      <div className="inspector-top"><div><span className="eyebrow">SCENE {String(index + 1).padStart(2, '0')} / 场景详情</span><h2>{scene.title}</h2></div><span className="edit-state">编辑中</span></div>
      <label>场景标题<input value={scene.title} onChange={(event) => viewModel.updateScene(scene.id, { title: event.target.value })} /></label>
      <label>
        <span className="field-head">这一幕发生了什么{scene.summaryState === 'suspect'
          ? <em className="fill-chip suspect">疑似默认文案 · 待确认</em>
          : scene.summaryState === 'placeholder'
            ? <em className="fill-chip placeholder">未填写</em>
            : <em className="fill-chip filled">已填写</em>}</span>
        <textarea value={scene.summary} onChange={(event) => viewModel.updateScene(scene.id, { summary: event.target.value })} rows={3} placeholder={DEFAULT_SCENE_SUMMARY} />
      </label>
      {scene.summary === DEFAULT_SCENE_SUMMARY && scene.summaryState !== 'filled' && (
        <div className="inline-review">
          <span>这段内容与默认提示文案逐字相同，是你真实写下的吗？直接修改文字也会自动转为已填写。</span>
          <button className="review-confirm" onClick={() => viewModel.reviewSceneSummary(scene.id, true)}>是我写的</button>
          <button className="review-discard" onClick={() => viewModel.reviewSceneSummary(scene.id, false)}>仍是默认文案</button>
        </div>
      )}
      {scene.summaryState === 'placeholder' && <p className="field-hint">摘要还没有真实内容，目前只显示默认提示。</p>}
      <label>核心冲突<textarea value={scene.conflict} onChange={(event) => viewModel.updateScene(scene.id, { conflict: event.target.value })} rows={2} placeholder="是什么让人物无法轻易得到想要的东西？" /></label>
      <div className="field-block"><span className="field-label">出场人物</span><div className="person-toggles">{characters.map((character) => <button key={character.id} className={scene.characterIds.includes(character.id) ? `person-toggle selected ${character.color}` : 'person-toggle'} onClick={() => viewModel.toggleCharacter(scene.id, character.id)}><span>{character.name.slice(0, 1)}</span>{character.name}</button>)}</div></div>
      <div className="order-controls"><span>时间顺序</span><button disabled={index <= 0} onClick={() => viewModel.moveScene(scene.id, 'up')}>↑ 上移</button><button disabled={index >= (story?.scenes.length ?? 1) - 1} onClick={() => viewModel.moveScene(scene.id, 'down')}>↓ 下移</button></div>
    </section>
  );
}
