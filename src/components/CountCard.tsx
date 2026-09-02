interface Props {
  title: string
  counts: Record<string, number>
  emptyLabel?: string
}

export function CountCard({ title, counts, emptyLabel = 'None yet' }: Props) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a)

  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-5">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink/40">{emptyLabel}</p>
      ) : (
        <dl className="mt-3 space-y-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between text-sm">
              <dt className="text-sec">{key.replace(/_/g, ' ')}</dt>
              <dd className="font-medium tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
