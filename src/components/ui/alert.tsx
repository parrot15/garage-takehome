import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * shadcn/ui Alert (base-nova), re-skinned: a compact note in the brand tint,
 * and the card that explains a failed brief. An icon placed before the title
 * spans both rows.
 */
const alertVariants = cva(
  "group/alert relative grid w-full gap-y-1 border text-left has-[>svg]:grid-cols-[auto_1fr] [&>svg]:row-span-2 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "gap-x-2.5 rounded-md border-brand/20 bg-brand/5 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground phone:px-3",
        destructive:
          "gap-x-3.75 rounded-lg border-destructive/20 bg-destructive/3 p-5.5 text-sm *:data-[slot=alert-title]:text-lg phone:gap-x-2.75 phone:p-4.25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

/** Renders a div unless given another element, such as a heading. */
function AlertTitle({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      { className: cn("font-semibold", className) },
      props,
    ),
    render,
    state: { slot: "alert-title" },
  });
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
