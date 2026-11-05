import { useCallback, useEffect, useState } from 'react';
import { readJSON, remove, write } from '../../utils/deviceStorage';

/**
 * Answers, deadline, screen events, and review flags for one learner's quiz,
 * saved on this device so a reload or connection drop doesn't lose work.
 * Saving pauses while `paused` (quiz finished) or before a deadline exists.
 */
export default function useQuizSession(sessionKey, paused) {
  const [restored] = useState(() => readJSON(sessionKey, {}));
  const [answers, setAnswers] = useState(restored.answers || {});
  const [deadline, setDeadline] = useState(restored.deadline || 0);
  const [events, setEvents] = useState(restored.events || []);
  const [flags, setFlags] = useState(restored.flags || []);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    if (!deadline || paused) return;
    if (!write(sessionKey, { answers, deadline, events, flags })) {
      setStorageError('Your browser could not save answers on this device. Keep this page open until you submit.');
    }
  }, [answers, deadline, events, flags, paused, sessionKey]);

  const setAnswer = useCallback((questionId, value) => setAnswers(prev => ({ ...prev, [questionId]: value })), []);
  const toggleFlag = useCallback(
    questionId => setFlags(prev => (prev.includes(questionId) ? prev.filter(id => id !== questionId) : [...prev, questionId])),
    []
  );
  const addEvent = useCallback(event => setEvents(prev => Object.freeze([...prev, event])), []);
  const clear = useCallback(() => remove(sessionKey), [sessionKey]);

  return { answers, setAnswer, deadline, setDeadline, events, addEvent, flags, toggleFlag, storageError, clear };
}
