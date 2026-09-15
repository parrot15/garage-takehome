import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { INTERACTIVE } from "./classes";

/**
 * shadcn/ui Button (base-nova), re-skinned: a charcoal primary action, an
 * outlined secondary one, and a compact outline for suggestion chips.
 */
const buttonVariants = cva(
  `${INTERACTIVE} inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:not-disabled:bg-primary/90 hover:not-disabled:shadow-sm disabled:bg-primary/65",
        outline:
          "border-input bg-card text-primary/80 hover:not-disabled:border-border-strong hover:not-disabled:bg-muted",
      },
      size: {
        default: "min-h-10.5 px-4.5 text-sm leading-tight",
        sm: "min-h-8.25 px-2.75 text-xs leading-tight",
        xs: "rounded-sm px-1.75 py-px text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
