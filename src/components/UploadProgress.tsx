'use client';

import React from 'react';

export default function UploadProgress({active,label='Uploading and securing your file…'}:{active:boolean;label?:string}) {
  if (!active) return null;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="status" aria-live="assertive" aria-label={label}><div className="w-full max-w-sm rounded-2xl border border-blue-100 bg-white p-6 text-center shadow-2xl"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700"/><h2 className="mt-4 font-extrabold text-slate-950">Please wait</h2><p className="mt-1 text-sm text-slate-600">{label}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="upload-progress-bar h-full rounded-full bg-blue-700"/></div><p className="mt-3 text-xs font-semibold text-slate-500">Inputs are locked until this finishes, preventing duplicate records.</p></div></div>;
}
