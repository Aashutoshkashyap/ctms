import React, { useEffect, useState } from 'react';
import { SitePhoto, storage } from '../lib/storage';

export default function EvidenceVault({ projectId, role }: { projectId: string; role: string }) {
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void storage.getSitePhotosForRole(role).then(rows => {
      if (active) setPhotos(rows);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, role]);

  if (role !== 'project_director') return <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800">Evidence access is reserved for the Project Director.</div>;
  return <div className="space-y-5">
    <div><h2 className="text-xl font-extrabold text-slate-900">Director Evidence Vault</h2><p className="text-slate-500">Private photographic verification submitted by authorized site, quality and safety personnel. Links expire automatically when Supabase is connected.</p></div>
    {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading protected evidence…</div> :
      photos.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No evidence has been uploaded for this project yet.</div> :
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{photos.map(photo => <figure key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {photo.url ? <img src={photo.url} alt={photo.caption || photo.name} className="h-56 w-full object-cover" /> : <div className="flex h-56 items-center justify-center bg-slate-100 text-slate-500">Protected image unavailable</div>}
        <figcaption className="space-y-1 p-4"><div className="flex justify-between gap-2"><b className="text-slate-900">{photo.caption || photo.name}</b><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold capitalize text-blue-700">{photo.evidence_type || 'progress'}</span></div><div className="text-xs text-slate-500">Uploaded by {photo.uploaded_by || 'Site team'} · {new Date(photo.captured_at).toLocaleString()}</div></figcaption>
      </figure>)}</div>}
  </div>;
}
