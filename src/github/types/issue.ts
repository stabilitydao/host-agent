import { IGithubIssue } from '@stabilitydao/stability/out/activity/builder';

export type Issues = { [repository: string]: FullIssue[] };

export type FullIssue = IGithubIssue & { repoId: number };
