import type { Topic } from './types'

export const WORK: Topic[] = [
  {
    id: 'job', group: 'work', title: 'The Job page', icon: 'git-pull-request',
    summary: 'Everything about one job in seven tabs: from the listing to the interview.',
    when: ['You decided a job is worth real effort.', 'You need the report, a tailored résumé or interview prep for one role.'],
    steps: [
      { title: 'Overview', body: 'Status, score and the next sensible action for this job.' },
      { title: 'Job', body: 'The listing itself, cleaned up and structured.' },
      { title: 'Match', body: 'How your profile lines up: matched and missing keywords, with an ATS job-match score.' },
      { title: 'Skill-up', body: 'What to learn for this job, with verified courses, plus gaps found in your practice sessions.' },
      { title: 'Documents', body: 'A tailored résumé and cover letter for this job, with tone, length and a “humanize the letter” option; wording that often reads as AI-written is highlighted. Every claim is fact-checked against your profile.' },
      { title: 'Report', body: 'The agent’s full evaluation, parsed into sections.' },
      { title: 'Knowledge base', body: 'Researched interview questions for this company and role. Filter by skill, type, difficulty and source, hide generated ones, open a question for detail and start practice.' },
    ],
    tips: ['Work left to right: Match tells you what to change, Documents applies it.'],
    go: [{ label: 'Open Jobs', section: 'jobs' }],
    keywords: 'job detail tabs match skill-up documents report cover letter knowledge base',
  },
  {
    id: 'resume', group: 'work', title: 'Resume', icon: 'tag',
    summary: 'Your master résumé workspace, in six pages: import it, edit it, pick a template, check how an ATS reads it, close skill gaps and research your public links.',
    when: ['You are starting out and need your profile in.', 'Scores say your résumé parses badly.', 'You need a polished PDF.'],
    steps: [
      { title: 'Overview', body: 'Where you stand: import a PDF or document, see progress through the phases, and the questions the agent still needs answered.' },
      { title: 'Content', body: 'Your résumé as structured sections. Review each suggestion, then Apply or Undo. A fact check flags anything not backed by your profile.' },
      { title: 'Templates', body: 'A gallery with live PDF previews. Export the one you like as PDF or DOCX to your output folder.' },
      { title: 'ATS analysis', body: 'Parse health says whether a robot can read the file. Job match compares it to a job you pick, with keyword findings to fix.' },
      { title: 'Skill-up', body: 'Skill gaps across your target roles, with verified courses.' },
      { title: 'Research', body: 'The agent reads your public links (profile pages, portfolio) to enrich your profile.' },
    ],
    tips: ['Fix parse health first; a perfect match score is worthless if the file cannot be read.', 'Meaning-based matching (Settings › Resume & documents) makes job match score wording, not just exact keywords.'],
    go: [{ label: 'Open Resume', section: 'resume' }, { label: 'Resume settings', section: 'settings', page: 'resume' }],
    keywords: 'cv pdf docx import ats parse health export template suggestions undo fact check content research skill-up',
  },
]

export const AGENTS: Topic[] = [
  {
    id: 'agent', group: 'agents', title: 'Agent chat', icon: 'sparkles',
    summary: 'A chat with your runner for anything the fixed flows do not cover.',
    when: ['You want to ask something about your search in plain language.', 'A run asked a question and you want to answer it.'],
    steps: [
      { title: 'Ask', body: 'Type a request. Tool steps stream in as the agent works, so you can see what it reads and runs.' },
      { title: 'Resume a thread', body: 'Threads are saved. Reopen one to continue where you stopped.' },
      { title: 'Continue a run', body: 'In Runs, choose Continue in chat to answer a run that was waiting for you.' },
    ],
    tips: ['What the agent may do (files, web, shell) is set in Settings › Agent.'],
    go: [{ label: 'Open Agent', section: 'agent' }, { label: 'Agent settings', section: 'settings', page: 'agent' }],
    keywords: 'chat thread conversation assistant permissions',
  },
  {
    id: 'monitoring', group: 'agents', title: 'Monitoring', icon: 'chart-column',
    summary: 'How your agents are doing: success rate, cost, tokens and the health of the search.',
    when: ['You want to know what the agent is costing.', 'Runs keep failing and you want the pattern.'],
    steps: [
      { title: 'Pick a range', body: 'Switch between 7 days, 30 days and All time.' },
      { title: 'Read cost and tokens', body: 'See spend by model and runner, so you can move cheap work to cheaper models.' },
      { title: 'Act on findings', body: 'Findings call out stale boards and repeated failures. Follow the link to fix them.' },
    ],
    go: [{ label: 'Open Monitoring', section: 'monitoring' }, { label: 'Monitoring settings', section: 'settings', page: 'monitoring' }],
    keywords: 'cost spend tokens success rate health findings stale charts',
  },
  {
    id: 'runs', group: 'agents', title: 'Runs', icon: 'history',
    summary: 'The history of everything the agent has done, live and past, with full logs.',
    when: ['A scan or evaluation is running and you want to watch it.', 'Something failed and you need the log.'],
    steps: [
      { title: 'Filter and group', body: 'Filter by status, runner or job. Group by job to see every run for one role.' },
      { title: 'Open a run', body: 'The right pane shows status, cost and a searchable log. Secrets are redacted.' },
      { title: 'Act', body: 'Cancel a live run, re-run a finished one, continue it in chat or delete it.' },
    ],
    tips: ['How long logs are kept is set in Settings › Monitoring.'],
    go: [{ label: 'Open Runs', section: 'runs' }],
    keywords: 'history logs cancel rerun delete live progress',
  },
]
