import React, { useEffect, useRef } from 'react';
import './Modal.css';

export default function Modal({ title, message, buttons = [], onClose }) {
  const firstButtonRef = useRef(null);

  useEffect(() => {
    firstButtonRef.current?.focus();
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onClose && onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2>{title}</h2>}
        {typeof message === 'string' ? <p>{message}</p> : message}
        <div className="modal-buttons">
          {buttons.map((btn, i) => (
            <button
              key={i}
              ref={i === 0 ? firstButtonRef : null}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
