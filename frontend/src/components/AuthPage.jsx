import { useState } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Calendar, QrCode } from 'lucide-react';

export default function AuthPage() {
  const { loginUser } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({
    name: '',
    email: '',
    rollNo: '',
    password: '',
    role: 'student',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const { data } = await API.post(endpoint, form);
      loginUser(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const quickDemoLogin = async (email) => {
    setError('');
    setLoading(true);
    try {
      const { data } = await API.post('/auth/login', { email, password: '123456' });
      loginUser(data);
    } catch (err) {
      setError('Demo login failed. Make sure backend & seed.js ran.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Left Info Panel */}
        <div className="p-8 bg-gradient-to-br from-indigo-600 to-violet-700 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-xs font-medium mb-6">
              <ShieldCheck className="w-4 h-4" /> Smart Campus Infrastructure
            </div>
            <h1 className="text-3xl font-bold leading-tight mb-3">
              Campus Resource & Event Ticketing Portal
            </h1>
            <p className="text-indigo-100 text-sm leading-relaxed">
              Unified conflict-free booking for auditoriums, labs, study pods, and equipment—paired with tamper-proof HMAC QR passes.
            </p>
          </div>

          <div className="space-y-3 mt-8 text-sm">
            <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl">
              <Calendar className="w-5 h-5 text-indigo-200 shrink-0" />
              <span>Real-time clash detection & smart room recommendations</span>
            </div>
            <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl">
              <QrCode className="w-5 h-5 text-indigo-200 shrink-0" />
              <span>Atomic seat locking & cryptographic single-use gate passes</span>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="p-8">
          <div className="flex gap-4 border-b border-slate-800 pb-3 mb-6">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`font-semibold pb-1 transition ${
                isLogin ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`font-semibold pb-1 transition ${
                !isLogin ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <input
                  type="text"
                  placeholder="Full Name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Roll No (Optional)"
                    value={form.rollNo}
                    onChange={(e) => setForm({ ...form, rollNo: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="student">Student</option>
                    <option value="organizer">Club Organizer</option>
                    <option value="admin">Campus Admin</option>
                  </select>
                </div>
              </>
            )}

            <input
              type="email"
              placeholder="College Email (e.g., student@campus.edu)"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              placeholder="Password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Register'}
            </button>
          </form>

          {/* One-Click Demo Accounts for Viva */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <p className="text-xs text-slate-400 mb-2.5">One-Click Demo Login (Password: 123456):</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickDemoLogin('student@campus.edu')}
                className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-lg transition"
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => quickDemoLogin('organizer@campus.edu')}
                className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-lg transition"
              >
                Organizer
              </button>
              <button
                type="button"
                onClick={() => quickDemoLogin('admin@campus.edu')}
                className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-lg transition"
              >
                Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}