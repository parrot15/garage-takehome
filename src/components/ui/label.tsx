import { cn } from "@/lib/cn";

/**
 * shadcn/ui Label (base-nova), re-skinned: bold, at the size the caller sets,
 * and always tied to its control.
 */
function Label({
  className,
  htmlFor,
  children,
  ...props
}: React.ComponentProps<"label"> & { htmlFor: string }) {
  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      className={cn("flex items-center font-semibold select-none", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
