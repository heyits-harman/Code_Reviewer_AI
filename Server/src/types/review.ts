
export type Severity = 'critical' | 'suggestion' | 'warning';
export type Category = 'bug' | 'security' | 'style' | 'performance';

export interface ReviewIssue{
  file: string;
  line: number;
  severity: Severity;
  category: Category;
  comment: string;
  suggestion?: string;
}

export interface ReviewJobPayload{
  installationId: number;
  repo: string;
  owner: string;
  prNumber: number;
}

export interface ChangedFile{
  fileName: string;
  patch: string;
  fullContent?: string;
  status: string;
}
