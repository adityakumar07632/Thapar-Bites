/**
 * Phase 13 — QR Scanner Modal for the Restaurant Dashboard.
 *
 * Uses the device camera via getUserMedia and the `jsqr` library to decode QR
 * codes in real time.  Each frame is captured to a hidden <canvas>, decoded,
 * and — on a successful read — passed to the parent via onScan().
 *
 * The parent controls whether this modal is open; the component cleans up the
 * camera stream when it unmounts so the camera indicator light goes off.
 */

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@campus-bites/ui';

interface QrScannerModalProps {
  open: boolean;
  title: string;
  hint?: string;
  onScan: (payload: string) => void;
  onClose: () => void;
}

export function QrScannerModal({ open, title, hint, onScan, onClose }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Start / stop camera when modal opens / closes.
  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function start() {
    setCameraError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scan();
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access and try again.'
          : 'Could not open the camera. Make sure nothing else is using it.';
      setCameraError(msg);
      setScanning(false);
    }
  }

  function stop() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  function scan() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scan);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (code?.data) {
      stop();
      onScan(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scan);
  }

  if (!open) return null;

  return (
    <Modal title={title} description={hint} onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-4">
        {/* Camera viewport */}
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-steel-900">
          {cameraError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle className="text-turmeric-400" size={32} />
              <p className="text-sm text-steel-300">{cameraError}</p>
              <Button variant="secondary" onClick={() => void start()}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                aria-label="Camera feed"
              />
              {/* Scan guide overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
              {scanning && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <span className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white">
                    <Camera size={12} />
                    Point camera at the student's QR code
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {/* Hidden canvas for frame capture / jsQR decoding */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        <Button variant="secondary" onClick={onClose} className="w-full justify-center">
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
