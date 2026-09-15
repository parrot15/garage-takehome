import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Input } from "./input";

/**
 * shadcn/ui InputGroup (base-nova), re-skinned as the search row: a faintly
 * raised card that lights up around its control and turns red around an
 * invalid one. On phones the addons stack, the icon beside the field and the
 * button under it.
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "group/input-group relative flex w-full min-w-0 items-center gap-0.75 rounded-lg border border-input bg-card p-1.25 shadow-xs focus-within:border-foreground focus-within:ring-3 focus-within:ring-brand/15 has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive phone:grid phone:grid-cols-[--spacing(7)_minmax(0,1fr)] phone:gap-0",
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex items-center justify-center text-muted-foreground select-none",
  {
    variants: {
      align: {
        "inline-start": "order-first",
        "inline-end": "order-last",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn("flex-1", className)}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupInput };
