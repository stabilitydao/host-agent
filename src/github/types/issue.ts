import {
  IBuildersMemoryV3,
  IGithubIssueV2,
} from '@stabilitydao/host/out/activity/builder';

export type Issues = { [repository: string]: FullIssue[] };

export type FullIssue = IGithubIssueV2 & {
  repoId: number;
  assignee: IGithubIssueV2['assignees'][number];
};

export type Repos = {
  [daoSymbol: string]: IBuildersMemoryV3['string']['repos'];
};
