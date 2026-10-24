type IconProps = { size?: number; className?: string };

function base(paths: React.ReactNode, { size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return base(
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5a2 2 0 0 1 4 0v5h3.5a1 1 0 0 0 1-1V9.5" />
    </>,
    props,
  );
}

export function CalendarIcon(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>,
    props,
  );
}

export function GridIcon(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>,
    props,
  );
}

export function DumbbellIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 9v6M2.5 10.5v3M7 8v8" />
      <path d="M20 9v6M21.5 10.5v3M17 8v8" />
      <path d="M7 12h10" />
    </>,
    props,
  );
}

export function UtensilsIcon(props: IconProps) {
  return base(
    <>
      <path d="M6 3v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M8 11v10" />
      <path d="M17 3c-1.5 0-3 2-3 5s1.5 5 3 5v8" />
    </>,
    props,
  );
}

export function FootstepsIcon(props: IconProps) {
  return base(
    <>
      <ellipse cx="8.5" cy="7" rx="2.3" ry="3.2" transform="rotate(-18 8.5 7)" />
      <path d="M6.3 11.5c-1 1.2-1.6 2.8-1 4.3.6 1.6 2.3 2.2 3.6 1.5 1-.5 1.3-1.6 1.1-2.8" />
      <ellipse cx="16" cy="13.5" rx="2.3" ry="3.2" transform="rotate(14 16 13.5)" />
      <path d="M18 18c1 1.2 1.3 2.6.7 3.9-.7 1.5-2.4 1.9-3.6 1.1-.9-.6-1.1-1.7-.8-2.8" />
    </>,
    props,
  );
}

export function TrashIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8V7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>,
    props,
  );
}

export function TimerIcon(props: IconProps) {
  return base(
    <>
      <path d="M10 2.5h4" />
      <path d="M12 4.5v3" />
      <circle cx="12" cy="14" r="8" />
      <path d="M12 10v4l3 2" />
    </>,
    props,
  );
}

export function ChartIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </>,
    props,
  );
}

export function UserIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </>,
    props,
  );
}

export function BellIcon(props: IconProps) {
  return base(
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
    </>,
    props,
  );
}

export function ChevronRightIcon(props: IconProps) {
  return base(<path d="m9 6 6 6-6 6" />, props);
}

export function ChevronLeftIcon(props: IconProps) {
  return base(<path d="m15 6-6 6 6 6" />, props);
}

export function ChevronDownIcon(props: IconProps) {
  return base(<path d="m6 9 6 6 6-6" />, props);
}

export function CheckIcon(props: IconProps) {
  return base(<path d="M5 12.5 10 17 19 7" />, props);
}

export function RefreshIcon(props: IconProps) {
  return base(
    <>
      <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20.5 8.5" />
      <path d="M20.5 4v4.5H16" />
      <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5" />
      <path d="M3.5 20v-4.5H8" />
    </>,
    props,
  );
}

export function PlayIcon(props: IconProps) {
  return base(<path d="M7 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />, props);
}

export function SwapIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </>,
    props,
  );
}

export function ClockIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
    props,
  );
}

export function TargetIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </>,
    props,
  );
}

export function UploadIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>,
    props,
  );
}

export function SparklesIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </>,
    props,
  );
}
