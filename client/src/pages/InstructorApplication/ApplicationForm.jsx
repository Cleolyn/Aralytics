import React, { useState } from 'react';

const FIELDS = [
  { name: 'full_name', label: 'Full name', autoComplete: 'name', required: true, minLength: 2, maxLength: 150, help: 'As it appears on your school records.' },
  { name: 'school', label: 'School', autoComplete: 'organization', required: true, minLength: 2, maxLength: 150, help: 'The school where you teach.' },
  { name: 'position', label: 'Position', autoComplete: 'organization-title', required: true, minLength: 2, maxLength: 100, help: 'For example: Teacher I, Master Teacher II.' },
  { name: 'employee_id', label: 'Employee ID (optional)', maxLength: 50, help: 'Helps the administrator verify you.' },
  { name: 'mobile', label: 'Mobile number', type: 'tel', autoComplete: 'tel', required: true, maxLength: 20, help: 'Use 09XXXXXXXXX or +639XXXXXXXXX.' }
];

/** Instructor application details. `initial` pre-fills a resubmission. */
export default function ApplicationForm({ initial, busy, resubmitting, onSubmit }) {
  const [values, setValues] = useState(() => ({
    full_name: initial.full_name || '', school: initial.school || '', position: initial.position || '',
    employee_id: initial.employee_id || '', mobile: initial.mobile || '', message: initial.message || ''
  }));
  const change = e => setValues(v => ({ ...v, [e.target.name]: e.target.value }));
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      {FIELDS.map(({ help, label, name, ...input }) => (
        <div className="field" key={name}>
          <label htmlFor={`instructor-${name}`}>{label}</label>
          <input className="form-input" id={`instructor-${name}`} name={name} value={values[name]} onChange={change} aria-describedby={`instructor-${name}-help`} {...input} />
          <small id={`instructor-${name}-help`}>{help}</small>
        </div>
      ))}
      <div className="field">
        <label htmlFor="instructor-message">Note for the administrator (optional)</label>
        <textarea className="form-input" id="instructor-message" name="message" maxLength={1000} value={values.message} onChange={change} />
      </div>
      <p className="account-note">An Aralytics administrator checks every instructor application before granting access to classes and student records.</p>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Sending application…' : resubmitting ? 'Send updated application' : 'Send application'}
      </button>
    </form>
  );
}
