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
  X,
  Eye,
} from 'lucide-react';

const isPastEvent = (ev) => {
  const cutoff = ev?.endTime ? new Date(ev.endTime) : new Date(ev?.startTime);
  return !Number.isNaN(cutoff.getTime()) && cutoff.getTime() <= Date.now();
};

function TicketPassCard({ ticket, onCancel, onDismiss }) {
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
    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center justify-between">
      {/* Close / Hide Pass Card Button */}
      <button
        type="button"
        onClick={() => onDismiss(ticket._id)}
        title="Hide this pass card"
        aria-label="Hide pass card"
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/15 text-slate-400 hover:text-red-300 border border-slate-700"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="w-full flex flex-col items-center pt-2">
        <span className="text-[11px] sm:text-xs text-indigo-400 font-semibold uppercase tracking-wider">
          {ticket.event?.clubName}
        </span>
        <h4 className="font-bold text-base mt-0.5 mb-1 px-4 break-words">{ticket.event?.title}</h4>
        <p className="text-xs text-slate-400 mb-3">
          {ticket.event?.resource?.name} • {new Date(ticket.event?.startTime).toLocaleDateString()}
        </p>

        {isWaitlisted ? (
          <div className="w-full bg-slate-800 border border-amber-500/40 rounded-xl p-3.5 sm:p-4 my-2 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" /> Standby Queue #{ticket.waitlistPosition}
            </div>
            <div className="text-2xl font-extrabold">{ticket.confirmationProbability ?? 75}%</div>
            <p className="text-xs font-semibold">Estimated Confirmation Chance</p>
            <p className="text-[11px] text-slate-400">
              Auto-upgrades to a live QR pass the instant an unscanned confirmed student cancels.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white p-2 sm:p-2.5 rounded-xl mb-3 shadow-sm">
              <img src={qrSrc} alt="Dynamic QR Pass" className="w-36 h-36 sm:w-44 sm:h-44 object-contain" />
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
            className="text-[11px] text-slate-500 hover:text-indigo-400 underline py-1"
          >
            {copied ? 'Copied Live Token!' : 'Copy Live QR Token (for Gate Simulator)'}
          </button>
        )}

        {/* Once scanned (isCheckedIn), pass cannot be cancelled */}
        {!ticket.isCheckedIn ? (
          <button
            type="button"
            disabled={cancelling}
            onClick={handleCancelClick}
            className="w-full py-2 px-3 rounded-lg bg-red-500/15 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" />
            {cancelling
              ? 'Processing...'
              : isWaitlisted
              ? 'Leave Standby Waitlist'
              : 'Cancel Pass (Release Seat)'}
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">
            Pass scanned — cancellation locked
          </span>
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

  // Dismissed / closed card IDs (persisted per user in localStorage)
  const [hiddenEventIds, setHiddenEventIds] = useState([]);
  const [hiddenTicketIds, setHiddenTicketIds] = useState([]);

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

  useEffect(() => {
    if (!user?.id) return;
    try {
      const savedEvents = JSON.parse(localStorage.getItem(`hidden_events_${user.id}`) || '[]');
      const savedTickets = JSON.parse(localStorage.getItem(`hidden_tickets_${user.id}`) || '[]');
      setHiddenEventIds(Array.isArray(savedEvents) ? savedEvents : []);
      setHiddenTicketIds(Array.isArray(savedTickets) ? savedTickets : []);
    } catch {
      // Ignore storage errors
    }
  }, [user?.id]);

  const dismissEvent = (eventId) => {
    setHiddenEventIds((prev) => {
      const updated = [...new Set([...prev, eventId])];
      if (user?.id) localStorage.setItem(`hidden_events_${user.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const restoreEvents = () => {
    setHiddenEventIds([]);
    if (user?.id) localStorage.removeItem(`hidden_events_${user.id}`);
  };

  const dismissTicket = (ticketId) => {
    setHiddenTicketIds((prev) => {
      const updated = [...new Set([...prev, ticketId])];
      if (user?.id) localStorage.setItem(`hidden_tickets_${user.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const restoreTickets = () => {
    setHiddenTicketIds([]);
    if (user?.id) localStorage.removeItem(`hidden_tickets_${user.id}`);
  };

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
  const visibleEvents = events.filter((ev) => !hiddenEventIds.includes(ev._id));
  const hiddenEventsCount = events.length - visibleEvents.length;

  const visibleTickets = myTickets.filter((t) => !hiddenTicketIds.includes(t._id));
  const hiddenTicketsCount = myTickets.length - visibleTickets.length;

  return (
    <div className="space-y-6 sm:space-y-8">
      {message && (
        <div
          className={`p-3 sm:p-3.5 rounded-xl text-xs sm:text-sm border ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/10 border-red-500/40 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header + Restore Hidden + Organizer Create Event Toggle */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">Upcoming Campus Events</h2>
          <p className="text-xs text-slate-400">
            Atomic seat reservation, 30s rotating HMAC passes &amp; probabilistic standby waitlist
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hiddenEventsCount > 0 && (
            <button
              type="button"
              onClick={restoreEvents}
              className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg text-xs font-semibold"
            >
              <Eye className="w-3.5 h-3.5" />
              Show {hiddenEventsCount} Closed
            </button>
          )}

          {(user.role === 'organizer' || user.role === 'admin') && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold transition"
            >
              <PlusCircle className="w-4 h-4" />
              {showCreateForm ? 'Close Form' : 'Host New Event'}
            </button>
          )}
        </div>
      </div>

      {/* Organizer Event Creation Form + Smart Venue & Standby Buffer Advisor */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateEvent}
          className="bg-slate-900 border border-indigo-500/40 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 text-sm"
        >
          <input
            type="text"
            placeholder="Event Title (e.g., AI Hackathon 2026)"
            required
            value={newEvent.title}
            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 sm:py-2"
          />
          <input
            type="text"
            placeholder="Organizing Club (e.g., IEEE / ACM)"
            required
            value={newEvent.clubName}
            onChange={(e) => setNewEvent({ ...newEvent, clubName: e.target.value })}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 sm:py-2"
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
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 sm:py-2"
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
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 sm:py-2"
          />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Start Time</label>
            <input
              type="datetime-local"
              required
              value={newEvent.startTime}
              onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 sm:py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">End Time</label>
            <input
              type="datetime-local"
              required
              value={newEvent.endTime}
              onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 sm:py-2"
            />
          </div>

          {(venueRec?.topRecommendation || standbyInfo) && (
            <div className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {venueRec?.topRecommendation && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
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
                <div className="space-y-1.5 pt-3 border-t border-slate-700 md:pt-0 md:border-t-0 md:border-l md:pl-4">
                  <span className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
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
      {visibleEvents.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 text-center text-slate-400 text-sm space-y-2">
          <p>
            {events.length === 0
              ? 'No approved events yet. Log in as Organizer to create one, then approve it as Admin!'
              : 'All event cards are currently closed/hidden.'}
          </p>
          {hiddenEventsCount > 0 && (
            <button
              type="button"
              onClick={restoreEvents}
              className="inline-flex items-center gap-1.5 bg-indigo-600 px-3 py-1.5 rounded-lg text-xs font-semibold"
            >
              <Eye className="w-3.5 h-3.5" /> Restore {hiddenEventsCount} Closed Event(s)
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {visibleEvents.map((ev) => {
            const seatsLeft = Math.max(0, ev.maxSeats - ev.bookedSeats);
            const existingTicket = ticketByEventId.get(ev._id);
            const past = isPastEvent(ev);

            return (
              <div
                key={ev._id}
                className="relative bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center gap-2 mb-2">
                    <span className="text-xs font-medium bg-indigo-500/15 text-indigo-300 px-2.5 py-0.5 rounded-full truncate">
                      {ev.clubName}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> {seatsLeft} / {ev.maxSeats} left
                      </span>
                      <button
                        type="button"
                        onClick={() => dismissEvent(ev._id)}
                        title="Close / hide this event card"
                        aria-label="Close event card"
                        className="p-1 rounded-md bg-slate-800 hover:bg-red-500/15 text-slate-400 hover:text-red-300 border border-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-base sm:text-lg mb-1">{ev.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4">{ev.description}</p>

                  <div className="space-y-1.5 text-xs text-slate-300 mb-4 sm:mb-5">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="truncate">{ev.resource?.name}</span>
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
                    className={`w-full py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 ${
                      existingTicket.status === 'waitlisted'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {existingTicket.status === 'waitlisted' ? (
                      <>
                        <Clock className="w-4 h-4 shrink-0" /> Standby #{existingTicket.waitlistPosition} (
                        {existingTicket.confirmationProbability}% Chance)
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 shrink-0" /> Pass Claimed (See Below)
                      </>
                    )}
                  </button>
                ) : past ? (
                  <button
                    disabled
                    className="w-full py-2.5 sm:py-2 rounded-lg bg-slate-800 text-slate-500 border border-slate-700 text-xs sm:text-sm font-medium cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    Event Date Passed
                  </button>
                ) : seatsLeft <= 0 ? (
                  <button
                    onClick={() => handleBookTicket(ev._id)}
                    className="w-full py-2.5 sm:py-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <Clock className="w-4 h-4 shrink-0" /> Join Standby Waitlist
                  </button>
                ) : (
                  <button
                    onClick={() => handleBookTicket(ev._id)}
                    className="w-full py-2.5 sm:py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <Ticket className="w-4 h-4 shrink-0" /> Get Free QR Pass
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* My QR Tickets & Standby Passes Wallet */}
      <div className="pt-4 border-t border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-base sm:text-lg font-bold">
            My Digital Passes &amp; Standby Queue ({visibleTickets.length})
          </h3>

          {hiddenTicketsCount > 0 && (
            <button
              type="button"
              onClick={restoreTickets}
              className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold"
            >
              <Eye className="w-3.5 h-3.5" />
              Show {hiddenTicketsCount} Closed Pass(es)
            </button>
          )}
        </div>

        {visibleTickets.length === 0 ? (
          <p className="text-sm text-slate-400">
            {myTickets.length === 0
              ? "You haven't claimed any event passes yet."
              : 'All pass cards are currently closed/hidden.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {visibleTickets.map((t) => (
              <TicketPassCard
                key={t._id}
                ticket={t}
                onCancel={handleCancelTicket}
                onDismiss={dismissTicket}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}