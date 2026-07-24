type IconProps = { className?: string };

export function CompassIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m15.3 8.7-2.1 4.5-4.5 2.1 2.1-4.5 4.5-2.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.8 18.5c.6-3.1 2.3-4.7 5.2-4.7s4.6 1.6 5.2 4.7M15 6.5a3 3 0 0 1 0 5.8M15.4 14.2c2.6.3 4.1 1.7 4.7 4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BrandsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 5.5h7.2L20 13.8 13.8 20 5.5 11.7V5.5h-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9" cy="9.5" r="1.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function MoneyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5h13.5A2.5 2.5 0 0 1 20 10v8H6.5A2.5 2.5 0 0 1 4 15.5v-8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 7.5V6.7A2.7 2.7 0 0 1 6.7 4H17M16 11.5h4v3h-4a1.5 1.5 0 0 1 0-3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RecruitmentIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="6.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 6.5V4h7v2.5M3.5 12h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.7" fill="white" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 19 6v5.2c0 4.1-2.3 7.2-7 9.3-4.7-2.1-7-5.2-7-9.3V6l7-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m9.3 12 1.7 1.7 3.9-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PulseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h4l2-5 4 10 2.2-5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AppsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
