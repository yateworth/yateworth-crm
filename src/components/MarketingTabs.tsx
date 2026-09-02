import { NavLink } from 'react-router-dom'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 pb-2 text-sm font-medium transition-colors ${
    isActive ? 'border-ox text-ink' : 'border-transparent text-sec hover:text-ink'
  }`

export function MarketingTabs() {
  return (
    <nav className="flex items-center gap-6 border-b border-ink/10">
      <NavLink to="/marketing/compose" className={tabClass}>
        Compose
      </NavLink>
      <NavLink to="/marketing/campaigns" className={tabClass}>
        Campaigns
      </NavLink>
      <NavLink to="/marketing/lists" className={tabClass}>
        Mailing lists
      </NavLink>
      <NavLink to="/marketing/templates" className={tabClass}>
        Templates
      </NavLink>
    </nav>
  )
}
