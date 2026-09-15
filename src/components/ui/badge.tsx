import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * shadcn/ui Badge (base-nova), re-skinned as the brief's tags: an outline for
 * labels, a filled neutral for statuses in flight, the brand tint for what is
 * pending, the brand itself for what is overdue, and green for what settled.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center rounded-sm border px-1.5 py-px text-2xs leading-normal font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        outline: "border-border text-muted-foreground",
        secondary: "border-border bg-muted text-muted-foreground",
        tint: "border-brand/20 bg-brand/8 text-muted-foreground",
        brand: "border-brand/40 bg-brand/15 text-brand",
        success: "border-success/20 bg-success/8 text-success",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({
  className,
  variant = "outline",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, type BadgeVariant, badgeVariants };
