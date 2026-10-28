export interface MenuHref {
  href: string;
}

/**
 * Pick the most specific visible menu route for the current pathname.
 * This keeps a parent item (for example PR) from staying highlighted when a
 * dedicated child page (for example Riwayat PR) is open.
 */
export function findActiveMenuHref(
  pathname: string,
  items: readonly MenuHref[]
): string | undefined {
  return items
    .filter((item) =>
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
