import React from 'react';
import { ArrowLeft, ArrowRight, Flag } from '../../components/icons';
import { cleanText } from '../../utils/learning';
import { optionsFor } from './quizUtils';

/** One question with its choices and the previous / mark / next toolbar. */
export default function QuestionStep({ question, answer, flagged, isFirst, isLast, inputDisabled, navDisabled, onAnswer, onPrevious, onToggleFlag, onNext }) {
  return (
    <>
      <fieldset className="quiz-question" disabled={inputDisabled}>
        <legend>{cleanText(question.question_text)}</legend>
        {optionsFor(question).map(option => (
          <label key={option.id} className="answer-option">
            <input
              type="radio"
              name={question.id}
              value={option.id}
              checked={answer === option.id}
              onChange={() => onAnswer(option.id)}
            />
            <span>
              <strong>{option.id}.</strong> {cleanText(option.text)}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="quiz-toolbar">
        <button className="text-action" disabled={isFirst || navDisabled} onClick={onPrevious}>
          <ArrowLeft size={16} />
          Previous
        </button>
        <button className="text-action" disabled={navDisabled} aria-pressed={flagged} onClick={onToggleFlag}>
          <Flag size={16} />
          {flagged ? 'Remove mark' : 'Mark for review'}
        </button>
        <button className="btn btn-primary" disabled={navDisabled} onClick={onNext}>
          {isLast ? 'Check answers' : 'Next question'}
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
