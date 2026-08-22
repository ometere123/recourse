/**
 * Two plates, out of register.
 *
 * The stamp-red field is the determination, laid down solid the way a stamp lays
 * down ink. The process-blue frame is the appeal: offset, smaller, and still an
 * outline because it is a claim and not yet ink. Where it crosses the
 * determination it cuts into it. Blue on red is very nearly no contrast, so the
 * blue frame prints over a paper-coloured knockout, which is how a two-colour
 * form is actually made. Two inks plus paper, the same rule the stylesheet holds
 * itself to.
 *
 * Decorative, and named by the wordmark it sits beside, so it is hidden from
 * assistive technology rather than described twice.
 *
 * Colours are CSS variables here and literal hex in `src/app/icon.svg`; the
 * favicon is served as a static file and cannot read the stylesheet. Keep the two
 * geometries in step, and keep every edge even: the figure has to halve onto whole
 * pixels at 16px.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="block shrink-0"
    >
      <rect width="32" height="32" fill="var(--paper)" />
      <rect x="4" y="4" width="14" height="14" fill="var(--stamp)" />
      <rect
        x="16"
        y="16"
        width="12"
        height="12"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="8"
      />
      <rect
        x="16"
        y="16"
        width="12"
        height="12"
        fill="none"
        stroke="var(--process)"
        strokeWidth="4"
      />
    </svg>
  );
}
