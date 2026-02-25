import React, { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';

export const QRCodeDisplay = ({ value, size = 200, showActions = true }) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  const fallbackUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(value)}&choe=UTF-8`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error copying:', err);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = `qr-${Date.now()}.png`;
    link.href = qrUrl;
    link.click();
  };

  const handleError = () => {
    setError(true);
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow-inner">
      <img 
        src={error ? fallbackUrl : qrUrl}
        alt="Código QR"
        className="w-full h-auto rounded-lg"
        onError={handleError}
        loading="lazy"
      />
      
      {showActions && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Copiar código"
          >
            {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
            <span className="text-sm font-medium">{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Descargar QR"
          >
            <Download size={18} />
            <span className="text-sm font-medium">Descargar</span>
          </button>
        </div>
      )}
    </div>
  );
};
