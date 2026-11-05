import React, { useState } from 'react';
import { FileUp } from '../icons';

/**
 * Drag-and-drop area wrapping a native file input.
 * `onFile` receives the dropped or chosen File (or undefined when cleared);
 * the change event is passed second for callers that need to reset the input.
 */
export default function FileDropZone({ id, label, accept, onFile, iconSize = 22, labelSpacing = 8, children, ...inputProps }) {
  const [dragActive, setDragActive] = useState(false);
  return (
    <div
      className="upload-field"
      onDragOver={e => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={e => {
        e.preventDefault();
        setDragActive(false);
        onFile(e.dataTransfer.files?.[0]);
      }}
      style={{ background: dragActive ? 'var(--colors-canvas-soft)' : 'transparent' }}
    >
      <FileUp size={iconSize} aria-hidden="true" />
      <label htmlFor={id} style={{ display: 'block', fontWeight: 600, marginTop: labelSpacing }}>
        {label}
      </label>
      <input id={id} type="file" accept={accept} onChange={e => onFile(e.target.files?.[0], e)} {...inputProps} />
      {children}
    </div>
  );
}
