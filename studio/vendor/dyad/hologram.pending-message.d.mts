export type PendingUserMessage = { readonly prompt: string; readonly messageCount: number };
export function pendingUserMessageFor(send: { prompt: unknown; attachmentCount: number }): string | null;
export function pendingUserMessageShown(pending: PendingUserMessage | null | undefined, messageCount: number): boolean;
export function restoredDraft(current: string, submitted: string): string;
