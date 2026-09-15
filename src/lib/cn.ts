import { createCn } from "cn/config";

/**
 * Merges theme classes while preserving line height when only font size changes.
 * Slash modifiers still replace line height; use this helper for shadcn imports.
 */
export const cn = createCn({
  override: { conflictingClassGroups: { "font-size": [] } },
});
