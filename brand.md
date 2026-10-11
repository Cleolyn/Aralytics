# Aralytics brand and interface guide

Aralytics is a welcoming learning space for Junior High School Araling Panlipunan. The current curriculum is AP10: Kontemporaryong Isyu. The interface connects learning to people, places, citizenship, and contemporary Philippine communities.

## Design direction

Use an open editorial layout: cream canvas, brown typography and actions, generous space, thin horizontal rules, and clear lists. Do not put every section inside a card. Navigation is a flat rail with an active indicator; secondary navigation uses underlined tabs. Use cards only when a distinct interactive surface genuinely needs containment. Do not use gradients, glass effects, decorative shadows, KPI tile grids, or pill-shaped navigation.

## Palette

| Token | Value | Purpose |
| --- | --- | --- |
| Canvas | `#FAF7F2` | Main background |
| Sand | `#F2EBE1` | Navigation, subtle selected rows |
| Ink | `#35241D` | Headings and primary text |
| Body | `#655348` | Supporting readable text |
| Primary | `#5A3827` | Primary actions and links |
| Primary hover | `#43291D` | Hover state |
| Rule | `#D9CCBE` | Section and table separators |
| Olive | `#52613D` | Completed / on track |
| Amber | `#8A561D` | Pending / needs practice |
| Critical | `#A0352A` | Errors and urgent issues |

Pair status colors with explicit text. Normal text must meet WCAG AA contrast (4.5:1); large text and non-text controls must meet their applicable requirements. Verify colors against their actual surface.

## Typography and spacing

Use Georgia for editorial page headings and Inter (with system sans-serif fallback) for body text, controls, and navigation. Body copy is at least 16px; supporting text is at least 14px. Keep prose around 65 characters per line. Page headings scale from 32px on mobile to 44px on desktop. Use an 8px spacing rhythm. Buttons and fields use a restrained 4px corner radius; controls should offer approximately 44px touch targets. Avoid uppercase body copy and technical badges.

## Voice

English-led Taglish: familiar English labels with warm Filipino greetings and subject titles. Examples: “Mabuhay, Juan.”, “Continue lesson”, “Activities”, “My Progress”, “Magandang araw, Teacher Maria.”, and “Pagsulong”. Explain errors with the next useful action. Never expose requirements numbers, database terms, engine names, or compliance implementation details in routine learning flows. Describe support as “Practice suggested” or “Needs follow-up”, never a public failure label.

## Navigation and hierarchy

- Learner: Overview, Lessons, Activities, My Progress. Practice support is reachable from progress and contextual recommendations.
- Teacher: Overview, Classes, Lessons, Assessments, Gradebook, Reports. Learner support and submission reviews have direct contextual links.
- Overview answers “What should I do next?” with real data, not decorative metrics.
- Lessons preserve ILAW: Layunin → Learn → Assessment → Pagsulong. Do not invent completion statistics or pretend static imagery is interactive.
- Keep quiz-taking focused, with question navigation, progress, clear timer, and review before submitting.
- Use lists/tables for activities, materials, submissions, and grades. Make actions recognizable text links, reserve filled buttons for primary actions.
- Public pages: landing, login, registration, help. Forms must use real supported account fields and honest validation.

## Imagery

Use restrained original illustrations of contemporary Philippine communities, learners, maps, and civic/environmental subjects. Avoid parchment backgrounds, colonial stereotypes, or presenting Araling Panlipunan as history alone. Illustrations support subject identity and must not displace task content. Decorative imagery uses empty alternative text; informative imagery needs a meaningful description.

## Accessibility and responsive behavior

Use semantic headings, labeled inputs, keyboard-operable controls, a skip link, visible focus rings, meaningful page titles, persistent inline feedback, and dialogs with focus management. Mobile navigation opens explicitly and closes after selection. Reflow open sections into one column; keep genuinely wide grade tables within their own scroll region. Respect reduced-motion preferences. Never rely on hover or color alone.

## Product boundaries

Quizzes and submissions require internet. Only actually downloaded material is labeled available offline. Registration uses LRN/school ID and section supported by the backend; invite-code and password-reset services are not currently available. Preserve role guards and teacher review/analytics tools. Dashboard data comes from authenticated endpoints; mockup names, dates, scores, and progress are illustrative, not production content.

## Approved references

The eleven separate mockups are in `output/design-reference-v1/`. They establish visual direction; implementation standardizes brand marks, navigation, copy, dates, and spacing across screens. The sources informing the design are Nielsen Norman Group's progressive disclosure guidance, CAST UDL guidelines, and W3C WCAG 2.2 navigation, contrast, target-size, and reflow guidance.
