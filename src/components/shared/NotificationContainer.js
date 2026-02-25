import React from 'react';
import { Check, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export const NotificationContainer = ({ notifications, onRemove }) => {
  if (notifications.length === 0) return null;

  return (
    <div 
      className="fixed top-4 left-4 right-4 z-[100] space-y-2 pointer-events-none max-w-lg mx-auto"
      role="alert"
      aria-live="assertive"
    >
      {notifications.map(({ id, message, type }) => (
        <div
          key={id}
          className={`pointer-events-auto p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-slideDown backdrop-blur-md ${
            type === 'success' ? 'bg-green-600/95 text-white' : 
            type === 'error' ? 'bg-red-600/95 text-white' : 
            type === 'warning' ? 'bg-amber-500/95 text-white' :
            'bg-blue-600/95 text-white'
          }`}
          role="status"
          aria-label={`Notificación: ${message}`}
        >
          <div className="bg-white/20 p-2 rounded-full" aria-hidden="true">
            {type === 'success' ? <Check size={20} /> : 
             type === 'error' ? <XCircle size={20} /> :
             type === 'warning' ? <AlertTriangle size={20} /> :
             <Info size={20} />}
          </div>
          <p className="font-medium flex-1 text-sm">{message}</p>
          <button 
            onClick={() => onRemove(id)}
            className="p-1 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Cerrar notificación"
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
};
