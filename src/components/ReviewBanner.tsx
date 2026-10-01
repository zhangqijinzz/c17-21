import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface ReviewBannerProps { viewModel: StoryViewModel; }

/**
 * 打开旧项目时按内容比对识别出的疑似默认文案集中在这里，
 * 作者可以逐条确认真实填写 / 仍未填写，也可以一键处理；
 * 点击场景条目可直接跳到对应场景，在输入框里直接改写也会立刻消除疑似状态。
 */
export function ReviewBanner({ viewModel }: ReviewBannerProps) {
  const reviews = viewModel.pendingReviews;
  if (reviews.length === 0) return null;
  return (
    <div className="review-banner" role="status">
      <div className="review-head">
        <strong>⌕ 发现 {reviews.length} 处与默认提示文案完全相同的内容</strong>
        <span>它们暂未计入完成度，请确认是否为你真实写下的内容</span>
      </div>
      <ul className="review-list">
        {reviews.map((review) => (
          <li className="review-item" key={`${review.kind}-${review.id}`}>
            <div className="review-copy"><span className="review-label">{review.label}</span><em>“{review.value}”</em></div>
            <div className="review-actions">
              {review.kind === 'sceneSummary' && <button className="review-link" onClick={() => viewModel.selectScene(review.id)}>定位</button>}
              <button className="review-confirm" onClick={() => review.kind === 'sceneSummary' ? viewModel.reviewSceneSummary(review.id, true) : viewModel.reviewCharacterRole(review.id, true)}>是我写的</button>
              <button className="review-discard" onClick={() => review.kind === 'sceneSummary' ? viewModel.reviewSceneSummary(review.id, false) : viewModel.reviewCharacterRole(review.id, false)}>仍是默认文案</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="review-bulk">
        <button onClick={() => viewModel.resolveAllSuspects(true)}>全部确认真实填写</button>
        <button onClick={() => viewModel.resolveAllSuspects(false)}>全部标记为未填写</button>
      </div>
    </div>
  );
}
