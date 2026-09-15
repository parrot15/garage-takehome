/** The colour transition every control and link shares. */
export const TRANSITION =
  "transition-[background-color,color,border-color,box-shadow] motion-reduce:transition-none";
/** The keyboard focus ring. */
export const FOCUS_RING =
  "outline-offset-4 focus-visible:outline-2 focus-visible:outline-foreground";
export const INTERACTIVE = `${TRANSITION} ${FOCUS_RING}`;
/** Small uppercase label; callers set the font size. */
export const EYEBROW =
  "inline-flex items-center gap-1.75 font-bold uppercase leading-normal tracking-widest text-muted-foreground";
/** Underlined inline link. */
export const UNDERLINED =
  "text-foreground underline decoration-brand/70 underline-offset-3";
/** Text link with a trailing icon, for buttons and anchors alike. */
export const TEXT_LINK = `${UNDERLINED} inline-flex items-center gap-1 font-semibold hover:decoration-brand`;
