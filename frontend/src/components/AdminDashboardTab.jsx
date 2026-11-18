import { useState, useEffect } from 'react';
import API from '../api/axios';
import { Check, X, BarChart3 } from 'lucide-react';

export default function AdminDashboardTab() {
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [resources, setResources] = useState([]);

  const loadAdminData = async () => {
    try {
      const [evRes, bkRes, resList] = await Promise.all([
        API.get('/events'),
        API.get('/resources/bookings/all'),
        API.get('/resources'),
      ]);
      setEvents(evRes.data);
      setBookings(bkRes.data);
      setResources(resList.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const updateEventStatus = async (id, status) => {
    await API.patch(`/events/${id}/status`, { status });
    loadAdminData();
  };

  const updateBookingStatus = async (id, status) => {
    await API.patch(`/resources/bookings/${id}/status`, { status });
    loadAdminData();
  };

  return (
    <div className="space-y-8">
      {/* Quick Campus Utilization Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-xs text-slate-400">Active Campus Assets</p>
          <p className="text-2xl font-bold mt-1">{resources.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-xs text-slate-400">Total Events</p>
          <p className="text-2xl font-bold mt-1">{events.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-xs text-slate-400">Pending Approvals</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {events.filter((e) => e.status === 'pending_approval').length +
              bookings.filter((b) => b.status === 'pending_approval').length}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <p className="text-xs text-slate-400">Total Tickets Issued</p>
          <p className="text-2xl font-bold text-indigo-400 mt-1">
            {events.reduce((sum, e) => sum + e.bookedSeats, 0)}
          </p>
        </div>
      </div>

      {/* Event Venue Approval Queue */}
      <div>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-400" /> Event Venue Requests
        </h3>
        <div className="space-y-3">
          {events.map((ev) => (
            <div
              key={ev._id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap justify-between items-center gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{ev.title}</span>
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
                    {ev.clubName}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded capitalize ${
                      ev.status === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : ev.status === 'rejected'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {ev.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Venue: <strong>{ev.resource?.name}</strong> • Seats: {ev.maxSeats} •{' '}
                  {new Date(ev.startTime).toLocaleString()}
                </p>
              </div>

              {ev.status === 'pending_approval' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateEventStatus(ev._id, 'approved')}
                    className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => updateEventStatus(ev._id, 'rejected')}
                    className="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Standalone Resource Booking Queue */}
      <div>
        <h3 className="text-lg font-bold mb-3">Facility & Equipment Reservations</h3>
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b._id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap justify-between items-center gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{b.resource?.name}</span>
                  <span className="text-xs text-slate-400">by {b.bookedBy?.name}</span>
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
                <p className="text-xs text-slate-300 mt-1">Purpose: {b.purpose}</p>
                <p className="text-xs text-slate-400">{new Date(b.startTime).toLocaleString()}</p>
              </div>

              {b.status === 'pending_approval' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => updateBookingStatus(b._id, 'approved')}
                    className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => updateBookingStatus(b._id, 'rejected')}
                    className="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}