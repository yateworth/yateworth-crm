import type { FirmFormValues } from '@/lib/firms'

interface Props {
  values: FirmFormValues
  onChange: (values: FirmFormValues) => void
  disabled?: boolean
}

export function FirmForm({ values, onChange, disabled }: Props) {
  function set<K extends keyof FirmFormValues>(key: K, value: FirmFormValues[K]) {
    onChange({ ...values, [key]: value })
  }

  const textInputs: Array<[keyof FirmFormValues, string, string]> = [
    ['name', 'firm-name', 'Name'],
    ['legalName', 'firm-legal-name', 'Legal name'],
    ['website', 'firm-website', 'Website'],
    ['mainPhone', 'firm-phone', 'Phone'],
    ['sizeBand', 'firm-size', 'Size (e.g. 10-50 lawyers)'],
    ['address', 'firm-address', 'Address'],
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {textInputs.map(([key, id, label]) => (
        <div key={id}>
          <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
            {label}
          </label>
          <input
            id={id}
            required={key === 'name'}
            disabled={disabled}
            value={values[key]}
            onChange={(e) => set(key, e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:bg-neutral-100"
          />
        </div>
      ))}
      <div className="col-span-2">
        <label htmlFor="firm-areas" className="block text-sm font-medium text-neutral-700">
          Practice areas (comma-separated)
        </label>
        <input
          id="firm-areas"
          disabled={disabled}
          value={values.practiceAreas}
          onChange={(e) => set('practiceAreas', e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:bg-neutral-100"
        />
      </div>
    </div>
  )
}
