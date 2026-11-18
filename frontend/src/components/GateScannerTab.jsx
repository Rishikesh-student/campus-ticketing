import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import API from '../api/axios';
import { Camera, CameraOff, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

export default function GateScannerTab() {
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const scannerRef = useRef(null);

  const verifyToken = async (token) => {
    try {
      const { data } = await API.post('/tickets/verify', { qrToken: token });
      setScanResult(data);
    } catch (err) {
      setScanResult(
        err.response?.data || {
          valid: false,
          status: 'ERROR',
          message: 'Verification request failed',
        }
      );
    }
  };

  const startCamera = async () => {
    setScanResult(null);
    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;
      setScanning(true);

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await stopCamera();
          verifyToken(decodedText);
        }
      );
    } catch (err) {
      setScanning(false);
      setScanResult({
        valid: false,
        status: 'CAMERA_ERROR',
        message: 'Camera unavailable or permission denied. Use the Manual Token Tester on the right!',
      });
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop();
      scannerRef.current.clear();
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleManualVerify = (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    verifyToken(manualToken.trim());
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold">Venue Gate QR Verification</h2>
        <p className="text-xs text-slate-400">
          Verifies HMAC-SHA256 cryptographic signature & blocks duplicate screenshot entries
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Live Camera Scanner */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col items-center">
          <div
            id="qr-reader"
            className="w-full max-w-xs aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800 mb-4 flex items-center justify-center"
          >
            {!scanning && <span className="text-xs text-slate-500">Camera Preview Off</span>}
          </div>

          {!scanning ? (
            <button
              onClick={startCamera}
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Start Live QR Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="w-full bg-red-600 hover:bg-red-500 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            >
              <CameraOff className="w-4 h-4" /> Stop Camera
            </button>
          )}
        </div>

        {/* Right: Manual Token Simulator + Verification Result Banner */}
        <div className="space-y-4">
          <form
            onSubmit={handleManualVerify}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3"
          >
            <h3 className="font-semibold text-sm">Gate Simulator (Paste Raw QR Token)</h3>
            <p className="text-xs text-slate-400">
              Tip: Copy a student's raw QR token, scan it once (Green), scan it again (Yellow Duplicate Block), or alter 1 character (Red Forgery Alert).
            </p>
            <input
              type="text"
              placeholder="ticketId:eventId:studentId:hmacSignature"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
            />
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 rounded-lg text-sm font-medium"
            >
              Verify Pass Token
            </button>
          </form>

          {/* Status Banner */}
          {scanResult && (
            <div
              className={`p-5 rounded-xl border ${
                scanResult.valid
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-200'
                  : scanResult.status === 'ALREADY_USED'
                  ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                  : 'bg-red-500/15 border-red-500 text-red-200'
              }`}
            >
              <div className="flex items-center gap-2.5 font-bold text-lg mb-1">
                {scanResult.valid ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : scanResult.status === 'ALREADY_USED' ? (
                  <ShieldAlert className="w-6 h-6 text-amber-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400" />
                )}
                <span>{scanResult.status}</span>
              </div>
              <p className="text-sm mb-3">{scanResult.message}</p>

              {scanResult.student && (
                <div className="bg-slate-950/60 p-3 rounded-lg text-xs space-y-1">
                  <p>
                    <strong>Attendee:</strong> {scanResult.student.name} ({scanResult.student.rollNo || 'N/A'})
                  </p>
                  <p>
                    <strong>Event:</strong> {scanResult.event?.title}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}