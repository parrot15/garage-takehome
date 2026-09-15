import { cn } from "@/lib/cn";
import { Label } from "./label";

/**
 * shadcn/ui Field (base-nova), re-skinned: a label, its control, the error it
 * may raise, and the help under it, stacked.
 */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("group/field flex w-full flex-col gap-2", className)}
      {...props}
    />
  );
}

function FieldLabel(props: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Announces the current message, and renders nothing when there is none. */
function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  if (!children) return null;
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm text-destructive", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Field, FieldDescription, FieldError, FieldLabel };
