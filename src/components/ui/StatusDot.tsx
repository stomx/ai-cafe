interface StatusDotProps {
  status: 'ready' | 'loading' | 'error' | 'idle';
  label?: string;
}

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`status-dot status-${status}`} />
      {label && <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>}
    </div>
  );
}
