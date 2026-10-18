import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentToastsRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const addToast = useCallback(({ message, type = 'success', duration }) => {
    if (!message) return;

    // Deduplication check: prevent identical toast within 1.5s
    const dedupeKey = `${type}:${message}`;
    const now = Date.now();
    const lastSeen = recentToastsRef.current.get(dedupeKey);
    if (lastSeen && now - lastSeen < 1500) {
      return;
    }
    recentToastsRef.current.set(dedupeKey, now);

    // Default durations: 2.5s (~2500ms) for success/info, 4.5s for error/warning
    const autoDismissMs = duration ?? (type === 'error' || type === 'warning' ? 4500 : 2500);
    const id = `${now}-${Math.random().toString(36).substr(2, 6)}`;

    const newToast = { id, message, type, isExiting: false };

    setToasts((prev) => [...prev, newToast]);

    if (autoDismissMs > 0) {
      setTimeout(() => {
        removeToast(id);
      }, autoDismissMs);
    }
  }, [removeToast]);

  const toast = {
    success: (msg, dur) => addToast({ message: msg, type: 'success', duration: dur }),
    error: (msg, dur) => addToast({ message: msg, type: 'error', duration: dur }),
    warning: (msg, dur) => addToast({ message: msg, type: 'warning', duration: dur }),
    info: (msg, dur) => addToast({ message: msg, type: 'info', duration: dur }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast Container positioned top-right */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-item toast-${t.type} ${t.isExiting ? 'toast-exiting' : ''}`}
            role="status"
          >
            <div className="toast-icon">
              {t.type === 'success' && <CheckCircle2 size={16} color="var(--status-healthy-text)" />}
              {t.type === 'error' && <AlertOctagon size={16} color="var(--status-critical-text)" />}
              {t.type === 'warning' && <AlertTriangle size={16} color="var(--status-degraded-text)" />}
              {t.type === 'info' && <Info size={16} color="var(--accent-blue-highlight)" />}
            </div>

            <div className="toast-message">{t.message}</div>

            <button
              onClick={() => removeToast(t.id)}
              className="toast-close-btn"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
