import { CheckCircle2 } from "lucide-react";

interface TimelineEvent {
  label: string | null;
  at: string | null;
}

// Business-only (lib/plans.ts's auditLogs flag) chronological record of
// everything that happened to a single change order — derived entirely
// from timestamps already on the row, no separate audit table needed.
// Events with a null label or timestamp (hasn't happened yet / doesn't
// apply to this status) are simply skipped rather than shown as blank.
export default function AuditLogTimeline({ events }: { events: TimelineEvent[] }) {
  const entries = events
    .filter((event): event is { label: string; at: string } => !!event.label && !!event.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="mb-1.5 text-xs font-semibold text-gray-900">Audit log</p>
      <ul className="space-y-1">
        {entries.map((entry, index) => (
          <li key={`${entry.label}-${index}`} className="flex items-center gap-1.5 text-xs text-gray-500">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="font-medium text-gray-700">{entry.label}</span>
            <span>— {new Date(entry.at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
