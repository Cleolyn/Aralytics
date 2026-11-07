import { describe, expect, it } from 'vitest';
import { activitiesFrom, cleanText, formatStatus } from './learning';

describe('cleanText', () => {
  it('normalizes underscores, dashes, and whitespace', () => {
    expect(cleanText('Quiz_One — Part  2')).toBe('Quiz One Part 2');
  });
  it('uses the fallback for missing or blank values', () => {
    expect(cleanText(null, 'No answer')).toBe('No answer');
    expect(cleanText(undefined, 'No answer')).toBe('No answer');
    expect(cleanText('', 'No answer')).toBe('No answer');
    expect(cleanText('  _ ', 'No answer')).toBe('No answer');
  });
  it('defaults the fallback to an empty string', () => {
    expect(cleanText('')).toBe('');
  });
});

describe('formatStatus', () => {
  it('maps known statuses and title-cases unknown ones', () => {
    expect(formatStatus('RECOMMENDED')).toBe('Suggested');
    expect(formatStatus('waiting_room')).toBe('Waiting room');
    expect(formatStatus('')).toBe('Pending');
  });
});

describe('activitiesFrom', () => {
  it('detects a local in-progress quiz session on the device', () => {
    window.localStorage.setItem('aralytics:quiz-session:qz-local:u1', JSON.stringify({ startedAt: 1000 }));
    try {
      const items = activitiesFrom([{ id: 'qz-local', title: 'Local Quiz' }, { id: 'qz-fresh', title: 'Fresh Quiz' }], []);
      expect(items.find(i => i.id === 'qz-local')?.state).toBe('In progress');
      expect(items.find(i => i.id === 'qz-fresh')?.state).toBe('Not started');
    } finally {
      window.localStorage.removeItem('aralytics:quiz-session:qz-local:u1');
    }
  });
});
