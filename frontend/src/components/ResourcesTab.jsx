import { useState, useEffect } from 'react';
import API from '../api/axios';
import { Building2, Clock, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

export default function ResourcesTab() {
  const [resources, setResources] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    resourceId: '',
    purpose: '',
    startTime: '',
    endTime: '',
  });
  const [feedback, setFeedback] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [resList, bookingsList] = await Promise.all([
        API.get('/resources'),
        API.get('/resources/bookings/my'),
      ]);
      setResources(resList.data);
      setMyBookings(bookingsList.data);
      if (resList.data.length > 0 && !form.resourceId) {
        setForm((prev) => ({ ...prev, resourceId: resList.data[0]._id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleBook = async (e) => {
    e.preventDefault();
    setFeedback(null);
    setAlternatives([]);
    setLoading(true);
    try {
      const { data } = await API.post('/resources/book', form);
      setFeedback({ type: 'success', text: data.message });
      setForm((prev) => ({ ...prev, purpose: '' }));
      fetchData();
    } catch (err) {
      const errData = err.response?.data;
      setFeedback({
        type: 'error',
        text: errData?.message || 'Booking failed',
      });
      if (errData?.alternatives?.length > 0) {
        setAlternatives(errData.alternatives);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchToAlternative = (altId) => {
    setForm((prev) => ({ ...prev, resourceId: altId }));
    setAlternatives([]);
    setFeedback({
      type: 'info',
      text: 'Switched to recommended available resource! Click Reserve Resource to confirm.',
    });
  };

  const filteredResources =
    filter === 'all' ? resources : resources.filter((r) => r.category === filter);

  return (
    <div className="space-y-8">
      {/* Top Grid: Resource Catalog + Booking Form */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Campus Resources */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Campus Facilities & Inventory</h2>
            <div className="flex gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {['all', 'hall', 'lab', 'study_room', 'equipment'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1.5 rounded-md capitalize transition ${
                    filter === cat ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {filteredResources.map((r) => (
              <div
                key={r._id}
                onClick={() => setForm({ ...form, resourceId: r._id })}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  form.resourceId === r._id
                    ? 'bg-indigo-950/40 border-indigo-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                    {r.category.replace('_', ' ')}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      r.requiresApproval
                        ? 'bg-amber-500/10 text-amber-300'
                        : 'bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    {r.requiresApproval ? 'Admin Approval' : 'Instant Auto-Approve'}
                  </span>
                </div>
                <h3 className="font-semibold text-base">{r.name}</h3>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                  <Building2 className="w-3.5 h-3.5" /> {r.location} • Cap: {r.capacity}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {r.amenities.map((a, idx) => (
                    <span key={idx} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Reservation Form + Smart Conflict Recommender */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-fit">
          <h3 className="font-bold text-lg mb-4">Reserve a Resource</h3>

          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs mb-4 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : feedback.type === 'info'
                  ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
                  : 'bg-red-500/10 border-red-500/40 text-red-300'
              }`}
            >
              <div className="flex items-start gap-2">
                {feedback.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>
            </div>
          )}

          {/* Smart Recommender Box when a Clash Happens */}
          {alternatives.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5 mb-2">
                <Sparkles className="w-4 h-4" /> Free Alternatives Available for This Slot:
              </p>
              <div className="space-y-1.5">
                {alternatives.map((alt) => (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => switchToAlternative(alt.id)}
                    className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 p-2 rounded flex justify-between items-center"
                  >
                    <span>
                      <strong>{alt.name}</strong> ({alt.location})
                    </span>
                    <span className="text-indigo-400 font-medium">Select →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleBook} className="space-y-3.5 text-sm">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Selected Resource</label>
              <select
                value={form.resourceId}
                onChange={(e) => setForm({ ...form, resourceId: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              >
                {resources.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name} (Cap: {r.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Purpose / Activity</label>
              <input
                type="text"
                required
                placeholder="e.g., Final Year Project Sprint / Extra Lab"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Start Time</label>
              <input
                type="datetime-local"
                required
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">End Time</label>
              <input
                type="datetime-local"
                required
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Checking Schedule...' : 'Reserve Resource'}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Section: My Resource Bookings */}
      <div>
        <h3 className="text-lg font-bold mb-3">My Resource Reservations</h3>
        {myBookings.length === 0 ? (
          <p className="text-sm text-slate-400">No resource reservations yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myBookings.map((b) => (
              <div key={b._id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">{b.resource?.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded capitalize ${
                      b.status === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : b.status === 'rejected'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {b.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mb-2">{b.purpose}</p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(b.startTime).toLocaleString()} →{' '}
                  {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}