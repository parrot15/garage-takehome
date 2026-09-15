import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/cn";

/**
 * shadcn/ui Card (base-nova), re-skinned as the brief's plain bordered
 * surface; callers pad it. Renders a div unless given another element.
 */
function Card({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "rounded-lg border border-border bg-card text-card-foreground",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "card" },
  });
}

export { Card };
