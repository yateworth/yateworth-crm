interface Props {
  title: string
  counts: Record<string, number>
  emptyLabel?: string
}

export function CountCard({ title, counts, emptyLabel = 'None yet' }: Props) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">{emptyLabel}</p>
      ) : (
        <dl className="mt-3 space-y-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between text-sm">
              <dt className="text-neutral-600">{key.replace(/_/g, ' ')}</dt>
              <dd className="font-medium text-neutral-900 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
