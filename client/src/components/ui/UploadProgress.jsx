import React from 'react';

/** Upload progress bar. `value` is a fraction from 0 to 1; renders nothing before an upload starts. */
export default function UploadProgress({ value, label = 'Upload progress' }) {
  const percent = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  if (!percent) return null;
  return (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
