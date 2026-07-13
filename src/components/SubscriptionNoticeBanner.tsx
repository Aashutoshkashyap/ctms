'use client';

import React, { useEffect, useState } from 'react';
import { storage } from '../lib/storage';
import { formatBsDate, replaceAdDatesWithBs } from '../lib/nepaliDate';

type Notice = {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  alert_for_date: string;
};

type Status = {
  organization: { name: string; plan: string; subscription_status: string; access_until?: string | null };
  daysRemaining: number | null;
  notifications: Notice[];
};

export default function SubscriptionNoticeBanner({ userRole }: { userRole: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (userRole === 'super_admin') return;
    let active = true;
    void (async () => {
      const session = await storage.getAuthSession();
      if (!session) return;
      const response = await fetch('/api/subscription/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const result = await response.json();
      if (active) setStatus(result);
    })();
    return () => { active = false; };
  }, [userRole]);

  if (!status || status.daysRemaining === null) return null;
  const renewalDue = status.daysRemaining <= 5;
  if (!renewalDue && status.notifications.length === 0) return null;
  const critical = renewalDue && status.daysRemaining <= 1;
  const expired = status.daysRemaining < 0;
  const latest = status.notifications[0];
  const title = !renewalDue && latest
    ? latest.title
    : expired
    ? 'Business subscription has expired'
    : status.daysRemaining === 0
      ? 'Business subscription expires today'
      : `Business subscription expires in ${status.daysRemaining} day${status.daysRemaining === 1 ? '' : 's'}`;
  const message = replaceAdDatesWithBs(!renewalDue && latest
    ? latest.message
    : `Access until ${formatBsDate(status.organization.access_until, { long: true })}. Send the payment reference to the platform administrator for renewal.`);
  return <section className={`mb-4 rounded-xl border p-4 shadow-sm ${critical ? 'border-rose-200 bg-rose-50 text-rose-950' : renewalDue ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <div className="text-xs font-extrabold uppercase tracking-wide">Subscription notice</div>
        <h2 className="mt-1 font-extrabold">{title}</h2>
        <p className="mt-1 text-sm">{message}</p>
      </div>
      {status.notifications.length > 0 && <button type="button" onClick={() => setExpanded(value => !value)} className="rounded-lg border border-current px-3 py-2 text-sm font-bold">{expanded ? 'Hide alerts' : `View alerts (${status.notifications.length})`}</button>}
    </div>
    {expanded && <div className="mt-3 grid gap-2 border-t border-current/15 pt-3">
      {status.notifications.map(notice => <div key={notice.id} className="rounded-lg bg-white/70 p-3 text-sm"><b>{notice.title}</b><p className="mt-1">{replaceAdDatesWithBs(notice.message)}</p></div>)}
    </div>}
  </section>;
}
