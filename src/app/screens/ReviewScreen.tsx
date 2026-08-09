import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WeeklyReviewFlow } from '@/features/review/WeeklyReviewFlow';

/**
 * "Weekly catch-up" (Menu > Data), a real route so the Android hardware back
 * button and browser back both do the sensible thing on a HashRouter (see
 * `MenuScreen.tsx`'s doc comment). `WeeklyReviewFlow` itself is unmodified,
 * other-agent-owned content (`src/features/review/**`) — this file only
 * supplies the `onClose` that a route needs and doesn't have as a prop.
 */
export function ReviewScreen() {
  const navigate = useNavigate();
  return <WeeklyReviewFlow onClose={() => navigate('/menu')} />;
}
