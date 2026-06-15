import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

function TypingText({ text, speed = 65 }) {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (count >= text.length) { setDone(true); return; }
    const t = setTimeout(() => setCount(c => c + 1), speed);
    return () => clearTimeout(t);
  }, [count, text, speed]);

  return (
    <span>
      {text.slice(0, count)}
      <span className={done ? 'cursor-blink' : 'opacity-100'}>|</span>
    </span>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Delay form appearance until typing animation is well underway
  useEffect(() => {
    const t = setTimeout(() => setShowForm(true), 600);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.token, data.user);
      toast.success(`Karibu, ${data.user.name}!`);
      navigate('/drivers');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #2d2b6b 0%, #1a1a2e 60%)',
      }}
    >
      {/* Logo + title */}
      <div className="flex flex-col items-center mb-5">
        <img
          src="/logo.svg"
          alt="Helion Tracking"
          className="mb-4"
          style={{
            height: '120px',
            width: 'auto',
            filter: 'brightness(0) invert(1) drop-shadow(0 0 28px rgba(129,140,248,0.55))',
          }}
        />
        <h1
          className="font-brand text-white text-lg tracking-[0.25em] uppercase text-center"
          style={{ minHeight: '1.75em', letterSpacing: '0.3em' }}
        >
          <TypingText text="Fleet Incident Reporter" speed={65} />
        </h1>
      </div>

      {/* Login card */}
      <div
        className={`w-full max-w-sm transition-all duration-700 ${
          showForm ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4 shadow-2xl"
        >
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

        </form>
      </div>
    </div>
  );
}
