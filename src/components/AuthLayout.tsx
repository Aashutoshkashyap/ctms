// Causal-Style Signup & Onboarding Wizard Component
import React, { useState } from 'react';
import { storage } from '../lib/storage';

interface AuthLayoutProps {
  onAuthSuccess: (user: { name: string; email: string; role: string }) => void;
}

export default function AuthLayout({ onAuthSuccess }: AuthLayoutProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Onboarding questions states
  const [jobFunction, setJobFunction] = useState('Finance');
  const [companySize, setCompanySize] = useState('26-100');
  const [timeframe, setTimeframe] = useState('Urgently (<1 week)');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (mode === 'signin') {
      setLoading(true);
      try {
        const result = await storage.signIn(email, password);
        const user = result.user as { name: string; email: string; role: string };
        onAuthSuccess(user);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Sign in failed.');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!firstName || !email || password.length < 6) {
      alert('Please fill out first name and email.');
      return;
    }
    setShowOnboarding(true);
  };

  const handleOnboardingComplete = async () => {
    // Map job function to project roles
    let role = 'project_manager';
    if (jobFunction === 'Finance') role = 'qs_billing_engineer';
    else if (jobFunction === 'Engineering') role = 'site_engineer';
    else if (jobFunction === 'Executive') role = 'project_director';
    else if (jobFunction === 'Other') role = 'employer_viewer';

    const user = {
      name: `${firstName} ${lastName}`.trim(),
      email,
      role
    };

    setLoading(true);
    setMessage('');
    try {
      const result = await storage.signUp(email, password, { name: user.name, role });
      if (!result.local && !result.session) {
        setShowOnboarding(false);
        setMessage('Account created. Check your email to confirm the account, then sign in.');
        setMode('signin');
        return;
      }
      onAuthSuccess(user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  const googleSignup = async () => {
    try {
      await storage.signInWithGoogle();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col md:flex-row relative">
      {/* LEFT COLUMN: Let's get you set up */}
      <div className="w-full md:w-[45%] flex flex-col justify-center px-10 py-12 md:px-16 border-r border-slate-100">
        <div className="mb-6 flex items-center gap-2">
          {/* Logo */}
          <div className="w-8 h-8 rounded-full border-[3px] border-blue-500/80 flex items-center justify-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          </div>
          <span className="font-extrabold tracking-tight text-xl text-slate-900">BUILDTRACK D&amp;B</span>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-1">{mode === 'signup' ? "Let's get you set up" : 'Welcome back'}</h1>
        <p className="text-xs text-slate-500 mb-6">
          {storage.isSupabaseConfigured() ? 'Secure authentication and cloud synchronization are enabled.' : 'Local sandbox mode is active. Connect Supabase in Settings for cloud authentication.'}
        </p>

        {/* Social Buttons */}
        <div className="space-y-2.5 mb-6 text-xs font-semibold">
          <button 
            onClick={googleSignup}
            className="w-full py-2.5 px-4 border border-slate-200 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 transition shadow-sm"
          >
            <span className="text-base">G</span> Continue with Google
          </button>
        </div>

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-4 text-slate-400 text-[10px] uppercase font-bold tracking-wider">OR</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* Direct Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
          {mode === 'signup' && <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">First name</label>
              <input 
                type="text" 
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500" 
                required
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Last name</label>
              <input 
                type="text" 
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
              />
            </div>
          </div>}

          <div>
            <label className="block text-slate-500 mb-1">Email address</label>
            <input 
              type="email" 
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Password</label>
            <input 
              type="password" 
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
              required
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-extrabold rounded-lg shadow-md transition"
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Get Started Free' : 'Sign In'}
          </button>
        </form>

        {message && <p className="mt-3 text-xs text-rose-600">{message}</p>}
        <div className="flex justify-between mt-5 text-[10px] text-slate-400 font-medium">
          <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }} className="text-blue-600 hover:underline">
            {mode === 'signup' ? 'Already registered? Sign in' : 'Need an account? Sign up'}
          </button>
          <span>{storage.isSupabaseConfigured() ? 'Supabase Auth' : 'Local Sandbox'}</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Visual Promo Showcase */}
      <div className="hidden md:flex md:w-[55%] bg-slate-50/50 flex-col justify-center px-16 py-12 space-y-8 select-none">
        {/* Mock Model Table visual */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xl max-w-lg text-[10px] text-slate-600 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-900 text-xs">Project Cash Flow + Cost Forecast</span>
            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Design &amp; Build control</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between border-b border-slate-50 pb-1">
              <span className="font-semibold text-slate-800">IPC BILLING + CLAIMS</span>
              <span className="font-mono">$6,250</span>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1 pl-2">
              <span className="text-slate-500">f Certified IPC</span>
              <span className="font-mono text-slate-400">$0</span>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1 pl-2">
              <span className="text-slate-500">f Approved variations</span>
              <span className="font-mono text-slate-800">$6,250</span>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-1 mt-2">
              <span className="font-semibold text-slate-800">DIRECT WORKS COST</span>
              <span className="font-mono">$2,625</span>
            </div>
            <div className="flex justify-between pb-1 mt-2">
              <span className="font-semibold text-slate-800">SITE OVERHEADS</span>
              <span className="font-mono">$31,567</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <div className="flex items-start gap-2.5 text-xs text-slate-700">
            <span className="text-emerald-500 text-base">✓</span>
            <div>
              <p className="font-bold text-slate-900">Control schedule, cost, and contract records together</p>
              <p className="text-slate-500 text-[11px] mt-0.5">Turn tender scope into a live WBS and CPM network.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-slate-700">
            <span className="text-emerald-500 text-base">✓</span>
            <div>
              <p className="font-bold text-slate-900">Keep project controls portable</p>
              <p className="text-slate-500 text-[11px] mt-0.5">Start locally, then connect the same workspace to Supabase.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ONBOARDING QUESTIONNAIRE POPUP MODAL */}
      {showOnboarding && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg w-full shadow-2xl space-y-6 text-slate-700">
            {/* Logo */}
            <div className="w-12 h-12 rounded-full border-[4px] border-blue-500/80 flex items-center justify-center mx-auto mb-2">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-extrabold text-slate-900">Welcome, {firstName || 'Saurabh'}!</h2>
              <p className="text-xs text-slate-500 mt-1">Please tell us a bit about yourself so that we can tailor your experience.</p>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              {/* Question 1: Job Function */}
              <div>
                <label className="block text-slate-500 mb-2">What's your job function?</label>
                <div className="flex flex-wrap gap-2">
                  {['Finance', 'Sales', 'Marketing', 'Engineering', 'Product', 'Executive', 'Other'].map(job => (
                    <button
                      key={job}
                      type="button"
                      onClick={() => setJobFunction(job)}
                      className={`px-3 py-1.5 border rounded-lg transition ${jobFunction === job ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {job}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question 2: Company Size */}
              <div>
                <label className="block text-slate-500 mb-2">How big is your company?</label>
                <div className="flex flex-wrap gap-2">
                  {['1-25', '26-100', '101-200', '201-500', '501-1000', '1001+'].map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setCompanySize(size)}
                      className={`px-3 py-1.5 border rounded-lg transition ${companySize === size ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question 3: Timeframe */}
              <div>
                <label className="block text-slate-500 mb-2">When do you next need to build a model/forecast?</label>
                <div className="flex flex-wrap gap-2">
                  {['Urgently (<1 week)', 'Soon (1-4 weeks)', 'Later (4+ weeks)', 'No use case'].map(time => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setTimeframe(time)}
                      className={`px-3 py-1.5 border rounded-lg transition ${timeframe === time ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={handleOnboardingComplete}
                disabled={loading}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-lg shadow-md transition text-xs"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
