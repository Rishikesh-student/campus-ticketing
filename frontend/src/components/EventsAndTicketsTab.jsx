import { useState, useEffect } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  Ticket,
  Calendar,
  MapPin,
  Users,
  PlusCircle,
  CheckCircle,
  Sparkles,
  RefreshCw,
  Clock,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

function TicketPassCard({ ticket, onCancel }) {
  const isWaitlisted = ticket.status === 'waitlisted';
  const [qrSrc, setQrSrc] = useState(ticket.qrImage);
  const [liveToken, setLiveToken] = useState(ticket.qrToken);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (isWaitlisted || ticket.isCheckedIn) return;

    let cancelled = false;

    const fetchRotatingQr = async () => {
      try {
        const { data } = await API.get(`/tickets/rotating/${ticket._id}`);
        if (!cancelled) {
          setQrSrc(data.rotatingQrImage);
          setLiveToken(data.rotatingToken);
          setSecondsLeft(data.secondsRemaining || 30);
        }
      } catch {
        // Keep fallback QR if offline
      }
    };

    fetchRotatingQr();

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchRotatingQr();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ticket._id, ticket.isCheckedIn, isWaitlisted]);

  const handleCopyToken = () => {
    navigator.clipboard.writeText(liveToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleCancelClick = async () => {
    setCancelling(true);
    await onCancel(ticket._id);
    setCancelling(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col items-center text-center justify-between">
      <div className="w-full flex flex-col items-center">
        <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
          {ticket.event?.clubName}
        </span>
        <h4 className="font-bold text-base mt-0.5 mb-1">{ticket.event?.title}</h4>
        <p className="text-xs text-slate-400 mb-3">
          {ticket.event?.resource?.name} • {new Date(ticket.event?.startTime).toLocaleDateString()}
        </p>

        {isWaitlisted ? (
          <div className="w-full bg-slate-800 border border-amber-500/40 rounded-xl p-4 my-2 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" /> Standby Queue #{ticket.waitlistPosition}
            </div>
            <div className="text-2xl font-extrabold">{ticket.confirmationProbability ?? 75}%</div>
            <p className="text-xs font-semibold">Estimated Confirmation Chance</p>
            <p className="text-[11px] text-slate-400">
              Auto-upgrades to a live QR pass the instant a confirmed student cancels.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white p-2.5 rounded-xl mb-3 shadow-sm">
              <img src={qrSrc} alt="Dynamic QR Pass" className="w-44 h-44 object-contain" />
            </div>

            {!ticket.isCheckedIn ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '6s' }} />
                  Confirmed • Live QR ({secondsLeft}s)
                </span>
                <span className="text-[11px] text-slate-400">
                  Screenshot-proof 30s rotating signature
                </span>
              </div>
            ) : (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-800 text-slate-400">
                Checked In at{' '}
                {new Date(ticket.checkedInAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </>
        )}
      </div>

      <div className="w-full mt-3 pt-3 border-t border-slate-800 flex flex-col items-center gap-2">
        {!isWaitlisted && (
          <button
            type="button"
            onClick={handleCopyToken}
            className="text-[11px] text-slate-500 hover:text-indigo-400 underline"
          >
            {copied ? 'Copied Live Token!' : 'Copy Live QR Token (for Gate Simulator)'}
          </button>
        )}

        {!ticket.isCheckedIn && (
          <button
            type="button"
            disabled={cancelling}
            onClick={handleCancelClick}
            className="w-full py-1.5 px-3 rounded-lg bg-red-500/15 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" />
            {cancelling
              ? 'Processing...'
              : isWaitlisted
              ? 'Leave Standby Waitlist'
              : 'Cancel Pass (Release Seat)'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function EventsAndTicketsTab() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [myTickets, setMyTickets] = useState([]);
  const [resources, setResources] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [message, setMessage] = useState(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    clubName: '',
    resourceId: '',
    startTime: '',
    endTime: '',
    maxSeats: 50,
  });

  const [venueRec, setVenueRec] = useState(null);
  const [standbyInfo, setStandbyInfo] = useState(null);

  const loadAll = async () => {
    try {
      const [evRes, tkRes, resList] = await Promise.all([
        API.get('/events'),
        API.get('/tickets/my'),
        API.get('/resources'),
      ]);
      setEvents(evRes.data);
      setMyTickets(tkRes.data);
      setResources(resList.data);
      if (resList.data.length > 0 && !newEvent.resourceId) {
        setNewEvent((prev) => ({ ...prev, resourceId: resList.data[0]._id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!showCreateForm) return;
    const seats = Math.max(1, Number(newEvent.maxSeats) || 50);

    const timer = setTimeout(async () => {
      try {
        const [recRes, sbRes] = await Promise.all([
          API.post('/research/recommend-venue', {
            expectedAttendees: seats,
            startTime: newEvent.startTime || undefined,
            endTime: newEvent.endTime || undefined,
          }),
          API.get(`/research/standby-forecast?maxSeats=${seats}`),
        ]);
        setVenueRec(recRes.data);
        setStandbyInfo(sbRes.data);
      } catch {
        // Ignore if warming up
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [showCreateForm, newEvent.maxSeats, newEvent.startTime, newEvent.endTime]);

  const handleBookTicket = async (eventId) => {
    setMessage(null);
    try {
      const { data } = await API.post(`/tickets/book/${eventId}`);
      setMessage({ type: 'success', text: data.message });
      loadAll();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Could not book ticket',
      });
    }
  };

  const handleCancelTicket = async (ticketId) => {
    setMessage(null);
    try {
      const { data } = await API.post(`/tickets/cancel/${ticketId}`);
      setMessage({ type: 'success', text: data.message });
      loadAll();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Could not cancel pass',
      });
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setMessage(null);
    try {
      const { data } = await API.post('/events', newEvent);
      setMessage({ type: 'success', text: data.message });
      setShowCreateForm(false);
      setNewEvent({
        title: '',
        description: '',
        clubName: '',
        resourceId: resources[0]?._id || '',
        startTime: '',
        endTime: '',
        maxSeats: 50,
      });
      loadAll();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to create event',
      });
    }
  };

  const ticketByEventId = new Map(myTickets.map((t) => [t.event?._id, t]));

  return (
    <div className="space-y-8">
      {message && (
        <div
          className={`p-3.5 rounded-xl text-sm border ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/10 border-red-500/40 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header + Organizer Create Event Toggle */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Upcoming Campus Events</h2>
          <p className="text-xs text-slate-400">
            Atomic seat reservation, 30s rotating HMAC passes &amp; probabilistic standby waitlist
          </p>
        </div>

        {(user.role === 'organizer' || user.role === 'admin') && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            <PlusCircle className="w-4 h-4" />
            {showCreateForm ? 'Close Form' : 'Host New Event'}
          </button>
        )}
      </div>

      {/* Organizer Event Creation Form + Smart Venue & Standby Buffer Advisor */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateEvent}
          className="bg-slate-900 border border-indigo-500/40 rounded-xl p-5 grid sm:grid-cols-2 gap-4 text-sm"
        >
          <input
            type="text"
            placeholder="Event Title (e.g., AI Hackathon 2026)"
            required
            value={newEvent.title}
            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          />
          <input
            type="text"
            placeholder="Organizing Club (e.g., IEEE / ACM)"
            required
            value={newEvent.clubName}
            onChange={(e) => setNewEvent({ ...newEvent, clubName: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          />
          <textarea
            placeholder="Event Description"
            required
            rows={2}
            value={newEvent.description}
            onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
            className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          />
          <select
            value={newEvent.resourceId}
            onChange={(e) => setNewEvent({ ...newEvent, resourceId: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          >
            {resources.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name} (Max Cap: {r.capacity})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            placeholder="Confirmed Ticket Seats"
            required
            value={newEvent.maxSeats}
            onChange={(e) => setNewEvent({ ...newEvent, maxSeats: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Start Time</label>
            <input
              type="datetime-local"
              required
              value={newEvent.startTime}
              onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">End Time</label>
            <input
              type="datetime-local"
              required
              value={newEvent.endTime}
              onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
            />
          </div>

          {(venueRec?.topRecommendation || standbyInfo) && (
            <div className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-4 grid md:grid-cols-2 gap-4 text-xs">
              {venueRec?.topRecommendation && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Best Venue Match ({venueRec.topRecommendation.fitScore}% Fit)
                    </span>
                    {newEvent.resourceId !== venueRec.topRecommendation.resourceId && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewEvent({
                            ...newEvent,
                            resourceId: venueRec.topRecommendation.resourceId,
                          })
                        }
                        className="bg-indigo-600 px-2.5 py-1 rounded-md text-[11px] font-semibold"
                      >
                        Apply Venue
                      </button>
                    )}
                  </div>
                  <p className="font-semibold">
                    {venueRec.topRecommendation.name} (Cap: {venueRec.topRecommendation.capacity} •{' '}
                    {venueRec.topRecommendation.seatUtilization}% Seat Utilization)
                  </p>
                  <p className="text-slate-400">
                    {venueRec.topRecommendation.hasConflict
                      ? 'Warning: Time overlap detected on top match.'
                      : 'Conflict-free slot verified by multi-criteria utility scoring.'}
                  </p>
                </div>
              )}

              {standbyInfo && (
                <div className="space-y-1.5 md:border-l md:border-slate-700 md:pl-4">
                  <span className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    Bounded Standby Waitlist Policy
                  </span>
                  <p className="font-semibold">
                    Auto-Standby Buffer: +{standbyInfo.recommendedStandbyCap} queue slots (15% cap)
                  </p>
                  <p className="text-slate-400">
                    Never exceeds physical room capacity; FIFO auto-promotes standby students on
                    cancellation ({standbyInfo.historicalCancelRatePct}% historical cancel rate).
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="sm:col-span-2 bg-indigo-600 hover:bg-indigo-500 font-semibold py-2.5 rounded-lg"
          >
            Submit Event &amp; Check Venue Conflict
          </button>
        </form>
      )}

      {/* Event Cards Grid */}
      {events.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
          No approved events yet. Log in as Organizer to create one, then approve it as Admin!
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map((ev) => {
            const seatsLeft = Math.max(0, ev.maxSeats - ev.bookedSeats);
            const existingTicket = ticketByEventId.get(ev._id);

            return (
              <div
                key={ev._id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium bg-indigo-500/15 text-indigo-300 px-2.5 py-0.5 rounded-full">
                      {ev.clubName}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {seatsLeft} / {ev.maxSeats} left
                    </span>
                  </div>
                  <h3 className="font-bold text-lg mb-1">{ev.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4">{ev.description}</p>

                  <div className="space-y-1.5 text-xs text-slate-300 mb-5">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{ev.resource?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{new Date(ev.startTime).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {existingTicket ? (
                  <button
                    disabled
                    className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${
                      existingTicket.status === 'waitlisted'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {existingTicket.status === 'waitlisted' ? (
                      <>
                        <Clock className="w-4 h-4" /> Standby #{existingTicket.waitlistPosition} (
                        {existingTicket.confirmationProbability}% Chance)
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" /> Pass Claimed (See Below)
                      </>
                    )}
                  </button>
                ) : seatsLeft <= 0 ? (
                  <button
                    onClick={() => handleBookTicket(ev._id)}
                    className="w-full py-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/40 text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <Clock className="w-4 h-4" /> Join Standby Waitlist
                  </button>
                ) : (
                  <button
                    onClick={() => handleBookTicket(ev._id)}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <Ticket className="w-4 h-4" /> Get Free QR Pass
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* My QR Tickets & Standby Passes Wallet */}
      <div className="pt-4 border-t border-slate-800">
        <h3 className="text-lg font-bold mb-4">
          My Digital Passes &amp; Standby Queue ({myTickets.length})
        </h3>
        {myTickets.length === 0 ? (
          <p className="text-sm text-slate-400">You haven&apos;t claimed any event passes yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {myTickets.map((t) => (
              <TicketPassCard key={t._id} ticket={t} onCancel={handleCancelTicket} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}