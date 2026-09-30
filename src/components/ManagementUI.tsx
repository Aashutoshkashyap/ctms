import React from 'react';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate';

const toneStyles: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-800',
  green: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-amber-50 text-amber-900',
  red: 'bg-rose-50 text-rose-800',
  slate: 'bg-slate-100 text-slate-700',
};

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-3xl">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600 md:text-base">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;
}

export function MetricCard({ label, value, note, icon, tone = 'blue' }: { label: string; value: string; note?: string; icon?: string; tone?: Tone }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-slate-600">{label}</p>{icon && <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${toneStyles[tone]}`}>{icon}</span>}</div>
    <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
    {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
  </div>;
}

export function ModuleCard({ icon, title, description, detail, onClick }: { icon: string; title: string; description: string; detail?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex min-h-32 flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-xl">{icon}</span>
    <span className="mt-3 flex w-full items-center justify-between gap-2"><span className="font-semibold text-slate-950">{title}</span><span aria-hidden="true" className="text-blue-700 transition group-hover:translate-x-1">→</span></span>
    <span className="mt-1 text-sm leading-5 text-slate-600">{description}</span>
    {detail && <span className="mt-auto pt-3 text-xs font-medium text-slate-500">{detail}</span>}
  </button>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-600">{description}</p>}</div>{action}</div>;
}

export function StatusBadge({ label, tone = 'slate' }: { label: string; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneStyles[tone]}`}>{label}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-600">{description}</p></div>;
}
