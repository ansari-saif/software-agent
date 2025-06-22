export type OptimisticPrompt = {
  id: string;
  content: string;
  promptType: string;
};

export type Prompt = {
  id: string;
  content: string;
  promptType: 'USER' | 'AGENT';
  createdAt: string;
  updatedAt: string;
  projectId: string;
  action?: string;
}; 