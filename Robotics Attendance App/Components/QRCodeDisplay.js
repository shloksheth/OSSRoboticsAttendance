import React, { useEffect, useRef } from 'react';
import { createPageUrl } from '@/utils';
import QRCode from 'qrcode';

export default function QRCodeDisplay() {
  const canvasRef = useRef(null);
  const checkInUrl = window.location.origin + createPageUrl('CheckIn');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    QRCode.toCanvas(canvas, checkInUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      }
    });
  }, [checkInUrl]);

  return (
    <div className="flex flex-col items-center p-6">
      <div className="bg-white p-4 rounded-2xl shadow-xl">
        <canvas ref={canvasRef} className="rounded-lg" />
      </div>
      <p className="text-red-200 text-sm mt-4 text-center">
        Students scan this code to check in
      </p>
      <div className="mt-4 p-3 bg-white/10 rounded-lg w-full">
        <p className="text-xs text-red-300 text-center break-all">{checkInUrl}</p>
      </div>
    </div>
  );
}