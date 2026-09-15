import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/cn";

/**
 * shadcn/ui Empty (base-nova), re-skinned: a dashed box that says what the
 * sources did not establish and offers a way forward.
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex w-full min-w-0 flex-col items-center rounded-md border border-dashed border-border p-6.25 text-center text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function EmptyMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-media"
      className={cn(
        "flex shrink-0 items-center justify-center text-brand [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/** Renders a div unless given another element, such as a heading. */
function EmptyTitle({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      { className: cn("mt-2.25 text-base font-medium", className) },
      props,
    ),
    render,
    state: { slot: "empty-title" },
  });
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn("mt-1.5 text-xs", className)}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn("mt-5 w-full text-left", className)}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle };
