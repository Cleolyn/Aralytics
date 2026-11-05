import { describe, expect, it } from 'vitest';
import { cleanText, formatStatus } from './learning';

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
