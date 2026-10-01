// WP4 owns this file. Implements the existing PracticeRunner interface for the interviewer path (plan §3.3).
import type { PracticeRunner } from '../copilot/practice'
import { todo } from '../kb/todo'
import type { InterviewPlan } from './types'

export const createInterviewerRunner = (_jobId: string, _plan: InterviewPlan, _sessionId: string): PracticeRunner => todo('WP4')
