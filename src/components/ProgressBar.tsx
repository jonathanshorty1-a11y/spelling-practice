export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((current / total) * 100))
  return (
    <div>
      <p className="progress-label">
        {total > 0 ? `Question ${current} of ${total}` : ''}
      </p>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
