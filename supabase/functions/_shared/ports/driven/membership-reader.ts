export type PromptLookupResult =
  | { readonly found: true; readonly groupId: string; readonly status: 'open' | 'closed' }
  | { readonly found: false };

export interface MembershipReader {
  lookupPrompt(promptId: string): Promise<PromptLookupResult>;
  isMember(userId: string, groupId: string): Promise<boolean>;
}
