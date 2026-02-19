import type { ThreadInfo, ProviderCapabilities } from './types';

/**
 * Checks if a thread supports attaching files.
 * Defaults to true if capabilities are undefined (backward compatibility).
 *
 * @param thread - The thread to check capabilities for
 * @returns boolean indicating if file attachments are supported
 */
export function canAttachFiles(thread: ThreadInfo | null | undefined): boolean {
  if (!thread || !thread.capabilities) {
    return true;
  }
  return thread.capabilities.CAN_ATTACH_FILES;
}

/**
 * Checks if a thread supports filtering history.
 * Defaults to true if capabilities are undefined (backward compatibility).
 *
 * @param thread - The thread to check capabilities for
 * @returns boolean indicating if history filtering is supported
 */
export function canFilterHistory(thread: ThreadInfo | null | undefined): boolean {
  if (!thread || !thread.capabilities) {
    return true;
  }
  return thread.capabilities.CAN_FILTER_HISTORY;
}

/**
 * Checks if a thread supports interactive approvals.
 * Defaults to true if capabilities are undefined (backward compatibility).
 *
 * @param thread - The thread to check capabilities for
 * @returns boolean indicating if approvals are supported
 */
export function supportsApprovals(thread: ThreadInfo | null | undefined): boolean {
  if (!thread || !thread.capabilities) {
    return true;
  }
  return thread.capabilities.SUPPORTS_APPROVALS;
}

/**
 * Checks if a thread supports streaming updates.
 * Defaults to true if capabilities are undefined (backward compatibility).
 *
 * @param thread - The thread to check capabilities for
 * @returns boolean indicating if streaming is supported
 */
export function supportsStreaming(thread: ThreadInfo | null | undefined): boolean {
  if (!thread || !thread.capabilities) {
    return true;
  }
  return thread.capabilities.SUPPORTS_STREAMING;
}

/**
 * Returns a tooltip message for a disabled capability.
 * Returns an empty string if the capability is available.
 *
 * @param capability - The capability key (e.g. 'CAN_ATTACH_FILES')
 * @param available - Whether the capability is currently available
 * @returns The tooltip message string
 */
export function getCapabilityTooltip(capability: keyof ProviderCapabilities | string, available: boolean): string {
  if (available) {
    return '';
  }

  switch (capability) {
    case 'CAN_ATTACH_FILES':
      return 'This provider does not support file attachments';
    case 'CAN_FILTER_HISTORY':
      return 'This provider does not support history filtering';
    case 'SUPPORTS_APPROVALS':
      return 'This provider does not support interactive approvals';
    case 'SUPPORTS_STREAMING':
      return 'This provider does not support live streaming updates';
    default:
      return 'This capability is not supported by the current provider';
  }
}
