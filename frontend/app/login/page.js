'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser } from '../../utils/auth';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const result = await loginUser(email, password);
      if (result.success) {
        toast.success('Login successful!');
        setTimeout(() => router.push('/board'), 500);
      } else {
        toast.error(result.error || 'Login failed');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 dark:bg-none dark:bg-slate-950">
      <Toaster position="top-right" />
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md dark:bg-slate-900 dark:shadow-black/30">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">J</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-50">Mini-Jira</h1>
          <p className="text-gray-500 text-sm mt-1 dark:text-slate-400">Sign in to your account</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-slate-200">Email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg p-3 mt-1 text-black focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              placeholder="ali@demo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-slate-200">Password</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg p-3 mt-1 text-black focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
        <div className="mt-6 p-4 bg-gray-50 rounded-lg dark:bg-slate-950">
          <p className="text-xs text-gray-500 font-medium mb-2 dark:text-slate-400">Demo accounts:</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">Manager: ali@demo.com / Demo@1234</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">Employee: sara@demo.com / Demo@1234</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">Employee: omar@demo.com / Demo@1234</p>
        </div>
      </div>
    </div>
  );
}