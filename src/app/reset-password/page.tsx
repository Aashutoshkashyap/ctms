'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { storage } from '../../lib/storage';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('Checking the recovery link…');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const session = await storage.getAuthSession();
        if (session) {
          if (active) { setReady(true); setMessage(''); }
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 150));
      }
      if (active) setMessage('This recovery link is invalid or expired. Request a new link from the sign-in page.');
    };
    void check();
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) return setMessage('The passwords do not match.');
    setSaving(true); setMessage('');
    try {
      await storage.updatePassword(password);
      setComplete(true);
      setMessage('Password updated. Sign in with your new password.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the password.');
    } finally { setSaving(false); }
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"><div className="mb-5 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 font-bold text-white">B</span><div><h1 className="font-extrabold text-slate-950">Choose a new password</h1><p className="text-sm text-slate-600">BuildTrack secure account recovery</p></div></div>{!complete&&<form onSubmit={submit} className="space-y-4"><label className="block text-sm font-semibold text-slate-700">New password<input disabled={!ready} required type="password" minLength={10} value={password} onChange={event=>setPassword(event.target.value)} className="mt-1 w-full rounded-lg" /></label><label className="block text-sm font-semibold text-slate-700">Confirm password<input disabled={!ready} required type="password" minLength={10} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg" /></label><p className="text-xs text-slate-500">Use at least 10 characters with upper-case, lower-case and a number.</p><button disabled={!ready||saving} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white disabled:opacity-50">{saving?'Updating…':'Update password'}</button></form>}{message&&<div className={`mt-4 rounded-lg p-3 text-sm ${complete?'bg-emerald-50 text-emerald-900':'bg-blue-50 text-blue-900'}`}>{message}</div>}<Link href="/" className="mt-4 inline-block text-sm font-bold text-blue-800">Return to sign in</Link></section></main>;
}
