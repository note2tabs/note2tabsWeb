/** Include a portalled select menu in its owning card's outside-click boundary. */
export function selectPortalTargetWithin(target: Element | null, selector: string): boolean {
  if (target?.closest(selector)) return true;
  const ownerId = target?.closest('[data-select-owner]')?.getAttribute('data-select-owner');
  return Boolean(ownerId && target?.ownerDocument.getElementById(ownerId)?.closest(selector));
}
