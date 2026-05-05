import { useState } from "react";

export default function NotesModal({ venue, existing, onSave, onClose }) {
  const [notes, setNotes] = useState(existing || "");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Notes — {venue.name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <textarea
          className="notes-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Your thoughts, what to order, who went, the vibe..."
          rows={8}
          autoFocus
        />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onSave(notes); onClose(); }}>
            Save Notes
          </button>
        </div>
      </div>
    </div>
  );
}
