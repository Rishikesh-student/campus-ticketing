import { useState, useEffect } from 'react';
import API from '../api/axios';
import { Check, X, BarChart3, Users, ShieldCheck, Clock } from 'lucide-react';

export default function AdminDashboardTab() {
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [resources, setResources] = useState([]);
  const [eventTelemetry, setEventTelemetry] = useState({});

  const loadAdminData = async () => {
    try {
      const [evRes, bkRes, resList] = await Promise.all([
        API.get('/events'),
        API.get('/resources/bookings/all'),
        API.get('/resources'),
      ]);
      const allEvents = evRes.data;
      setEvents(allEvents);
      setBookings(bkRes.data);
      setResources(resList.data);

      // Fetch real-time check-in & waitlist stats for approved events
      const approvedEvents = allEvents.filter((e) => e.status === 'approved');
      if (approvedEvents.length > 0) {
        const statsResults = await Promise.all(
          approvedEvents.map(async (ev) => {
            try {
              const { data } = await API.get(`/tickets/event/${ev._id}/attendees`);
              return [
                ev._id,
                {
                  totalRegistered: data.totalRegistered || 0,
                  totalWaitlisted: data.totalWaitlisted || 0,
                  totalCheckedIn: data.totalCheckedIn || 0,
                },
              ];
            } catch {
              return [
                ev._id,
                {
                  totalRegistered: ev.bookedSeats || 0,
                  totalWaitlisted: 0,
                  totalCheckedIn: 0,
                },
              ];
            }
          })
        );
        setEventTelemetry(Object.fromEntries(statsResults));
      }
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

  const approvedEvents = events.filter((e) => e.status === 'approved');
  const totalConfirmed = events.reduce((sum, e) => sum + (e.bookedSeats || 0), 0);
  const totalCheckedIn = Object.values(eventTelemetry).reduce(
    (sum, s) => sum + (s.totalCheckedIn || 0),
    0
  );
  const totalWaitlisted = Object.values(eventTelemetry).reduce(
    (sum, s) => sum + (s.totalWaitlisted || 0),
    0
  );
  const overallTurnoutPct =
    totalConfirmed > 0 ? Math.round((totalCheckedIn / totalConfirmed) * 100) : 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Live Campus Governance & Turnout Telemetry Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <p className="text-xs text-slate-400">Campus Assets</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{resources.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <p className="text-xs text-slate-400">Total Events</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">{events.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <p className="text-xs text-slate-400">Pending Queue</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-400 mt-1">
            {events.filter((e) => e.status === 'pending_approval').length +
              bookings.filter((b) => b.status === 'pending_approval').length}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <p className="text-xs text-slate-400">Confirmed Passes</p>
          <p className="text-xl sm:text-2xl font-bold text-indigo-400 mt-1">{totalConfirmed}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <p className="text-xs text-slate-400">Gate Check-Ins</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1">
            {totalCheckedIn}{' '}
            <span className="text-xs font-normal text-slate-400">({overallTurnoutPct}%)</span>
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <p className="text-xs text-slate-400">Standby Queued</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-300 mt-1">{totalWaitlisted}</p>
        </div>
      </div>

      {/* Live Event Turnout & Seat Utilization Analytics Table */}
      {approvedEvents.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
          <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            Live Event Seat Utilization &amp; Gate Turnout
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs">
                  <th className="py-2.5 pr-4">Event &amp; Club</th>
                  <th className="py-2.5 px-3">Venue</th>
                  <th className="py-2.5 px-3">Seats Filled</th>
                  <th className="py-2.5 px-3">Standby Queue</th>
                  <th className="py-2.5 pl-3">Checked In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {approvedEvents.map((ev) => {
                  const stats = eventTelemetry[ev._id] || {
                    totalRegistered: ev.bookedSeats || 0,
                    totalWaitlisted: 0,
                    totalCheckedIn: 0,
                  };
                  const fillPct =
                    ev.maxSeats > 0 ? Math.round((ev.bookedSeats / ev.maxSeats) * 100) : 0;
                  const turnoutPct =
                    stats.totalRegistered > 0
                      ? Math.round((stats.totalCheckedIn / stats.totalRegistered) * 100)
                      : 0;

                  return (
                    <tr key={ev._id}>
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{ev.title}</div>
                        <div className="text-xs text-indigo-400">{ev.clubName}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{ev.resource?.name || 'TBA'}</td>
                      <td className="py-3 px-3">
                        <span className="font-semibold">
                          {ev.bookedSeats}/{ev.maxSeats}
                        </span>{' '}
                        <span className="text-xs text-slate-400">({fillPct}%)</span>
                      </td>
                      <td className="py-3 px-3">
                        {stats.totalWaitlisted > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-medium">
                            <Clock className="w-3 h-3" /> {stats.totalWaitlisted} waiting
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">0</span>
                        )}
                      </td>
                      <td className="py-3 pl-3">
                        <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                          <Users className="w-3.5 h-3.5" /> {stats.totalCheckedIn}
                        </span>{' '}
                        <span className="text-xs text-slate-400">({turnoutPct}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event Venue Approval Queue */}
      <div>
        <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-400 shrink-0" /> Event Venue Requests
        </h3>
        <div className="space-y-3">
          {events.map((ev) => (
            <div
              key={ev._id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
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
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => updateEventStatus(ev._id, 'approved')}
                    className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => updateEventStatus(ev._id, 'rejected')}
                    className="flex-1 sm:flex-initial bg-red-600 hover:bg-red-500 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
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
        <h3 className="text-base sm:text-lg font-bold mb-3">Facility &amp; Equipment Reservations</h3>
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b._id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
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
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => updateBookingStatus(b._id, 'approved')}
                    className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => updateBookingStatus(b._id, 'rejected')}
                    className="flex-1 sm:flex-initial bg-red-600 hover:bg-red-500 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
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