import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface PlaceholderReviewProps { viewModel: StoryViewModel; }

export function PlaceholderReview({ viewModel }: PlaceholderReviewProps) {
  const items = viewModel.pendingReviewItems;
  if (items.length === 0) return null;
  return (
    <div className="review-panel" role="status">
      <div className="review-head">
        <strong>△ 检测到 {items.length} 处内容与默认文案相同</strong>
        <span>来自旧项目，请确认是还没写，还是你写下的内容；确认前不计入未填写。</span>
        <button onClick={() => viewModel.confirmAllPendingUnwritten()}>全部仍未填写</button>
      </div>
      <ul>
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <span className="review-item-label">{item.field} · {item.title}</span>
            <span className="review-item-content">{item.content || '（空）'}</span>
            <button onClick={() => viewModel.confirmPendingUnwritten(item.kind, item.id)}>仍未填写</button>
            <button className="written" onClick={() => viewModel.markPendingAsWritten(item.kind, item.id)}>是我写的内容</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
